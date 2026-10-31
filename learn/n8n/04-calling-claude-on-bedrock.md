# 04 – Calling Claude on Bedrock

## The HTTP Request node

n8n has ready-made AI nodes, but this workflow uses a plain **HTTP Request** node, *Claude on Bedrock: Write Email*. That gives full control over the request (structured output, thinking off) and returns Claude's raw reply for checking.

| Setting | Value |
|---|---|
| Method | POST |
| URL | `{bedrock_endpoint}/model/{ai_model}/invoke` (from Config) |
| Authentication | Predefined credential type → **AWS** |
| Headers | `Content-Type: application/json`, `Accept: application/json` |
| Body | JSON from *Build AI Request* |
| Timeout | 45 s |
| Settings tab | Retry on fail: 3 tries, 3 s apart. On error: continue (using error output). |

**How AWS authentication works.** AWS doesn't take a simple API key here. Every request must be signed with **SigV4**, a signature computed from the access key secret, the date, the URL and the body. n8n's AWS credential does this automatically. The IAM user's only permission is `bedrock:InvokeModel`, so a leaked key can't do anything else in the AWS account.

Lessons from building it: Bedrock answered *400 "Content Type invalid"* until the two headers were set explicitly. The end-to-end test's mock Bedrock now rejects requests without them, and recomputes the SigV4 signature, so this can't regress unnoticed.

## The request body

Built by `buildRequest()` in `n8n/src/prompt.js`:

```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 2000,
  "system": "<fixed system prompt: royalty policy, tone, 10 rules>",
  "messages": [{ "role": "user", "content": "<the facts as JSON + what to write>" }],
  "thinking": { "type": "disabled" },
  "output_config": { "format": { "type": "json_schema", "schema": { "subject": "string", "body": "string" } } }
}
```

- **The system prompt never changes.** It holds no names or dates. Everything that varies goes in the user message.
- **Structured output** forces Claude to answer `{"subject": …, "body": …}`, so there's no parsing guesswork.
- **Thinking off:** this is short writing from given facts; reasoning adds cost and time without improving it.

## What the prompt tells Claude

The rules, in short (full text in `prompt.js`):

- Use only the given facts.
- Copy amounts exactly.
- Never predict when money will arrive ("soon", "well before").
- Greet by first name.
- Mention every book and all three totals, even ₹0.
- Plain text, 180–320 words, written as "we", signed "The BookLeaf Author Success Team".

Each scenario adds its own paragraph. For example, *overdue* means own the delay without deflecting, and give the ops commitment ("our royalties team will confirm the exact payout date within 2 business days").

## Checking the answer: Check AI Output

`checkEmail()` in `lib.js` rejects the email if:

- it isn't `{subject, body}`, or the body is too short
- the author's first name is missing
- any book title is missing. Since 31 Oct this comparison ignores quote style, dashes and case: Diya's *Durga’s Daughters* was rejected only because Claude wrote a straight apostrophe.
- any of the three totals is missing
- **any ₹ amount appears that isn't in the facts**, which catches invented figures
- it contains a placeholder like `[NAME]` or `{{`

A rejection becomes *Failed: AI email rejected by checks: …* in Bubble. Nothing is sent.

## Cost and speed

One email is about 1.5k input and 0.4k output tokens on Haiku 4.5, a fraction of a cent. A run takes 3–6 s, most of it Claude.

## Check yourself

1. Claude writes "₹3,750" where the facts say "₹3,570". What happens?
2. Why not let Claude calculate the totals from the book list?
3. AWS returns 403 "not authorized to perform bedrock:InvokeModel". Where do you fix it?

Answers: 1) The check finds an amount not in the facts, and the run is *Failed* with "Unexpected amount ₹3,750". 2) Models can slip on arithmetic and dates; code can't, and code is tested. 3) In AWS IAM: the user's policy needs `bedrock:InvokeModel` on the inference profile and the model. Also check model access is enabled in the Bedrock console.
