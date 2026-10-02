import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { candidate } from './core.mjs';
export const executable = fileURLToPath(new URL('./native/build/crypto_cuda.exe', import.meta.url));
export function validateWorkload(options) {
  if (options.algorithm !== 'SHA-256') throw new Error('CUDA currently supports SHA-256 only. PBKDF2 remains available on CPU.');
  if (!Number.isInteger(options.iterations) || options.iterations < 100 || options.iterations > 100000000) throw new Error('CUDA iterations must be between 100 and 100,000,000.');
  if (!Number.isInteger(options.length) || options.length < 1 || options.length > 256) throw new Error('Candidate length must be between 1 and 256.');
}
export async function runNative(args, { signal, timeout = 30000 } = {}) {
  await access(executable).catch(() => { throw new Error('CUDA binary is missing. Run npm run build:cuda.'); });
  if (signal?.aborted) throw new Error('CUDA request cancelled.');
  return new Promise((resolve, reject) => {
    // Fixed executable and argument vector: no shell, arbitrary paths or commands.
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', failure = null;
    const stop = message => { failure = new Error(message); child.kill(); };
    const cancel = () => stop('CUDA request cancelled.');
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => stop('CUDA request exceeded its 30-second limit.'), timeout);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 1000000) stop('CUDA output exceeded limit.'); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error(stderr.trim() || `CUDA process exited with ${code}.`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Invalid CUDA process result.')); }
    });
  });
}
export async function gpuInfo(options) {
  try { return await runNative(['info'], options); }
  catch (e) { return { available: false, reason: e.message }; }
}
export async function gpuBenchmark(options, { signal } = {}) {
  validateWorkload(options);
  const start = performance.now();
  const result = await runNative(['benchmark', String(options.iterations), String(options.length)], { signal });
  if (!result.selftest || result.iterations < 1 || result.iterations > options.iterations || !(result.elapsed > 0) || !(result.kernelElapsed > 0) || !Array.isArray(result.digestSamples) || result.digestSamples.length < 1) throw new Error('Invalid CUDA measurement.');
  for (const sample of result.digestSamples) {
    if (!Number.isInteger(sample.index) || sample.index < 0 || sample.index >= result.iterations) throw new Error('Invalid CUDA sample index.');
    const expected = createHash('sha256').update(candidate(sample.index, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', options.length)).digest('hex');
    if (sample.digest !== expected) throw new Error(`GPU/CPU digest mismatch at candidate ${sample.index}.`);
  }
  const requestElapsed = (performance.now() - start) / 1000;
  return { ...result, backend: `GPU · CUDA · ${result.device}`, backendId: 'cuda', rounds: null, requestElapsed, requestRate: result.iterations / requestElapsed, verified: true, date: new Date().toISOString(), timing: 'Steady-state candidate generation + full SHA-256 + digest D2H copies + CPU checksum. Startup, self-tests, allocation and 3 warm-up batches excluded.', kernelTiming: 'CUDA events on default stream: candidate generation + full SHA-256 + global digest writes; no host copies.', requestTiming: 'Process spawn, CUDA context initialization, known-vector self-tests, allocations, warm-up, measured work, cleanup and sampled CPU digest verification.' };
}
