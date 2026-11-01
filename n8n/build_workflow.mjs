#!/usr/bin/env node
// Generates the importable n8n workflow from src/lib.js and src/prompt.js, so
// the code inside the Code nodes is exactly the code the unit tests exercise.
//
//   node n8n/build_workflow.mjs                      -> n8n/bookleaf_royalty_summary.workflow.json
//   node n8n/build_workflow.mjs --test <mockBaseUrl> [--bedrock <url>]
//       -> test build pointing at the local mocks (Bedrock + Bubble API), written to n8n/test/.build/

import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const lib = require('./src/lib.js');
const prompt = require('./src/prompt.js');

const testIdx = process.argv.indexOf('--test');
const mockBase = testIdx > -1 ? process.argv[testIdx + 1] : null;
const bedrockIdx = process.argv.indexOf('--bedrock');
const bedrockEndpoint = bedrockIdx > -1 ? process.argv[bedrockIdx + 1] : 'https://bedrock-runtime.us-east-1.amazonaws.com';

// Deterministic ids keep diffs of the exported JSON readable.
const uuid = (seed) => {
  const h = createHash('sha1').update(`bookleaf:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// Code node body = the lib functions it uses + its own entry code.
const code = (fns, body, consts = {}) => {
  const header = '// Generated from n8n/src/*.js by build_workflow.mjs - edit there, then rebuild.\n';
  const constSrc = Object.entries(consts).map(([k, v]) => `const ${k} = ${JSON.stringify(v, null, 2)};\n`).join('');
  const fnSrc = fns.map((name) => lib[name].toString()).join('\n\n');
  return `${header}\n${constSrc}${constSrc ? '\n' : ''}${fnSrc}\n\n// ---- node logic ----\n${body.trim()}\n`;
};

const CRED = {
  webhook: { httpHeaderAuth: { id: 'bookleafWebhookKey', name: 'BookLeaf Webhook Key (X-BookLeaf-Key)' } },
  aws: { aws: { id: 'awsBedrock', name: 'AWS Bedrock (IAM access key)' } },
  bubble: { httpHeaderAuth: { id: 'bubbleApiToken', name: 'Bubble API Token (Authorization: Bearer)' } },
  smtp: { smtp: { id: 'bookleafSmtp', name: 'BookLeaf SMTP' } },
};

const nodes = [];
const node = (name, type, typeVersion, position, parameters, extra = {}) => {
  nodes.push({ parameters, id: uuid(name), name, type, typeVersion, position, ...extra });
  return name;
};
const sticky = (name, position, width, height, content, color = 7) => node(name, 'n8n-nodes-base.stickyNote', 1,
  position, { content, width, height, color });

const setField = (name, value) => ({
  id: uuid(`cfg-${name}`), name, value, type: typeof value === 'number' ? 'number' : 'string',
});
const ifTrue = (name, leftValue, position) => node(name, 'n8n-nodes-base.if', 2, position, {
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{
      id: uuid(`${name}-cond`), leftValue, rightValue: '',
      operator: { type: 'boolean', operation: 'true', singleValue: true },
    }],
    combinator: 'and',
  },
  options: {},
});

// ---------------------------------------------------------------- nodes

