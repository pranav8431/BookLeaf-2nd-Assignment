# Bubble exercises

Each one is small and easy to undo. They're ordered from looking to building. Keep a note of what you change; Ctrl+Z works within an editor session.

## Look

1. **Trace a number.** On Priya's dashboard, find where "TOTAL PENDING ₹3,570" comes from. Design → page `dashboard` → AuthorRoyaltyView → click the figure → read its expression. Which search and which operator?
2. **Run as.** Data → App data → Book → **Run as** Rohit. Count the books he can see. Repeat as the admin.
3. **Step through a send.** Preview `admin_author` for an author with `?debug_mode=true`. Set the debugger to *Step-by-step*, click Generate, and watch the nine steps. Which ones are skipped, and why?
4. **Read the logs.** Logs tab → server logs → find a run of *Trigger Royalty Summary* and the JSON it sent.

## Change (and change back)

5. **Thousands separators** (a real improvement): click the TOTAL EARNED figure in AuthorRoyaltyView. In its expression, click the `:sum` part and add `:formatted as` → choose the format that shows `1,028.58` → set decimals to 0. Preview. Then do TOTAL PAID and TOTAL PENDING.
6. **Badge colour:** Styles → *Badge*, or the badge's conditional for *Overdue*. Change the red, preview, and change it back.
7. **New option:** Data → Option sets → `StaffEmail` → add your own email. Sign up with it in a private window: you'll be an admin. Then delete that user (App data → User) and the option.

## Build

8. **Author count per city:** on `admin`, add a Text under the filters reading *Search for Authors (city = Dropdown city's value):count authors in this city*. Make it visible only when a city is chosen.
9. **"Last summary" line:** on `admin_author`, under the button, add a Text showing *Search for NotificationLogs (author = Current page's Author, status = Success) sorted by Created Date descending :first item's Created Date :formatted as (static timezone Asia/Kolkata)*.
10. **Retry button:** in the admin log, add a small "Retry" button to rows with status Failed. It goes to `admin_author` for that row's author. Hint: copy the existing *View* button workflow.

When you can do 8–10 without looking at notes, you know enough Bubble to explain every part of this app.
