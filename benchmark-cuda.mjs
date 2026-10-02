import { gpuBenchmark, gpuInfo } from './cuda-backend.mjs';
import { benchmark } from './engine.mjs';
import { cpus } from 'node:os';
import { writeFile } from 'node:fs/promises';
const options = { algorithm: 'SHA-256', iterations: 1000000, length: 12 };
const measurements = [];
for (let run = 1; run <= 3; run++) {
  const cpu = { ...await benchmark(options), backendId: 'cpu', runtime: `Node ${process.version}` };
  const gpu = await gpuBenchmark(options);
  if (cpu.iterations !== gpu.iterations || cpu.checksum !== gpu.checksum) throw new Error('CPU/GPU workload mismatch');
  console.log(`Run ${run}: CPU ${Math.round(cpu.rate).toLocaleString('en-US')}/s; CUDA steady ${Math.round(gpu.rate).toLocaleString('en-US')}/s; kernel ${Math.round(gpu.kernelRate).toLocaleString('en-US')}/s; request ${gpu.requestElapsed.toFixed(3)} s; ${(gpu.rate / cpu.rate).toFixed(2)}x; checksum MATCH`);
  measurements.push({ run, cpu, gpu, implementationRatio: gpu.rate / cpu.rate });
}
await writeFile('cuda-results.json', JSON.stringify({ hardware: { cpu: cpus()[0].model.trim(), gpu: await gpuInfo() }, workload: options, measurements }, null, 2));
