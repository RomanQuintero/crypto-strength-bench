import { candidate, space, uniqueAlphabet } from './core.mjs';
const encoder = new TextEncoder();
const salt = encoder.encode('Crypto Strength Bench / synthetic salt / v1');
export const BACKEND = 'CPU · native Web Crypto · one worker';
export function hex(buffer) { return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, '0')).join(''); }
export async function evaluate(value, algorithm = 'SHA-256', rounds = 10000) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  if (algorithm === 'SHA-256') return crypto.subtle.digest('SHA-256', bytes);
  if (algorithm !== 'PBKDF2') throw new Error('Unsupported algorithm.');
  if (!Number.isInteger(rounds) || rounds < 1000 || rounds > 1000000) throw new Error('PBKDF2 rounds must be between 1,000 and 1,000,000.');
  const key = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256);
}
export async function benchmark({ algorithm = 'SHA-256', iterations = 20000, rounds = 10000, length = 12 }, progress = () => {}) {
  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 2000000) throw new Error('Benchmark evaluations must be between 100 and 2,000,000.');
  if (!Number.isInteger(length) || length < 1 || length > 256) throw new Error('Invalid candidate length.');
  const warmup = algorithm === 'SHA-256' ? 256 : 8;
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < warmup; i++) await evaluate(candidate(i, alphabet, length), algorithm, rounds);
  const start = performance.now(); let completed = 0, last = start, checksum = 0;
  const samples = []; let sampleStart = start, sampleCount = 0;
  for (let i = 0; i < iterations; i++) {
    const digest = await evaluate(candidate(i, alphabet, length), algorithm, rounds);
    checksum ^= new Uint8Array(digest)[0]; completed++; sampleCount++;
    if (completed % 100 === 0) {
      const now = performance.now();
      if (now - sampleStart >= 150) { samples.push(sampleCount / ((now - sampleStart) / 1000)); sampleCount = 0; sampleStart = now; }
      if (now - last >= 100) { progress({ completed, iterations, elapsed: (now - start) / 1000 }); last = now; }
    }
    if (performance.now() - start > 15000) break;
  }
  const elapsed = (performance.now() - start) / 1000;
  return { algorithm, backend: BACKEND, rounds: algorithm === 'PBKDF2' ? rounds : null, length, requestedIterations: iterations, iterations: completed, elapsed, rate: completed / elapsed, warmup, samples, checksum, date: new Date().toISOString(), capped: completed < iterations };
}
export async function recover({ alphabet, length, secret }, progress = () => {}) {
  alphabet = uniqueAlphabet(alphabet);
  const n = space(alphabet, length);
  if (n > 500000n) throw new Error('Demo is limited to 500,000 candidates.');
  if (Array.from(secret).length !== length || Array.from(secret).some(c => !Array.from(alphabet).includes(c))) throw new Error('The test secret must match the demo alphabet and length.');
  const target = hex(await evaluate(secret));
  progress({ target, total: Number(n), attempts: 0, elapsed: 0 });
  const start = performance.now(); let last = start;
  for (let i = 0; i < Number(n); i++) {
    const value = candidate(i, alphabet, length);
    if (hex(await evaluate(value)) === target) return { secret: value, target, total: Number(n), attempts: i + 1, elapsed: (performance.now() - start) / 1000 };
    if (i % 100 === 0 && performance.now() - last > 100) { last = performance.now(); progress({ target, total: Number(n), attempts: i + 1, elapsed: (last - start) / 1000 }); }
  }
  throw new Error('Secret not found.');
}
