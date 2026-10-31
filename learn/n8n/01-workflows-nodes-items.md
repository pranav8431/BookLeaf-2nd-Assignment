# 01 – Workflows, nodes and items

## The canvas

Open the workflow. You'll see 23 working nodes, plus sticky notes that label four sections: *Guards*, *Facts and AI*, *Delivery* and *Report*. Read it left to right:

```
Bubble Webhook → Config → Validate Payload → Payload Valid? → Duplicate Guard → Already Triggered?
  → Compute Royalty Facts → Build AI Request → Claude on Bedrock: Write Email → Check AI Output
  → Email Passes Checks? → Prepare Email → Send Email? → (Send Email (SMTP)) → Success Result
  → Finalize Result → Callback Enabled? → (Callback: Update Bubble Log) → Respond to Bubble
```

Side branches lead to *Invalid Payload Result*, *Duplicate Result* and *Failure Result*. Every branch ends at *Finalize Result*, so there is exactly one place where the reply is assembled.

## Items: what flows along the lines

Each node outputs a list of **items**. An item is a JSON object, under `json`. Most nodes run once per input item. Here there's always exactly one item: one request, for one author.

Click any node in a past execution to see three panels: **Input**, the node's **Parameters**, and **Output**. Switch the output view between *Table*, *JSON* and *Schema*. This is the main way to understand and debug n8n.

## Expressions: `{{ }}`

Any parameter can be fixed text or an **expression** (toggle *Expression* above the field). Expressions are JavaScript inside `{{ }}`:

| Expression | Means |
|---|---|
| `{{ $json.author.name }}` | a field of the item coming into this node |
| `{{ $('Config').first().json.ai_model }}` | a field from an earlier node, by name |
| `{{ $execution.id }}` | this run's ID (sent back to Bubble as `n8n_execution_id`) |
| `{{ $now }}` | the current time (Luxon DateTime) |

The Claude node's URL is an expression:
`{{ $('Config').first().json.bedrock_endpoint }}/model/{{ encodeURIComponent($('Config').first().json.ai_model) }}/invoke`.
Change the model in *Config* and this URL follows.

## Executions

Every run is saved as an **execution**: production runs (triggered by Bubble) and manual ones (the *Execute workflow* button). Open one to see the path it took. Green nodes ran; grey nodes didn't. On a branch you can see which side was taken.

Try it: open the executions list and find run **#22** (Diya, *Failed*) and **#23** (Diya, *Success*). In #22, open *Check AI Output*: `problems` says the book title wasn't mentioned, even though it was (the apostrophe bug). In #23 the same node shows `ok: true`.

## Draft and published

Editing creates a **draft**. Bubble keeps calling the **published** version until you click *Publish*. *Workflow history* (clock icon) lists every version with its note, for example "Title check ignores quote/dash style".

## Check yourself

1. Where would you look to see the exact JSON Bubble sent for Kavita's last summary?
2. What does `$('Config').first().json.email_mode` return right now?
3. You changed a node, but Bubble's runs still behave the old way. Why?

Answers: 1) Executions → that run → *Bubble Webhook* → Output → `body`. 2) `"off"`. 3) The change is still a draft; click Publish.