sticky('Note: Overview', [-80, -420], 1060, 300, `## BookLeaf - Royalty Summary (Bubble -> n8n -> Claude -> Bubble)
**Trigger:** Bubble admin clicks "Generate & Send Royalty Summary" (or bulk). Bubble creates a Notification Log row (status *Processing*) and POSTs the author's full royalty data here.

**Security:** Header Auth credential - requests without the right \`X-BookLeaf-Key\` get 403 before any node runs.

**Contract:** every handled outcome answers HTTP 200 with \`{status: Success | Failed | Skipped, ...}\` so Bubble can update the log from the response. If the Bubble Data API is available (paid plan), the same result is also PATCHed to the log as a callback.

**Edit settings in the *Config* node** (Bedrock model + endpoint, email mode, dedupe window, Bubble API base).`, 4);
sticky('Note: Guards', [380, -100], 620, 520, `### 1. Validate & de-duplicate
- Rejects malformed payloads and books whose *earned - paid != pending* - we never email inconsistent numbers.
- Duplicate guard: one run per author per window (default 120 s), stored in workflow static data. Failed runs release the lock so the admin can retry immediately.`);
sticky('Note: AI', [1100, -100], 900, 520, `### 2. Facts in code, words from Claude
- *Compute Royalty Facts* decides every figure, the green/yellow/red status, the next payout date (quarterly + 45 days) and the scenario (all paid / in cycle / overdue / below ₹1,000 / in production).
- Claude Haiku on **AWS Bedrock** writes the email from those facts only (structured JSON output). SigV4 via the AWS credential; 3 tries, 45 s timeout.
- Model + region: \`ai_model\`, \`bedrock_endpoint\` in Config.
- *Check AI Output* rejects any email that drops a total or a book, or mentions an amount we did not supply.`);
sticky('Note: Delivery', [2100, -100], 720, 520, `### 3. Deliver
\`email_mode\` in Config:
- **off** - log to Bubble only (required output)
- **redirect** - send to \`email_redirect_to\` (safe for demos; sample author emails are real domains)
- **live** - send to the author

SMTP failures do not fail the summary; they are reported as \`email_status: Failed\`.`);
sticky('Note: Callback', [2920, -100], 760, 520, `### 4. Report back to Bubble
- *Finalize Result* builds one result object for every path (Success / Failed / Skipped).
- Optional callback: PATCH \`/obj/notificationlog/{log_id}\` on the Bubble Data API (needs a Bubble plan with the app API). Errors here are recorded but never block the webhook response.
- *Respond to Bubble* always answers, so the admin UI never hangs.`);

node('Bubble Webhook', 'n8n-nodes-base.webhook', 2, [0, 200], {
  httpMethod: 'POST',
  path: 'bookleaf/royalty-summary',
  authentication: 'headerAuth',
  responseMode: 'responseNode',
  options: {},
}, { webhookId: uuid('webhook-id'), credentials: CRED.webhook });

node('Config', 'n8n-nodes-base.set', 3.4, [220, 200], {
  mode: 'manual',
  assignments: {
    assignments: [
      setField('bedrock_endpoint', bedrockEndpoint),
      setField('ai_model', 'us.anthropic.claude-haiku-4-5-20251001-v1:0'),
      setField('payout_threshold_inr', 1000),
      setField('dedupe_window_seconds', 120),
      setField('email_mode', mockBase ? 'off' : 'redirect'),
      setField('email_redirect_to', 'replace-with-your-inbox@example.com'),
      setField('email_from', 'BookLeaf Royalties <replace-with-your-smtp-sender@example.com>'),
      setField('support_email', 'support@bookleaf.example'),
      setField('overdue_commitment', 'Our royalties team will review your account and confirm the exact payout date to you within 2 business days.'),
      setField('bubble_callback_enabled', mockBase ? 'true' : 'false'),
      setField('bubble_api_base', mockBase ? `${mockBase}/api/1.1` : 'https://YOUR-APP.bubbleapps.io/version-test/api/1.1'),
    ],
  },
  includeOtherFields: true,
  options: {},
});

node('Validate Payload', 'n8n-nodes-base.code', 2, [440, 200], {
  jsCode: code(['parseDay', 'parseAmount', 'parseYesNo', 'validatePayload'], `
const body = $('Bubble Webhook').first().json.body;
const result = validatePayload(body);
return [{
  json: {
    valid: result.ok,
    errors: result.errors,
    log_id: result.payload ? result.payload.log_id : null,
    author_id: result.payload ? result.payload.author.id : null,
    author_name: result.payload ? result.payload.author.name : null,
  },
}];`),
});

ifTrue('Payload Valid?', '={{ $json.valid }}', [660, 200]);

node('Duplicate Guard', 'n8n-nodes-base.code', 2, [880, 100], {
  jsCode: code(['checkAndLock'], `
const cfg = $('Config').first().json;
const v = $input.first().json;
const state = $getWorkflowStaticData('global');
const r = checkAndLock(state, v.author_id, v.log_id, Date.now(), Number(cfg.dedupe_window_seconds));
return [{ json: { ...v, duplicate: r.duplicate, duplicate_reason: r.reason || null, original_log_id: r.original_log_id || null } }];`),
});

ifTrue('Already Triggered?', '={{ $json.duplicate }}', [1100, 100]);

