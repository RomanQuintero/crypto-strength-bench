export const alphabets = { digits: '0123456789', lower: 'abcdefghijklmnopqrstuvwxyz', letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', alnum: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' };
export function uniqueAlphabet(value) { return [...new Set(Array.from(value))].join(''); }
export function space(alphabet, length) {
  const a = Array.from(uniqueAlphabet(alphabet)).length;
  if (a < 2 || !Number.isInteger(length) || length < 1 || length > 256) throw new Error('Use at least two unique characters and a length from 1 to 256.');
  return BigInt(a) ** BigInt(length);
}
export function entropySpace(bits) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 4096) throw new Error('Entropy must be an integer from 1 to 4096 bits.');
  return 1n << BigInt(bits);
}
export function logBig(n) { const s = n.toString(); return Math.log10(Number(s.slice(0, 15))) + s.length - Math.min(s.length, 15); }
export function estimates(n, rate) {
  if (!(rate > 0) || !Number.isFinite(rate)) throw new Error('A measured positive rate is required.');
  const worst = logBig(n) - Math.log10(rate);
  return { average: worst - Math.log10(2), worst, entropy: logBig(n) / Math.log10(2) };
}
export function scientific(n) {
  const s = n.toString();
  if (s.length <= 12) return BigInt(n).toLocaleString('en-US');
  return `${Number('0.' + s.slice(0, 5)) * 10 < 10 ? (Number('0.' + s.slice(0, 5)) * 10).toFixed(3) : '10'} × 10^${s.length - 1}`;
}
export function halfScientific(n) {
  if (n % 2n === 0n) return scientific(n / 2n);
  if (n < 1000000000000n) return `${(n / 2n).toLocaleString('en-US')}.5`;
  return scientific(n / 2n) + ' (≈)';
}
export const year = 365.25 * 86400;
export const universeLog = Math.log10(13.8e9 * year);
export const rulerMax = 24;
export function rulerPosition(logSeconds) { return Math.max(0, Math.min(100, (logSeconds + 3) / (rulerMax + 3) * 100)); }
export function timeLabel(logSeconds) {
  if (!Number.isFinite(logSeconds)) return 'Run a benchmark';
  const units = [[-6, 1e-6, 'µs'], [-3, .001, 'ms'], [0, 1, 'seconds'], [Math.log10(60), 60, 'minutes'], [Math.log10(3600), 3600, 'hours'], [Math.log10(86400), 86400, 'days'], [Math.log10(year), year, 'years']];
  let unit = units[0];
  for (const u of units) if (logSeconds >= u[0]) unit = u;
  const power = logSeconds - Math.log10(unit[1]);
  if (power >= 6 || power < -3) return `${(10 ** (power - Math.floor(power))).toFixed(2)} × 10^${Math.floor(power)} ${unit[2]}`;
  return `${(10 ** power).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit[2]}`;
}
export function candidate(index, alphabet, length) {
  const chars = Array.from(alphabet); let result = '';
  for (let i = 0; i < length; i++) { result = chars[index % chars.length] + result; index = Math.floor(index / chars.length); }
  return result;
}
export function randomSecret(alphabet, length, cryptoApi = globalThis.crypto) {
  const chars = Array.from(alphabet); const limit = Math.floor(4294967296 / chars.length) * chars.length;
  let s = ''; const b = new Uint32Array(1);
  while (Array.from(s).length < length) { cryptoApi.getRandomValues(b); if (b[0] < limit) s += chars[b[0] % chars.length]; }
  return s;
}
