# 05 – Errors, retries and duplicates

## Retries

Open *Claude on Bedrock: Write Email* → **Settings**:

- **Retry On Fail:** on, **Max Tries 3**, **Wait 3000 ms**. A brief AWS hiccup or throttle is retried automatically.
- **On Error: Continue (using error output).** After the third failure the node doesn't crash the workflow. The item leaves through a second, red output, wired to *Failure Result*, which writes "AI API call failed after 3 attempts: <AWS's message>".

The SMTP node (2 tries) and the Bubble callback (3 tries) use the same pattern. A failed email still logs *Success* with `email_status: Failed`, because the summary itself was produced.

Without an error output, a failing node stops the run, *Respond to Bubble* is never reached, and Bubble only sees a 500. Wiring every risky node's error output means the admin always gets a specific reason.

## Every outcome the admin can see

| Problem | Caught by | Bubble log shows |
|---|---|---|
| Wrong or missing key | Webhook header auth | Failed: Could not reach n8n (HTTP 403) |
| Bad or inconsistent data | Validate Payload | Failed: Invalid request from Bubble: … |
| Clicked again within 2 min | Duplicate Guard | Skipped: Duplicate trigger ignored … |
| AWS down, throttled, bad keys | Claude node error output | Failed: AI API call failed after 3 attempts … |
| Bad or invented content | Check AI Output | Failed: AI email rejected by checks: … |
| SMTP fails | SMTP error output | Success, with email: Failed and the reason |
| n8n unreachable or crashed | Bubble's API Connector error | Failed: Could not reach n8n (HTTP …) |
| No answer at all | Bubble conditional | after 3 min the row shows "No response" |

## The duplicate guard and static data

n8n workflows normally forget everything between runs. **Workflow static data** is the exception: a small object saved with the workflow, read with `$getWorkflowStaticData('global')`.

*Duplicate Guard* runs `checkAndLock()` from `lib.js`:

1. Look up this author's ID in static data.
2. If it was triggered less than 120 s ago, the run is a duplicate. Answer *Skipped*, and don't call Claude. The reason says which case it was: another click ("already triggered 13s ago (log …)"), or the same request arriving twice ("Same request received twice (retry)").
3. Otherwise record `{author → time, log_id}` and continue.

*Finalize Result* calls `releaseLock()` when a run **fails**, so the admin can retry at once instead of waiting 2 minutes.

**Static data quirks:**

- It's saved only at the end of a **production** execution, so manual test runs don't change it.
- Two requests in the same second could both pass. Bubble's button lock and its "Processing row exists" check cover that.
- A shared store such as Redis would close the gap fully.

## Timeouts

- **Bedrock call:** 45 s per try.
- **Whole workflow:** 150 s (*Workflow settings → Timeout*).
- **Bubble:** treats a row still *Processing* after 3 minutes as "No response" and unlocks the button.

## Check yourself

1. AWS throttles the first two tries and the third succeeds. What does the admin see?
2. Why release the duplicate lock on failure but not on success?
3. Run #22 failed in *Check AI Output*. Could Diya be retried immediately?

Answers: 1) A normal *Success*, about 6 s slower. The retries appear only in the n8n execution. 2) A success means the author got their summary, so a repeat within 2 minutes really is a duplicate. A failure means they got nothing, so blocking a retry would only hurt. 3) Yes: *Finalize Result* released the lock because the status was Failed. That's how run #23 went straight through.
