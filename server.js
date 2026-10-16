import http from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createDownloadService } from "./server/downloads.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(ROOT, "www");
const PORT = Number(process.env.PORT || 3000);

const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png" };

export function normalizeSlug(input) {
  const slug = String(input ?? "").trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(slug) ? slug : null;
}

export function createKickClient({ env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  let token = null, tokenExpiresAt = 0;
  async function getToken() {
    if (token && now() < tokenExpiresAt - 30000) return token;
    if (!env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET) {
      const error = new Error("Kick API no está configurada. Añade KICK_CLIENT_ID y KICK_CLIENT_SECRET en el servidor.");
      error.status = 503; throw error;
    }
    const response = await fetchImpl("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.KICK_CLIENT_ID, client_secret: env.KICK_CLIENT_SECRET }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? "Kick rechazó las credenciales de la aplicación." : "No se pudo autenticar con Kick.");
      error.status = response.status === 429 ? 503 : 502; throw error;
    }
    const data = await response.json();
    if (!data.access_token) { const error = new Error("Kick no devolvió un token válido."); error.status = 502; throw error; }
    token = data.access_token;
    tokenExpiresAt = now() + Math.max(60, Number(data.expires_in || 3600)) * 1000;
    return token;
  }
  async function getChannel(slug) {
    const accessToken = await getToken();
    const url = new URL("https://api.kick.com/public/v1/channels");
    url.searchParams.set("slug", slug);
    const response = await fetchImpl(url, {
      headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = new Error(response.status === 429 ? "Kick limitó temporalmente las consultas. Inténtalo más tarde." : "No se pudo consultar el canal en Kick.");
      error.status = response.status === 429 ? 503 : 502; throw error;
    }
    const payload = await response.json();
    const rows = Array.isArray(payload.data) ? payload.data : payload.data?.channels ? payload.data.channels : payload.data ? [payload.data] : [];
    const channel = rows.find(row => String(row.slug ?? row.username ?? "").toLowerCase() === slug) ?? rows[0];
    if (!channel) return null;
    return {
      id: channel.broadcaster_user_id ?? channel.user_id ?? channel.id ?? null,
      slug: channel.slug ?? channel.username ?? slug,
      name: channel.channel_name ?? channel.name ?? channel.slug ?? slug,
      profilePicture: channel.profile_picture ?? channel.profile_picture_url ?? null,
      banner: channel.banner_picture ?? channel.banner ?? null,
      category: channel.category?.name ?? channel.category ?? null,
      streamTitle: channel.stream_title ?? channel.livestream?.stream_title ?? null,
      isLive: Boolean(channel.stream?.is_live ?? channel.is_live ?? channel.livestream?.is_live ?? false),
      followers: Number.isFinite(Number(channel.followers_count)) ? Number(channel.followers_count) : null,
      source: "Kick Public API"
    };
  }
  return { getChannel };
}

async function readJsonBody(req, maxBytes = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) { const error = new Error("La solicitud es demasiado grande."); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { const error = new Error("El cuerpo debe ser JSON válido."); error.status = 400; throw error; }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

export function createAppServer({ env = process.env, fetchImpl = fetch, webRoot = WEB_ROOT, downloadService } = {}) {
  const kick = createKickClient({ env, fetchImpl });
  const downloads = downloadService || createDownloadService({ env });
  const downloadStarts = [];
  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, service: "vodx-kick-wrapped", kickConfigured: Boolean(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET) });
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/download") {
      try {
        const body = await readJsonBody(req);
        const now = Date.now();
        while (downloadStarts.length && now - downloadStarts[0] > 10 * 60 * 1000) downloadStarts.shift();
        if (downloadStarts.length >= 3) return sendJson(res, 429, { error: "Límite beta: máximo 3 descargas cada 10 minutos por servidor." });
        const result = await downloads.download({
          url: body.url,
          ...(body.startSeconds !== undefined || body.endSeconds !== undefined
            ? { startSeconds: body.startSeconds, endSeconds: body.endSeconds }
            : {})
        });
        downloadStarts.push(now);
        return sendJson(res, 200, { data: result });
      } catch (error) {
        return sendJson(res, Number(error.status) || 502, { error: error.message || "No se pudo descargar el VOD." });
      }
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/download/file") {
      const record = await downloads.getFile(requestUrl.searchParams.get("id"));
      if (!record) return sendJson(res, 404, { error: "El archivo no existe o expiró. Vuelve a iniciar la descarga." });
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": record.size,
        "Content-Disposition": 'attachment; filename="' + record.filename.replace(/[^a-zA-Z0-9._-]/g, "_") + '"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      const stream = createReadStream(record.path);
      stream.on("error", () => { if (!res.headersSent) sendJson(res, 404, { error: "El archivo ya no está disponible." }); else res.destroy(); });
      stream.pipe(res);
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/kick/channel") {
      const slug = normalizeSlug(requestUrl.searchParams.get("slug"));
      if (!slug) return sendJson(res, 400, { error: "Escribe un usuario válido de Kick." });
      try {
        const channel = await kick.getChannel(slug);
        if (!channel) return sendJson(res, 404, { error: "No se encontró el canal o Kick no devolvió datos públicos." });
        return sendJson(res, 200, { data: channel });
      } catch (error) {
        return sendJson(res, Number(error.status) || 502, { error: error.message || "Error al consultar Kick." });
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Método no permitido." });
    let pathname;
    try { pathname = decodeURIComponent(requestUrl.pathname); } catch { return sendJson(res, 400, { error: "Ruta inválida." }); }
    if (pathname === "/") pathname = "/index.html";
    const resolved = path.resolve(webRoot, "." + pathname);
    if (!resolved.startsWith(path.resolve(webRoot) + path.sep)) return sendJson(res, 403, { error: "Acceso denegado." });
    try {
      const info = await stat(resolved);
      if (!info.isFile()) return sendJson(res, 404, { error: "No encontrado." });
      const body = await readFile(resolved);
      res.writeHead(200, { "Content-Type": MIME[path.extname(resolved)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Content-Length": body.length });
      return res.end(req.method === "HEAD" ? undefined : body);
    } catch { return sendJson(res, 404, { error: "No encontrado." }); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createAppServer().listen(PORT, "0.0.0.0", () => console.log("VODX listo en el puerto " + PORT));
}
