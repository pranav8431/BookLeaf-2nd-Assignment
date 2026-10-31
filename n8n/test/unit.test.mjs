// Unit tests for the logic that runs inside the n8n Code nodes.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const lib = require('../src/lib.js');
const { buildUserMessage, SYSTEM_PROMPT } = require('../src/prompt.js');

const here = dirname(fileURLToPath(import.meta.url));
const payloadDir = join(here, 'payloads');
const payloads = Object.fromEntries(readdirSync(payloadDir).map((f) => [
  f.replace('.json', ''), JSON.parse(readFileSync(join(payloadDir, f), 'utf8')),
]));
const CONFIG = { payout_threshold_inr: 1000, support_email: 'support@bookleaf.test', overdue_commitment: 'COMMIT' };
const day = (s) => new Date(`${s}T00:00:00Z`);
const factsFor = (code, asOf) => {
  const v = lib.validatePayload({ ...payloads[code], as_of_date: asOf });
  assert.equal(v.ok, true, v.errors.join('; '));
  return lib.buildFacts(v.payload, new Date(), CONFIG);
};

test('every author in the dataset produces a valid payload', () => {
  assert.equal(Object.keys(payloads).length, 10);
  for (const [code, body] of Object.entries(payloads)) {
    const v = lib.validatePayload(body);
    assert.equal(v.ok, true, `${code}: ${v.errors.join('; ')}`);
  }
});

test('payload validation reports precise errors', () => {
  const base = structuredClone(payloads.AUTH001);
  assert.deepEqual(lib.validatePayload(null).errors, ['Body must be a JSON object']);

  const noLog = { ...base, log_id: '' };
  assert.ok(lib.validatePayload(noLog).errors.includes('log_id is required'));

  const badEmail = structuredClone(base);
  badEmail.author.email = 'not-an-email';
  assert.ok(lib.validatePayload(badEmail).errors.includes('author.email is not a valid email'));

  const badNumber = structuredClone(base);
  badNumber.books[0].royalty_paid = 'abc';
  assert.ok(lib.validatePayload(badNumber).errors.includes('books[0].royalty_paid is not a number'));

  const inconsistent = structuredClone(base);
  inconsistent.books[0].royalty_pending = '9999';
  assert.ok(lib.validatePayload(inconsistent).errors.some((e) => e.includes('earned - paid != pending')));
});

test('parsers accept what Bubble can send', () => {
  assert.equal(lib.isoDay(lib.parseDay('2025-10-15')), '2025-10-15');
  assert.equal(lib.isoDay(lib.parseDay('2025-10-15T00:00:00.000Z')), '2025-10-15');
  assert.equal(lib.isoDay(lib.parseDay('1760486400000')), '2025-10-15');
  assert.equal(lib.parseDay(''), null);
  assert.equal(lib.parseDay('soon'), undefined);
  assert.equal(lib.parseAmount('1,203'), 1203);
  assert.equal(lib.parseAmount(''), null);
  assert.equal(lib.parseYesNo('yes'), true);
  assert.equal(lib.formatINR(57744), '₹57,744');
  assert.equal(lib.formatINR(123456), '₹1,23,456');
});

test('royalty status follows the green/yellow/red rule', () => {
  const asOf = day('2025-12-15');
  const status = (code, idx) => {
    const v = lib.validatePayload(payloads[code]);
    return lib.royaltyStatus(v.payload.books[idx], asOf);
  };
  assert.equal(status('AUTH001', 0), 'pending'); // paid 2025-10-15, 61 days ago
  assert.equal(status('AUTH001', 1), 'paid');
  assert.equal(status('AUTH002', 0), 'overdue'); // paid 2025-09-01, 105 days ago
  assert.equal(status('AUTH003', 0), 'overdue'); // never paid, published 2024-07-05
  assert.equal(status('AUTH007', 2), 'n/a'); // in production
  // Never paid but published under 90 days ago: still within the cycle.
  const fresh = lib.validatePayload(payloads.AUTH010).payload.books[1]; // published 2025-01-20
  assert.equal(lib.royaltyStatus(fresh, day('2025-03-01')), 'pending');
  assert.equal(lib.royaltyStatus(fresh, day('2025-04-21')), 'overdue');
});

test('payout window: quarterly cycle + 45 days', () => {
  const w = (s) => {
    const r = lib.payoutWindow(day(s));
    return [r.quarter_label, lib.isoDay(r.payout_by)];
  };
  assert.deepEqual(w('2026-10-30'), ['Q3 2026', '2026-11-14']);
  assert.deepEqual(w('2026-11-14'), ['Q3 2026', '2026-11-14']);
  assert.deepEqual(w('2026-11-15'), ['Q4 2026', '2027-02-14']);
  assert.deepEqual(w('2026-01-10'), ['Q4 2025', '2026-02-14']);
  assert.deepEqual(w('2026-02-15'), ['Q1 2026', '2026-05-15']);
});

