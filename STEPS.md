# What to do, step by step

## Where things stand (31 Oct 2026)

Parts A–E are done. Part D below is kept for reference. The [build guide](docs/BUBBLE_BUILD_GUIDE.md#how-the-deployed-app-differs-from-this-guide) lists where the deployed app differs.

- **Done and tested live:**
  - logins for admin, Priya and Rohit
  - data isolation
  - single send → *Success*; second click → *Skipped*
  - bulk send to all 9 authors with a pending balance
  - error rows with clear reasons
  - n8n is published and the export file matches it
- **Left for you:**
  - [ ] **Collaborator:** when BookLeaf sends their email, go to Settings → Collaboration → **Invite**, not Transfer. If the Free plan blocks inviting, tell them, and offer the version-test link and logins.
  - [x] **README → Learning process:** written (YouTube + official docs). Read it once and adjust anything that doesn't sound like you.
  - [ ] **Optional:** thousands separators on the amounts in the Bubble UI (`:formatted as` on each amount).
  - [ ] **Recording:** follow [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md). Leave `email_mode = off`, because the email shows in Bubble's log.
  - [ ] **F6 and F7** below: prepare for the call, zip, send.

---

Work top to bottom. Tick each box as you go. Where a step says "Guide §N", the exact clicks are in [docs/BUBBLE_BUILD_GUIDE.md](docs/BUBBLE_BUILD_GUIDE.md), section N.

Rough plan across your 5 days:

| Day | Steps |
|---|---|
| 1 | Parts A–C (accounts, n8n live with Bedrock, email check) and Bubble steps D1–D4 |
| 2 | D5–D9 (data in, logins, author dashboard) |
| 3 | D10–D14 (admin pages, the integration) |
| 4 | Part E (test everything) and fix what breaks |
| 5 | Part F (README, recording, submit) |

---

## Part A: Accounts and keys (30 min)

- [ ] **A1. Bubble account:** sign up at bubble.io (the Free plan is enough).
- [ ] **A2. n8n:** start an n8n Cloud free trial at n8n.io. Cloud is easiest because its webhook URL is already public. (Self-hosting works too, but then you need ngrok.)
- [ ] **A3. AWS Bedrock access:** you can reuse the IAM user from Assignment 1, whose keys are in `~/Desktop/bookleaf/.env` as `BEDROCK_AWS_ACCESS_KEY_ID` / `BEDROCK_AWS_SECRET_ACCESS_KEY`. Check two things in the AWS console (region **us-east-1**):
  - **Bedrock → Model access:** Claude Haiku 4.5 shows *Access granted*. It already worked for Assignment 1, so it should.
  - **IAM → that user → Permissions:** it can call `bedrock:InvokeModel`. A policy like this is enough:
    ```json
    { "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Action": "bedrock:InvokeModel",
      "Resource": ["arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*",
                   "arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5*"] }] }
    ```
  Use the IAM **access key + secret**, not the Bedrock API key. n8n's AWS credential signs requests with them, and your Assignment 1 notes say some AWS organisations block Bedrock API keys.
- [ ] **A4. Webhook secret:** in a terminal, run
  ```bash
  openssl rand -hex 32
  ```
  and save the output in a notes file as **WEBHOOK_KEY**. You'll paste it into both n8n and Bubble.
- [ ] **A5. (Optional, for the real-email bonus) Gmail app password:** turn on 2-step verification in your Google account, then go to myaccount.google.com → Security → App passwords → create one. Save it.

## Part B: Set up n8n (30 min)

- [ ] **B1. Import:** n8n → **Workflows → ⋯ → Import from File** → choose `n8n/bookleaf_royalty_summary.workflow.json`.
- [ ] **B2. Webhook credential:** open the **Bubble Webhook** node → Credential → *Create new* → **Header Auth**:
  - Name: `X-BookLeaf-Key`
  - Value: your **WEBHOOK_KEY**
- [ ] **B3. AWS credential:** open **Claude on Bedrock: Write Email** → Credential → *Create new* → **AWS (IAM)**:
  - Region: `us-east-1`
  - Access Key ID and Secret Access Key: from A3
  - Temporary credentials: off
  - Leave the custom endpoints empty.
- [ ] **B4. Config:** open the **Config** node and set:
  - `email_redirect_to` = your own email address (demo emails go here, never to the fake authors)
  - `email_from` = for example `BookLeaf Royalties <yourgmail@gmail.com>`
  - `support_email` = any address you want shown in the emails
  - Leave `ai_model`, `bedrock_endpoint`, `email_mode = redirect` and `bubble_callback_enabled = false` as they are.
- [ ] **B5. Email node (optional, needs A5):** open **Send Email (SMTP)** → create an SMTP credential:
  - User: your Gmail address
  - Password: the app password from A5
  - Host: `smtp.gmail.com`, Port: `465`, SSL/TLS: on

  If you skip this, set `email_mode = off` in Config; emails are then only logged in Bubble, which is enough for the brief.
- [ ] **B6. Save, then Publish/Activate** the workflow (toggle at the top right).
- [ ] **B7.** Open the **Bubble Webhook** node and copy the **Production URL**. It looks like `https://YOURNAME.app.n8n.cloud/webhook/bookleaf/royalty-summary`. Save it as **WEBHOOK_URL**.
- [ ] **B8. Quick test from your terminal:**
  ```bash
  cd ~/Desktop/bookleaf2
  curl -s -X POST "WEBHOOK_URL" -H "Content-Type: application/json" \
    -H "X-BookLeaf-Key: WEBHOOK_KEY" --data @n8n/test/payloads/AUTH009.json
  ```
  You should get back JSON with `"status":"Success"` and an email body. Check **Executions** in n8n to watch the run. Also try the same command with a wrong key: you should get a 403.

  If you get `"status":"Failed"`, the `error_message` says why:
  - *not authorized to perform bedrock:InvokeModel*: fix the IAM policy (A3)
  - *signature does not match*: re-paste the secret key in the AWS credential
  - *model identifier is invalid / access denied to model*: check Model access in the Bedrock console

## Part C: Check the AI emails before building Bubble (10 min)

This sends all 10 sample authors through your live workflow, so it tests n8n and Bedrock together.

- [ ] **C1.** In a terminal:
  ```bash
  cd ~/Desktop/bookleaf2
  WEBHOOK_URL="paste-url" WEBHOOK_KEY="paste-key" npm run try-webhook
  ```
- [ ] **C2.** You should see `10/10 Success`. Kavita (AUTH009) may say *Skipped* if you ran B8 less than 2 minutes ago; that's the duplicate guard working. Open a few emails in `n8n/test/.out/`, for example `AUTH009.txt` (Kavita) and `AUTH008.txt` (Farhan), and read them. They should sound like a real person at BookLeaf.
- [ ] **C3.** If an author comes back *Failed* with "AI email rejected by checks: …", the reason says exactly what was wrong. Run that author alone again:
  ```bash
  WEBHOOK_URL=… WEBHOOK_KEY=… npm run try-webhook -- AUTH003
  ```
  If it keeps failing, send me the output.

## Part D: Build the Bubble app (2–3 days)

The Guide has every click. Do the steps in this order, because each one needs the one before it.

- [ ] **D1. Create the app** (name it e.g. `bookleaf-royalties`). Skip the templates and start blank.
- [ ] **D2. Option sets:** create all 8, with their attributes (colours, labels, ranks). Put the admin email you'll use into `StaffEmail`, for example `ops.admin@bookleaf.test`. **Guide §1**
- [ ] **D3. Data types and fields:** create them exactly as named. The names matter because n8n uses the same ones. **Guide §2**
- [ ] **D4. Privacy rules:** for every type, untick everything for "Everyone else", then add the rules. **Guide §3**
- [ ] **D5. Import the data:** Data → App data → upload the three CSVs from `data/bubble_import/`, in order 1 → 2 → 3. Afterwards you should have 10 authors, 18 books and 12 payouts. **Guide §4**
- [ ] **D6. Pages:** create `index`, `login`, `signup`, `dashboard`, `admin`, `admin_author` (set its type of content to Author) and `setup`. **Guide §8**
- [ ] **D7. Sign-up and login workflows**, then create the accounts by signing up in preview mode **Guide §5**:
  - your admin email (from StaffEmail)
  - `priya.sharma@email.com`
  - `rohit.kapoor@email.com`

  Write down the passwords; they go in the README.
- [ ] **D8. StatusEngine** reusable element: the badge rule. **Guide §6**
- [ ] **D9. Setup page:** add the "Link imported records" button and click it once while logged in as admin. In App Data, check that every Book now has an author. **Guide §4**
- [ ] **D10. RoyaltyBadge and AuthorRoyaltyView** reusable elements, then put AuthorRoyaltyView on `dashboard`. Log in as Priya and check her two books and the totals ₹19,908 / ₹16,338 / ₹3,570. **Guide §7**
- [ ] **D11. Admin page:** filters, author list, KPI row, notification log table and the email popup. **Guide §8**
- [ ] **D12. admin_author page:** AuthorRoyaltyView (data source = Current page Author) and this author's log table. **Guide §8**
- [ ] **D13. API Connector:** install the plugin, add the `X-BookLeaf-Key` header with your **WEBHOOK_KEY** (Private) and the call with your **WEBHOOK_URL**. Tick "Include errors in response…". Paste the sample values from `data/bubble_import/api_connector_initialize_values.txt` and click **Initialize call**. It must return `Success`; if not, check that the n8n workflow is active (Part B). **Guide §9a**
- [ ] **D14. SummarySender, single button, bulk button.** **Guide §9b–9d**

**If you get stuck on a Bubble step:** write down what you tried and what happened, find a workaround, and keep going. The brief says they value this. Put the notes in the README's "Learning process" section later. You can also paste the problem to me.

## Part E: Test everything (half a day)

Go through **Guide §10**, all 8 checks:

- [ ] **E1.** Priya's figures and badges are correct.
- [ ] **E2.** Sneha's in-production book shows grey, "Not yet published".
- [ ] **E3.** Logged in as Priya, you can't reach admin pages or anyone else's data. Also try App Data → **Run as**.
- [ ] **E4.** The admin filters work: status, city and name search.
- [ ] **E5.** A single send for Kavita gives a Success log, and the email mentions the ₹1,000 threshold and *Raising Roots*.
- [ ] **E6.** A double-click doesn't send twice, and a second send within 2 minutes is *Skipped*.
- [ ] **E7.** The bulk send queues 9 authors (everyone except Farhan) and they all finish.
- [ ] **E8.** A wrong key in the API Connector gives *Failed (HTTP 403)*. Put the key back afterwards.
- [ ] **E9.** If you set up SMTP, the emails arrive in your inbox with "[Test - for …]" in the subject.

## Part F: Submit (day 5)

- [ ] **F1. Deploy:** in Bubble, click Deploy to Live if your plan allows it. If not, share the `version-test` URL; the data you imported is in the Development database, which version-test uses.
- [ ] **F2. Editor access:** Bubble → Settings → Collaboration → add the email BookLeaf gives you.
- [ ] **F3. n8n export:** in n8n, open the workflow → ⋯ → **Download**. Save it over `n8n/bookleaf_royalty_summary.workflow.json` so the file matches what's running. Exports never include credential secrets, but open the file and search for your key to be sure. If you use n8n Cloud, also give them view access to the workspace.
- [ ] **F4. README:**
  - fill in the **test logins** table at the top
  - write the **Learning process** section in your own words: what you watched or read, what was confusing and how you solved it
  - delete anything the README says that you didn't actually build, for example the callback, if you left it off
- [ ] **F5. Recording (3–5 min):** follow `docs/DEMO_SCRIPT.md`. With `email_mode = off`, the full email is shown in the author's notification log. `redirect` also needs SMTP set up (B-steps).
- [ ] **F6. Prepare for the founder call.** Be able to explain, without notes:
  - why Book links to Author, and not the other way round
  - how the privacy rules work
  - why Bubble sends the full data instead of n8n reading Bubble (the Free plan has no Data API)
  - what each n8n section does
  - how a double-click is prevented (three layers)
  - why the AI never calculates numbers (code computes facts, Claude writes words, checks reject invented amounts)
  - why Bedrock, and how n8n authenticates to it (the AWS credential signs every request with SigV4; the IAM user can only call InvokeModel)
- [ ] **F7. Send:** zip the folder **without** `node_modules`, `n8n/test/.out` and `n8n/test/.build`. Email it with the live URL, the logins, the Loom link and the n8n workspace link.
  ```bash
  cd ~/Desktop && zip -r BookLeaf-assignment2.zip bookleaf2 -x "bookleaf2/node_modules/*" "bookleaf2/n8n/test/.out/*" "bookleaf2/n8n/test/.build/*"
  ```

---

**Questions worth emailing BookLeaf early** (the brief says asking is a good signal):

1. Should the red "overdue" badge ignore balances below the ₹1,000 payout minimum? Kavita's ₹850 is red under the rule as written, but it's correctly unpaid.
2. Is it fine if the demo emails go to a test inbox instead of the sample authors' addresses? Those addresses are on email.com, a real domain.
