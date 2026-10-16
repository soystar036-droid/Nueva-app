import test from "node:test";
import assert from "node:assert/strict";
import { validateVodDownloadUrl, validateClipRange, createDownloadService } from "../server/downloads.js";

test("acepta únicamente URLs HTTPS de VOD en kick.com", () => {
  assert.equal(validateVodDownloadUrl("https://kick.com/soypan/videos/abc123"), "https://kick.com/soypan/videos/abc123");
  assert.equal(validateVodDownloadUrl("http://kick.com/soypan/videos/abc123"), null);
  assert.equal(validateVodDownloadUrl("https://kick.com.evil.test/soypan/videos/abc123"), null);
  assert.equal(validateVodDownloadUrl("https://user@kick.com/soypan/videos/abc123"), null);
  assert.equal(validateVodDownloadUrl("https://kick.com/soypan/videos/abc123/extra"), null);
  assert.equal(validateVodDownloadUrl("https://example.com/soypan/videos/abc123"), null);
});

test("limita fragmentos a un máximo de 30 minutos", () => {
  assert.deepEqual(validateClipRange(0, 30), { start: 0, end: 30 });
  assert.equal(validateClipRange(30, 30), null);
  assert.equal(validateClipRange(0, 1801), null);
  assert.equal(validateClipRange(-1, 20), null);
  assert.equal(validateClipRange("0", 20), null);
});

test("la descarga está desactivada por defecto y no ejecuta procesos", async () => {
  let called = false;
  const service = createDownloadService({ env: {}, spawnImpl: () => { called = true; throw new Error("no debe ejecutarse"); } });
  await assert.rejects(service.download({ url: "https://kick.com/soypan/videos/abc123" }), /VODX_ENABLE_DOWNLOADS/);
  assert.equal(called, false);
});

test("rechaza URLs inválidas antes de invocar yt-dlp", async () => {
  let called = false;
  const service = createDownloadService({ env: { VODX_ENABLE_DOWNLOADS: "true" }, spawnImpl: () => { called = true; throw new Error("no debe ejecutarse"); } });
  await assert.rejects(service.download({ url: "https://example.com/anything" }), /VOD público de kick.com/);
  assert.equal(called, false);
});
