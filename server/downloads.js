import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_BYTES = 900 * 1024 * 1024;
const RETENTION_MS = 6 * 60 * 60 * 1000;
const MAX_RUNTIME_MS = 90 * 60 * 1000;

export function validateVodDownloadUrl(value) {
  let url;
  try { url = new URL(String(value ?? "").trim()); } catch { return null; }
  if (url.protocol !== "https:" || !["kick.com", "www.kick.com"].includes(url.hostname.toLowerCase())) return null;
  if (url.username || url.password || url.port) return null;
  if (!/^\/[a-zA-Z0-9_]{1,25}\/(videos|video)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
  url.hash = "";
  return url.toString();
}

export function validateClipRange(start, end) {
  const valid = value => Number.isInteger(value) && value >= 0 && value <= 24 * 60 * 60;
  if (!valid(start) || !valid(end) || end <= start) return null;
  if (end - start > 30 * 60) return null;
  return { start, end };
}

function runCommand(spawnImpl, command, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(command, args, { stdio: ["ignore", "ignore", "pipe"] }); }
    catch (error) { reject(error); return; }
    let stderr = "";
    child.stderr?.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-3000); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("La operación superó el tiempo permitido.")); }, timeoutMs);
    timer.unref?.();
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || "La herramienta de descarga no pudo completar la operación."));
    });
  });
}

