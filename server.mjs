import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { gpuInfo, gpuBenchmark, validateWorkload } from './cuda-backend.mjs';
const allowed = new Set(['index.html', 'style.css', 'app.mjs', 'core.mjs', 'engine.mjs', 'worker.mjs']);
const types = { html: 'text/html', css: 'text/css', mjs: 'text/javascript' };
let gpuBusy = false;
const info = gpuInfo();
function json(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  // Local API can only be accessed from this loopback application's origin.
  if (!['127.0.0.1:4314', 'localhost:4314'].includes(req.headers.host)) { json(res, 403, { error: 'Invalid host.' }); return; }
  if (req.headers.origin && !['http://127.0.0.1:4314', 'http://localhost:4314'].includes(req.headers.origin)) { json(res, 403, { error: 'Invalid origin.' }); return; }
  const path = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (path === 'api/gpu' && req.method === 'GET') { json(res, 200, await info); return; }
  if (path === 'api/gpu/benchmark') {
    if (req.method !== 'POST') { json(res, 405, { error: 'Use POST.' }); return; }
    if (req.headers['content-type'] !== 'application/json') { json(res, 415, { error: 'Use application/json.' }); return; }
    if (gpuBusy) { json(res, 409, { error: 'A CUDA benchmark is already running.' }); return; }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Request too large.'); }
      const options = JSON.parse(body); validateWorkload(options);
      if (gpuBusy) { json(res, 409, { error: 'A CUDA benchmark is already running.' }); return; }
      gpuBusy = true;
      try { const result = await gpuBenchmark(options, { signal: controller.signal }); if (!res.destroyed) json(res, 200, result); }
      finally { gpuBusy = false; }
    } catch (error) { if (!res.destroyed) json(res, 400, { error: error.message }); }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (!allowed.has(path)) { res.writeHead(404); res.end('Not found'); return; }
  try { const body = await readFile(new URL(path, import.meta.url)); res.writeHead(200, { 'Content-Type': types[path.split('.').pop()] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); }
  catch { res.writeHead(500); res.end('Unable to read application file'); }
});
server.listen(4314, '127.0.0.1', () => console.log('Crypto Strength Bench: http://127.0.0.1:4314'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
