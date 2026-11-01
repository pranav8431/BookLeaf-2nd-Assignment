# Interview Q&A: how the Bubble frontend was built

Answers are in the first person, written to be said out loud. Learn the idea behind each one, not the wording. Most answers end with **Show:**, the place in the Bubble editor to open if they ask you to share your screen.

Open the editor at **bubble.io → pranavkr1503 → Design** while you practise, and click through each **Show:** until you can find it without thinking.

---

## 1. The big picture

**Q: Walk me through the frontend. What pages are there?**

There are four main pages and one shared component:

- **index:** log in and sign up, side by side.
- **dashboard:** the author's own royalties.
- **admin:** the ops view, with KPIs, filters, the author list, the bulk-send button and the notification log.
- **admin_author:** one author's detail page for admins, with the Generate & Send button and that author's log.
- **AuthorRoyaltyView:** a reusable element with the totals band, the book cards and the payout history. The dashboard and admin_author both use it, so an author and an admin see exactly the same numbers.

Bubble's default `404` and `reset_pw` pages are still there, untouched.

**Show:** the page dropdown at the top-left of the Design tab.

**Q: Why a reusable element instead of building the author view twice?**

The brief says the admin should see "the same data the author sees". If I built it twice, the two copies would drift: I'd fix a total on one page and forget the other. With one reusable, a fix lands on both pages, and the author and admin can't disagree about a number. It's the same idea as a shared component in React.

**Show:** the page dropdown → *Reusable elements* → AuthorRoyaltyView.

**Q: How does the reusable know which author to show?**

It has *Type of content = Author*. Each page passes one in:

- **dashboard:** *Current User's author*
- **admin_author:** *Current page's Author*

Everything inside reads from *AuthorRoyaltyView's Author* (or *Parent group's …*), so the component doesn't care which page it's on.

**Q: Why did you design the data before the UI?**

The brief says it prefers a well-structured app with a basic UI over a pretty app with a messy database. In Bubble the UI is mostly expressions over the data, so once Author → Book → RoyaltyPayout was right, each screen was largely "search for X and show its fields".

---

## 2. Layout and styling

**Q: How did you lay out the pages? Fixed positions?**

No. I used Bubble's responsive engine: every page and group is a **column or row container with gaps**, a lot like CSS flexbox. For example:

- the page is a column
- the header is a row
- the KPI band is a row of small groups
- each book card is a column, with a row of figures inside

Elements stretch or fit their content instead of sitting at fixed x/y positions.

**Show:** select any group → the Layout tab (*Container layout: Column/Row*, *gap*).

**Q: How did you keep the styling consistent?**

With **styles** rather than per-element formatting:

- *Heading 3* for book titles
- *Badge* for the status pills
- *Ledger figure* for the big rupee totals
- *Outline* for cards
- *Error text* for error messages

Change a style once and every element using it updates.

**Show:** the Styles tab, or select a text element and look at the style dropdown at the top of its property panel.

**Q: Is it mobile friendly?**

The containers are responsive, so it reflows. But I built it for desktop, because ops staff use it at a desk. Mobile polish would come after the data and workflows were right, as the brief prioritises.

---

## 3. Showing data

**Q: How does the "My Books" list work?**

It's a **Repeating Group** with *Type of content = Book* and data source *Search for Books where author = the reusable's Author*, sorted by publication date. Each cell is a card:

