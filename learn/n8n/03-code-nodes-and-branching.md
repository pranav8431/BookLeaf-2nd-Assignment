# 03 – Code nodes and branching

## Config: one place for settings

**Config** is an *Edit Fields (Set)* node holding every tunable value. Other nodes read it with `$('Config').first().json.<name>`.

| Field | Value | Effect |
|---|---|---|
| `ai_model` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Which Claude model Bedrock runs |
| `bedrock_endpoint` | `https://bedrock-runtime.us-east-1.amazonaws.com` | AWS region |
| `payout_threshold_inr` | 1000 | The minimum payout rule |
| `dedupe_window_seconds` | 120 | Duplicate guard window |
| `email_mode` | `off` (the export file defaults to `redirect`) | `off` (log only), `redirect` (to your inbox), `live` (to the author) |
| `support_email`, `overdue_commitment` | text | Put into the email facts |
| `bubble_callback_enabled` | false | The Data API callback, for paid Bubble plans |

Changing behaviour means editing Config and publishing. No node needs touching.

## Code nodes

A **Code** node runs JavaScript. In "Run Once for All Items" mode it reads `$input.first().json` (or `$input.all()`) and must **return a list of items**: `return [{ json: { … } }]`.

This workflow's Code nodes:

| Node | What it does |
|---|---|
| Validate Payload | Parses Bubble's strings into numbers and dates. Lists every problem. |
| Duplicate Guard | Checks and records "this author was triggered at …" (lesson 05) |
| Compute Royalty Facts | Totals, statuses, payout window, scenario |
| Build AI Request | The Bedrock request body: system prompt, facts, JSON schema |
| Check AI Output | Parses Claude's JSON and runs `checkEmail()` |
| Prepare Email | Subject, plain text and HTML. Applies `email_mode`. |
| Success / Failure / Invalid / Duplicate Result | Shape the reply for each outcome |
| Finalize Result | One reply object. Releases the duplicate lock if the run failed. |

## Where the code really lives

Writing logic straight into n8n's code editor is hard to test. In this project every function lives in **`n8n/src/lib.js`** (and the prompt in `n8n/src/prompt.js`), with unit tests in `n8n/test/unit.test.mjs`.

**`n8n/build_workflow.mjs`** builds the workflow JSON. For each Code node it copies in exactly the functions that node needs, using their real source text. So the code you test is byte-for-byte the code that runs. Open *Check AI Output* in n8n: the top line says "Generated from n8n/src/*.js by build_workflow.mjs".

The change loop:

```bash
# 1. edit n8n/src/lib.js
npm test          # 2. unit tests
npm run build     # 3. regenerate n8n/bookleaf_royalty_summary.workflow.json
# 4. paste the node's new code into n8n (or re-import the file), then Publish
```

## "Code owns the facts": Compute Royalty Facts

This node decides everything factual, so Claude doesn't have to:

- **Totals**, formatted as Indian rupees: `₹1,23,456`.
- **Each book's status**: paid; pending within 90 days of the last payout (or of publication if never paid); overdue after that.
- **The payout window**: the quarter that just ended plus 45 days. On 30 Oct 2026 that's Q3 2026, due by 14 Nov 2026.
- **The scenario**, which picks one instruction paragraph for Claude:

| Scenario | When | Example |
|---|---|---|
| `all_paid` | nothing pending | Farhan |
| `below_threshold` | pending, but under ₹1,000 | Kavita (₹850) |
| `overdue` | anything overdue | Ananya, Rohit, Priya… |
| `pending_in_cycle` | pending, none overdue | (none today; try `--as-of 2025-12-15`) |
| `no_published_books` | only books in production | (none in the data) |

## IF nodes: branching

An **IF** node has a *true* and a *false* output. *Payload Valid?* tests `{{ $json.ok }}`. True goes on; false goes to *Invalid Payload Result*. The same pattern appears in *Already Triggered?*, *Email Passes Checks?*, *Send Email?* and *Callback Enabled?*.

## Check yourself

1. You want the minimum payout to be ₹500. What do you change?
2. Why is *Finalize Result* the only node that talks to *Respond to Bubble*?
3. Where would you fix a bug in the duplicate guard, and how do you get the fix into n8n?

Answers: 1) `payout_threshold_inr` in Config, then Publish. Also update the policy text in `prompt.js`, which mentions ₹1,000. 2) Every outcome gets the same reply shape and the same last steps (lock release, callback). 3) In `checkAndLock` in `n8n/src/lib.js`. Add a test, run `npm test` and `npm run build`, then update the *Duplicate Guard* node and publish.
