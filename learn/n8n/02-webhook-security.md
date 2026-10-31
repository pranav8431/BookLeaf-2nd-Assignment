# 02 – Webhook, security and replies

## The Webhook trigger

**Bubble Webhook** is a *Webhook* node. It gives the workflow two URLs:

- **Test URL** (`/webhook-test/…`): works only while you've clicked *Listen for test event*, and shows the data live in the editor. Use it while building.
- **Production URL** (`/webhook/bookleaf/royalty-summary`): works only when the workflow is published. Bubble's API Connector uses this one.

Settings that matter here:

| Setting | Value | Why |
|---|---|---|
| HTTP Method | POST | Bubble sends a JSON body |
| Authentication | Header Auth | A request without the right header gets **403** and the workflow never starts |
| Respond | Using 'Respond to Webhook' node | So the reply can be built at the end, after Claude, not sent immediately |

## Credentials keep secrets out of the workflow

The webhook key, AWS keys, Bubble token and SMTP password all live in **Credentials** (left sidebar → *Credentials*), not in node fields. Nodes just reference them by name:

| Credential | Type | Used by |
|---|---|---|
| BookLeaf Webhook Key (X-BookLeaf-Key) | Header Auth | Bubble Webhook |
| AWS Bedrock (IAM access key) | AWS | Claude on Bedrock: Write Email |
| Bubble API Token | Header Auth | Callback (switched off on the Free plan) |
| BookLeaf SMTP | SMTP | Send Email (only if email is turned on) |

Because of this, the exported workflow JSON contains no secrets, so it's safe to submit.

The same key is stored twice, in n8n's credential and as a **private** header in Bubble's API Connector. If they differ, every send fails with 403.

## Respond to Webhook

**Respond to Bubble** is the last node. It sends the JSON that *Finalize Result* built back as the HTTP response to Bubble's call:

```json
{ "status": "Success", "log_id": "…", "completed_at": "…",
  "email_subject": "…", "email_body": "…",
  "email_status": "Not sent", "email_detail": "Email sending is off …",
  "error_message": "", "n8n_execution_id": "23" }
```

Bubble waits for this reply, which is why a run takes about 5 seconds from the button's point of view. The workflow's execution timeout is 150 s, so a hung run can't keep Bubble waiting forever.

## Don't trust the input

Even with a valid key, n8n treats the body as untrusted. **Validate Payload** checks:

- every required field is present
- emails look like emails
- numbers parse
- for every book, earned − paid = pending

If anything fails, *Invalid Payload Result* answers *Failed: Invalid request from Bubble: …*, and Claude is never called. You saw this for real when Bubble sent empty author fields: "author.name is required; author.email is required".

## Try it from your terminal

With the URL and key in your environment (never paste the key into chat or a file):

```bash
cd ~/Desktop/bookleaf2
WEBHOOK_URL="https://pranav-bookleaf.app.n8n.cloud/webhook/bookleaf/royalty-summary" \
WEBHOOK_KEY="…your key…" npm run try-webhook -- AUTH009
```

Then call it with a wrong key using curl, and look for the 403:

```bash
curl -i -X POST "$WEBHOOK_URL" -H 'X-BookLeaf-Key: wrong' -H 'Content-Type: application/json' -d '{}'
```

## Check yourself

1. Why is the key a *Header Auth* credential and not checked in a Code node?
2. Bubble shows *Failed: Invalid request from Bubble: books[1].royalty_pending …*. Which side is wrong, Bubble or n8n?

Answers: 1) Header Auth rejects the request before any node runs: no execution, no cost, nothing logged with the payload. 2) Bubble's data (or how Bubble builds the JSON). n8n is doing its job by refusing figures that don't add up.
