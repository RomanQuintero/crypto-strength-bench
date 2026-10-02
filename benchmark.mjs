import { benchmark } from './engine.mjs';
import { cpus, platform, release } from 'node:os';
import { writeFile } from 'node:fs/promises';
const measurements = [];
for (const algorithm of ['SHA-256', 'PBKDF2']) {
  const result = await benchmark({ algorithm, iterations: algorithm === 'SHA-256' ? 100000 : 1000, rounds: 10000, length: 12 });
  measurements.push({ ...result, backend: 'CPU · Node native Web Crypto · sequential candidate loop' });
  console.log(`${algorithm}: ${result.rate.toFixed(2)} candidates/s · ${result.iterations} evaluations · ${result.elapsed.toFixed(3)} seconds`);
}
const report = { hardware: { cpu: cpus()[0]?.model, logicalProcessors: cpus().length, platform: platform(), release: release(), node: process.version, gpuDetected: 'NVIDIA GeForce RTX 3090 (unused; CUDA toolkit not found)' }, measurements };
await writeFile('example-results.json', JSON.stringify(report, null, 2));
