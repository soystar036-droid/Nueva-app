import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer, normalizeSlug } from "../server.js";
test("normaliza slugs de Kick",()=>{assert.equal(normalizeSlug("@Soy_Pan"),"soy_pan");assert.equal(normalizeSlug("bad slug"),null);assert.equal(normalizeSlug(""),null)});
test("health no expone credenciales",async t=>{const server=createAppServer({env:{KICK_CLIENT_ID:"id",KICK_CLIENT_SECRET:"secret-hidden"}});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/health");const body=await response.json();assert.equal(response.status,200);assert.equal(body.ok,true);assert.equal(body.kickConfigured,true);assert.equal(JSON.stringify(body).includes("secret-hidden"),false)});
test("valida slug antes de consultar Kick",async t=>{const server=createAppServer({env:{},fetchImpl:async()=>{throw new Error("No debería llamarse")}});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/kick/channel?slug=bad%20slug");assert.equal(response.status,400);assert.match((await response.json()).error,/usuario válido/i)});
test("indica credenciales faltantes",async t=>{const server=createAppServer({env:{},fetchImpl:async()=>{throw new Error("No debería llamarse")}});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/kick/channel?slug=soypan");assert.equal(response.status,503);assert.match((await response.json()).error,/KICK_CLIENT_ID/)});
test("sirve la interfaz",async t=>{const server=createAppServer({env:{}});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const response=await fetch("http://127.0.0.1:"+server.address().port+"/");assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/text\/html/);assert.match(await response.text(),/Kick Wrapped/)});

test("consulta un canal usando el token OAuth de aplicación", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://id.kick.com/oauth/token") {
      return new Response(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [{
      broadcaster_user_id: 77,
      slug: "soypan",
      stream_title: "Prueba de directo",
      category: { name: "Just Chatting" },
      stream: { is_live: true }
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const { createKickClient } = await import("../server.js");
  const client = createKickClient({ env: { KICK_CLIENT_ID: "client", KICK_CLIENT_SECRET: "secret" }, fetchImpl });
  const channel = await client.getChannel("soypan");
  assert.equal(channel.id, 77);
  assert.equal(channel.slug, "soypan");
  assert.equal(channel.category, "Just Chatting");
  assert.equal(channel.streamTitle, "Prueba de directo");
  assert.equal(channel.isLive, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /slug=soypan/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer mock-token");
});


test("endpoint de descarga informa cuando la función está desactivada", async t => {
  const server = createAppServer({ env: { VODX_ENABLE_DOWNLOADS: "false" } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://kick.com/soypan/videos/abc123" })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /VODX_ENABLE_DOWNLOADS/);
});

test("endpoint de descarga rechaza hosts externos", async t => {
  const server = createAppServer({ env: { VODX_ENABLE_DOWNLOADS: "true" } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/video" })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /kick.com/);
});


test("la API inicia una tarea asíncrona y permite consultar su estado", async t => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const downloadService = {
    startDownload: () => ({ id, status: "queued", statusUrl: "/api/download/status?id=" + id }),
    getJob: async requestedId => requestedId === id ? { id, status: "processing", result: null, error: null } : null,
    getFile: async () => null
  };
  const server = createAppServer({ env: {}, downloadService });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const started = await fetch(base + "/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://kick.com/soypan/videos/abc123" })
  });
  assert.equal(started.status, 202);
  assert.equal((await started.json()).data.id, id);
  const status = await fetch(base + "/api/download/status?id=" + id);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).data.status, "processing");
});