node('Compute Royalty Facts', 'n8n-nodes-base.code', 2, [1320, 200], {
  jsCode: code(['parseDay', 'parseAmount', 'parseYesNo', 'validatePayload', 'isoDay', 'humanDay', 'formatINR',
    'todayInIndia', 'productionStage', 'royaltyStatus', 'payoutWindow', 'buildFacts'], `
const cfg = $('Config').first().json;
// Re-parse the original body: typed values (Dates) do not survive between nodes.
const v = validatePayload($('Bubble Webhook').first().json.body);
const facts = buildFacts(v.payload, new Date(), {
  payout_threshold_inr: Number(cfg.payout_threshold_inr),
  support_email: cfg.support_email,
  overdue_commitment: cfg.overdue_commitment,
});
return [{ json: { log_id: v.payload.log_id, trigger_type: v.payload.trigger_type, author: v.payload.author, facts } }];`),
});

node('Build AI Request', 'n8n-nodes-base.code', 2, [1540, 200], {
  jsCode: code([], `
const cfg = $('Config').first().json;
const ctx = $input.first().json;
return [{ json: { ...ctx, request: buildRequest(ctx.facts, cfg.ai_model) } }];`, { SYSTEM_PROMPT: prompt.SYSTEM_PROMPT, OUTPUT_SCHEMA: prompt.OUTPUT_SCHEMA })
    .replace('// ---- node logic ----', `${prompt.buildUserMessage.toString()}\n\n${prompt.buildRequest.toString()}\n\n// ---- node logic ----`),
});

