# n8n exercises

Do these on a **copy**, so Bubble's live workflow is never affected.

**Make the copy:** open the workflow → **⋯ → Duplicate** → name it `BookLeaf - PLAYGROUND`. In the copy, open *Bubble Webhook* and change **Path** to `bookleaf/playground`, so the two never share a URL. Don't publish the copy unless an exercise says so.

**Feed it test data:** open a past execution of the real workflow (for example #23), click *Bubble Webhook* → **Output** → *Copy to editor* (or "Pin data"). In the copy, pin that data on *Bubble Webhook*. Now *Execute workflow* replays that real request without Bubble.

## Look

1. **Follow a run.** In execution #23, click every green node and note one field it added. What does *Compute Royalty Facts* say the scenario is?
2. **Find the skip.** Open execution #13 (Kavita, *Skipped*). Which IF node sent it down the duplicate branch, and what did *Duplicate Guard* output?
3. **Read the prompt.** Open *Build AI Request* → Output → `request.system`. Find the rule about not predicting payment dates.

## Change (in the copy)

4. **Turn on structured logging:** add a *No Operation* node after *Finalize Result*, named `Log`. Run it and look at its input.
5. **Force a failure:** in the copy's *Config*, set `ai_model` to `not-a-model`. Execute. Which branch handles it, and what message would Bubble show?
6. **Break the facts:** in the pinned webhook data, change one book's `royalty_pending` so earned − paid ≠ pending. Execute. Where does it stop?
7. **Invent a number:** in *Check AI Output* (copy only), add `email.body += ' Bonus: ₹99,999.';` just before `checkEmail` is called. Execute and read `problems`.

## Build

8. **A Slack/Discord alert on failure:** after *Finalize Result*, add an IF on `{{ $json.status === 'Failed' }}`. On true, add a *Discord* or *Slack* node (needs your own webhook credential) that posts the author's name and `error_message`.
9. **A daily digest:** a new small workflow. A *Schedule Trigger* (every day 9:00 Asia/Kolkata), then a *Code* node that returns one item, then an *Email* or *Slack* node saying "Royalty summaries are ready to send". This is how you'd remind ops to click the bulk button.
10. **Change the code properly:** in `n8n/src/lib.js`, make `checkEmail` also reject an email that mentions "guarantee". Add a test in `n8n/test/unit.test.mjs`, run `npm test` and `npm run build`, and paste the new *Check AI Output* code into the **copy**.

Delete the copy when you're done (⋯ → Archive/Delete), so it can't be confused with the real one.
