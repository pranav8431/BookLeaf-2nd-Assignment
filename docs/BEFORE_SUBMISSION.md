# Before submission

Do these in order. Parts 1 and 2 change the live n8n workflow, so do them **before** recording the video. Then the recording shows the fixed email and a real email arriving.

1. ~~Fix Kavita's email~~ (done)
2. [Turn on email sending (SMTP)](#2-turn-on-email-sending-smtp) (20 min)
3. [Update the README and demo script for email](#3-update-the-readme-and-demo-script-for-email) (5 min)
4. [Everything else](#4-everything-else-before-you-send) (checklist)
5. [Push to GitHub](#5-push-to-github)

---

## 1. Fix Kavita's email (done, 2 Nov 2026)

**The problem.** Kavita's email said *"Your Q3 2026 royalties total ₹850."* That was false: ₹850 is everything she has earned since November 2024. Claude was given the current cycle (Q3 2026) in the facts and attached it to her balance.

**The fix**, in `buildFacts()` in [`n8n/src/lib.js`](../n8n/src/lib.js):

- Below the ₹1,000 minimum, the facts no longer include a quarter or due date. `payout_cycle` is only `{ minimum_payout: '₹1,000' }`.
- The `below_threshold` instruction tells Claude to call it "your pending balance", and not to mention any quarter or payout date.
- A unit test checks both. `npm test` → 10 pass.

**Done:** the export was rebuilt, the live *Compute Royalty Facts* node was updated, and the workflow was published. A test run (n8n execution #25) now says: *"Your pending balance of ₹850 is below our minimum payout threshold of ₹1,000. This means it will carry forward and be paid out in the first quarterly payout after your total pending balance reaches ₹1,000."* It passed every check.

**Left for you:** nothing. The next time you send Kavita from Bubble (for example in the recording), the log will show the new wording.

---

## 2. Turn on email sending (SMTP)

> **Use `redirect`, never `live`.** The sample authors' addresses are on `email.com`, a real domain with real mailboxes. In `live` mode, every click (yours or a BookLeaf reviewer's) emails a stranger. In `redirect` mode, every email goes to **your** inbox, and the subject says who it was meant for: `[Test - for kavita.deshmukh@email.com] Your BookLeaf royalty summary…`.

### 2a. Gmail app password

Gmail won't accept your normal password from n8n. You need an app password:

1. Go to myaccount.google.com → **Security** and make sure **2-Step Verification** is on.
2. Search the account page for **App passwords** (or go to myaccount.google.com/apppasswords).
3. Name it `n8n BookLeaf` → **Create**.
4. Copy the 16-character password (without the spaces). Google shows it only once.

Don't paste it into chat, the README or any file. It only goes into n8n.

### 2b. SMTP credential in n8n

1. In n8n, go to **Credentials** (left sidebar) → **Add credential** → search **SMTP**.
2. Fill it in:
   - User: your Gmail address
   - Password: the app password from 2a
   - Host: `smtp.gmail.com`
   - Port: `465`
   - SSL/TLS: **on**
3. Name it `BookLeaf SMTP` → **Save**. n8n tests the connection. If it fails, the usual cause is the normal password instead of the app password, or SSL left off.

### 2c. Attach it to the email node

1. Open the workflow and double-click **Send Email (SMTP)**.
2. Under **Credential to connect with**, choose `BookLeaf SMTP`. Close the node.

### 2d. Config

Double-click **Config** and change three fields:

| Field | Set to |
|---|---|
| `email_mode` | `redirect` |
| `email_redirect_to` | your Gmail address |
| `email_from` | `BookLeaf Royalties <your Gmail address>` (Gmail only sends from the account you logged in with) |

Leave everything else alone. Click **Save**, then **Publish**.

### 2e. Test

1. In Bubble as admin, open one author → **Generate & Send Royalty Summary**.
2. The log row should say **Success · email: Sent**.
3. Check your inbox (and Spam, the first time). The email has a plain-text and an HTML version.

| Bubble shows | What to do |
|---|---|
| **email: Sent** | Done. |
| **email: Failed** | Open the run in n8n → **Executions** → *Success Result* → `email_detail` has the SMTP error. Usually it's a wrong app password or SSL turned off. The summary itself is still *Success*; only delivery failed. |
| **email: Not sent** | `email_mode` is still `off`, or `email_redirect_to` is empty or still `…@example.com`. Fix it in Config, then publish again. |

Note: a bulk run sends 9 emails to your inbox, one every 6 seconds. Gmail's limit is about 500 a day, so that's fine.

---

## 3. Update the README and demo script for email

Once 2e works, three places still say email is off:

1. **README.md**, under the test-logins table, replace the sentence starting "These are test accounts on test data…" with:
   > These are test accounts on test data. Email sending is on in **redirect** mode: each summary is logged in Bubble *and* emailed to my own inbox (the subject names the intended author), so the sample authors' real-domain addresses are never mailed.
2. **README.md §4**, in *Email modes*, change "`redirect` (default)" to "`redirect` (what the live workflow uses)".
3. **docs/DEMO_SCRIPT.md** already assumes `redirect` (Scene 7 shows the email in Gmail), so it needs no change.

Or ask me and I'll make these three edits.

---

## 4. Everything else before you send

**The work**
- [x] **README → "Learning process"** (§9). Written: YouTube and official docs, how you approached it, a table of what tripped you up, and what you'd do differently. Read it once before submitting. If a video or doc page really helped you, add its name; specific sources read as more genuine.
  - what you'd do differently
- [ ] **Show the "all paid" email once.** Bulk correctly skips Farhan, so no all-paid email exists yet, and the brief asks for one. As admin, open **Farhan Sheikh** → Generate. The email should be a thank-you with no pending amount. Show it in the recording too.
- [ ] **Optional: thousands separators in Bubble.** Amounts show `₹84024`. In the editor, on each amount text, click the expression → `:formatted as` → number with a thousands separator. They're on the `AuthorRoyaltyView` reusable and the admin page.

**The recording (3–5 min)**
- [ ] Do Parts 1–3 first, then follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md). You need to show the author portal, the admin portal, a trigger, and the n8n execution running.
- [ ] Upload it to Loom (or Drive with "anyone with the link can view") and test the link in a private window.

**Access**
- [ ] **Bubble collaborator:** when BookLeaf sends their email address, go to Settings → Collaboration → **Invite** (not Transfer).
- [ ] **n8n view access.** The brief asks for it if you use n8n Cloud. In n8n, go to **Settings → Users → Invite** with their email. If your plan can't invite, say so in the submission email and point to the export file and the recording.
- [ ] **n8n trial end date.** Check it under Settings → Usage/Plan. The trial lasts about 14 days from 30 Oct, so it ends around 13 Nov. If it lapses, the webhook stops and every send in Bubble shows *Failed*. Keep it running until they've finished reviewing.
- [ ] **AWS:** make sure the Bedrock IAM key stays active, and keep an eye on billing. Each email costs a fraction of a cent.

**Final checks (in a private browser window)**
- [ ] Log in as **Priya** → only her books. Log in as **admin** → all 10 authors. The passwords in the README work.
- [ ] As admin, send one author → **Success**, and the email arrives.
- [ ] `npm test` → pass 10.
- [ ] The export file is current. If you changed anything in n8n by hand (other than Parts 1–2), download the workflow (⋯ → **Download**) over `n8n/bookleaf_royalty_summary.workflow.json`. Then search the file for your Gmail app password and the webhook key: neither should be there. Credentials are never exported, only their names.

**The submission email to BookLeaf** should contain:
- the Bubble link: `https://pranavkr1503.bubbleapps.io/version-test/index`, plus the admin and author logins from the README
- a note that the Free plan has no Live deploy, so the link is the development version
- the GitHub repo link (or the zip)
- the Loom link
- n8n workspace access (or a note why not)
- one line saying you'll add their email as a Bubble collaborator once they send it (or that you've done it)

---

## 5. Push to GitHub

**Make the repo private** and add BookLeaf as a collaborator on it (GitHub → repo → Settings → Collaborators). The README contains working admin logins for an app that calls a paid AI API and sends emails. In a public repo, anyone could log in and spend your AWS credit or fill your inbox. The sample data and the brief are BookLeaf's material too.

The `.gitignore` already excludes:

| Ignored | Why |
|---|---|
| `node_modules/` | Installed packages. `npm install` recreates them. |
| `n8n/test/.build/` | Generated test workflow plus **fake** test credentials |
| `n8n/test/.out/` | Emails written by `npm run try-webhook` |
| `.env`, `.env.*` | In case you ever put real keys in one |
| `*.zip`, `*.log`, editor/OS files | Clutter |

First push:

```bash
cd ~/Desktop/bookleaf2
git init
git add .
git status                     # read the list: nothing from node_modules, .build, .out or any .env
git grep -n -I -E "AKIA[0-9A-Z]{16}|app password|BEGIN PRIVATE KEY" -- . || echo "no secrets found"
git commit -m "BookLeaf Assignment 2: Bubble royalty dashboard + n8n AI summary workflow"
git branch -M main
git remote add origin https://github.com/<your-username>/bookleaf-royalty-dashboard.git
git push -u origin main
```

Create the empty **private** repo on github.com first (with no README, so the first push doesn't conflict).

The AWS-looking values in `n8n/test/mock_services.mjs` and `run_e2e.sh` (`AKIDEXAMPLE`, `wJalrXUtnFEMI/…EXAMPLEKEY`) are AWS's public documentation example keys, used by the fake Bedrock in the tests. They are safe to commit.