// Bedrock InvokeModel, SigV4-signed by n8n's AWS credential. The model ID is
// URL-encoded (its ":" becomes %3A), as the AWS SDKs send it. Bedrock rejects
// the call ("Content Type is invalid") unless both JSON headers are explicit.
node('Claude on Bedrock: Write Email', 'n8n-nodes-base.httpRequest', 4.2, [1760, 200], {
  method: 'POST',
  url: "={{ $('Config').first().json.bedrock_endpoint }}/model/{{ encodeURIComponent($('Config').first().json.ai_model) }}/invoke",
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'aws',
  sendHeaders: true,
  headerParameters: { parameters: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Accept', value: 'application/json' },
  ] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.request) }}',
  options: { timeout: 45000 },
}, { credentials: CRED.aws, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueErrorOutput' });

node('Check AI Output', 'n8n-nodes-base.code', 2, [1980, 120], {
  jsCode: code(['checkEmail'], `
const res = $input.first().json;
const ctx = $('Build AI Request').first().json;
const problems = [];
let email = null;
if (res.stop_reason === 'refusal') problems.push('Model declined the request');
else if (res.stop_reason === 'max_tokens') problems.push('Model output was cut off (max_tokens)');
else {
  const block = (res.content || []).find((b) => b.type === 'text');
  try { email = JSON.parse(block.text); } catch (e) { problems.push('Model output was not valid JSON'); }
}
if (email) problems.push(...checkEmail(email, ctx.facts));
return [{
  json: {
    ok: problems.length === 0,
    problems,
    email,
    ai: { model: res.model || null, input_tokens: res.usage ? res.usage.input_tokens : null, output_tokens: res.usage ? res.usage.output_tokens : null },
    log_id: ctx.log_id,
    author: ctx.author,
  },
}];`),
});

ifTrue('Email Passes Checks?', '={{ $json.ok }}', [2200, 120]);

node('Prepare Email', 'n8n-nodes-base.code', 2, [2420, 40], {
  jsCode: code(['toHtml'], `
const cfg = $('Config').first().json;
const r = $input.first().json;
const mode = String(cfg.email_mode || 'off').toLowerCase();
const validAddress = (a) => /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(a || '') && !/example\\.com$/i.test(a);
let send = false; let to = null; let skip_reason = null; let subject = r.email.subject;
if (mode === 'live') { send = true; to = r.author.email; }
else if (mode === 'redirect') {
  if (validAddress(cfg.email_redirect_to)) {
    send = true; to = cfg.email_redirect_to; subject = '[Test - for ' + r.author.email + '] ' + subject;
  } else skip_reason = 'email_mode is "redirect" but email_redirect_to is not set in Config';
} else skip_reason = 'Email sending is off (email_mode = off); the summary is logged in Bubble only.';
return [{ json: { ...r, send, to, subject, html: toHtml(r.email.body), skip_reason } }];`),
});

ifTrue('Send Email?', '={{ $json.send }}', [2640, 40]);

node('Send Email (SMTP)', 'n8n-nodes-base.emailSend', 2.1, [2860, -20], {
  fromEmail: "={{ $('Config').first().json.email_from }}",
  toEmail: '={{ $json.to }}',
  subject: '={{ $json.subject }}',
  emailFormat: 'both',
  text: '={{ $json.email.body }}',
  html: '={{ $json.html }}',
  options: { appendAttribution: false },
}, { credentials: CRED.smtp, retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: 'continueErrorOutput' });

node('Success Result', 'n8n-nodes-base.code', 2, [3080, 40], {
  jsCode: code([], `
const prep = $('Prepare Email').first().json;
const inp = $input.first().json;
const errText = (e) => (typeof e === 'string' ? e : (e && (e.message || e.description)) || JSON.stringify(e));
let email_status; let email_detail;
if (!prep.send) { email_status = 'Not sent'; email_detail = prep.skip_reason; }
else if (inp.error) { email_status = 'Failed'; email_detail = 'SMTP error: ' + errText(inp.error); }
// Only the SMTP server's acceptance counts as sent: a disabled email node passes
// its input straight through, which once showed "Sent" for an email never sent.
else if (!(Array.isArray(inp.accepted) && inp.accepted.length)) {
  email_status = 'Failed'; email_detail = 'Email node returned no SMTP confirmation (is Send Email (SMTP) disabled?)';
}
else { email_status = 'Sent'; email_detail = 'Sent to ' + inp.accepted.join(', ') + ' (' + String(inp.response || '').slice(0, 40) + ')'; }
return [{
  json: {
    status: 'Success',
    log_id: prep.log_id,
    author_id: prep.author.id,
    email_subject: prep.email.subject,
    email_body: prep.email.body,
    email_status,
    email_detail,
    error_message: '',
    ai: prep.ai,
  },
}];`),
});

node('Failure Result', 'n8n-nodes-base.code', 2, [2420, 360], {
  jsCode: code([], `
const inp = $input.first().json;
const ctx = $('Build AI Request').first().json;
const errText = (e) => (typeof e === 'string' ? e : (e && (e.message || e.description)) || JSON.stringify(e));
const reason = Array.isArray(inp.problems)
  ? 'AI email rejected by checks: ' + inp.problems.join('; ')
  : 'AI API call failed after 3 attempts: ' + errText(inp.error || inp);
return [{
  json: {
    status: 'Failed',
    log_id: ctx.log_id,
    author_id: ctx.author.id,
    email_subject: '',
    email_body: '',
    email_status: 'Not sent',
    email_detail: '',
    error_message: reason.slice(0, 1000),
  },
}];`),
});

node('Invalid Payload Result', 'n8n-nodes-base.code', 2, [880, 360], {
  jsCode: code([], `
const v = $input.first().json;
return [{
  json: {
    status: 'Failed',
    log_id: v.log_id,
    author_id: v.author_id,
    email_subject: '', email_body: '', email_status: 'Not sent', email_detail: '',
    error_message: ('Invalid request from Bubble: ' + v.errors.join('; ')).slice(0, 1000),
  },
}];`),
});

node('Duplicate Result', 'n8n-nodes-base.code', 2, [1320, -20], {
  jsCode: code([], `
const v = $input.first().json;
return [{
  json: {
    status: 'Skipped',
    log_id: v.log_id,
    author_id: v.author_id,
    email_subject: '', email_body: '', email_status: 'Not sent', email_detail: '',
    error_message: 'Duplicate trigger ignored: ' + v.duplicate_reason,
    original_log_id: v.original_log_id,
  },
}];`),
});

node('Finalize Result', 'n8n-nodes-base.code', 2, [3300, 200], {
  jsCode: code(['releaseLock'], `
const cfg = $('Config').first().json;
const r = $input.first().json;
const completed_at = new Date().toISOString();
// A failed run must not block a retry for the rest of the dedupe window.
if (r.status === 'Failed' && r.author_id) releaseLock($getWorkflowStaticData('global'), r.author_id, r.log_id);
const response = {
  status: r.status,
  log_id: r.log_id,
  completed_at,
  email_subject: r.email_subject,
  email_body: r.email_body,
  email_status: r.email_status,
  email_detail: r.email_detail,
  error_message: r.error_message,
  n8n_execution_id: String($execution.id),
  ai_model: r.ai ? r.ai.model : null,
};
// Field names match the NotificationLog data type in Bubble.
const callback = {
  status: r.status,
  completed_at,
  email_subject: r.email_subject,
  email_body: r.email_body,
  email_status: r.email_status,
  email_detail: r.email_detail,
  error_message: r.error_message,
  n8n_execution_id: String($execution.id),
};
const callbackEnabled = String(cfg.bubble_callback_enabled).toLowerCase() === 'true' && !!r.log_id;
return [{ json: { response, callback, callback_enabled: callbackEnabled } }];`),
});

ifTrue('Callback Enabled?', '={{ $json.callback_enabled }}', [3520, 200]);

node('Callback: Update Bubble Log', 'n8n-nodes-base.httpRequest', 4.2, [3740, 120], {
  method: 'PATCH',
  url: "={{ $('Config').first().json.bubble_api_base }}/obj/notificationlog/{{ $json.response.log_id }}",
  authentication: 'genericCredentialType',
  genericAuthType: 'httpHeaderAuth',
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.callback) }}',
  options: { timeout: 15000 },
}, { credentials: CRED.bubble, retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueErrorOutput' });

node('Note Callback Outcome', 'n8n-nodes-base.code', 2, [3960, 120], {
  jsCode: code([], `
const fin = $('Finalize Result').first().json;
const inp = $input.first().json;
const errText = (e) => (typeof e === 'string' ? e : (e && (e.message || e.description)) || JSON.stringify(e));
const callback_status = inp.error ? 'Failed: ' + errText(inp.error) : 'Delivered';
return [{ json: { ...fin, response: { ...fin.response, callback_status } } }];`),
});

node('Respond to Bubble', 'n8n-nodes-base.respondToWebhook', 1.1, [4180, 200], {
  respondWith: 'json',
  responseBody: '={{ JSON.stringify($json.response) }}',
  options: { responseCode: 200 },
});

// ---------------------------------------------------------------- wiring

const main = (...outputs) => ({ main: outputs.map((targets) => targets.map((n) => ({ node: n, type: 'main', index: 0 }))) });
const connections = {
  'Bubble Webhook': main(['Config']),
  Config: main(['Validate Payload']),
  'Validate Payload': main(['Payload Valid?']),
  'Payload Valid?': main(['Duplicate Guard'], ['Invalid Payload Result']),
  'Duplicate Guard': main(['Already Triggered?']),
  'Already Triggered?': main(['Duplicate Result'], ['Compute Royalty Facts']),
  'Compute Royalty Facts': main(['Build AI Request']),
  'Build AI Request': main(['Claude on Bedrock: Write Email']),
  'Claude on Bedrock: Write Email': main(['Check AI Output'], ['Failure Result']),
  'Check AI Output': main(['Email Passes Checks?']),
  'Email Passes Checks?': main(['Prepare Email'], ['Failure Result']),
  'Prepare Email': main(['Send Email?']),
  'Send Email?': main(['Send Email (SMTP)'], ['Success Result']),
  'Send Email (SMTP)': main(['Success Result'], ['Success Result']),
  'Success Result': main(['Finalize Result']),
  'Failure Result': main(['Finalize Result']),
  'Invalid Payload Result': main(['Finalize Result']),
  'Duplicate Result': main(['Finalize Result']),
  'Finalize Result': main(['Callback Enabled?']),
  'Callback Enabled?': main(['Callback: Update Bubble Log'], ['Respond to Bubble']),
  'Callback: Update Bubble Log': main(['Note Callback Outcome'], ['Note Callback Outcome']),
  'Note Callback Outcome': main(['Respond to Bubble']),
};

const workflow = {
  name: 'BookLeaf - Royalty Summary Email (Bubble webhook, Claude on Bedrock)',
  nodes,
  connections,
  active: false,
  settings: {
    executionOrder: 'v1',
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'all',
    saveManualExecutions: true,
    saveExecutionProgress: true,
    executionTimeout: 150,
  },
  pinData: {},
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

const outDir = mockBase ? join(here, 'test', '.build') : here;
mkdirSync(outDir, { recursive: true });
const out = join(outDir, mockBase ? 'workflow.test.json' : 'bookleaf_royalty_summary.workflow.json');
if (mockBase) workflow.id = 'bookleafRoyaltyTest';
writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log(`wrote ${out} (${nodes.length} nodes)`);
