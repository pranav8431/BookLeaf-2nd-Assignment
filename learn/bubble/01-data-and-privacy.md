# 01 – Data and privacy

Open **Data** in the editor. It has sub-tabs: **Data types**, **Privacy**, **App data** and **Option sets**.

## Data types are tables, fields are columns

A *data type* is like a database table; each record is a *thing*. This app has five:

| Type | Holds | Key fields |
|---|---|---|
| User | a login (built in) | `email`, `role`, `author`, `login_email` |
| Author | a publishing profile | `author_code`, `name`, `email`, `city`, `user`, `payout_status` |
| Book | one title | `author`, `title`, `copies_sold`, `total_royalty_earned`, `royalty_paid`, `royalty_pending`, `royalty_status`, … |
| RoyaltyPayout | one payment | `book`, `author`, `amount`, `payout_date`, `note` |
| NotificationLog | one summary attempt | `author`, `triggered_by`, `trigger_type`, `status`, `email_subject`, `email_body`, `error_message`, … |

A field's type can be text, number, date, yes/no, another data type (a link), an option, or a *list* of any of these.

**Link from the child to the parent.** Book has an `author` field; Author has no list of books. To get an author's books you search: *Do a search for Books where author = this Author*. There's only one place to update, so the two sides can never disagree. This is the same rule as a foreign key in SQL.

**Store what you need to filter by.** Bubble can only filter searches on stored fields. The admin page filters authors by payout status, so `payout_status` is a stored field, recalculated when an admin opens the admin page.

## Option sets are fixed lists

**Option sets** hold values that never come from users: roles (Admin, Author), royalty statuses (Paid, Pending, Overdue, Not applicable), log statuses, platforms and production stages. An option can carry *attributes*. Here `RoyaltyStatus` has a `label` and a `color`, and `ProductionStage` has a `step` number for "stage 4 of 9".

Why not plain text? A typo can't create a fourth status. Renaming a label changes it everywhere. Conditions compare options, not strings.

`StaffEmail` is an option set too. It lists the emails allowed to become admins. Only someone with editor access can change it, which is what makes the admin role safe.

## Privacy rules decide what the server sends

Open **Data → Privacy**. Each type has rules saying who can see which fields, and who can find the records in searches.

The key idea: **privacy rules run on Bubble's server.** A page can only show what the server sends it. Hiding something on a page is cosmetic; a privacy rule is real protection.

The rules in this app:

| Type | Rule | Meaning |
|---|---|---|
| all types | *Everyone else*: nothing ticked | Default deny |
| all types | `Current User's role is Admin` | Admins see everything |
| Book, RoyaltyPayout | `This Book's author is Current User's author` (and that is not empty) | An author sees only their own books and payouts |
| Author | `This Author's user is Current User` | An author sees their own profile |
| Author | `This Author's email is Current User's login_email` | Lets sign-up find the profile to link (see lesson 03) |
| NotificationLog | admins only | Authors never see the logs |

**Gotcha 1: single hop only.** A rule can follow one link from *This Book*, not a chain. `This Book's author's user is Current User` is rejected. Instead the rule compares both sides to a value one hop away: *This Book's author* = *Current User's author*.

**Gotcha 2: no `Current User's email`.** Bubble won't use the built-in email in a rule. Sign-up copies it into a normal text field, `login_email`, which a rule can use.

**Prove it:** App data → pick the *Book* table → **Run as** → choose Priya's user. You'll see only her two books. Do the same for Rohit.

## App data

**App data** is the spreadsheet view of your records. You can edit a cell, delete rows, or switch between the *Development* and *Live* databases. On the Free plan only Development is used.

## Check yourself

1. Why does RoyaltyPayout store `author` as well as `book`? (Hint: single hop.)
2. If you deleted the admin rule on Book, what would the admin page show?
3. What stops an author from signing up with `admin@bookleaf.test`?

Answers: 1) So its privacy rule can be one hop: *This Payout's author is Current User's author*. 2) No books, and every total would be ₹0. 3) Sign-up only gives Admin to emails in `StaffEmail`. Someone signing up with that address would also need the mailbox, and that email already has an account.