- the title (*Heading 3*) and a status badge
- a line with ISBN, genre and status
- a line with the publication date, MRP and platforms (*available_on: each item's Display joined with ", "*)
- a row of five figures: copies sold, earned, paid, pending, last payout

**Show:** AuthorRoyaltyView → RepeatingGroup Book.

**Q: How do you show something different for a book that isn't published yet?**

With a **conditional** on that text. When *Parent group's Book's is_published is no*, the text changes to "Not yet published · currently at {production stage} (stage {step} of 9)". `ProductionStage` is an option set, and `step` is an attribute on each option, so "stage 4 of 9" comes straight from the data.

**Show:** the "Published …" text in the book card → Conditional tab.

**Q: How are the totals calculated: total earned, paid and pending?**

They're computed live with list operators. For example: *Search for Books (author = this Author) :each item's total_royalty_earned :sum*. Paid and pending work the same way, and copies sold is the sum of copies sold. I don't store totals on the Author, because a stored total could drift from the books; a computed one can't.

**Q: How does the payout history work?**

It's a second repeating group, *Search for RoyaltyPayouts (author = this Author)*, newest first. The dataset only gives cumulative totals and a last-payout date, so I seeded one clearly labelled "opening balance" row per book rather than inventing transactions. Under it there's an empty-state text, "No payouts have been made yet", which only shows when the search count is 0.

**Q: How did you build the green/yellow/red badge?**

There are two parts:

1. **The status itself** is a stored option-set field, `royalty_status` on Book: Paid, Pending, Overdue or Not Applicable. The rule from the brief (green if fully paid; yellow if pending within 90 days; red if pending and the last payout was over 90 days ago, or never paid and published over 90 days ago) is applied by workflow actions, not in the UI.
2. **The pill** is a text with the *Badge* style. Its text is *royalty_status's label* (an attribute on the option set), and four **conditionals** set the background colour: Paid → green, Pending → amber, Overdue → red, Not Applicable → grey.

**Show:** the badge in the book card → Conditional tab.

**Q: Why store the status instead of calculating it on the page?**

Two reasons:

- **Filtering.** The admin page filters authors by payout status, and Bubble can only filter a search on a *stored* field.
- **One rule in one place.** Every screen reads the same stored value instead of each re-implementing the 90-day rule.

The cost is that it must be kept fresh. The recompute actions run when an admin opens the admin page, so statuses are correct against today's date before anyone acts on them.

**Q: Bubble has no if/else. How did you implement the 90-day rule?**

Each status has its own *Make changes to a list of Books* action, with a search whose constraints match exactly one case: paid, unpublished, pending with a recent payout, pending with an old payout, never paid and recently published, never paid and published long ago. There are six, and they're mutually exclusive, so the order doesn't matter. The author's overall status then takes the worst of their books' statuses.

**Show:** Workflow tab → admin → *Page is loaded*.

**Q: Every pending book is red. Is that a bug?**

No. The latest payout in the dataset is 1 Dec 2025, so as of today every pending balance is more than 90 days old. The rule is doing what the brief says. Kavita is a real edge case: her ₹850 is red by the badge rule, but it's correctly unpaid under the ₹1,000 minimum. So her dashboard shows a hint explaining the threshold, and I'd raise with ops that the badge should probably ignore balances under the minimum.

---

## 4. The admin page

**Q: How do the search and filters work?**

The author list is a repeating group with *Search for Authors*, and three constraints read the inputs:

| Filter | Constraint |
|---|---|
| Name | `name` *text contains* the search box's value |
| City | `city` = the city dropdown's value |
| Payout status | `payout_status` = the status dropdown's value |

**"Ignore empty constraints"** is ticked, so an empty input means "don't filter on this". Bubble re-runs the search whenever an input changes, so the list updates as you type, with no button or workflow. It's sorted by name.

**Show:** admin → RepeatingGroup Author → Data source.

**Q: Where do the dropdown options come from? Did you type the cities in?**

No, nothing is hard-coded:

- **City:** *Search for Authors :each item's city :unique elements*. A new author in a new city appears automatically.
- **Payout status:** *All RoyaltyStatus*, with the caption *Current option's label*.

**Q: What's in each row of the author list?**

The author's name and city, then the number of books, the total earned and the total pending (each a search over that author's books with `:count` or `:sum`), their payout-status badge, and a **View** button. View runs *Go to page admin_author*, with *Data to send = Current cell's Author*. That's how the detail page knows who to show: its URL becomes `/admin_author/<author id>`.

**Q: What are the numbers at the top of the admin page?**

They're KPI cards: number of authors, total earned, total paid and total pending across everyone, and how many authors are overdue. Each is one search with `:count` or `:sum`.

**Q: How does the notification log display work?**

It's a repeating group of *Search for NotificationLogs*, newest first. Each row shows:

- a status badge (Processing blue, Success green, Failed red, Skipped grey)
- the time, formatted in a fixed **Asia/Kolkata** timezone with an "IST" label
- the trigger type (Single or Bulk) and the email status
- the subject and the full email body
- the error message

Fields that are empty are hidden by conditionals. On admin_author the same list is filtered to that one author.

**Q: Why the fixed timezone?**

`:formatted as` uses the *viewer's* browser timezone by default. My browser reported UTC, so a run at 12:07 am IST showed as 6:37 pm the day before. Setting the timezone to static Asia/Kolkata means everyone sees the same IST time. I also store date-only values at noon IST, so the calendar day doesn't shift for anyone between UTC−6:30 and UTC+11:30.

