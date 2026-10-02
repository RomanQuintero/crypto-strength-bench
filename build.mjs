import { mkdir, copyFile, access } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const f of ['index.html', 'style.css', 'app.mjs', 'core.mjs', 'engine.mjs', 'worker.mjs']) await copyFile(f, `dist/${f}`);
for (const f of ['server.mjs', 'cuda-backend.mjs']) await copyFile(f, `dist/${f}`);
try {
  await access('native/build/crypto_cuda.exe');
  await mkdir('dist/native/build', { recursive: true });
  await copyFile('native/build/crypto_cuda.exe', 'dist/native/build/crypto_cuda.exe');
  console.log('Built CPU + CUDA application in dist/. Launch with node dist/server.mjs.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log('Built CPU application in dist/. Compile CUDA with npm run build:cuda to include the GPU backend.');
}
