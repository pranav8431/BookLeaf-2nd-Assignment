# Learning n8n with this workflow

n8n is a workflow automation tool. You connect **nodes** on a canvas: a trigger starts the run, and each node does one job and hands its output to the next. This folder teaches it through the workflow *BookLeaf - Royalty Summary Email*.

| Lesson | You'll understand |
|---|---|
| [01 – Workflows, nodes and items](01-workflows-nodes-items.md) | The canvas, how data flows, expressions, executions |
| [02 – Webhook, security and replies](02-webhook-security.md) | Webhook trigger, header auth, Respond to Webhook, credentials |
| [03 – Code nodes and branching](03-code-nodes-and-branching.md) | Code nodes, IF nodes, Config, how the tested code gets in |
| [04 – Calling Claude on Bedrock](04-calling-claude-on-bedrock.md) | HTTP Request node, AWS signing, the prompt, checking the output |
| [05 – Errors, retries and duplicates](05-errors-retries-duplicates.md) | Retries, error outputs, static data, timeouts |
| [Exercises](exercises.md) | Hands-on, on a copy of the workflow |

**Open it:** https://pranav-bookleaf.app.n8n.cloud → *Overview* → *BookLeaf - Royalty Summary Email*. The **Executions** tab shows every past run; click one to see what each node received and sent.

**Official material:**

- n8n docs: https://docs.n8n.io
- Level 1 and Level 2 courses: https://docs.n8n.io/courses/ (about 2 hours each; Level 1 covers this folder's lessons 01–03)

**Safety:** this workflow is published and Bubble calls it. Don't experiment on it directly. Use **⋯ → Duplicate** and work on the copy (exercises.md shows how). If you do change the original, n8n keeps it as a draft until you click **Publish**, and *Workflow history* can restore any older version.