---

## 5. Buttons, states and feedback

**Q: How did you stop the admin from double-clicking Generate & Send?**

There are three layers, and two of them are in the UI:

1. **A custom state, `is_sending`, on the page.** It's the very first action of the click workflow, so it's set before any server call. The button has a conditional: *when is_sending is yes → text "Sending…", not clickable*.
2. **A database check.** The same conditional also disables the button while this author has a *Processing* log under 3 minutes old, which covers a second tab or a second admin.
3. **n8n's duplicate guard** on the server, which returns *Skipped* within 2 minutes.

**Show:** admin_author → the Generate button → Conditional tab, and the page's *Custom states*.

**Q: What does the admin see if n8n never answers? Is there a spinner forever?**

No. A *Processing* row older than 3 minutes changes, through a conditional, to a red **"No response"** badge, and the button unlocks. If n8n returns an error, the API Connector call is set to include errors in its response, and a separate action marks the log *Failed* with the HTTP code. So something always ends up on screen.

**Q: How does the bulk button work in the UI?**

1. The click sets two custom states: `queue` (every author with a pending balance, which is 9 of the 10) and `batch_id` (for example `BULK-20261030-183546`).
2. A **"Do every 6 seconds"** event, which runs only when the queue isn't empty and the user is an admin, takes the first author, creates their log row, removes them from the queue and calls n8n.
3. While it runs, a conditional changes the button to "Sending… N left. Keep this page open", where N is the queue count.

New rows appear in the log on their own, because Bubble searches are live.

**Q: Why does the bulk run need the tab open? Isn't that fragile?**

Yes, and it's deliberate given the plan. I first built it as a backend workflow, with *Schedule API workflow on a list*. On the Free plan, Bubble ran a few and then refused the rest with "This app reached a workflow limit available on the Free plan". That error kills the run before any error branch, so rows stuck on *Processing*. Page workflows aren't capped, so I moved the loop to the page. The backend versions are still in the app, working, for when the app moves to a paid plan.

**Q: How do login errors show?**

The index page has two custom states, `login_error` and `signup_error`, each shown in an *Error text* element. Bubble's *"An element has an error running a workflow"* event catches a wrong password and sets the state to a friendly message. Each click clears the state first, so an old error doesn't linger.

---

## 6. Login, roles and protecting pages

**Q: How does login decide where to send the user?**

The *Log in* button runs *Log the user in*, then two *Go to page* actions with opposite *Only when* conditions: role is Admin → admin, otherwise → dashboard. That's how you do if/else in Bubble.

**Q: How does sign-up work? Can anyone become an admin?**

No. Sign-up does *Sign the user up* and copies the email into a `login_email` field. Then:

- **Admin role:** only if the email is in the **StaffEmail** option set, which can only be edited in the Bubble editor.
- **Author role:** only if an Author record has that email, in which case the new login is linked to it (this is the "claim").
- **Anyone else:** gets "This email is not registered with BookLeaf" and is logged out again.

**Q: What stops an author typing /admin in the address bar?**

Two things, and only the second is security:

1. **Page redirects.** Each page's *Page is loaded* workflow redirects: logged out → index; on admin pages, not an admin → dashboard. This is convenience.
2. **Privacy rules.** They run on Bubble's server and decide which records are ever sent to the browser. Even if someone defeated the redirect, the admin page would load empty for an author, because the server never sends other authors' data.

**Q: Why is hiding an element not enough for privacy?**

Hidden elements and redirects run in the browser, and the data still arrives in the page. Privacy rules filter on the server. The rules are default-deny on every type:

- admins see everything
- an author sees their own Author, Books and Payouts
- an author never sees notification logs

I tested this by logging in as Rohit: two books, his payouts only, and /admin sent him back.

**Q: What was tricky about the privacy rules?**

- **Single hop only.** Bubble rejects `This Book's author's user is Current User`. So I compare both sides one hop away: `This Book's author is Current User's author`. That's also why RoyaltyPayout stores `author` directly as well as `book`.
- **No built-in email.** Bubble won't use the built-in `email` in a rule, which is why sign-up copies it into `login_email`.

---

## 7. Talking to n8n from the UI

**Q: How does the button call n8n?**

