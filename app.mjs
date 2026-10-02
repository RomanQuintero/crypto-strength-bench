import { alphabets, uniqueAlphabet, space, entropySpace, estimates, scientific, halfScientific, timeLabel, universeLog, randomSecret, rulerPosition, rulerMax } from './core.mjs';
const $ = id => document.getElementById(id);
let measurement = null, worker = null, runKind = null;
const history = [];
let compareOptions = null, gpuAvailable = false;
const latest = { cpu: null, cuda: null };
function saveMeasurement(value) {
  const other = latest[value.backendId === 'cuda' ? 'cpu' : 'cuda'];
  if (other && value.algorithm === other.algorithm && value.length === other.length && value.iterations === other.iterations && value.requestedIterations === other.requestedIterations && value.checksum !== other.checksum) throw new Error('CPU/GPU all-candidate checksum mismatch. Measurement rejected.');
  measurement = { ...value, backendId: value.backendId ?? 'cpu', environment: { userAgent: navigator.userAgent, logicalProcessors: navigator.hardwareConcurrency ?? null } };
  history.push(measurement); latest[measurement.backendId] = measurement;
  showMeasurement(measurement); showComparison();
}
function showMeasurement(value) {
  measurement = value;
  $('rate').textContent = Math.round(value.rate).toLocaleString('en-US');
  $('measurement').textContent = `${value.backend} · ${value.algorithm}${value.rounds ? ` · ${value.rounds.toLocaleString('en-US')} rounds` : ''} · ${value.iterations.toLocaleString('en-US')} evaluations in ${value.elapsed.toFixed(3)} s · ${value.length}-character candidates · ${value.warmup.toLocaleString('en-US')} warm-up evaluations. ${value.elapsed < .25 ? 'Short sample: repeat with more work.' : ''}`;
  $('status').textContent = value.capped ? 'Time cap reached. Rate uses completed work only.' : 'Measurement complete. Explore the search space.';
  $('bench-progress').style.width = '100%'; $('export').disabled = false; render();
}
function showComparison() {
  const cpu = latest.cpu, gpu = latest.cuda;
  for (const [id, value] of [['cpu', cpu], ['gpu', gpu]]) {
    $(`${id}-rate`).textContent = value ? `${Math.round(value.rate).toLocaleString('en-US')}/s` : '—';
    $(`${id}-details`).textContent = value ? `${value.algorithm} · ${value.length} chars · ${value.iterations.toLocaleString('en-US')} evaluations · ${value.elapsed.toFixed(4)} s` : `No ${id.toUpperCase()} measurement yet.`;
    $(`use-${id}`).disabled = !value;
  }
  if (gpu) $('gpu-timings').textContent = `CUDA kernel only: ${Math.round(gpu.kernelRate).toLocaleString('en-US')}/s (${(gpu.kernelElapsed * 1000).toFixed(3)} ms). Steady-state with digest copies/checksum: ${Math.round(gpu.rate).toLocaleString('en-US')}/s. Complete server request: ${Math.round(gpu.requestRate).toLocaleString('en-US')}/s (${gpu.requestElapsed.toFixed(3)} s). Browser round trip: ${gpu.browserElapsed?.toFixed(3) ?? '—'} s. CUDA vectors and sampled CPU digests verified.`;
  const match = cpu && gpu && cpu.algorithm === gpu.algorithm && cpu.length === gpu.length && cpu.requestedIterations === gpu.requestedIterations && cpu.iterations === gpu.iterations;
  if (match && cpu.checksum !== gpu.checksum) { $('comparison-state').textContent = 'CHECKSUM MISMATCH'; $('comparison-ratio').textContent = 'CPU/GPU validation failed. Do not use this comparison.'; return; }
  $('comparison-state').textContent = match ? 'MATCHED WORKLOAD · VERIFIED' : cpu && gpu ? 'DIFFERENT WORKLOADS' : 'AWAITING MEASUREMENTS';
  $('comparison-ratio').textContent = match ? `Measured implementation ratio: ${(gpu.rate / cpu.rate).toFixed(2)}× GPU / CPU, including digest transfer overhead on GPU. All-candidate checksum matches.` : 'Run “Measure CPU vs GPU” for a matched SHA-256 workload. No ratio is calculated for different workloads.';
}
function backendControls() {
  const sha = $('algorithm').value === 'SHA-256';
  $('cuda-option').disabled = !gpuAvailable || !sha;
  if (!sha && $('backend').value === 'cuda') $('backend').value = 'cpu';
  $('backend-note').textContent = $('backend').value === 'cuda' ? 'GPU · real CUDA SHA-256. Headline rate includes full digest transfers; kernel-only timing is separate.' : `CPU · sequential native Web Crypto in one worker.${!sha ? ' PBKDF2 is CPU-only.' : ''}`;
  $('compare').disabled = !gpuAvailable || !sha || !!worker;
  const gpu = $('backend').value === 'cuda';
  document.querySelectorAll('[data-gpu-only]').forEach(option => option.disabled = !gpu);
  if (!gpu && Number($('iterations').value) > 2000000) $('iterations').value = '1000000';
}
function currentSpace() { return $('model').value === 'bits' ? entropySpace(Number($('length').value)) : space($('alphabet').value === 'custom' ? $('custom').value : alphabets[$('alphabet').value], Number($('length').value)); }
function render() {
  const bits = $('model').value === 'bits';
  $('alphabet-row').hidden = bits; $('custom-row').hidden = bits || $('alphabet').value !== 'custom';
  $('length-label').textContent = bits ? 'Uniform entropy' : 'Secret length';
  $('length-value').textContent = `${$('length').value} ${bits ? 'bits' : 'characters'}`;
  $('range-min').textContent = bits ? '1 BIT' : '1 CHARACTER'; $('range-max').textContent = bits ? '256 BITS' : '32 CHARACTERS';
  try {
    const n = currentSpace(); const entropy = estimates(n, 1).entropy;
    $('space').textContent = scientific(n); $('space').title = n.toString();
    $('entropy').textContent = `${entropy.toFixed(2)} bits`; $('attempts').textContent = halfScientific(n);
    if (!measurement) return;
    const t = estimates(n, measurement.rate);
    $('average').textContent = timeLabel(t.average); $('worst').textContent = timeLabel(t.worst);
    $('marker').hidden = false;
    $('marker').style.left = `${rulerPosition(t.average)}%`;
    $('marker').querySelector('span').textContent = t.average > rulerMax ? 'FAR BEYOND →' : 'EXPECTED';
    const delta = t.average - universeLog;
    $('perspective').textContent = delta >= 0 ? `At this measured rate, the expected search takes ${delta < 6 ? (10 ** delta).toLocaleString('en-US', { maximumFractionDigits: 2 }) : `${(10 ** (delta - Math.floor(delta))).toFixed(2)} × 10^${Math.floor(delta)}`} times the approximate 13.8-billion-year age of the universe.` : `At this measured rate, expected exhaustive search takes ${timeLabel(t.average)}. ${bits ? 'Each extra bit doubles the space.' : `Each extra character multiplies the space by ${Array.from(uniqueAlphabet($('alphabet').value === 'custom' ? $('custom').value : alphabets[$('alphabet').value])).length}.`}`;
    if (t.average < -3) $('perspective').textContent += ' The estimate falls below the 1 ms ruler boundary.';
    const max = Number($('length').max); const values = [];
    for (let i = 1; i <= max; i++) { const ni = bits ? entropySpace(i) : space($('alphabet').value === 'custom' ? $('custom').value : alphabets[$('alphabet').value], i); values.push(estimates(ni, measurement.rate).average); }
    const high = values.at(-1);
    // Linear seconds mapped through log1p produce an exponential growth curve without overflow.
    const y = v => 100 - 90 * Math.log10(1 + 10 ** Math.max(-300, v - high + 2)) / Math.log10(101);
    $('curve').setAttribute('d', values.map((v, i) => `${i ? 'L' : 'M'}${10 + i / (max - 1) * 780},${y(v)}`).join(' '));
    const index = Number($('length').value) - 1;
    $('chart-point').setAttribute('cx', 10 + index / (max - 1) * 780); $('chart-point').setAttribute('cy', y(values[index]));
    $('chart-caption').textContent = `Relative time · 1–${max} ${bits ? 'bits' : 'characters'} · maximum normalized`;
  } catch (e) { $('space').textContent = 'Invalid alphabet'; $('entropy').textContent = '—'; $('attempts').textContent = '—'; $('average').textContent = e.message; $('worst').textContent = '—'; $('marker').hidden = true; }
}
function switchModel(bits, value) { $('model').value = bits ? 'bits' : 'alphabet'; $('length').max = bits ? '256' : '32'; $('length').value = value; render(); }
function busy(value) {
  $('run').disabled = value; $('recover').disabled = value;
  $('compare').disabled = value || !gpuAvailable || $('algorithm').value !== 'SHA-256';
  for (const id of ['algorithm', 'backend', 'iterations', 'rounds']) $(id).disabled = value;
  $('use-cpu').disabled = value || !latest.cpu; $('use-gpu').disabled = value || !latest.cuda;
  $('cancel').hidden = !value || runKind !== 'benchmark'; $('cancel-demo').hidden = !value || runKind !== 'recover';
}
function start(kind, options, backend = 'cpu') {
  if (worker) return;
  runKind = kind; busy(true);
  const status = kind === 'benchmark' ? $('status') : $('demo-status'); status.classList.remove('error');
  if (backend === 'cuda') { startGpu(options); return; }
  status.textContent = kind === 'benchmark' ? 'Warming up native crypto…' : 'Hashing the local test secret…';
  worker = new Worker('./worker.mjs', { type: 'module' });
  worker.onerror = () => finishError('Worker failed. Serve this app through localhost or HTTPS in a modern browser.');
  worker.onmessage = ({ data }) => {
    if (data.type === 'error') { finishError(data.message); return; }
    if (data.type === 'progress') {
      if (kind === 'benchmark') { $('bench-progress').style.width = `${100 * data.value.completed / data.value.iterations}%`; status.textContent = `${data.value.completed.toLocaleString('en-US')} evaluations · ${data.value.elapsed.toFixed(2)} s`; }
      else showDemo(data.value);
    }
    if (data.type === 'result') {
      if (kind === 'benchmark') {
        try { saveMeasurement(data.value); } catch (error) { finishError(error.message); return; }
      } else { showDemo(data.value); $('recovered').hidden = false; $('recovered').textContent = `SECRET RECOVERED → ${data.value.secret}`; $('demo-status').textContent = `Digest matched after ${data.value.attempts.toLocaleString('en-US')} actual evaluations. Search ended at the match.`; }
      worker.terminate(); worker = null; busy(false);
      if (kind === 'benchmark' && compareOptions) { const options = compareOptions; compareOptions = null; $('backend').value = 'cuda'; backendControls(); start('benchmark', options, 'cuda'); }
    }
  };
  worker.postMessage({ kind, options });
}
async function startGpu(options) {
  const controller = new AbortController(); worker = { terminate: () => controller.abort() };
  const start = performance.now();
  const timer = setInterval(() => { $('status').textContent = `CUDA: startup, validation & bounded evaluation · ${((performance.now() - start) / 1000).toFixed(1)} s`; }, 100);
  $('status').textContent = 'Starting CUDA on the local GPU…';
  try {
    const response = await fetch('/api/gpu/benchmark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options), signal: controller.signal });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? 'CUDA request failed.');
    if (controller.signal.aborted) return;
    value.browserElapsed = (performance.now() - start) / 1000;
    saveMeasurement(value); worker = null; busy(false);
  } catch (error) { if (!controller.signal.aborted) finishError(error.message); }
  finally { clearInterval(timer); }
}
function finishError(message) { compareOptions = null; const status = runKind === 'benchmark' ? $('status') : $('demo-status'); status.textContent = message; status.classList.add('error'); worker?.terminate(); worker = null; busy(false); }
function showDemo(value) { $('target').textContent = value.target; $('demo-attempts').textContent = `${value.attempts.toLocaleString('en-US')} / ${value.total.toLocaleString('en-US')}`; $('demo-elapsed').textContent = `${value.elapsed.toFixed(2)} s`; $('demo-rate').textContent = value.elapsed > 0 ? `${Math.round(value.attempts / value.elapsed).toLocaleString('en-US')}/s` : '—'; $('demo-progress').style.width = `${100 * value.attempts / value.total}%`; }
function workload() { return { algorithm: $('algorithm').value, iterations: Number($('iterations').value), rounds: Number($('rounds').value), length: $('model').value === 'bits' ? 12 : Number($('length').value) }; }
$('run').onclick = () => { $('bench-progress').style.width = '0'; start('benchmark', workload(), $('backend').value); };
$('compare').onclick = () => { if (Number($('iterations').value) > 2000000) $('iterations').value = '1000000'; compareOptions = workload(); $('backend').value = 'cpu'; backendControls(); $('bench-progress').style.width = '0'; start('benchmark', compareOptions); };
$('use-cpu').onclick = () => { showMeasurement(latest.cpu); $('backend').value = 'cpu'; backendControls(); };
$('use-gpu').onclick = () => { showMeasurement(latest.cuda); $('backend').value = 'cuda'; backendControls(); };
$('algorithm').onchange = () => { $('rounds-row').hidden = $('algorithm').value !== 'PBKDF2'; backendControls(); };
$('backend').onchange = backendControls;
for (const id of ['alphabet', 'custom', 'length']) $(id).addEventListener('input', render);
$('model').onchange = () => switchModel($('model').value === 'bits', $('model').value === 'bits' ? 128 : 12);
document.querySelectorAll('[data-length]').forEach(b => b.onclick = () => switchModel(false, Number(b.dataset.length)));
document.querySelectorAll('[data-bits]').forEach(b => b.onclick = () => switchModel(true, Number(b.dataset.bits)));
for (const id of ['cancel', 'cancel-demo']) $(id).onclick = () => { compareOptions = null; worker?.terminate(); worker = null; busy(false); $(runKind === 'benchmark' ? 'status' : 'demo-status').textContent = 'Stopped. No partial benchmark was saved.'; };
function tab(demo) { $('lab').hidden = demo; $('demo').hidden = !demo; $('bench-tab').classList.toggle('active', !demo); $('demo-tab').classList.toggle('active', demo); $('bench-tab').setAttribute('aria-pressed', !demo); $('demo-tab').setAttribute('aria-pressed', demo); }
$('bench-tab').onclick = () => tab(false); $('demo-tab').onclick = () => tab(true);
$('generate').onclick = () => { $('secret').value = randomSecret(alphabets[$('demo-alphabet').value], Number($('demo-length').value)); $('recovered').hidden = true; };
for (const id of ['demo-alphabet', 'demo-length']) $(id).onchange = () => { $('secret').value = ''; $('recovered').hidden = true; };
$('recover').onclick = () => { $('recovered').hidden = true; $('demo-progress').style.width = '0'; start('recover', { alphabet: alphabets[$('demo-alphabet').value], length: Number($('demo-length').value), secret: $('secret').value }); };
$('export').onclick = () => { const blob = new Blob([JSON.stringify({ measurements: history, methodology: 'CPU native Web Crypto loop vs CUDA steady-state with full digest copies/checksum, both excluding warm-up/startup. GPU kernel-only and complete request timings are separately recorded.' }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'crypto-strength-measurements.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('hardware').textContent = `Browser: ${navigator.userAgent}. Logical processors exposed: ${navigator.hardwareConcurrency ?? 'unknown'}. CPU native Web Crypto remains available. Detecting CUDA…`;
fetch('/api/gpu').then(r => r.json()).then(info => {
  gpuAvailable = info.available === true && info.selftest === true;
  $('cuda-option').textContent = gpuAvailable ? `GPU · CUDA · ${info.device}` : 'GPU · CUDA unavailable';
  $('hardware').textContent = `Browser: ${navigator.userAgent}. Logical processors: ${navigator.hardwareConcurrency ?? 'unknown'}. CUDA: ${gpuAvailable ? `${info.device} · compute ${info.computeCapability} · known-vector self-test passed` : info.reason}.`;
  backendControls();
  if (!gpuAvailable) $('backend-note').textContent += ` CUDA unavailable: ${info.reason}`;
}).catch(() => { $('cuda-option').textContent = 'GPU · requires local npm start server'; backendControls(); });
document.querySelectorAll('.ruler-labels span').forEach((el, i) => { el.style.left = `${rulerPosition([-3, 0, Math.log10(86400), Math.log10(31557600), Math.log10(1e6 * 31557600), universeLog, rulerMax][i])}%`; });
if (!crypto.subtle) { $('run').disabled = true; $('recover').disabled = true; $('status').textContent = 'Web Crypto unavailable. Launch with npm start and open http://127.0.0.1:4314.'; }
render();
