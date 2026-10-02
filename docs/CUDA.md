# CPU + RTX 3090 CUDA

## Real local toolchain

The environment that compiled Project #13 is reused read-only:

```text
Project #13\.deps\cuda\bin\nvcc.exe   13.2.51
C:\Program Files\Microsoft Visual Studio\18\Community
  Common7\Tools\VsDevCmd.bat         MSVC x64 environment
  VC\Tools\MSVC\14.51.36231          host compiler
```

`npm run build:cuda` discovers Visual Studio with `vswhere`, initializes its developer environment and builds `native/build/crypto_cuda.exe` using `-O3 -std=c++17 -arch=sm_86 -cudart=static`. No download, system install, OpenCV or driver modification is required. Set `CUDA_PATH` to another toolkit root to override the sibling project default.

`npm start` starts the local UI/API at http://127.0.0.1:4314. The compiled executable is present on this machine; rebuild as needed. Restart the server if the CUDA binary was unavailable at startup. `npm run build` includes the API and CUDA executable in dist; run `node dist/server.mjs` to launch the distribution after stopping the source server. Serving static files alone supports CPU but cannot invoke CUDA.

Hardware: Ryzen 7 9800X3D, 16 logical processors, RTX 3090, compute capability 8.6, driver 596.49, Windows 11 10.0.26200. Device 0 is used, and the runtime-returned device name labels every GPU measurement.

## Architecture and workload

The CPU backend remains native Web Crypto in a background browser worker, supporting SHA-256 and PBKDF2. CPU recovery remains unchanged. The CUDA backend implements complete SHA-256 according to FIPS 180-4. One thread generates a candidate from the identical `[a-zA-Z0-9]` enumeration used on CPU, applies padding and all compression rounds, and materializes the full 32-byte digest. Length supports 1–256 bytes in the native engine; UI length is 1–32. No CPU hashing substitutes for GPU candidate evaluation.

CUDA launches 256 threads per block, up to 262,144 candidates per batch. A bounded command-line helper communicates JSON through stdout. The loopback Node API invokes a fixed executable/argument vector without a shell. Only validated algorithm/count/length options are accepted, with one active GPU benchmark, bounded JSON payload, host/origin validation, cancellation and a 30-second timeout. Arbitrary commands, target hashes and credential files are not exposed.

CPU accepts 100–2M evaluations; GPU 100–100M. A roughly 15-second measured-work limit is checked per CPU evaluation or GPU batch. Setup, warm-up and an expensive individual operation can add time. Cancel terminates the worker or aborts the HTTP request and kills its native child; incomplete measurements are discarded.

Small GPU workloads can take only milliseconds. Select **GPU / 100M evaluations** for a longer run. For a matched comparison choose **1M** and click **Measure CPU vs GPU**. It runs CPU then GPU with the same length, alphabet and starting index. If a GPU-only large count was selected, comparison resets to 1M. Switching to CPU also resets GPU-only counts. When a finite short-length space wraps, candidates repeat: this is throughput measurement.

## Timing scopes

| Metric | Included | Excluded |
|---|---|---|
| CPU headline | Generation, UTF-8 encoding, sequential Web Crypto/native API overhead, digest consumption and progress; PBKDF2 key import | Worker startup and warm-up (256 SHA evaluations or 8 KDF evaluations) |
| GPU headline / steady-state | Device candidate generation, complete SHA-256, full digest writes, launches/events, synchronization, **all digest D2H copies**, host checksum | Process/context startup, vector tests, allocations, three warm-up batches, post-run sampled verification |
| GPU kernel-only | CUDA events around generation, hashing and global digest writes | Host copies/checksum, setup and warm-up |
| Complete server request | Spawn, context startup, standard tests, allocations, warm-up, measured work, cleanup, parsing and sampled CPU verification | Browser HTTP round trip |
| Browser round trip | Complete local HTTP request/response | CPU measurement, which is a separate run |

The UI uses **CPU loop vs CUDA steady-state**, both excluding setup/warm-up, and labels the timing scopes. It compares implementations, not peak hardware capability: a sequential native API loop differs greatly from batched parallel CUDA. Kernel-only throughput never silently drives estimates. Request timing exposes initialization cost, particularly for small batches.