Through the **API Connector**, where *Trigger Royalty Summary* is set up as an **action**. Its body is the author and their books as JSON, and the key goes in a **private** `X-BookLeaf-Key` header. Bubble's server makes the call, so the key never reaches the browser.

The click workflow then:

1. sets `is_sending`
2. creates a NotificationLog with status *Processing*
3. calls the API, passing the log's ID
4. writes n8n's answer onto *Result of step 2*: subject, body and status (Success, Failed or Skipped)
5. clears `is_sending`

**Show:** Plugins → API Connector, and Workflow → admin_author → the button's workflow.

**Q: How did you build a JSON array of books in Bubble?**

*Search for Books :format as text*. Each item becomes a small JSON object, joined with commas, and every text value is passed through `:formatted as JSON-safe`, so a title with a quote can't break the JSON. Numbers and dates are sent as strings so that an empty value can't break it either, and n8n parses them. Because the call carries the full data, n8n doesn't need the Data API, which the Free plan doesn't have.

**Q: What's "Result of step 2"?**

In a Bubble workflow, a later action can use what an earlier action returned. Step 2 creates the log row, so *Result of step 2* **is** that row. I pass its unique ID to n8n, and later actions update that same row with n8n's answer.

---

## 8. Testing and debugging

**Q: How did you test the frontend?**

- **Data isolation:** logged in as Priya, then Rohit (only their own books), then admin (all 10 authors).
- **Totals:** compared each figure against the JSON.
- **Filters:** each filter on its own and combined.
- **Sends:** a single send (Success in about 5 s), a double click (*Skipped*), and a bulk run (9 rows, one every 6 s).
- **Failures:** a wrong key gives *Failed* with HTTP 403, and a stuck row turns into "No response" after 3 minutes.

**Q: How do you debug a Bubble workflow?**

- **Step-by-step debugger:** preview with `?debug_mode=true`, which runs each action one at a time, with **Inspect** to see any element's data.
- **Server logs:** the **Logs** tab shows server-side errors. That's where I found the Free-plan workflow-limit message.
- **Run as:** App data → *Run as* a user shows exactly what that user's privacy rules let them see.

**Q: Name a real bug you hit and how you fixed it.**

Pick one:

- **Wrong times:** log times showed in UTC, so a run after midnight in India looked like the previous evening. Fixed with a static Asia/Kolkata timezone on the date formatting, plus noon-IST dates.
- **Stuck rows:** rows stuck on *Processing* because the Free plan capped backend workflows. Moved the send and bulk loop to page workflows, and added the 3-minute "No response" fallback.
- **A correct email rejected:** Diya's email was rejected because her title has a curly apostrophe (*Durga’s Daughters*) and Claude wrote a straight one. The check now ignores quote style. That fix was on the n8n side, but the Bubble log showed the exact reason, which is the point of logging errors.

---

## 9. Judgement questions

**Q: What would you improve in the frontend?**

- Thousands separators on amounts. Bubble shows `₹84024`, while the emails show `₹84,024`.
- Pagination on the log once it grows.
- A per-batch summary at the end of a bulk run.
- Moving the bulk run to a backend workflow on a paid plan, so the tab can close.

**Q: What did you find hard about Bubble, coming from code?**

*(Answer from your own experience. Ideas:)*

- There's no if/else; you write mutually exclusive *Only when* conditions instead.
- Expressions are clicked together rather than typed.
- Privacy rules only follow one hop.
- The Free plan's limits aren't visible until you hit them.
- Timezones default to the viewer's browser.

**Q: What did you like?**

*(Your own words. Ideas:)*

- Searches are live, so the log updated with no refresh code.
- Reusable elements.
- Privacy rules are enforced on the server for you.
- How fast a working CRUD screen comes together once the data model is right.

**Q: Did you use AI tools to build it?**

**Answer honestly.** The brief explicitly allows AI tools, and says you must be able to explain the build in detail. That's what this file is for.

A truthful answer looks like this: "Yes. I used an AI coding assistant to help me build it quickly. I made the design decisions, tested every flow myself, found the real bugs (the timezone, the Free-plan limit, the apostrophe), and I can walk you through any page, workflow or rule in the editor now."

Don't claim you placed every element by hand if you didn't. If the founders open the editor, being able to *navigate and explain it* is what convinces them.

---

## If you get a question you can't answer

Say what you'd check and where: "I'd open the workflow in step-by-step debug mode and inspect what *Result of step 3* returned." Knowing **where to look** in Bubble counts for as much as knowing the answer.
