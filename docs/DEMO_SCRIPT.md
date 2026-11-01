# Demo recording script (about 4½ minutes)

The brief asks for 3–5 minutes showing the author portal, the admin portal, a royalty summary being triggered, and the n8n workflow running. This script covers all four, in that order, with the exact words to say.

Each scene has **Do** (what to click) and **Say** (what to speak). Say it in your own rhythm. You don't need to read it word for word, but keep to the points.

---

## Before you record (10 minutes)

**Do these first, in this order:**

1. Finish Part 2 of [BEFORE_SUBMISSION.md](BEFORE_SUBMISSION.md): SMTP in `redirect` mode, **published** in n8n. (The Kavita fix is already live.)
2. As admin, open **Farhan Sheikh** → **Generate & Send Royalty Summary** once. This puts an "all paid" email in the log, which you'll point to near the end.
3. Then **wait at least 2 minutes** before recording, so Kavita isn't blocked by the duplicate guard when you send her live.

**Open these tabs in this order** (in one browser window, logged out of the app):

| Tab | What | Where |
|---|---|---|
| 1 | The app's login page | https://pranavkr1503.bubbleapps.io/version-test/index |
| 2 | Bubble editor, **Data → Data types** | bubble.io → your app |
| 3 | n8n, the workflow canvas | n8n → BookLeaf – Royalty Summary Email |
| 4 | Gmail, searched for `BookLeaf royalty` | so only these emails are visible |

**Screen hygiene:**

- Browser zoom at 110–125% so text is readable in the video. Hide the bookmarks bar. Close unrelated tabs.
- **Never open these on screen:** n8n *Credentials*, the API Connector's key field in Bubble, or any AWS page. They hold secrets.
- Turn on Do Not Disturb, so no notifications pop up.
- Record at 1080p (Loom, OBS, or the Ubuntu screen recorder: Ctrl+Alt+Shift+R).

**Logins** (all use the password from the README): `priya.sharma@email.com` and `admin@bookleaf.test`.

---

## Scene 1: Introduction (0:00–0:15)

**Do:** tab 1, the login page.

**Say:**
> "Hi, I'm Pranav. This is my BookLeaf Author Royalty Dashboard. Bubble is the app, n8n is the automation, and Claude on AWS Bedrock writes the royalty emails. I'll show the database, the author portal, the admin portal, and then a summary going through n8n end to end."

---

## Scene 2: Database and privacy (0:15–0:50)

**Do:** tab 2, the Bubble editor, **Data → Data types**. Click **Author**, then **Book**, then **RoyaltyPayout**.

**Say:**
> "The data is relational. An Author has Books, and a Book has RoyaltyPayouts. The link always lives on the child, like a foreign key, so there's nothing to keep in sync. Statuses and platforms are option sets, so there are no free-text typos. The book's royalty status is stored because the admin page filters on it, and Bubble can only filter on stored fields."

**Do:** click **Privacy**, then open the **Book** rules.

**Say:**
> "Privacy is enforced on Bubble's server. Every type defaults to nothing visible. Admins see everything, and an author only sees books whose author is their own author record. I'll prove that next."

---

## Scene 3: Author portal (0:50–1:35)

**Do:** tab 1. Log in as **priya.sharma@email.com**.

**Say:**
> "I'm logged in as Priya, an author. At the top are her totals across all books: ₹19,908 earned, ₹16,338 paid, ₹3,570 pending."

**Do:** move the mouse over the first book card.

**Say:**
> "Each book shows the ISBN, genre, status, publication date, MRP and the platforms it's on. Then copies sold, royalty earned, paid, pending, and the last payout date. The badge is the payout status. Green means fully paid, yellow means pending but inside the normal 90-day cycle, and red means overdue. *Whispers of the Ganges* is red because its last payout was more than 90 days ago. *The Saffron Diaries* is green because it's fully paid."

**Do:** scroll to **Payout history**.

**Say:**
> "And here's her payout history."

**Do:** in the address bar, replace `dashboard` with `admin` and press Enter. It bounces back to the dashboard.

**Say:**
> "If Priya tries to open the admin page, she's sent straight back. That redirect is only a convenience. The real protection is the privacy rules, so even the data request itself would only return her own records."

**Do:** **Log out**.

---

## Scene 4: Admin portal (1:35–2:15)

**Do:** log in as **admin@bookleaf.test**.

**Say:**
> "Now as an admin from the BookLeaf ops team. At the top are totals across every author, and below is every author with their book count, total earned, total pending and payout status."

**Do:** set the **payout status** dropdown to **Paid**.

**Say:**
> "I can filter by payout status. Farhan is the only author who's fully paid."

**Do:** clear it. Pick a **city**. Clear it. Type `Rohit` in the name search.

