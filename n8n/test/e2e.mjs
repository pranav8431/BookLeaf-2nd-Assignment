#!/usr/bin/env node
// End-to-end checks against a running n8n (started by run_e2e.sh) that has the
// test build of the workflow imported and published, with mock_services.mjs
// standing in for Claude on Bedrock and Bubble.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const N8N = process.env.N8N_URL || 'http://127.0.0.1:5678';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:8787';
const HOOK = `${N8N}/webhook/bookleaf/royalty-summary`;
const KEY = 'test-webhook-key';

const payload = (code, logId) => ({
  ...JSON.parse(readFileSync(join(here, 'payloads', `${code}.json`), 'utf8')),
  log_id: logId,
});
const call = async (body, key = KEY) => {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['X-BookLeaf-Key'] = key;
  const res = await fetch(HOOK, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { http: res.status, json, text };
};
const mockCalls = async () => (await fetch(`${MOCK}/__calls`)).json();
const reset = () => fetch(`${MOCK}/__reset`, { method: 'POST' });
const run = Date.now();
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
};

await check('rejects calls without the shared secret', async () => {
  await reset();
  assert.equal((await call(payload('AUTH001', `nokey-${run}`), null)).http, 403);
  assert.equal((await call(payload('AUTH001', `badkey-${run}`), 'wrong')).http, 403);
  assert.equal((await mockCalls()).length, 0, 'nothing downstream may run');
});

await check('happy path: Success, email logged, callback PATCHed to Bubble', async () => {
  await reset();
  const r = await call(payload('AUTH001', `ok-${run}`));
  assert.equal(r.http, 200, r.text);
  assert.equal(r.json.status, 'Success', r.text);
  assert.match(r.json.email_body, /Dear Priya/);
  assert.match(r.json.email_body, /Whispers of the Ganges/);
  assert.equal(r.json.email_status, 'Not sent');
  assert.equal(r.json.callback_status, 'Delivered');
  assert.ok(r.json.completed_at && r.json.n8n_execution_id);
  const calls = await mockCalls();
  const ai = calls.find((c) => c.url.startsWith('/model/'));
  assert.equal(ai.url, '/model/us.anthropic.claude-haiku-4-5-20251001-v1%3A0/invoke');
  assert.equal(ai.sigv4, null, `SigV4: ${ai.sigv4}`);
  assert.equal(ai.body.anthropic_version, 'bedrock-2023-05-31');
  assert.equal(ai.body.model, undefined, 'Bedrock takes the model in the URL');
  assert.deepEqual(ai.body.thinking, { type: 'disabled' });
  assert.equal(ai.body.output_config.format.type, 'json_schema');
  assert.equal(ai.body.output_config.effort, undefined, 'Haiku 4.5 rejects effort');
  const cb = calls.find((c) => c.method === 'PATCH');
  assert.equal(cb.url, `/api/1.1/obj/notificationlog/ok-${run}`);
  assert.equal(cb.body.status, 'Success');
  assert.equal(cb.headers.authorization, 'Bearer test-bubble-token');
});

await check('double click: second trigger for the same author is Skipped, AI not called again', async () => {
  await reset();
  const r = await call(payload('AUTH001', `dup-${run}`));
  assert.equal(r.json.status, 'Skipped', r.text);
  assert.match(r.json.error_message, /already triggered/);
  const calls = await mockCalls();
  assert.equal(calls.filter((c) => c.url.startsWith('/model/')).length, 0);
  assert.equal(calls.find((c) => c.method === 'PATCH').body.status, 'Skipped');
});

await check('AI API down: 3 attempts, then Failed (not silent)', async () => {
  await reset();
  const r = await call(payload('AUTH002', `aifail-${run}`));
  assert.equal(r.http, 200, r.text);
  assert.equal(r.json.status, 'Failed', r.text);
  assert.match(r.json.error_message, /AI API call failed after 3 attempts/);
  const calls = await mockCalls();
  assert.equal(calls.filter((c) => c.url.startsWith('/model/')).length, 3);
  assert.equal(calls.find((c) => c.method === 'PATCH').body.status, 'Failed');
});

await check('a failed run releases the duplicate lock so the admin can retry', async () => {
  const r = await call(payload('AUTH002', `retry-${run}`));
  assert.equal(r.json.status, 'Failed', 'should run again, not be Skipped');
});

await check('AI output that invents a figure is rejected', async () => {
  const r = await call(payload('AUTH004', `badai-${run}`));
  assert.equal(r.json.status, 'Failed', r.text);
  assert.match(r.json.error_message, /Unexpected amount ₹99,999/);
});

await check('invalid payload is reported, not crashed on', async () => {
  const body = payload('AUTH005', `invalid-${run}`);
  body.books[0].royalty_pending = '500'; // earned 14,240 - paid 14,240 != 500
  delete body.author.email;
  const r = await call(body);
  assert.equal(r.json.status, 'Failed', r.text);
  assert.match(r.json.error_message, /author.email is required/);
  assert.match(r.json.error_message, /earned - paid != pending/);
});

await check('edge cases: below-threshold author with a book in production', async () => {
  await reset();
  const r = await call(payload('AUTH009', `kavita-${run}`));
  assert.equal(r.json.status, 'Success', r.text);
  assert.match(r.json.email_body, /Raising Roots is at Typesetting \(stage 4 of 9\)/);
  const ai = (await mockCalls()).find((c) => c.url.startsWith('/model/'));
  assert.match(ai.body.messages[0].content, /"scenario": "below_threshold"/);
});

await check('Bubble Data API down: still Success to Bubble, callback failure recorded', async () => {
  const r = await call(payload('AUTH010', `callback-down-${run}`));
  assert.equal(r.json.status, 'Success', r.text);
  assert.match(r.json.callback_status, /^Failed/);
});

for (const [s, n, e] of results) console.log(`${s}  ${n}${e ? `\n      ${e}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
