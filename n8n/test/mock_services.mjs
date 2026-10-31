#!/usr/bin/env node
// Local stand-ins for Claude on AWS Bedrock and the Bubble Data API, so the real
// n8n workflow can be exercised end to end without AWS keys or a Bubble app.
//
//   POST  /model/:modelId/invoke            Bedrock InvokeModel; the AWS SigV4 signature is
//                                           recomputed and must match, as AWS would require
//   PATCH /api/1.1/obj/notificationlog/:id  records the callback (Bubble Data API shape)
//   GET   /__calls                          everything received, for assertions
//
// Failure injection, by author name in the facts:
//   Rohit Kapoor  -> AI API returns 500 (tests retries + Failed path)
//   Vikram Joshi  -> AI invents an amount (tests the output checks)

import { createServer } from 'node:http';
import { createHash, createHmac } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 8787);
const calls = [];
// Fake IAM key pair the e2e test gives n8n's AWS credential.
const AWS_KEY = 'AKIDEXAMPLE';
const AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';

// Standard SigV4 verification for non-S3 services (Bedrock signs as "bedrock").
// Returns null when the signature is valid, otherwise the reason.
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const hmac = (k, v) => createHmac('sha256', k).update(v).digest();
const rfc3986 = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
function sigv4Problem(req, rawBody) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/);
  if (!m) return 'missing or malformed SigV4 Authorization header';
  const [, key, date, region, service, signedHeaders, signature] = m;
  if (key !== AWS_KEY) return `unknown access key ${key}`;
  if (service !== 'bedrock') return `signed for service "${service}", Bedrock requires "bedrock"`;
  if (region !== 'us-east-1') return `signed for region ${region}`;
  const amzDate = req.headers['x-amz-date'];
  if (!amzDate) return 'missing x-amz-date';
  const [path, query = ''] = req.url.split('?');
  const canonicalUri = path.split('/').map(rfc3986).join('/');
  const canonicalQuery = query.split('&').filter(Boolean).map((p) => p.split('=')).sort().map(([k, v = '']) => `${k}=${v}`).join('&');
  const canonicalHeaders = signedHeaders.split(';')
    .map((h) => `${h}:${String(req.headers[h] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
  const payloadHash = req.headers['x-amz-content-sha256'] || sha256(rawBody);
  const canonicalRequest = [req.method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${AWS_SECRET}`, date), region), service), 'aws4_request');
  const expected = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return expected === signature ? null : 'signature does not match';
}

const goodEmail = (f) => {
  const lines = [`Dear ${f.author_first_name},`, '',
    `Here is your BookLeaf royalty summary as of ${f.as_of}.`, ''];
  for (const b of f.published_books) {
    lines.push(b.title, `- Copies sold: ${b.copies_sold}`,
      `- Royalty earned: ${b.earned}; paid: ${b.paid}; pending: ${b.pending}`,
      `- Last payout: ${b.last_payout}`, '');
  }
  lines.push(`Overall you have earned ${f.totals.earned}, of which ${f.totals.paid} has been paid and ${f.totals.pending} is pending.`, '');
  lines.push(f.scenario_guidance.replace(/\(see books.*?\)\.?/, '').slice(0, 300), '');
  for (const b of f.books_in_production) {
    lines.push(`${b.title} is at ${b.production.stage} (stage ${b.production.step} of ${b.production.of}); next is ${b.production.next}.`, '');
  }
  lines.push(`You can see the full breakdown in your BookLeaf dashboard, or write to ${f.support_email}.`, '',
    'Warm regards,', 'The BookLeaf Author Success Team');
  return { subject: `Your BookLeaf royalty summary - ${f.totals.pending} pending`, body: lines.join('\n') };
};

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    const sigv4 = req.url.startsWith('/model/') ? sigv4Problem(req, raw) : undefined;
    if (!req.url.startsWith('/__')) calls.push({ method: req.method, url: req.url, headers: req.headers, body, sigv4, at: new Date().toISOString() });

    if (req.method === 'GET' && req.url === '/__calls') return send(res, 200, calls);
    if (req.method === 'POST' && req.url === '/__reset') { calls.length = 0; return send(res, 200, { ok: true }); }

    if (req.method === 'POST' && /^\/model\/[^/]+\/invoke$/.test(req.url)) {
      if (sigv4) return send(res, 403, { message: `The request signature we calculated does not match (${sigv4})` });
      // Real Bedrock answers 400 when these are missing or not JSON.
      const ct = String(req.headers['content-type'] || ''); const accept = String(req.headers.accept || '');
      if (!ct.startsWith('application/json') || !accept.includes('application/json')) {
        return send(res, 400, { message: 'The provided Content Type is invalid or not supported for this model' });
      }
      const text = body.messages[0].content;
      const facts = JSON.parse(text.slice(text.indexOf('<author_facts>') + 14, text.indexOf('</author_facts>')));
      if (facts.author_name === 'Rohit Kapoor') return send(res, 500, { type: 'error', error: { type: 'api_error', message: 'Internal server error' } });
      const email = goodEmail(facts);
      if (facts.author_name === 'Vikram Joshi') email.body = email.body.replace(facts.totals.paid, '₹99,999');
      return setTimeout(() => send(res, 200, {
        id: 'msg_mock', type: 'message', role: 'assistant', model: decodeURIComponent(req.url.split('/')[2]), stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(email) }],
        usage: { input_tokens: 1500, output_tokens: 350 },
      }), 200);
    }

    const m = req.url.match(/^\/api\/1\.1\/obj\/notificationlog\/([^/?]+)/);
    if (req.method === 'PATCH' && m) {
      if (req.headers.authorization !== 'Bearer test-bubble-token') return send(res, 401, { status: 'error', message: 'bad token' });
      if (m[1].includes('callback-down')) return send(res, 503, { status: 'error', message: 'Bubble unavailable' });
      return send(res, 204);
    }
    send(res, 404, { error: 'not found' });
  });
}).listen(PORT, () => console.log(`mock services on :${PORT}`));
