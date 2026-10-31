# 02 – Pages, elements and expressions

Open **Design**. The page dropdown at the top lists `index`, `dashboard`, `admin` and `admin_author`. The **Elements tree** on the left shows how each page is nested.

## Layout: groups inside groups

Modern Bubble pages use *responsive containers*. Every group is a **row** or a **column**, with gaps between children, much like CSS flexbox. Select a group, then open the **Layout** tab in its property panel to see `Container layout: Column`, the gap, and min/max widths. This app keeps content in a column with a 1180px max width, centred.

Elements have a **style** (Styles tab), for example *Ledger figure* for the big totals or *Badge* for status pills. Change the style once and every element using it updates.

## Showing data: a group's "type of content"

A group can hold one thing. Set **Type of content = Author** and **Data source = …**, and everything inside can say *Parent group's Author's name*.

- `admin_author` page: the **page itself** has type of content Author, so the URL `/admin_author/<author id>` loads that author. Elements read *Current page's Author*.
- `dashboard`: the content comes from *Current User's author*.

## Repeating groups: lists

A **RepeatingGroup** shows one cell per item of a list. Its *Type of content* is Book and its *Data source* is a search: *Search for Books (author = …)*. Inside a cell, *Current cell's Book* (or *Parent group's Book*) is that row's book.

The admin page's author list is a repeating group with a search that uses the filter inputs. **Ignore empty constraints** is ticked, so an empty filter means "don't filter".

## Reusable elements

**AuthorRoyaltyView** is a *reusable element*: built once, used on both `dashboard` and `admin_author`. It has type of content Author. The page passes in an author, and the reusable shows the totals band, the book cards and the payout history. To edit it, pick it from the page dropdown under *Reusable elements*.

One fix covers both pages, and an author and an admin are guaranteed to see the same figures.

## Expressions: the language of Bubble

Every dynamic value is an *expression* you build by clicking, read left to right:

```
Search for Books (author = Parent group's Author) :each item's royalty_pending :sum
```

You'll meet these pieces most often:

| Piece | Example |
|---|---|
| Data source | `Current User`, `Search for …`, `Current page's Author`, `Parent group's Book`, `Current date/time` |
| Field | `'s name`, `'s author`, `'s royalty_status` |
| List operator | `:count`, `:sum`, `:first item`, `:unique elements`, `:minus item`, `:format as text` |
| Comparison | `is`, `is not`, `>`, `is empty` |
| Formatting | `:formatted as` (dates and numbers), `:formatted as JSON-safe` (text inside JSON) |

**Dates and timezones.** `:formatted as` on a date uses the *viewer's* timezone unless you pick a static one. The log timestamps here use static *Asia/Kolkata*, so they read the same for everyone.

## Conditionals: changing looks with data

Select the status badge on a book card and open its **Conditional** tab. Rules like *When Parent group's Book's royalty_status is Overdue → background red* set the colours. The send button has *When admin_author's is_sending is yes or this author has a Processing log → text "Sending…", not clickable*.

## Check yourself

1. Where would you change the totals band so it changes on both the dashboard and the admin author page?
2. The admin's author list shows ₹0 for everyone. Name two likely causes.
3. Why is the dashboard's first workflow action "Go to index when Current User is logged out"?

Answers: 1) In the AuthorRoyaltyView reusable. 2) The admin privacy rule on Book is missing, or the search constraint compares the wrong thing (for example *Current User's author* instead of *Current cell's Author*). 3) So a logged-out visitor isn't left on a page that has nothing to show. It's convenience, not security: privacy rules are the security.
