# Screen recording plan (about 4 minutes)

App: https://pranavkr1503.bubbleapps.io/version-test/index. Logins are in the README; all three use the same password.

**Before recording:**

- Leave n8n `email_mode = off`. The full AI email appears in the author's notification log in Bubble, so nothing needs to reach an inbox.
- Open three tabs: the Bubble app, the Bubble editor (*Data* tab), and n8n *Executions* for the workflow.
- Don't send to Kavita in the 2 minutes before you start. The duplicate guard would mark that send *Skipped* too early.

| Time | Show | Say (briefly) |
|---|---|---|
| 0:00 | Bubble editor *Data* tab: types, then *Privacy* | Author → Book → Payout, with the link on the child. Statuses are stored so the admin page can filter on them. Every type hides everything by default; authors only reach rows linked to their own Author. |
| 0:35 | Log in as Priya | Her two books and their badges, totals ₹19,908 / ₹16,338 / ₹3,570, payout history |
| 1:00 | Type `/admin` in the address bar as Priya | Sent back to her dashboard. The redirect is just convenience; the privacy rules are what protect the data, on Bubble's server. |
| 1:15 | Log out, log in as admin | KPIs. Filter by status *Paid*: Farhan is the only fully paid author. Then filter by city and search by name. |
| 1:45 | Open Kavita → **Generate & Send Royalty Summary** | Button shows "Sending…", log row goes *Processing* → *Success* in about 5 s, and the full email appears underneath |
| 2:05 | Read the email | ₹1,000 minimum explained as policy, not a delay. *Raising Roots* is at Typesetting, stage 4 of 9. The figures match the band above. |
| 2:25 | n8n execution for that run | Validate → Duplicate guard → Compute facts → Claude on Bedrock → Check → Respond. Open *Compute Royalty Facts* to show the scenario `below_threshold`: code decides the facts and Claude only writes the words. |
| 2:55 | Back in Bubble, click Generate again | *Skipped*: "already triggered … ago". No second Claude call in n8n. |
| 3:10 | All authors → **Send summaries to 9 authors** | "Sending… N left". A row appears every 6 seconds. Kavita comes back *Skipped* if her single send was under 2 minutes ago, which is the guard working across single and bulk. |
| 3:45 | Explain one failure | Point to a *Failed* row and its reason. Or set a wrong key in the API Connector, send once, show *Failed: HTTP 403*, then put the key back. |

If you show the wrong-key failure, restore the real key afterwards. Plugins → API Connector → the `X-BookLeaf-Key` value is the one in your n8n credential.
