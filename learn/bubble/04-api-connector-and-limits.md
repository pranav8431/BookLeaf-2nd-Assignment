# 04 – Talking to other systems, and the Free plan

## The API Connector

Open **Plugins → API Connector**. It describes outside APIs so workflows can call them as actions.

This app has one collection, **BookLeaf n8n**, with one call, **Trigger Royalty Summary**:

| Setting | Value | Why |
|---|---|---|
| Use as | Action | So a workflow step can run it |
| Method / URL | POST to the n8n production webhook | |
| Shared header | `X-BookLeaf-Key`, marked **Private** | Private values never go to the browser |
| Body | JSON with `<log_id>`, `<author_name>`, `<books_json>` and other parameters | Each `<param>` becomes a field you fill in the action |
| Include errors in response | ticked | A failed call returns an error you can branch on, instead of stopping the workflow |

**Initialize call** sends a real request with sample values so Bubble learns the response shape (`status`, `email_subject`, …). After that, *Result of step N's status* is available in expressions. You must re-initialize if n8n's response fields change.

**Building JSON in Bubble.** Parameters are pasted into the body as raw text, so a name like `O'Brien "Bob"` could break the JSON. Every text value uses `:formatted as JSON-safe`, which adds the quotes and escapes. The book list is `Search for Books :format as text`, with one JSON object per book and `,` as the delimiter. The body wraps it in `[ ]`.

Even when an API Connector action runs from a page workflow, Bubble's server makes the request. That's why the private key stays secret.

## Backend workflows

**Backend workflows** (left sidebar, the `{ }` icon) run on Bubble's server with no browser involved. They're started by *Schedule API workflow* (one thing) or *Schedule API workflow on a list* (many things, spaced apart).

This app has two, `send_royalty_summary` and `recompute_statuses`. Both work, but nothing uses them now. Two lessons from building them:

- **Parameters are read with "API Event Parameter"**, shown in the editor as just the parameter's name (for example `author`). An early version used the wrong data source, every value arrived empty, and n8n answered "author.name is required".
- **The Free plan caps them.** After a handful of runs Bubble refused the rest with *"This app reached a workflow limit available on the Free plan."* That error kills the workflow before any error step can run, so the log rows stayed on *Processing* forever.

So sending moved into page workflows, which aren't capped. On a paid plan the bulk send should move back to the server, so the admin can close the tab.

## What the Free plan allows

| Feature | Free | Used here |
|---|---|---|
| Pages, workflows, privacy rules, API Connector | yes | yes |
| Backend workflows | limited runs | built, unused |
| Data API / Workflow API (outside systems calling Bubble) | no | n8n's callback is built but switched off |
| Deploy to Live | no | reviewers use `version-test` |
| Collaborators | test only | ask BookLeaf if invite fails |
| Records | 200 | about 60 used |

## Check yourself

1. Why does n8n return the result in the webhook response instead of writing to Bubble itself?
2. You add a field `royalty_rate` to the n8n response. What must you do in Bubble before you can save it?
3. The admin sees *Failed: Could not reach n8n (HTTP 403)*. What do you check first?

Answers: 1) On the Free plan nothing outside can write to Bubble (no Data API). The response is the only way back. 2) Re-initialize the call in the API Connector so Bubble learns the new field. Then add a field to NotificationLog and set it in the "Make changes" step. 3) The `X-BookLeaf-Key` value in the API Connector matches the n8n credential.
