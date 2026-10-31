#!/usr/bin/env node
// Turns bookleaf_sample_data.json into:
//   data/bubble_import/*.csv     - files for Bubble's App Data -> Upload (CSV import)
//   n8n/test/payloads/*.json     - the exact webhook bodies Bubble sends n8n, one per
//                                  author, used by the unit and end-to-end tests
//
// Usage: node scripts/generate_data.mjs [--us-dates]
//   --us-dates  write CSV dates as MM/DD/YYYY instead of YYYY-MM-DD, in case your
//               Bubble app's CSV importer rejects ISO dates.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'bookleaf_sample_data.json'), 'utf8'));
const usDates = process.argv.includes('--us-dates');

const STAGES = ['Manuscript Received', 'Editing', 'Cover Design', 'Typesetting', 'Proofreading',
  'ISBN Assignment', 'Printing', 'Distribution Setup', 'Published & Live'];

const stageOf = (status) => STAGES.find((s) => status.toLowerCase().includes(s.toLowerCase())) || status;
const csvDate = (d) => {
  if (!d) return '';
  if (!usDates) return d;
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
};
const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => {
  const cols = Object.keys(rows[0]);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
};

const authors = [];
const books = [];
const payouts = [];

for (const a of data.authors) {
  authors.push({
    author_code: a.author_id, name: a.name, email: a.email, phone: a.phone,
    city: a.city, joined_date: csvDate(a.joined_date),
  });
  for (const b of a.books) {
    const published = /^published/i.test(b.status);
    if (b.total_royalty_earned - b.royalty_paid !== b.royalty_pending) {
      throw new Error(`${b.book_id}: earned - paid != pending in source data`);
    }
    books.push({
      book_code: b.book_id, author_code: a.author_id, title: b.title, isbn: b.isbn, genre: b.genre,
      status_label: b.status, production_stage: stageOf(b.status), is_published: published ? 'yes' : 'no',
      publication_date: csvDate(b.publication_date), mrp: b.mrp, royalty_per_copy: b.author_royalty_per_copy,
      copies_sold: b.total_copies_sold, total_royalty_earned: b.total_royalty_earned,
      royalty_paid: b.royalty_paid, royalty_pending: b.royalty_pending,
      last_payout_date: csvDate(b.last_royalty_payout_date), print_partner: b.print_partner,
      available_on: b.available_on.join(','),
    });
    if (b.royalty_paid > 0) {
      payouts.push({
        payout_code: `PO-${b.book_id}-001`, book_code: b.book_id, author_code: a.author_id,
        amount: b.royalty_paid, payout_date: csvDate(b.last_royalty_payout_date),
        note: 'Opening balance: total paid to date (source data holds cumulative figures only)',
      });
    }
  }
}

const csvDir = join(root, 'data', 'bubble_import');
mkdirSync(csvDir, { recursive: true });
writeFileSync(join(csvDir, '1_authors.csv'), toCsv(authors));
writeFileSync(join(csvDir, '2_books.csv'), toCsv(books));
writeFileSync(join(csvDir, '3_royalty_payouts.csv'), toCsv(payouts));

// Webhook bodies, shaped exactly like the Bubble API Connector call builds them
// (numbers and dates as strings so empty values stay valid JSON).
const payloadDir = join(root, 'n8n', 'test', 'payloads');
mkdirSync(payloadDir, { recursive: true });
for (const a of data.authors) {
  const body = {
    log_id: `test-log-${a.author_id}`,
    trigger_type: 'single',
    triggered_by: 'admin@bookleaf.test',
    author: { id: `bubble-${a.author_id}`, author_code: a.author_id, name: a.name, email: a.email, city: a.city },
    books: a.books.map((b) => ({
      book_code: b.book_id, title: b.title, isbn: b.isbn, genre: b.genre, status: b.status,
      is_published: /^published/i.test(b.status) ? 'yes' : 'no',
      publication_date: b.publication_date || '', mrp: b.mrp === null ? '' : String(b.mrp),
      royalty_per_copy: b.author_royalty_per_copy === null ? '' : String(b.author_royalty_per_copy),
      copies_sold: String(b.total_copies_sold), total_royalty_earned: String(b.total_royalty_earned),
      royalty_paid: String(b.royalty_paid), royalty_pending: String(b.royalty_pending),
      last_payout_date: b.last_royalty_payout_date || '', available_on: b.available_on.join(', '),
    })),
  };
  writeFileSync(join(payloadDir, `${a.author_id}.json`), JSON.stringify(body, null, 2) + '\n');
}

// Values to paste into Bubble's API Connector when initializing the call
// (Priya Sharma, AUTH001). books_json is the inside of the JSON array.
const sample = JSON.parse(readFileSync(join(payloadDir, 'AUTH001.json'), 'utf8'));
const q = (v) => JSON.stringify(v);
writeFileSync(join(csvDir, 'api_connector_initialize_values.txt'), [
  'Paste these into the API Connector parameters, then click "Initialize call".',
  'Text parameters include their own quotes, exactly as ":formatted as JSON-safe" produces them.',
  '',
  'log_id          test-init-001',
  'trigger_type    single',
  `triggered_by    ${q('admin@bookleaf.test')}`,
  `author_id       ${sample.author.id}`,
  `author_code     ${q(sample.author.author_code)}`,
  `author_name     ${q(sample.author.name)}`,
  `author_email    ${q(sample.author.email)}`,
  `author_city     ${q(sample.author.city)}`,
  'books_json (one line):',
  sample.books.map((b) => JSON.stringify(b)).join(','),
  '',
].join('\n'));

console.log(`authors: ${authors.length}, books: ${books.length}, payouts: ${payouts.length}`);
console.log(`CSVs -> ${csvDir}\npayloads -> ${payloadDir}`);
