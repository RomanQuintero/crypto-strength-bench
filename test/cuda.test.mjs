import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { executable, runNative, gpuBenchmark, gpuInfo, validateWorkload } from '../cuda-backend.mjs';
import { benchmark } from '../engine.mjs';
const available = existsSync(executable);
test('CUDA API rejects unsupported algorithms and unbounded workloads', () => {
  assert.throws(() => validateWorkload({ algorithm: 'PBKDF2', iterations: 100, length: 12 }), /SHA-256 only/);
  for (const iterations of [-1, 99, 100000001, 1.5, '100']) assert.throws(() => validateWorkload({ algorithm: 'SHA-256', iterations, length: 12 }));
  for (const length of [0, 257, -1, '12']) assert.throws(() => validateWorkload({ algorithm: 'SHA-256', iterations: 100, length }));
});
test('CUDA GPU detection and built-in standard-vector self-tests', { skip: !available }, async () => {
  const info = await gpuInfo(); assert.equal(info.available, true); assert.equal(info.selftest, true); assert.match(info.device, /NVIDIA/);
});
test('GPU hash matches independent CPU SHA-256 across padding boundaries and binary input', { skip: !available }, async () => {
  for (const length of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 127, 128, 255, 256]) {
    const input = Buffer.from(Array.from({ length }, (_, i) => (i * 131 + 255) % 256));
    const value = await runNative(['hash', input.toString('hex')]);
    assert.equal(value.digest, createHash('sha256').update(input).digest('hex'), `length ${length}`);
  }
});
test('same CPU/GPU candidate workload: sampled digests and all-candidate checksums', { skip: !available }, async () => {
  for (const length of [1, 12, 56, 256]) {
    const options = { algorithm: 'SHA-256', iterations: 1000, length };
    const cpu = await benchmark(options); const gpu = await gpuBenchmark(options);
    assert.equal(gpu.iterations, cpu.iterations); assert.equal(gpu.checksum, cpu.checksum, `length ${length}`);
    assert.equal(gpu.verified, true); assert.equal(gpu.digestSamples.length, 3);
    assert.ok(gpu.kernelElapsed > 0); assert.ok(gpu.requestElapsed >= gpu.elapsed);
    assert.ok(Math.abs(gpu.rate - gpu.iterations / gpu.elapsed) < 0.01);
  }
});
test('CUDA cancellation does not return a completed measurement', { skip: !available }, async () => {
  const controller = new AbortController();
  const pending = gpuBenchmark({ algorithm: 'SHA-256', iterations: 2000000, length: 256 }, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, /cancelled/);
  const running = new AbortController();
  const active = gpuBenchmark({ algorithm: 'SHA-256', iterations: 100000000, length: 256 }, { signal: running.signal });
  const timer = setTimeout(() => running.abort(), 50);
  await assert.rejects(active, /cancelled/); clearTimeout(timer);
});
test('GPU batches preserve CPU candidate order across the batch boundary', { skip: !available }, async () => {
  const options = { algorithm: 'SHA-256', iterations: 262149, length: 1 };
  const cpu = await benchmark(options); const gpu = await gpuBenchmark(options);
  assert.equal(gpu.iterations, options.iterations); assert.equal(gpu.checksum, cpu.checksum); assert.equal(gpu.verified, true);
});