export function createDownloadService({ env = process.env, spawnImpl = spawn, now = () => Date.now() } = {}) {
  const directory = path.resolve(env.TEMP_DIR || "/tmp/vodx");
  const ytdlp = env.YTDLP_PATH || "yt-dlp";
  const ffmpeg = env.FFMPEG_PATH || "ffmpeg";
  const files = new Map();
  const jobs = new Map();
  let active = false;

  async function cleanup() {
    const current = now();
    for (const [id, record] of files) {
      if (record.expiresAt > current) continue;
      files.delete(id);
      try { await unlink(record.path); } catch {}
    }
    for (const [id, job] of jobs) if (job.expiresAt <= current) jobs.delete(id);
    try {
      const names = await readdir(directory);
      for (const name of names) {
        if (!/^vodx-[0-9a-f-]{36}\.[a-z0-9]{1,8}(\.part)?$/i.test(name)) continue;
        const full = path.join(directory, name);
        try { if (current - (await stat(full)).mtimeMs > RETENTION_MS) await unlink(full); } catch {}
      }
    } catch {}
  }

  async function download({ url, startSeconds, endSeconds }) {
    if (env.VODX_ENABLE_DOWNLOADS !== "true") {
      const error = new Error("La descarga real está desactivada. Activa VODX_ENABLE_DOWNLOADS=true después de instalar yt-dlp y ffmpeg en el servidor.");
      error.status = 503; throw error;
    }
    const safeUrl = validateVodDownloadUrl(url);
    if (!safeUrl) { const error = new Error("El enlace debe ser un VOD público de kick.com con formato válido."); error.status = 400; throw error; }
    const hasStart = startSeconds !== undefined || endSeconds !== undefined;
    let range = null;
    if (hasStart) {
      range = validateClipRange(startSeconds, endSeconds);
      if (!range) { const error = new Error("El fragmento debe durar entre 1 segundo y 30 minutos, con tiempos válidos."); error.status = 400; throw error; }
    }
    if (active) { const error = new Error("Ya hay una descarga en curso. Inténtalo cuando termine."); error.status = 429; throw error; }
    active = true;
    const id = randomUUID();
    try {
      await cleanup();
      await mkdir(directory, { recursive: true });
      await runCommand(spawnImpl, ytdlp, ["--version"]);
      await runCommand(spawnImpl, ffmpeg, ["-version"]);
      const output = path.join(directory, `vodx-${id}.%(ext)s`);
      const args = [
        "--ignore-config", "--no-playlist", "--no-warnings", "--no-progress",
        "--socket-timeout", "15", "--max-filesize", "900M", "--restrict-filenames",
        "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
        "--merge-output-format", "mp4", "-o", output
      ];
      if (range) args.push("--download-sections", `*${range.start}-${range.end}`, "--force-keyframes-at-cuts");
      args.push("--", safeUrl);
      await runCommand(spawnImpl, ytdlp, args, MAX_RUNTIME_MS);
      const candidates = (await readdir(directory)).filter(name => name.startsWith(`vodx-${id}.`) && !name.endsWith(".part"));
      const candidateStats = await Promise.all(candidates.map(async name => ({ name, info: await stat(path.join(directory, name)) })));
      const result = candidateStats.find(item => item.info.isFile() && item.info.size > 0 && item.info.size <= MAX_BYTES);
      if (!result) {
        for (const name of candidates) try { await unlink(path.join(directory, name)); } catch {}
        const error = new Error("No se encontró un archivo válido o supera el límite de 900 MB."); error.status = 413; throw error;
      }
      const record = { id, path: path.join(directory, result.name), filename: result.name, size: result.info.size, expiresAt: now() + RETENTION_MS };
      files.set(id, record);
      return { id, filename: record.filename, size: record.size, expiresAt: record.expiresAt, downloadUrl: `/api/download/file?id=${id}` };
    } catch (error) {
      try {
        const names = await readdir(directory);
        for (const name of names) if (name.startsWith(`vodx-${id}.`)) try { await unlink(path.join(directory, name)); } catch {}
      } catch {}
      if (error.code === "ENOENT") {
        const unavailable = new Error("No se encontró yt-dlp o ffmpeg en el servidor. Instala ambas herramientas y revisa YTDLP_PATH/FFMPEG_PATH.");
        unavailable.status = 503; throw unavailable;
      }
      if (!error.status) { error.status = 502; error.message = "La descarga falló. El VOD puede ser privado, estar restringido o no estar disponible."; }
      throw error;
    } finally {
      active = false;
    }
  }

  function startDownload(args) {
    if (env.VODX_ENABLE_DOWNLOADS !== "true") {
      const error = new Error("La descarga real está desactivada. Activa VODX_ENABLE_DOWNLOADS=true después de instalar yt-dlp y ffmpeg en el servidor.");
      error.status = 503; throw error;
    }
    if (!validateVodDownloadUrl(args?.url)) {
      const error = new Error("El enlace debe ser un VOD público de kick.com con formato válido."); error.status = 400; throw error;
    }
    if (args?.startSeconds !== undefined || args?.endSeconds !== undefined) {
      if (!validateClipRange(args.startSeconds, args.endSeconds)) {
        const error = new Error("El fragmento debe durar entre 1 segundo y 30 minutos, con tiempos válidos."); error.status = 400; throw error;
      }
    }
    if (active) { const error = new Error("Ya hay una descarga en curso. Inténtalo cuando termine."); error.status = 429; throw error; }
    const id = randomUUID();
    const job = { id, status: "queued", createdAt: now(), expiresAt: now() + RETENTION_MS, result: null, error: null };
    jobs.set(id, job);
    Promise.resolve().then(async () => {
      job.status = "processing";
      try {
        job.result = await download(args);
        job.status = "completed";
      } catch (error) {
        job.status = "failed";
        job.error = { status: Number(error.status) || 502, message: error.message || "La descarga falló." };
      }
      job.updatedAt = now();
    });
    return { id, status: job.status, statusUrl: `/api/download/status?id=${id}` };
  }

  async function getJob(id) {
    await cleanup();
    if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ""))) return null;
    const job = jobs.get(id);
    if (!job || job.expiresAt <= now()) { jobs.delete(id); return null; }
    return { id: job.id, status: job.status, result: job.result, error: job.error, updatedAt: job.updatedAt ?? job.createdAt };
  }

  async function getFile(id) {
    await cleanup();
    if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ""))) return null;
    const record = files.get(id);
    if (!record || record.expiresAt <= now()) { files.delete(id); return null; }
    return record;
  }

  return { download, startDownload, getJob, getFile, cleanup };
}