**Say:**
> "Or filter by city, or search by name. These are live searches, so the list updates as I type."

**Do:** clear the search box.

---

## Scene 5: Trigger a summary (2:15–2:55)

**Do:** click **View** on **Kavita Deshmukh**.

**Say:**
> "This is the author detail page: the same view Kavita sees, but for an admin. Her case is an interesting one. She has ₹850 pending, which is under BookLeaf's ₹1,000 minimum payout, and she has a second book still in production."

**Do:** click **Generate & Send Royalty Summary**. Keep the mouse still while it runs.

**Say (while it runs):**
> "The button locks straight away, so a double click can't start two runs. Bubble creates a log row marked Processing and calls the n8n webhook with Kavita's data and a secret key in the header."

**Do:** when it turns **Success** (about 5 seconds), scroll to the email in the log.

**Say:**
> "It's back as Success, and here's the email Claude wrote. It greets her by name and lists each book with its sales and royalty figures, and the totals. It explains the ₹1,000 minimum as policy, not a delay. And it gives a production update on *Raising Roots*: Typesetting, stage 4 of 9."

---

## Scene 6: The n8n workflow (2:55–3:35)

**Do:** tab 3, n8n. Show the whole canvas first, then click **Executions** and open the newest one.

**Say:**
> "Here's that same run in n8n. The webhook only accepts requests with the correct key. Anything else gets a 403 before any node runs. Then the payload is validated, a duplicate guard checks whether this author was triggered in the last two minutes, and *Compute Royalty Facts* works out every number, status and payout date in code."

**Do:** click the **Compute Royalty Facts** node and show `scenario: below_threshold` in its output.

**Say:**
> "This is the main design decision. Code owns the facts, and the model only writes the words. Code picked the scenario, below threshold. Claude on Bedrock then writes the email, and *Check AI Output* rejects it if any rupee amount isn't in the facts, or a book or total is missing. So a wrong number can never reach an author. Finally, the result goes back to Bubble, which updates the log."

---

## Scene 7: Duplicate click and email delivery (3:35–4:05)

**Do:** tab 1. Click **Generate & Send** for Kavita again.

**Say:**
> "If I click again within two minutes…"

**Do:** wait for the row to show **Skipped**.

**Say:**
> "…it's marked Skipped: 'already triggered a few seconds ago'. n8n caught the duplicate, and Claude wasn't called again."

**Do:** tab 4, Gmail. Open the newest *[Test – for kavita.deshmukh@email.com]* email.

**Say:**
> "Email sending is on in redirect mode. The sample authors' addresses are on a real domain, so for this demo every email comes to my inbox instead, with the intended recipient in the subject."

*(If you left `email_mode = off`, skip this Gmail step and say: "Sending is off for the demo, so the email is logged in Bubble instead.")*

---

## Scene 8: Bulk, errors and wrap-up (4:05–4:40)

**Do:** tab 1. Click **All authors** → **Send summaries to 9 authors**.

**Say:**
> "The bulk button sends to every author with a pending balance. That's nine, because Farhan is fully paid. It calls the same webhook once per author, one every six seconds, so the AI API isn't flooded."

**Do:** scroll down to the **Notification log** while rows appear. Point to the **Failed** row for Diya and its reason, then to Farhan's **Success** row.

**Say:**
> "Failures are logged with a reason, never left spinning. This failed run was a real catch: the check rejected Diya's email over a mismatched apostrophe in her book title, I fixed the check, and the re-run passed. If n8n doesn't answer at all, the row turns to 'No response' after three minutes and the button unlocks. And here's Farhan's email, sent earlier: because he's fully paid, it's a thank-you, with no payout date."

**Say (closing):**
> "Everything is in the README: the schema and the reasoning behind it, how Bubble and n8n talk to each other, the prompt strategy, error handling, and what I learned along the way. Thanks for watching."

**Do:** stop recording. Don't wait for the bulk run to finish on camera.

---

## After recording

- Watch it once. Check that every number is readable and no secret is visible.
- If it's over 5 minutes, cut Scene 7's Gmail part or shorten Scene 4. Those are the safest to trim.
- Upload to Loom, or Drive with "anyone with the link can view". Open the link in a private window to check it plays.
- Put the link in the README's deliverables table and in your submission email.

## If something goes wrong while recording

| Problem | What to do |
|---|---|
| Kavita comes back **Skipped** on the first click | You sent her less than 2 minutes earlier. Say "that's the duplicate guard", wait 2 minutes, and re-record from Scene 5. |
| A row shows **Failed** | Read the reason out. It's a genuine demo of error handling. Then check the n8n execution afterwards. |
| The row stays on **Processing** | Check that the n8n workflow is still **published** and the trial hasn't expired, then re-record. |
| A typo or stumble | Keep going. A natural recording is fine; it doesn't need to be perfect. |
