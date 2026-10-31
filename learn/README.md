# How the BookLeaf royalty system works

Start here. This page follows one click through the whole system. The two folders then teach the tools, using this project as the example:

- [`bubble/`](bubble/): the app people log into
- [`n8n/`](n8n/): the automation that writes the email

Suggested order: read this page, do Bubble lessons 1–2, then n8n lessons 1–2, then the rest. Each lesson takes 20–40 minutes and ends with things to try.

---

## The three parts

| Part | Job | Where it lives |
|---|---|---|
| **Bubble** | Stores authors, books and payouts. Shows dashboards. Decides who may see what. Records every summary in a log. | pranavkr1503.bubbleapps.io/version-test |
| **n8n** | Receives a request, checks it, works out the facts, asks Claude for the wording, checks the wording, and replies. | pranav-bookleaf.app.n8n.cloud |
| **Claude on AWS Bedrock** | Writes the subject and body of the email from facts it is given. It never calculates anything. | AWS account, region us-east-1 |

Bubble is the source of truth for the data. n8n never reads Bubble's database: Bubble sends n8n everything it needs in one request.

## One click, start to finish

An admin opens Kavita's page and clicks **Generate & Send Royalty Summary**.

**In Bubble (the button's workflow on the `admin_author` page):**

1. A page state `is_sending` is set to *yes*. The button turns into a disabled "Sending…" button, so a double-click can't start a second run.
2. A **NotificationLog** row is created with status *Processing*, Kavita as the author, and the admin as `triggered_by`.
3. The **API Connector** action *Trigger Royalty Summary* sends a POST to the n8n webhook. Bubble makes this call from its own server, so the secret header `X-BookLeaf-Key` never reaches the browser. The body is JSON:
   ```json
   { "log_id": "…", "trigger_type": "single", "triggered_by": "admin@bookleaf.test",
     "author": { "id": "…", "author_code": "AUTH009", "name": "Kavita Deshmukh", "email": "…", "city": "Nagpur" },
     "books": [ { "title": "The Nagpur Notebooks", "copies_sold": "34", "total_royalty_earned": "850", … } ] }
   ```
   The `books` array is built in Bubble with `:format as text`, one JSON object per book.

**In n8n (workflow "BookLeaf - Royalty Summary Email"):**

4. **Bubble Webhook** checks the `X-BookLeaf-Key` header. A wrong key gets 403 and nothing else runs.
5. **Validate Payload** checks every field. It rejects a book whose earned − paid ≠ pending.
6. **Duplicate Guard** allows one run per author every 120 seconds. A second click comes back *Skipped* without calling Claude.
7. **Compute Royalty Facts** (plain JavaScript) works out:
   - the totals, written as Indian rupees (`₹850`)
   - each book's status (paid / pending / overdue)
   - the payout window (Q3 2026, due by 14 November 2026)
   - the scenario. For Kavita it's `below_threshold`: ₹850 is under the ₹1,000 minimum.
8. **Claude on Bedrock: Write Email** sends the facts and a fixed system prompt to Claude Haiku 4.5. Claude must answer as JSON `{subject, body}`.
9. **Check AI Output** reads the email before anything is sent. Every book is named. All three totals are present. **No ₹ amount appears that wasn't in the facts.** If a check fails, the run ends as *Failed* with the reason.
10. **Send Email?** Email sending is off (`email_mode = off`), so nothing is mailed. The text is only logged.
11. **Respond to Bubble** returns `{status: "Success", email_subject, email_body, email_status, n8n_execution_id, …}`.

**Back in Bubble:**

12. The workflow writes the reply onto the log row and sets the status to *Success*, *Failed* or *Skipped*. If the call itself errored (wrong key, n8n down), a separate step marks the row *Failed: Could not reach n8n (HTTP 403)*.
13. `is_sending` goes back to *no*, and the log row on the page shows the email.

**Bulk** is the same three Bubble steps in a loop. The bulk button fills a page state `queue` with every author who has something pending (9 of 10). A "Do every 6 seconds" event takes the first author, creates their log row, removes them from the queue, and calls n8n.

## Why it's built this way

| Decision | Reason |
|---|---|
| Bubble sends all the data to n8n | The Free plan has no Data API, so n8n couldn't read Bubble anyway. It also means one fewer network hop, and no Bubble token in n8n that would bypass privacy rules. |
| Code computes the facts, Claude writes the words | Royalty emails are useless if a number is wrong. Language models can slip on arithmetic and dates; JavaScript doesn't. |
| Check the email before sending | The model could still copy a number wrongly or invent one. The check turns that into a visible *Failed*, never a wrong email. |
| Three layers against double sends | The page lock stops double-clicks. Bubble disables the button while the author has a *Processing* row. n8n's guard covers everything else, such as two admins or two tabs. |
| Sending runs in page workflows, not backend workflows | The Free plan stopped backend workflows after a few runs ("workflow limit"). Page workflows aren't capped. The cost: a bulk run needs the tab kept open. |
| Dates stored at noon IST, times shown in IST | A date stored at midnight IST is the previous day in a browser set to UTC. |

## Map of the project folder

| Path | What it is |
|---|---|
| `bookleaf_sample_data.json` | The dataset from the brief |
| `scripts/generate_data.mjs` | Turns the dataset into CSVs and test payloads |
| `n8n/src/lib.js` | All the logic that runs inside n8n's Code nodes: validation, facts, checks |
| `n8n/src/prompt.js` | The system prompt and the request sent to Claude |
| `n8n/build_workflow.mjs` | Builds the n8n workflow JSON, copying in the tested code |
| `n8n/bookleaf_royalty_summary.workflow.json` | The workflow export you submit |
| `n8n/test/` | Unit tests (`npm test`), end-to-end tests in real n8n, live-webhook script |
| `docs/` | Bubble build guide and demo script |
| `README.md` | The write-up for BookLeaf |

## Questions to be able to answer without notes

1. Why does Book point to Author, and not Author hold a list of Books?
2. Priya types Rohit's book ID into a URL. What stops her seeing it?
3. How does a new author's login get linked to their Author record?
4. What happens, step by step, if someone double-clicks the button?
5. Why can't Claude invent a royalty figure that reaches an author?
6. What does the admin see if AWS is down? If the webhook key is wrong?
7. Why does Kavita get no apology even though her badge is red?
8. What would you change on a paid Bubble plan?

The lessons answer all of these. Answers are also in the main [README](../README.md).
