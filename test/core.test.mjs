import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { space, entropySpace, estimates, logBig, timeLabel, scientific, halfScientific, candidate, randomSecret, uniqueAlphabet, year, rulerPosition } from '../core.mjs';
import { evaluate, hex, recover, benchmark } from '../engine.mjs';
test('SHA-256 standard vectors', async () => {
  assert.equal(hex(await evaluate('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex(await evaluate('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hex(await evaluate('a'.repeat(1000000))), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});
test('PBKDF2 agrees with independent node implementation', async () => {
  const { pbkdf2Sync } = await import('node:crypto');
  assert.equal(hex(await evaluate('password', 'PBKDF2', 1000)), pbkdf2Sync('password', 'Crypto Strength Bench / synthetic salt / v1', 1000, 32, 'sha256').toString('hex'));
});
test('exact large spaces and duplicate Unicode alphabet', () => {
  assert.equal(space('0123456789', 4), 10000n);
  assert.equal(space('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16), 62n ** 16n);
  assert.equal(entropySpace(128), 340282366920938463463374607431768211456n);
  assert.equal(entropySpace(256), 2n ** 256n);
  assert.equal(space('😀😀a', 4), 16n);
  assert.equal(uniqueAlphabet('aabb'), 'ab');
  assert.throws(() => space('a', 4)); assert.throws(() => entropySpace(1.5));
});
test('expected and worst times remain valid over 1000 orders of magnitude', () => {
  const t = estimates(1000n, 100); assert.ok(Math.abs(t.average - Math.log10(5)) < 1e-12); assert.equal(t.worst, 1);
  assert.ok(Number.isFinite(estimates(entropySpace(4096), 1000000).worst));
  assert.equal(logBig(10n ** 1000n), 1000); assert.throws(() => estimates(10n, 0));
  assert.equal(halfScientific(3n), '1.5'); assert.match(scientific(entropySpace(256)), /10\^77/);
});
test('time units and extreme time formatting', () => {
  assert.equal(timeLabel(Math.log10(.042)), '42 ms');
  assert.equal(timeLabel(Math.log10(3.7)), '3.7 seconds');
  assert.equal(timeLabel(Math.log10(8.2 * 3600)), '8.2 hours');
  assert.equal(timeLabel(Math.log10(14.3 * year)), '14.3 years');
  assert.match(timeLabel(Math.log10(year) + 1000), /10\^1000 years/);
  assert.equal(rulerPosition(-3), 0); assert.equal(rulerPosition(24), 100);
  assert.equal(rulerPosition(10.5), 50); assert.equal(rulerPosition(1000), 100);
});
test('candidate order and actual synthetic recovery', async () => {
  assert.equal(candidate(0, 'ab', 2), 'aa'); assert.equal(candidate(3, 'ab', 2), 'bb');
  const result = await recover({ alphabet: 'ab', length: 3, secret: 'bab' });
  assert.equal(result.secret, 'bab'); assert.equal(result.attempts, 6); assert.equal(result.total, 8);
  assert.equal(result.target, hex(await evaluate('bab')));
  await assert.rejects(recover({ alphabet: 'abcdefghijklmnopqrstuvwxyz', length: 5, secret: 'abcde' }), /limited/);
  await assert.rejects(recover({ alphabet: 'ab', length: 2, secret: 'zz' }), /match/);
  const secret = randomSecret('😀a', 4, webcrypto); assert.equal(Array.from(secret).length, 4);
});
test('real bounded benchmark metadata and rate', async () => {
  const r = await benchmark({ iterations: 100, length: 8 });
  assert.equal(r.iterations, 100); assert.equal(r.warmup, 256); assert.ok(r.elapsed > 0); assert.ok(r.rate > 0); assert.equal(r.rate, 100 / r.elapsed);
  await assert.rejects(benchmark({ iterations: 0 }), /evaluations/);
});
