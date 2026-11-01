# Bubble build guide

This is the exact build of the Bubble half of the system, in the order to do it. It assumes the n8n workflow is already imported and active (README → *Setting up n8n*), because the API Connector call can only be initialized against a live webhook.

Conventions: `Search for Books (author = X)` means a *Do a search for* with that constraint. "Ignore empty constraints" is ticked on every search that uses filter inputs. Field names are `snake_case` on purpose: the Bubble Data API uses field names as JSON keys, so the n8n callback can write `email_subject` without a mapping table.

> **Free plan.** Everything below works on Bubble's Free plan: privacy rules, the API Connector, custom events, reusable elements and "Do every X seconds". It does **not** depend on backend workflows or the Data API, because Bubble's pricing comparison lists "Bubble app API" as unavailable on Free. Step 9 shows the optional extra wiring if your plan has the Data API.

## How the deployed app differs from this guide

Testing the app at `pranavkr1503.bubbleapps.io/version-test` changed a few things. The data model, option sets, statuses, the n8n payload and the log fields are as written below. These parts differ:

| Area | This guide | Deployed app, and why |
|---|---|---|
| Privacy rules (§3) | `This Book's author's user is Current User` | Bubble only accepts single-hop conditions: `This Book's author is Current User's author` (and Current User's author is not empty). The same applies to RoyaltyPayout. Author has two rules: `This Author's user is Current User`, and `This Author's email is Current User's login_email`, so sign-up can find the record to link. Bubble won't use the built-in `email` field in a rule, so sign-up copies it into `User.login_email`. |
| Data import (§4) | CSV upload, then a `setup` page links records | Records were created directly, parents first, with children linked by the IDs Bubble returned. There is no `setup` page. The CSVs remain the manual route. |
| Dates | Imported as dates | Stored at 12:00 IST so the calendar day is right in every browser timezone. Log timestamps are formatted in Asia/Kolkata and labelled "IST". |
| Pages (§8) | `index`, `login`, `signup`, `dashboard`, `admin`, `admin_author`, `setup` | `index` holds both login and sign-up. Then `dashboard`, `admin` and `admin_author`. |
| StatusEngine (§6) | Reusable element | The same rule, as actions on the `admin` page's *Page is loaded* event, run for admins only. A backend copy, `recompute_statuses`, is in the app for a paid plan. |
| SummarySender (§9b) | Reusable custom event shared by both buttons | The same three steps (create log, call n8n, write the result) run in the `admin_author` button workflow and in the `admin` page's bulk timer. |
| Bulk (§9d) | "Do every 3 seconds" | "Do every 6 seconds". The button shows "Sending… N left. Keep this page open". |
| Backend workflows | Not used | `send_royalty_summary` and `recompute_statuses` exist and work, but nothing calls them. The Free plan refused them after a few runs ("This app reached a workflow limit available on the Free plan"), so sending runs in page workflows. Switch to them on a paid plan. |

---

## 1. Option sets (Data → Option sets)

Option sets hold fixed vocabularies. They are cheap to read, need no privacy rules, and can carry attributes such as badge colours, which keeps conditionals out of the UI.

| Option set | Options (Display) | Attributes |
|---|---|---|
| `Role` | Admin, Author | – |
| `RoyaltyStatus` | Paid, Pending, Overdue, Not Applicable | `label` (text): "Paid up", "Pending – in cycle", "Overdue", "Not yet published"; `color` (text): `#1F9D55`, `#B7791F`, `#C53030`, `#718096`; `rank` (number): 3, 2, 1, 4 |
| `NotificationStatus` | Processing, Success, Failed, Skipped | `color` (text): `#2B6CB0`, `#1F9D55`, `#C53030`, `#718096` |
| `TriggerType` | Single, Bulk | – |
| `Platform` | Amazon India, Flipkart, Amazon US, Amazon UK, BookLeaf Store | – |
| `PrintPartner` | In-House, Repro India, Epitome Books | – |
| `ProductionStage` | Manuscript Received, Editing, Cover Design, Typesetting, Proofreading, ISBN Assignment, Printing, Distribution Setup, Published & Live | `step` (number): 1 … 9 |
| `StaffEmail` | the email address(es) allowed to become admins, e.g. `ops.admin@bookleaf.test` | – |

`StaffEmail` is the admin allowlist. Option sets can only be changed in the editor, so nobody can make themselves an admin from the running app.

## 2. Data types and fields (Data → Data types)

```
User (built-in)
  role            Role
  author          Author                 the author profile this login belongs to (empty for admins)

Author
  author_code     text                   "AUTH001", the ID from the source data
  name            text
  email           text
  phone           text
  city            text
  joined_date     date
  user            User                   back-link used by privacy rules
  payout_status   RoyaltyStatus          worst status across the author's books (stored so admins can filter on it)

Book
  book_code       text                   "BK001"
  author          Author                 the relationship: one Author has many Books
  author_code     text                   import helper, used once to set `author`
  title           text
  isbn            text
  genre           text
  status_label    text                   exactly as in the data, e.g. "In Production - Cover Design"
  production_stage ProductionStage
  is_published    yes / no
  publication_date date
  mrp             number
  royalty_per_copy number
  copies_sold     number
  total_royalty_earned number
  royalty_paid    number
  royalty_pending number
  last_payout_date date
  print_partner   PrintPartner
  available_on    list of Platform
  royalty_status  RoyaltyStatus          derived; recomputed by StatusEngine (step 6)

RoyaltyPayout
  payout_code     text
  book            Book
  author          Author                 denormalised so the privacy rule is one hop
  book_code       text                   import helper
  author_code     text                   import helper
  amount          number
  payout_date     date
  note            text

NotificationLog
  author          Author
  triggered_by    User
  trigger_type    TriggerType
  batch_id        text                   shared by every log of one bulk run
  status          NotificationStatus
  sent_to         text                   author email at the time of sending
  completed_at    date
  email_subject   text
  email_body      text
  email_status    text                   Sent / Not sent / Failed (SMTP is a bonus channel)
  email_detail    text
  error_message   text
  n8n_execution_id text                  links the log row to the n8n execution
```

Why this shape:

- **The relationship lives only on the child.** `Book.author` and `RoyaltyPayout.author` are the single source of truth; there is no `Author.books` list to keep in sync. "An author's books" is always `Search for Books (author = …)`, which privacy rules filter automatically.
- **Royalty figures stay as given.** The data has cumulative per-book totals, not transactions. I store them on `Book` as-is and check `earned − paid = pending` on import (generator) and again in n8n before emailing.
- **`RoyaltyPayout` exists although the data has no payout history.** The brief asks for a payout history, and real payouts are events. The import seeds one "opening balance" payout per book (amount = royalty paid to date, date = last payout date) and labels it as such. Future payouts become new rows, not edits.
- **Derived statuses are stored** (`royalty_status`, `payout_status`) because Bubble can only filter a search on stored fields. Step 6 owns the rule in one place.
- **`NotificationLog` is the integration's audit trail.** One row per attempt, never updated by more than its own run, carrying the n8n execution ID for cross-referencing.

## 3. Privacy rules (Data → Privacy)

For each type, delete the default "everyone" permissions so **Everyone else** has every box unticked, then add these rules. In each rule tick *View all fields* and *Find this in searches*, and leave *Allow auto-binding* off.

| Type | Rule name | Condition |
|---|---|---|
| Author | Admins | `Current User's role is Admin` |
| Author | Own profile | `This Author's user is Current User` |
| Book | Admins | `Current User's role is Admin` |
| Book | Own books | `This Book's author's user is Current User` |
| RoyaltyPayout | Admins | `Current User's role is Admin` |
| RoyaltyPayout | Own payouts | `This RoyaltyPayout's author's user is Current User` |
| NotificationLog | Admins | `Current User's role is Admin` |
| User | Admins | `Current User's role is Admin` |
| User | Self | `This User is Current User` |

Privacy rules are enforced on Bubble's server, so an author cannot read another author's data even with the browser console or a hand-crafted request. Page redirects (step 8) are only UX. Authors have no rule on NotificationLog, so they never see internal logs.

How to verify: App Data → All Books → **Run as** → pick Priya's user → only BK001 and BK002 are listed. Then log in as Priya in a private window and open `/admin`; you are sent back to `/dashboard`.

## 4. Import the data (Data → App data)

Run `npm run data` (or use the committed files) to get `data/bubble_import/`:

1. **All Authors → Upload → `1_authors.csv`.** Map every column to the field of the same name.
2. **All Books → Upload → `2_books.csv`.** Map every column except `author` (there is no such column; `author_code` goes to the `author_code` text field). `production_stage`, `print_partner` and `available_on` map to option-set fields by their Display text; `available_on` is a comma-separated list.
3. **All RoyaltyPayouts → Upload → `3_royalty_payouts.csv`.**

If the importer rejects the ISO dates, regenerate with `node scripts/generate_data.mjs --us-dates`. If it refuses the `available_on` list column, leave it unmapped and set the platforms on the 18 books by hand in App Data.

**Link the records.** Bubble's CSV import links related things by unique ID, which the source data doesn't have, so the CSVs carry `author_code` / `book_code` and a one-off page does the linking. Create a page `setup` with one button "Link imported records". Its workflow is guarded with *Only when Current User's role is Admin*:

1. Make changes to a list of things: `Search for Books (author is empty)` → `author = Search for Authors (author_code = This Book's author_code):first item`
2. Make changes to a list of things: `Search for RoyaltyPayouts (book is empty)` → `book = Search for Books (book_code = This RoyaltyPayout's book_code):first item`, `author = Search for Authors (author_code = This RoyaltyPayout's author_code):first item`
3. Trigger StatusEngine's `recompute` (step 6) with no author.

Run it once after creating the admin login (step 5). Check in App Data that every Book has an author: 18 books, 12 payouts.

Data goes into the **Development** database. If you deploy to Live, import into Live too: App data → switch to *Live* → repeat, or use *Copy and restore database*.

## 5. Sign-up, login and roles

There is no public sign-up. A login can only be created for an email that already exists as an Author (the author "claims" their account) or that is listed in `StaffEmail`.

**Page `signup`** has inputs Email and Password, and a button *Create account*.

- Event *Create account is clicked*, **Only when** `Search for Authors (email = Input Email's value:lowercase):count > 0` **or** `StaffEmail's all options:each item's Display contains Input Email's value:lowercase`:
  1. Sign the user up (email, password)
  2. Make changes to Current User: `role = Get option: Admin` **only when** StaffEmail contains the email; otherwise `role = Author`, `author = Search for Authors (email = Current User's email):first item`
  3. Make changes to `Current User's author` (only when it's not empty): `user = Current User`
  4. Go to page `dashboard` or `admin` by role
- A second event on the same button, **Only when** neither condition holds: show the alert "This email isn't registered with BookLeaf. Please use the email your books are published under."

**Page `login`:** Log the user in, then go to `admin` (when `Current User's role is Admin`) or `dashboard`.

**Create the test accounts:** sign up `priya.sharma@email.com` and your `StaffEmail` address with the passwords you will share. Optionally also sign up a second author, such as `rohit.kapoor@email.com`, for the data-isolation test.

## 6. Reusable element: StatusEngine (royalty status rule)

This is the single place the green/yellow/red rule lives in Bubble. It is an invisible reusable element containing one custom event, `recompute`, with an optional parameter `scope` of type Author: empty means all authors, set means that author only.

Let `cutoff` be `Current date/time +(days): -90`. Every search below adds `author = scope` (ignore empty constraints). The book rules are **mutually exclusive**, so the order of the actions doesn't matter:

| # | Make changes to a list of things | Set `royalty_status` |
|---|---|---|
| 1 | `Search for Books (is_published = no)` | Not Applicable |
| 2 | `Search for Books (is_published = yes, royalty_pending ≤ 0)` | Paid |
| 3 | `Search for Books (royalty_pending > 0, last_payout_date ≥ cutoff)` | Pending |
| 4 | `Search for Books (royalty_pending > 0, last_payout_date is empty, publication_date ≥ cutoff)` | Pending |
| 5 | `Search for Books (royalty_pending > 0, last_payout_date < cutoff)` | Overdue |
| 6 | `Search for Books (royalty_pending > 0, last_payout_date is empty, publication_date < cutoff)` | Overdue |

Author status is "worst book wins". Bubble has no if/else for a field value, so the author rules are ordered and each one overwrites the last. They use the raw book fields rather than `royalty_status`, so they don't depend on actions 1–6 having already been saved:

| # | Target | Set `payout_status` |
|---|---|---|
| 7 | `Search for Authors` (scope empty) **or** `scope` (scope set) | Not Applicable |
| 8 | `Search for Books (is_published = yes):each item's author` | Paid |
| 9 | `Search for Books (royalty_pending > 0):each item's author` | Pending |
| 10 | `Search for Books (royalty_pending > 0, last_payout_date < cutoff):each item's author` | Overdue |
| 11 | `Search for Books (royalty_pending > 0, last_payout_date is empty, publication_date < cutoff):each item's author` | Overdue |

StatusEngine is placed on `dashboard` (page load: `recompute(scope = Current User's author)`) and on `admin` (page load: `recompute()` for everyone). n8n applies the same rule independently (`royaltyStatus()` in `n8n/src/lib.js`) when it writes the email.

> With today's date, every book with a pending amount is red: the most recent payout in the data is 1 Dec 2025, more than 90 days ago. That is the rule working as specified. To demo yellow badges, temporarily change `cutoff` to `-400` days.

## 7. Reusable elements for the UI

**RoyaltyBadge** (type of content: `RoyaltyStatus`). A small group with background colour `Parent group's RoyaltyStatus's color` and the text `Parent group's RoyaltyStatus's label`, in white. The colours come from option-set attributes, so the badge needs no conditionals.

**AuthorRoyaltyView** (type of content: `Author`). This is what an author sees. The same element is placed on the author dashboard and on the admin detail page, so admins see exactly what the author sees.

- **Summary row:** four text tiles showing total earned, total paid, total pending and copies sold. For example `Search for Books (author = Parent group's Author):sum of total_royalty_earned`, formatted as a number with 0 decimals and prefixed with "₹". A fifth tile is a RoyaltyBadge on `Parent group's Author's payout_status`.
- **Threshold hint** (conditional: visible only when the total pending is > 0 and < 1000): "Your pending balance is below the ₹1,000 minimum payout and will roll over to next quarter."
- **Repeating group "My Books"** (type Book): `Search for Books (author = Parent group's Author)`, sorted by `publication_date` descending. Each cell shows:
  - title, ISBN, genre and `status_label`
  - publication date, or "Not yet published" (conditional on empty)
  - MRP, and platforms as `available_on:each item's Display:join with ", "`
  - copies sold, total earned, paid and pending
  - last payout date, or "No payout yet" (conditional on empty)
  - a RoyaltyBadge on `Current cell's Book's royalty_status`
- **Repeating group "Payout history"** (type RoyaltyPayout): `Search for RoyaltyPayouts (author = Parent group's Author)`, sorted by `payout_date` descending. Each row shows date, book's title, amount and note.

**SummarySender**: invisible, holds the integration (step 9).

## 8. Pages

| Page | Type of content | Contents | Page-load workflow |
|---|---|---|---|
| `index` | – | – | Go to `admin` if role is Admin, `dashboard` if logged in, else `login` |
| `login`, `signup` | – | step 5 | – |
| `dashboard` | – | header with author name + Log out, AuthorRoyaltyView (data source `Current User's author`), StatusEngine | logged out → `login`; role is Admin → `admin`; then `StatusEngine.recompute(scope = Current User's author)` |
| `admin` | – | KPIs, filters, author list, bulk button, notification log, StatusEngine, SummarySender, email popup | role is not Admin → `dashboard` (or `login` when logged out); then `StatusEngine.recompute()` |
| `admin_author` | Author | back link, AuthorRoyaltyView (data source `Current page Author`), send button, this author's logs, SummarySender | role is not Admin → `dashboard` |
| `setup` | – | step 4 button | role is not Admin → `login` |

### `admin`: author overview

- **Filters:**
  - search input `SearchName`
  - dropdown `FilterCity`, with dynamic choices `Search for Authors:each item's city:unique elements`
  - dropdown `FilterStatus`, with choices `All RoyaltyStatus` minus Not Applicable, labelled "Fully paid / Pending / Overdue"
- **Repeating group "Authors"** (type Author): `Search for Authors (name contains SearchName's value, city = FilterCity's value, payout_status = FilterStatus's value)`, with *ignore empty constraints* ticked and sorted by name. Each cell shows:
  - name, city and email
  - total books: `Search for Books (author = Current cell's Author):count`
  - total earned: `…:sum of total_royalty_earned`
  - total pending: `…:sum of royalty_pending`
  - a RoyaltyBadge on `payout_status`
  - a *View* button → go to page `admin_author`, sending `Current cell's Author`
- **KPI row:** authors, books, total earned, total paid, total pending, and the overdue authors count.

### `admin`: notification log

Repeating group (type NotificationLog): `Search for NotificationLogs`, sorted by Created Date descending, showing up to 50 rows. Each row shows:

- created date (`formatted as` Asia/Kolkata), author's name, trigger type and batch_id
- the status text, with background `status's color`
- `email_status`, `error_message` (truncated to 120 characters), and n8n_execution_id
- *View email* → shows a popup with `email_subject` and `email_body` (multiline text)

Conditional on the status text: **when** `status is Processing and Created Date < Current date/time +(minutes): -3`, the text is "No response – timed out" with background `#C53030`. This covers a lost browser tab or an n8n run that never answered. Bubble searches are live, so this table updates by itself as each run finishes.

## 9. Integration: API Connector + SummarySender

### 9a. API Connector (Plugins → Add plugins → API Connector)

*Add another API*, named `BookLeaf n8n`, with authentication *None or self-handled*.

- **Shared header:** `X-BookLeaf-Key` = the secret you put in n8n's "BookLeaf Webhook Key" credential (`openssl rand -hex 32`). Keep it **Private**. API Connector calls run from Bubble's server, so the key never reaches the browser.
- **Call `Trigger Royalty Summary`:**
  - Use as **Action**, data type **JSON**, method **POST**
  - URL `https://<your-n8n-host>/webhook/bookleaf/royalty-summary` (the *Production* URL, not `/webhook-test/`)
  - header `Content-Type: application/json`, body type **JSON**
  - Tick **"Include errors in response and allow workflow actions to continue"**. This is what lets the UI show a failure instead of Bubble's generic error popup.
  - Body:

```json
{
  "log_id": "<log_id>",
  "trigger_type": "<trigger_type>",
  "triggered_by": <triggered_by>,
  "author": {
    "id": "<author_id>",
    "author_code": <author_code>,
    "name": <author_name>,
    "email": <author_email>,
    "city": <author_city>
  },
  "books": [<books_json>]
}
```

  Untick *Private* on every parameter. The parameters without quotes in the body receive values already quoted by `:formatted as JSON-safe`. Paste the sample values from `data/bubble_import/api_connector_initialize_values.txt` and click **Initialize call**. Bubble learns the response fields: `status, log_id, completed_at, email_subject, email_body, email_status, email_detail, error_message, n8n_execution_id, ai_model, callback_status`.

  > Initializing really runs the workflow, which makes one AI call. Priya is then locked for 2 minutes by the duplicate guard, so a real trigger for her right after initializing returns *Skipped*. That is expected.

### 9b. SummarySender custom event `send_summary`

Parameters: `author` (Author), `trigger_type` (TriggerType), `batch_id` (text, optional).

1. **Create a new NotificationLog:**
   - `author` = author, `triggered_by` = Current User, `trigger_type` = trigger_type, `batch_id` = batch_id
   - `status` = Processing, `sent_to` = author's email
2. **Plugins → BookLeaf n8n – Trigger Royalty Summary** with these parameters:
   - `log_id` = `Result of step 1's unique id`
   - `trigger_type` = `trigger_type's Display:lowercase`
   - `triggered_by` = `Current User's email:formatted as JSON-safe`
   - `author_id` = `author's unique id`
   - `author_code`, `author_name`, `author_email`, `author_city` = the matching author field `:formatted as JSON-safe`
   - `books_json` = `Search for Books (author = author):format as text`, with delimiter `,` and this content for each item (one line in Bubble; wrapped here for reading):

     ```
     {"book_code":This Book's book_code:formatted as JSON-safe,
      "title":This Book's title:formatted as JSON-safe,
      "isbn":This Book's isbn:formatted as JSON-safe,
      "genre":This Book's genre:formatted as JSON-safe,
      "status":This Book's status_label:formatted as JSON-safe,
      "is_published":"This Book's is_published",
      "publication_date":"This Book's publication_date:formatted as <custom yyyy-mm-dd, time zone Asia/Kolkata>",
      "mrp":"This Book's mrp",
      "royalty_per_copy":"This Book's royalty_per_copy",
      "copies_sold":"This Book's copies_sold",
      "total_royalty_earned":"This Book's total_royalty_earned",
      "royalty_paid":"This Book's royalty_paid",
      "royalty_pending":"This Book's royalty_pending",
      "last_payout_date":"This Book's last_payout_date:formatted as <same custom format>",
      "available_on":This Book's available_on:each item's Display:join with ", ":formatted as JSON-safe}
     ```

     Numbers and dates are sent **inside quotes**, so an empty value (an in-production book has no MRP) produces `""` instead of invalid JSON. n8n parses them. In the date preview, check that the output looks like `2025-10-15`. n8n also accepts `10/15/2025`, ISO timestamps and Unix milliseconds, so any unambiguous format works.
3. **Make changes to `Result of step 1`**, *Only when* `Result of step 2's returned an error is no`:
   - `status` = `All NotificationStatus:filtered (Display = Result of step 2's status):first item`
   - `completed_at` = Current date/time
   - `email_subject`, `email_body`, `email_status`, `email_detail`, `error_message`, `n8n_execution_id` = the fields of the same name in Result of step 2
4. **Make changes to `Result of step 1`**, *Only when* `Result of step 2's returned an error is yes`:
   - `status` = Failed
   - `completed_at` = Current date/time
   - `error_message` = `"Could not reach n8n (HTTP " & Result of step 2's error's status code & "): " & Result of step 2's error's body:truncated to 400`

   This catches a wrong or missing key (403), n8n being down or unreachable, timeouts, and unexpected n8n crashes (500).

**Callback (optional, paid plans with the Data API):** Settings → API → enable the Data API and expose **only `NotificationLog`**. Generate an API token. In n8n, put it in the "Bubble API Token" credential as `Bearer <token>`, set `bubble_callback_enabled = true` and `bubble_api_base = https://<app>.bubbleapps.io/version-test/api/1.1` (drop `/version-test` for Live). n8n then also PATCHes the log row itself, so the log is correct even if the admin closed the tab before step 3 ran. Both writers set identical values, so the order they arrive in doesn't matter.

### 9c. Single trigger (`admin_author`)

- Add a button **Generate & Send Royalty Summary** and a page custom state `is_sending` (yes/no).
- Add a conditional to the button: **when** `is_sending is yes` **or** `Search for NotificationLogs (author = Current page Author, status = Processing, Created Date > Current date/time +(minutes): -3):count > 0`, it is *not clickable* and reads "Sending…".
- Workflow *Button is clicked*, **Only when** `Current User's role is Admin` **and** `is_sending is no`:
  1. Set state `is_sending = yes`. This is a client-side lock that applies instantly, so a fast double-click can't start a second run.
  2. Trigger `SummarySender.send_summary` (author = Current page Author, trigger_type = Single)
  3. Set state `is_sending = no`
- Below the button, a repeating group shows this author's NotificationLogs, newest first, with status and *View email*.

### 9d. Bulk trigger (`admin`)

Bubble's Free plan has no backend loop ("Schedule API workflow on a list"), so the bulk send is a client-side queue drained one author at a time. This also calls the webhook exactly once per eligible author and never floods the AI API.

- **Page custom states:** `bulk_queue` (list of Authors), `bulk_current` (Author), `bulk_in_flight` (yes/no), `bulk_total` and `bulk_done` (numbers), `bulk_batch` (text).
- **Button** "Send summaries to all authors with pending royalties (N)", where N = `Search for Books (royalty_pending > 0):each item's author:unique elements:count`. It is not clickable while `bulk_queue:count > 0`.
- **Click workflow** (Only when role is Admin and `bulk_queue:count is 0`): set `bulk_queue` = `Search for Books (royalty_pending > 0):each item's author:unique elements`, `bulk_total` = its count, `bulk_done` = 0, `bulk_batch` = `"BULK-" & Current date/time:extract UNIX`. The UNIX value is milliseconds since 1970, so it is unique per click.
- **Event "Do every 3 seconds"**, Only when `bulk_queue:count > 0` and `bulk_in_flight is no`:
  1. set `bulk_in_flight = yes`
  2. set `bulk_current = bulk_queue:first item`
  3. set `bulk_queue = bulk_queue minus item bulk_current`
  4. trigger `SummarySender.send_summary` (author = bulk_current, trigger_type = Bulk, batch_id = bulk_batch)
  5. set `bulk_done = bulk_done + 1`, then `bulk_in_flight = no`
- **Progress text** "Sending bulk_done of bulk_total…" is visible while `bulk_queue:count > 0 or bulk_in_flight is yes`.

The admin needs to keep the page open while a bulk run drains, which is about 10 seconds per author. On a paid plan the same SummarySender logic moves into a backend workflow scheduled on the list, and the browser can be closed.

## 10. Test checklist

1. **Log in as Priya:** two books are shown. *Whispers of the Ganges* is red (pending ₹3,570, last paid 15 Oct 2025) and *The Saffron Diaries* is green. The totals are ₹19,908 earned, ₹16,338 paid and ₹3,570 pending.
2. **Log in as Sneha:** *Midnight in Mysore* shows "Not yet published" and a grey badge.
3. **Isolation:** as Priya, open `/admin_author/<another author's id>`; you are redirected, and App Data → Run as Priya lists only her rows.
4. **Admin overview:** filter by Overdue, then by city "Nagpur", then search "kap" for Rohit Kapoor. Farhan Sheikh is the only author shown under *Paid*.
5. **Single send:** open Kavita's detail page and click send. A *Processing* log row appears, then *Success*. The email explains the ₹1,000 threshold rollover and gives a production update for *Raising Roots*.
6. **Double-click:** the button locks immediately; trigger again from a second tab within 2 minutes → *Skipped*.
7. **Bulk:** 9 authors queue (everyone except Farhan) and drain one by one.
8. **Failure:** change the `X-BookLeaf-Key` header in the API Connector and send → the log shows *Failed*: "Could not reach n8n (HTTP 403)". Put the key back. In n8n, change `ai_model` in Config to a model ID that doesn't exist and send → *Failed*: "AI API call failed after 3 attempts" with Bedrock's error. Change it back.