test('scenarios cover the dataset edge cases', () => {
  assert.equal(factsFor('AUTH008', '2026-10-30').scenario, 'all_paid'); // Farhan: fully paid
  assert.equal(factsFor('AUTH008', '2026-10-30').payout_cycle, null, 'no cycle facts when nothing is pending');
  assert.equal(factsFor('AUTH001', '2026-10-30').payout_cycle.payout_due_by, '14 November 2026');
  assert.equal(factsFor('AUTH009', '2026-10-30').scenario, 'below_threshold'); // Kavita: ₹850 pending
  assert.equal(factsFor('AUTH003', '2026-10-30').scenario, 'overdue'); // Ananya: never paid
  assert.equal(factsFor('AUTH001', '2025-12-15').scenario, 'pending_in_cycle');

  const kavita = factsFor('AUTH009', '2026-10-30');
  assert.equal(kavita.books_in_production.length, 1);
  assert.deepEqual(kavita.books_in_production[0].production,
    { stage: 'Typesetting', step: 4, of: 9, next: 'Proofreading' });
  assert.equal(kavita.follow_up_commitment, null);

  const sneha = factsFor('AUTH007', '2026-10-30');
  assert.equal(sneha.totals.pending, '₹7,865');
  assert.equal(sneha.published_books.length, 2);
  assert.equal(sneha.follow_up_commitment, 'COMMIT');
});

test('the prompt is static and the user message hides internal fields', () => {
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(SYSTEM_PROMPT), 'system prompt must not contain dates');
  const msg = buildUserMessage(factsFor('AUTH001', '2026-10-30'));
  assert.ok(msg.includes('Whispers of the Ganges'));
  assert.ok(!msg.includes('_raw'));
});

test('email checks catch dropped and invented figures', () => {
  const facts = factsFor('AUTH001', '2025-12-15');
  const good = {
    subject: 'Your BookLeaf royalty summary - ₹3,570 pending',
    body: `Dear Priya,

Here is your royalty summary as of ${facts.as_of}.

Whispers of the Ganges
- Copies sold: 342
- Royalty earned: ₹11,970, paid: ₹8,400, pending: ₹3,570

The Saffron Diaries
- Copies sold: 189
- Royalty earned: ₹7,938, fully paid

Overall: total earned ₹19,908, total paid ₹16,338, total pending ₹3,570.
Your Q4 2025 royalties will be paid by 14 February 2026.

Warm regards,
The BookLeaf Author Success Team`,
  };
  assert.deepEqual(lib.checkEmail(good, facts), []);

  const invented = { ...good, body: good.body.replace('₹8,400', '₹8,500') };
  assert.ok(lib.checkEmail(invented, facts).some((p) => p.includes('Unexpected amount ₹8,500')));

  const missingBook = { ...good, body: good.body.replace(/The Saffron Diaries/g, 'your memoir') };
  assert.ok(lib.checkEmail(missingBook, facts).some((p) => p.includes('The Saffron Diaries')));

  // Diya's title is stored with a curly apostrophe; a straight one in the email still counts.
  const diya = factsFor('AUTH010', '2026-10-30');
  const curly = diya.published_books.find((b) => b.title.includes('’'));
  assert.ok(curly, 'dataset has a title with a curly apostrophe');
  const straight = curly.title.replace('’', "'");
  const diyaBody = `Hi Diya,\n\n${diya.published_books.map((b) => (b === curly ? straight : b.title)).join(' and ')} are doing well. `
    + `Total earned ${diya.totals.earned}, total paid ${diya.totals.paid}, total pending ${diya.totals.pending}.\n\n`
    + 'Warm regards,\nThe BookLeaf Author Success Team. '.repeat(3);
  assert.deepEqual(lib.checkEmail({ subject: 'Your BookLeaf royalty summary', body: diyaBody }, diya), []);

  assert.deepEqual(lib.checkEmail({ subject: 1 }, facts), ['Model did not return {subject, body}']);

  // A total of ₹0 must still be written out; a stray "0" elsewhere doesn't count.
  const ananya = factsFor('AUTH003', '2026-10-30');
  const noPaidTotal = {
    subject: 'Your BookLeaf royalty summary - ₹2,546 pending',
    body: `Hello Ananya,\n\nBetween Two Temples has sold 67 copies since 5 July 2024 and earned ₹2,546, all of which is still pending. Our records from 2024 show no payout yet.\n\nTotal earned ₹2,546, total pending ₹2,546.\n\nWarm regards,\nThe BookLeaf Author Success Team`,
  };
  assert.ok(lib.checkEmail(noPaidTotal, ananya).includes('Total paid (₹0) is missing'));
  const withPaid = { ...noPaidTotal, body: noPaidTotal.body.replace('total pending', 'total paid ₹0, total pending') };
  assert.deepEqual(lib.checkEmail(withPaid, ananya), []);
});

test('duplicate guard: window, retries and release on failure', () => {
  const state = {};
  const t0 = 1_000_000;
  assert.equal(lib.checkAndLock(state, 'A1', 'log1', t0, 120).duplicate, false);
  const again = lib.checkAndLock(state, 'A1', 'log2', t0 + 5000, 120);
  assert.equal(again.duplicate, true);
  assert.equal(again.original_log_id, 'log1');
  assert.match(lib.checkAndLock(state, 'A1', 'log1', t0 + 6000, 120).reason, /retry/);
  assert.equal(lib.checkAndLock(state, 'B1', 'log3', t0 + 6000, 120).duplicate, false, 'other authors unaffected');
  assert.equal(lib.checkAndLock(state, 'A1', 'log4', t0 + 121000, 120).duplicate, false, 'expires after window');

  lib.releaseLock(state, 'A1', 'log4');
  assert.equal(lib.checkAndLock(state, 'A1', 'log5', t0 + 122000, 120).duplicate, false, 'failed run released');
});

test('HTML rendering escapes and keeps bullets', () => {
  const html = lib.toHtml('Hi <b>Priya</b>\n\n- one\n- two');
  assert.ok(html.includes('&lt;b&gt;Priya&lt;/b&gt;'));
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
});
