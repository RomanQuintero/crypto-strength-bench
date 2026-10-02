import { benchmark, recover } from './engine.mjs';
self.onmessage = async ({ data }) => {
  try {
    const run = data.kind === 'benchmark' ? benchmark : recover;
    const result = await run(data.options, value => self.postMessage({ type: 'progress', value }));
    self.postMessage({ type: 'result', value: result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
