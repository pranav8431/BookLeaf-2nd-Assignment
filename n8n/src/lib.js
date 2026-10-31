// Pure helpers shared by the n8n Code nodes.
//
// build_workflow.mjs copies the functions each Code node needs (via
// Function.prototype.toString) into that node's jsCode, so this file is the
// single source of truth and is unit-tested by test/unit.test.mjs.
// Keep every function self-contained: no imports, no closures over module state.

// Accepts what Bubble can realistically send for a date: "2025-10-15",
// a full ISO timestamp, a Unix-ms number/string, or "" / null for empty.
// Returns a UTC-midnight Date for the calendar day, or null.
function parseDay(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length === 13 ? Number(s) : Number(s) * 1000;
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined; // present but unparseable
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Bubble sends numbers as strings so that an empty number does not break the
// JSON body. "" / null -> null; "1,200" -> 1200; garbage -> undefined.
function parseAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const s = String(value).replace(/[,₹\s]/g, '');
  if (s === '' || s.toLowerCase() === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseYesNo(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  if (['yes', 'true', '1'].includes(s)) return true;
  if (['no', 'false', '0', ''].includes(s)) return false;
  return undefined;
}

function isoDay(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

// "15 November 2026" - unambiguous for Indian and US readers alike.
function humanDay(date) {
  if (!date) return null;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatINR(amount) {
  const n = Math.round(Number(amount) || 0);
  return '₹' + n.toLocaleString('en-IN');
}

// "Today" as a calendar day in India, where BookLeaf operates its payout cycle.
function todayInIndia(now) {
  const ist = new Date((now ? now.getTime() : Date.now()) + 330 * 60000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

// Validates and normalises the webhook body sent by Bubble.
// Returns { ok, errors, payload }.
function validatePayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body must be a JSON object'], payload: null };
  }
  const author = body.author || {};
  const requireText = (v, field) => {
    if (typeof v !== 'string' || v.trim() === '') errors.push(`${field} is required`);
    return typeof v === 'string' ? v.trim() : '';
  };
  const logId = requireText(body.log_id, 'log_id');
  const authorId = requireText(author.id, 'author.id');
  const name = requireText(author.name, 'author.name');
  const email = requireText(author.email, 'author.email');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('author.email is not a valid email');
  if (!Array.isArray(body.books)) errors.push('books must be an array');

  const books = (Array.isArray(body.books) ? body.books : []).map((b, i) => {
    const at = `books[${i}]`;
    if (!b || typeof b !== 'object') { errors.push(`${at} must be an object`); return null; }
    const num = (k) => {
      const v = parseAmount(b[k]);
      if (v === undefined) errors.push(`${at}.${k} is not a number`);
      return v === undefined ? null : v;
    };
    const day = (k) => {
      const v = parseDay(b[k]);
      if (v === undefined) errors.push(`${at}.${k} is not a date`);
      return v === undefined ? null : v;
    };
    const status = typeof b.status === 'string' ? b.status.trim() : '';
    if (!b.title || String(b.title).trim() === '') errors.push(`${at}.title is required`);
    if (!status) errors.push(`${at}.status is required`);
    let isPublished = parseYesNo(b.is_published);
    if (isPublished === undefined) { errors.push(`${at}.is_published must be yes/no`); isPublished = false; }
    // The dataset's status text is the source of truth if Bubble omitted the flag.
    if (b.is_published === undefined) isPublished = /^published/i.test(status);
    const book = {
      book_code: String(b.book_code || '').trim(),
      title: String(b.title || '').trim(),
      isbn: String(b.isbn || '').trim(),
      genre: String(b.genre || '').trim(),
      status,
      is_published: isPublished,
      publication_date: day('publication_date'),
      mrp: num('mrp'),
      royalty_per_copy: num('royalty_per_copy'),
      copies_sold: num('copies_sold') || 0,
      total_royalty_earned: num('total_royalty_earned') || 0,
      royalty_paid: num('royalty_paid') || 0,
      royalty_pending: num('royalty_pending') || 0,
      last_payout_date: day('last_payout_date'),
      available_on: String(b.available_on || '').split(',').map((p) => p.trim()).filter(Boolean),
    };
    if (Math.abs(book.total_royalty_earned - book.royalty_paid - book.royalty_pending) > 1) {
      errors.push(`${at} (${book.title}): earned - paid != pending; refusing to email inconsistent figures`);
    }
    return book;
  }).filter(Boolean);

  const asOf = parseDay(body.as_of_date);
  if (asOf === undefined) errors.push('as_of_date is not a date');

  return {
    ok: errors.length === 0,
    errors,
    payload: {
      log_id: logId,
      trigger_type: body.trigger_type === 'bulk' ? 'bulk' : 'single',
      triggered_by: typeof body.triggered_by === 'string' ? body.triggered_by : '',
      as_of_date: asOf || null,
      author: {
        id: authorId,
        author_code: String(author.author_code || '').trim(),
        name,
        email,
        city: String(author.city || '').trim(),
      },
      books,
    },
  };
}

// Duplicate-trigger guard. `state` is n8n workflow static data (persisted
// between production executions). An author who was triggered within
// `windowSeconds` is a duplicate unless the earlier run failed (failed runs
// release their lock in releaseLock). Same log_id twice = transport retry.
function checkAndLock(state, authorId, logId, nowMs, windowSeconds) {
  state.locks = state.locks || {};
  for (const [k, v] of Object.entries(state.locks)) {
    if (nowMs - v.at > windowSeconds * 1000) delete state.locks[k];
  }
  const existing = state.locks[authorId];
  if (existing) {
    return {
      duplicate: true,
      reason: existing.log_id === logId
        ? 'Same request received twice (retry); the first one is being processed.'
        : `A summary for this author was already triggered ${Math.round((nowMs - existing.at) / 1000)}s ago (log ${existing.log_id}).`,
      original_log_id: existing.log_id,
    };
  }
  state.locks[authorId] = { log_id: logId, at: nowMs };
  return { duplicate: false };
}

function releaseLock(state, authorId, logId) {
  if (state.locks && state.locks[authorId] && state.locks[authorId].log_id === logId) {
    delete state.locks[authorId];
  }
}

// BookLeaf's production pipeline (Knowledge Base, Assignment 1).
function productionStage(statusText) {
  const stages = ['Manuscript Received', 'Editing', 'Cover Design', 'Typesetting',
    'Proofreading', 'ISBN Assignment', 'Printing', 'Distribution Setup', 'Published & Live'];
  const lower = statusText.toLowerCase();
  const idx = stages.findIndex((s) => lower.includes(s.toLowerCase()));
  if (idx === -1) return { stage: statusText, step: null, of: stages.length, next: null };
  return { stage: stages[idx], step: idx + 1, of: stages.length, next: stages[idx + 1] || null };
}

// Royalty status for one book - the same rule Bubble's status workflow uses:
//   paid     published, nothing pending
//   pending  something pending, still inside the normal cycle
//   overdue  something pending and (last payout > 90 days ago, or never paid
//            and published > 90 days ago)
//   n/a      not yet published
function royaltyStatus(book, today) {
  if (!book.is_published) return 'n/a';
  if (book.royalty_pending <= 0) return 'paid';
  const days = (d) => Math.floor((today - d) / 86400000);
  if (book.last_payout_date) return days(book.last_payout_date) > 90 ? 'overdue' : 'pending';
  if (book.publication_date && days(book.publication_date) > 90) return 'overdue';
  return 'pending';
}

// Quarterly cycle from the Knowledge Base: royalties are calculated per
// calendar quarter and paid within 45 days of the quarter ending.
function payoutWindow(today) {
  const y = today.getUTCFullYear();
  const q = Math.floor(today.getUTCMonth() / 3); // 0..3, current quarter
  const quarterEnd = (year, qi) => new Date(Date.UTC(year, qi * 3 + 3, 0)); // last day of quarter
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const lastClosedEnd = q === 0 ? quarterEnd(y - 1, 3) : quarterEnd(y, q - 1);
  const lastDeadline = addDays(lastClosedEnd, 45);
  const label = (d) => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (today <= lastDeadline) {
    return { quarter_label: label(lastClosedEnd), quarter_end: lastClosedEnd, payout_by: lastDeadline, in_progress: true };
  }
  const currentEnd = quarterEnd(y, q);
  return { quarter_label: label(currentEnd), quarter_end: currentEnd, payout_by: addDays(currentEnd, 45), in_progress: false };
}

// Everything the email states as fact is computed here, not by the model.
function buildFacts(payload, now, config) {
  const today = payload.as_of_date || todayInIndia(now);
  const threshold = config.payout_threshold_inr;
  const books = payload.books.map((b) => {
    const status = royaltyStatus(b, today);
    const base = { title: b.title, isbn: b.isbn, genre: b.genre, royalty_status: status };
    if (!b.is_published) {
      return { ...base, in_production: true, production: productionStage(b.status) };
    }
    return {
      ...base,
      in_production: false,
      published_on: humanDay(b.publication_date),
      mrp: b.mrp === null ? null : formatINR(b.mrp),
      royalty_per_copy: b.royalty_per_copy === null ? null : formatINR(b.royalty_per_copy),
      copies_sold: b.copies_sold.toLocaleString('en-IN'),
      earned: formatINR(b.total_royalty_earned),
      paid: formatINR(b.royalty_paid),
      pending: formatINR(b.royalty_pending),
      last_payout: b.last_payout_date ? humanDay(b.last_payout_date) : 'No payout yet',
      available_on: b.available_on,
    };
  });
  const sum = (k) => payload.books.reduce((acc, b) => acc + (b[k] || 0), 0);
  const totals = {
    earned: sum('total_royalty_earned'),
    paid: sum('royalty_paid'),
    pending: sum('royalty_pending'),
    copies: sum('copies_sold'),
  };
  const published = books.filter((b) => !b.in_production);
  const window = payoutWindow(today);
  const anyOverdue = books.some((b) => b.royalty_status === 'overdue');
  const belowThreshold = totals.pending > 0 && totals.pending < threshold;

  // One scenario label drives which paragraph the model writes, so edge
  // cases are decided by code rather than left to the model's judgement.
  let scenario;
  if (published.length === 0) scenario = 'no_published_books';
  else if (totals.pending === 0) scenario = 'all_paid';
  else if (belowThreshold) scenario = 'below_threshold';
  else if (anyOverdue) scenario = 'overdue';
  else scenario = 'pending_in_cycle';

  const guidance = {
    no_published_books: 'The author has no published books yet, so there are no royalties. Focus on the production update and what happens next.',
    all_paid: 'All royalties are paid up. Acknowledge this positively and thank them. Do not mention quarters, payout cycles or upcoming payouts, and do not say which period the last payout covered.',
    below_threshold: `The total pending amount (${formatINR(totals.pending)}) is below the ${formatINR(threshold)} minimum payout threshold, so it rolls over to the next quarter and will be paid once the accumulated balance reaches ${formatINR(threshold)}. Explain this plainly; it is policy, not a delay.`,
    overdue: `Some pending royalties are older than our normal cycle (see books with royalty_status "overdue"). Own this directly and apologise without corporate deflection. Then state the commitment exactly as given in follow_up_commitment, and mention the current cycle: ${window.quarter_label} royalties are due by ${humanDay(window.payout_by)}.`,
    pending_in_cycle: `The pending amount is within the normal cycle. Explain that royalties are calculated quarterly and paid within 45 days of the quarter ending, so the ${window.quarter_label} payout is due by ${humanDay(window.payout_by)}, by bank transfer to the account linked in their dashboard.`,
  }[scenario];

  return {
    author_first_name: payload.author.name.split(/\s+/)[0],
    author_name: payload.author.name,
    as_of: humanDay(today),
    scenario,
    scenario_guidance: guidance,
    follow_up_commitment: anyOverdue && scenario === 'overdue' ? config.overdue_commitment : null,
    totals: {
      earned: formatINR(totals.earned),
      paid: formatINR(totals.paid),
      pending: formatINR(totals.pending),
      copies_sold: totals.copies.toLocaleString('en-IN'),
    },
    // Only when something is pending: given to an all-paid author, the model
    // turned "Q3 2026 due by …" into a false "Q3 2026 has been paid".
    payout_cycle: totals.pending > 0 ? {
      quarter: window.quarter_label,
      quarter_end: humanDay(window.quarter_end),
      payout_due_by: humanDay(window.payout_by),
      minimum_payout: formatINR(threshold),
    } : null,
    published_books: published,
    books_in_production: books.filter((b) => b.in_production),
    support_email: config.support_email,
    // Raw numbers for Bubble/n8n bookkeeping; not shown to the model.
    _raw: { totals, scenario, any_overdue: anyOverdue, today: isoDay(today) },
  };
}

// Checks the model's email against the facts before anything is sent.
// Returns a list of problems (empty = OK).
function checkEmail(email, facts) {
  const problems = [];
  if (!email || typeof email.subject !== 'string' || typeof email.body !== 'string') {
    return ['Model did not return {subject, body}'];
  }
  const subject = email.subject.trim();
  const body = email.body;
  if (subject.length < 5 || subject.length > 140) problems.push('Subject length out of range');
  if (body.trim().length < 200) problems.push('Body is too short');
  if (!body.includes(facts.author_first_name)) problems.push('Greeting does not use the author\'s name');
  // A figure counts only when written as an amount ("₹3,570", "₹ 3,570", "Rs. 3,570").
  // Bare digits don't count: "0" would match almost any text.
  const mentions = (inr) => [inr, inr.replace('₹', '₹ '), inr.replace('₹', 'Rs. '), inr.replace('₹', 'Rs ')]
    .some((form) => body.includes(form));
  if (facts.published_books.length > 0) {
    for (const k of ['earned', 'paid', 'pending']) {
      if (!mentions(facts.totals[k])) problems.push(`Total ${k} (${facts.totals[k]}) is missing`);
    }
  }
  // Titles match whatever quote or dash style the model used: the data has
  // "Durga’s Daughters" (curly) and the model may write "Durga's" (straight).
  const fold = (s) => s.replace(/[‘’ʼ`]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ').toLowerCase();
  const foldedBody = fold(body);
  for (const b of facts.published_books) {
    if (!foldedBody.includes(fold(b.title))) problems.push(`Published book "${b.title}" is not mentioned`);
  }
  for (const b of facts.books_in_production) {
    if (!foldedBody.includes(fold(b.title))) problems.push(`In-production book "${b.title}" is not mentioned`);
  }
  // Any rupee figure the model wrote must be one we gave it.
  const allowed = new Set();
  const collect = (v) => {
    if (typeof v === 'string' && v.startsWith('₹')) allowed.add(v.replace(/[₹,]/g, ''));
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(facts);
  const written = body.match(/₹\s?[\d,]+/g) || [];
  for (const w of written) {
    const digits = w.replace(/[₹,\s]/g, '');
    if (!allowed.has(digits)) problems.push(`Unexpected amount ${w} (not in the provided figures)`);
  }
  if (/\[[A-Z _]+\]|\{\{|lorem ipsum/i.test(body)) problems.push('Body contains a placeholder');
  return problems;
}

// Plain-text email -> minimal, email-client-safe HTML.
function toHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = text.trim().split(/\n{2,}/).map((p) => {
    const lines = p.split('\n');
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${esc(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    return `<p>${lines.map(esc).join('<br>')}</p>`;
  });
  return '<div style="font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#222;max-width:620px">'
    + paras.join('\n') + '</div>';
}

module.exports = {
  parseDay, parseAmount, parseYesNo, isoDay, humanDay, formatINR, todayInIndia,
  validatePayload, checkAndLock, releaseLock, productionStage, royaltyStatus,
  payoutWindow, buildFacts, checkEmail, toHtml,
};
