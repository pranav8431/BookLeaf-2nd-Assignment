#!/usr/bin/env node
// Sends the sample authors to your live n8n webhook, which calls Claude on
// Bedrock for real, and prints what Bubble would receive. Use it after setting
// up n8n and before building Bubble, to judge the emails and prove the wiring.
//
//   WEBHOOK_URL=https://you.app.n8n.cloud/webhook/bookleaf/royalty-summary \
//   WEBHOOK_KEY=... node n8n/test/try_webhook.mjs [AUTH001 ...] [--as-of 2025-12-15]
//
// Each email is written to n8n/test/.out/<author>.txt. Runs one author at a time.
// Running the same author twice within 2 minutes returns "Skipped" (duplicate guard).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { WEBHOOK_URL: url, WEBHOOK_KEY: key } = process.env;
if (!url || !key) { console.error('Set WEBHOOK_URL and WEBHOOK_KEY first.'); process.exit(2); }
const args = process.argv.slice(2);
const asOfIdx = args.indexOf('--as-of');
const asOf = asOfIdx > -1 ? args.splice(asOfIdx, 2)[1] : undefined;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '.out');
mkdirSync(outDir, { recursive: true });
const codes = args.length ? args : readdirSync(join(here, 'payloads')).map((f) => f.replace('.json', '')).sort();

let ok = 0;
for (const code of codes) {
  const body = JSON.parse(readFileSync(join(here, 'payloads', `${code}.json`), 'utf8'));
  body.log_id = `try-${code}-${Date.now()}`;
  if (asOf) body.as_of_date = asOf;
  const t0 = Date.now();
  let line;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-BookLeaf-Key': key },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      line = `HTTP ${res.status} ${text.slice(0, 200)}`;
    } else {
      const r = JSON.parse(text);
      if (r.status === 'Success') ok++;
      line = `${r.status.padEnd(8)} email ${r.email_status}${r.error_message ? `  ${r.error_message}` : ''}`;
      writeFileSync(join(outDir, `${code}.txt`),
        `status: ${r.status}\nsubject: ${r.email_subject}\n\n${r.email_body}\n\n---\n${r.error_message || 'all checks passed'}\nn8n execution: ${r.n8n_execution_id}\n`);
    }
  } catch (e) {
    line = `request failed: ${e.message}`;
  }
  console.log(`${code}  ${line}  (${Date.now() - t0} ms)`);
}
console.log(`\n${ok}/${codes.length} Success; emails in ${outDir}`);
process.exit(ok === codes.length ? 0 : 1);