The ratio is shown only when algorithm, candidate length, requested and completed counts match and the all-candidate checksum agrees. Different/capped workloads show no ratio. Sampled full digests are independently checked with CPU SHA-256 before accepting each CUDA result. Users can select the completed CPU or GPU rate for the same search-space extrapolation; the active measured backend/workload is shown beneath the rate. PBKDF2 is explicitly CPU-only. The tiny recovery demo also explicitly labels CPU.

## Validation

`npm test`: **13 passing test groups**. The original seven CPU/model groups are retained. GPU coverage adds input bounds, device detection and standard vectors, independent binary full-digest parity at lengths **0,1,3,55,56,63,64,65,119,120,127,128,255,256**, sampled/all-candidate checksum parity at candidate lengths 1/12/56/256, cancellation before/during child execution, and ordering across the 262,144-candidate batch boundary. Native startup checks empty/abc and the standard two-block SHA-256 vector before benchmarking. CUDA tests skip only when the executable is missing; an existing but failing backend fails tests.

`node verify-cuda-ui.mjs` verifies actual UI matched measurement, CPU/GPU rate selection and corresponding time estimates, a 100M GPU run, differing-workload labels, cancellation, retained CPU PBKDF2 and synthetic recovery, JSON export, mobile overflow and API algorithm/origin guards. No page errors. `node verify-ui.mjs` verifies the original CPU workflow. Both use installed Edge and the desktop runtime's bundled Playwright; adjust `createRequire` on another machine. They require the local server to be running. Screenshots were visually inspected.

## Measurements from this machine

Actual paired **Edge CPU + CUDA** run: 1M identical SHA-256 candidates, length 12:

| Backend | Evaluations | Timed work | Candidates/s |
|---|---:|---:|---:|
| CPU Web Crypto worker | 1,000,000 | 3.430 s | **291,545** |
| RTX 3090 CUDA steady-state (copies/checksum included) | 1,000,000 | 0.003215 s | **311,071,018** |

Both checksums: **143**. Sampled full digests match. Observed implementation ratio: **1,066.97×**, not a peak-hardware ratio. Short GPU sample; prefer the longer GPU run for its rate.

Actual **100M GPU** run, 12-character candidates:

| Timing scope | Seconds | Candidates/s |
|---|---:|---:|
| Kernel-only | 0.072947 | **1,370,865,359** |
| Steady-state with digest transfer/checksum | 0.293267 | **340,986,433** |
| Complete server request | 0.407016 | **245,690,346** |
| Browser HTTP round trip | 0.409400 | — |

At this steady-state rate, 62^12 extrapolates to **149,910 years expected**, **299,819 years worst case**. This search was not performed. The estimate retains the original uniform/exhaustive-search assumptions.

Three separate paired **Node CPU + CUDA** runs measured CPU **70,980–75,331/s** and CUDA steady-state **258.8–268.5 million/s**. Node and Edge API overhead differ; these CPU rates must not be substituted for each other. All three full-workload checksums matched. Run `npm run bench:cuda` to repeat them.

Raw records: `cuda-results.json` (three Node pairs) and `cuda-browser-results.json` (browser matched run + 100M GPU run). Historical CPU records remain in `example-results.json` and `browser-results.json`. Reruns can overwrite files with new observations. Rates depend on runtime, load, candidate length, clocks, transfers and temperature; they are not internet numbers or promises.

## Remaining scope

GPU supports SHA-256 only. There is no persistent GPU process, multi-GPU selection, parallel CPU worker pool or GPU recovery. CPU SHA-256, PBKDF2 and synthetic recovery remain available. Next useful improvements are repeat-run statistics, a persistent CUDA worker with explicit initialization timing, and a batch-native CPU implementation for a closer implementation comparison.

References: [NIST FIPS 180-4 SHA-256](https://csrc.nist.gov/pubs/fips/180-4/upd1/final) and [CUDA event timing API](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__EVENT.html). Kernel intervals use CUDA events; broader intervals use monotonic high-resolution host timing.
