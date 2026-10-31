# 03 – Workflows and states

Open **Workflow** (or click an element and choose *Start/Edit workflow*). A workflow is **an event followed by actions that run in order**.

## Events used in this app

| Event | Where | What it does |
|---|---|---|
| Page is loaded | every page | Redirect guards. On `admin`, also recompute statuses. |
| An element is clicked | buttons | Log in, sign up, send, bulk, view, log out |
| Do every 6 seconds | `admin` | Bulk queue: send to the next author while the queue isn't empty |
| An element has an error running a workflow | `index` | Shows a friendly login/sign-up error |

Any event or action can have **Only when**, a condition. Example: the bulk timer runs *only when admin's queue:count > 0 and Current User's role is Admin*.

## Actions and "Result of step N"

Actions run top to bottom. A later action can use an earlier one's output: **Result of step 2** is the NotificationLog that step 2 created. The send workflow uses this everywhere:

1. Set state `is_sending` = yes
2. **Create a new NotificationLog** (author, status Processing, …)
3. **BookLeaf n8n – Trigger Royalty Summary**, with `log_id` = *Result of step 2's unique id*
4. **Make changes to** *Result of step 2*: subject, body, execution ID… *only when step 3 didn't return an error*
5–7. Set status to Success, Failed or Skipped, depending on *Result of step 3's body status*
8. **Make changes to** *Result of step 2*: Failed, "Could not reach n8n (HTTP …)", *only when step 3 returned an error*
9. Set state `is_sending` = no

Bubble has no if/else. You branch by giving several actions mutually exclusive *Only when* conditions, as steps 4–8 do.

## Custom states: memory for a page

A **custom state** is a variable stored on an element or page, which lives only in this browser tab until reload. Select the page and look under *Custom states* in its properties.

| State | Page | Used for |
|---|---|---|
| `is_sending` (yes/no) | `admin_author` | Locks the button instantly, before any server call |
| `queue` (list of Authors) | `admin` | The authors still to send in a bulk run |
| `batch_id` (text) | `admin` | `BULK-20261030-183546`, shared by every row of one bulk run |
| `login_error`, `signup_error` | `index` | Messages shown under the forms |

Actions: **Set state** to change it, and *admin's queue* in an expression to read it. The bulk timer pops an author with *Set state queue = admin's queue :minus item Result of step 1's author*.

## Login and sign-up

On `index`:

- **Log in:** the *Log the user in* action, then *Go to page admin* if the role is Admin, otherwise *Go to page dashboard*.
- **Sign up:**
  1. *Sign the user up* (email + password). The email is also stored in `login_email`.
  2. *Make changes to current user*: role = Admin, **only when** StaffEmail contains the email.
  3. *Make changes to current user*: role = Author, author = *Search for Authors (email = login_email):first item*, **only when** that search finds one. This is the account "claim".
  4. *Make changes to Author*: user = Current User, linking the profile back.
  5. Go to the right page, or if the role is still empty: show "This email is not registered with BookLeaf" and **log out**.

Step 3's search only works because of the Author privacy rule `email is Current User's login_email` (lesson 01).

## Debugging

Open a preview with `?debug_mode=true` (the editor's Preview does this). The bar at the bottom offers **Step-by-step**: click a button and watch each action run, with *Inspect* showing any element's data. **Logs** (left sidebar, the chart icon) shows server-side runs, including errors such as the Free plan's "workflow limit".

## Check yourself

1. Why set `is_sending` *before* creating the log, rather than after?
2. The bulk timer fires every 6 s but a call takes about 5 s. Could two ticks send to the same author?
3. Why is there no "else" step for when the role is empty, other than the error message?

Answers: 1) Setting a state is instant and local; creating a record takes a server round-trip, and a second click could land in that gap. 2) No. The author is removed from the queue right after their log row is created, well before the next tick. n8n's duplicate guard would also mark a repeat *Skipped*. 3) The error-message and log-out actions *are* the else branch: they carry the opposite *Only when*.
