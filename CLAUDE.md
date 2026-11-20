# Printex – Business Records Website

Record-keeping website for **Printex**, a small graphic design and printing business in Sri Lanka.
The owner is a **beginner**: explain every step in simple language, one step at a time,
and say exactly what to click or type.

## Decisions (agreed)

- **Language / currency:** English only. Sri Lankan Rupees, shown as `Rs. 1,250.00`.
  Store money as `numeric(12,2)` in the database (never floating point).
- **Dates:** Sri Lanka time (Asia/Colombo). Dates as `date`, times as `timestamptz`;
  display as `19 Nov 2026`, `9:30 AM`.
- **Tech:** plain HTML, CSS and JavaScript. **No build step, no npm, no frameworks.**
  The Supabase JS library is loaded from a CDN with a fixed version number.
- **Database + login:** Supabase free plan, email + password login.
  **Public sign-ups are off.** The owner creates every account in the Supabase dashboard.
- **Hosting:** GitHub Pages (free). The repository is public, so the code must never contain
  secrets. Only the Supabase *anon* key goes in the code. **Never** put the `service_role` key in the code.
- **Security is enforced in the database.** Row Level Security (RLS) is on for every table and
  database triggers/functions check the user's role. Hiding a screen is only for tidiness.
- **Phone first:** designed for a phone screen first, also works on a computer.
- **Local testing:** the folder is inside XAMPP, so it can be tested at `http://localhost/printex/`.
  `.htaccess` sends `Cache-Control: no-cache` for html/js/css so browsers always pick up changes
  (GitHub Pages ignores it; there, changes can take up to 10 minutes to appear).
- **Version number (cache busting):** `index.html` loads `css/style.css?v=X` and `js/app.js?v=X`;
  `app.js` reads X from its own address and loads every screen as `screens/<file>.js?v=X`.
  **Whenever a screen, app.js or style.css changes, bump X on both lines in index.html**
  (format `YYYY-MM-DD.N`, e.g. `2026-11-20.1` → `2026-11-20.2`). Without this, browsers can keep
  showing an old screen, because screen files are loaded later and a page refresh doesn't reach them.

## Roles

Three roles: **Owner**, **Manager**, **Staff**.

| Screen / action | Owner | Manager | Staff |
|---|---|---|---|
| Sales: add, change line prices | ✅ | ✅ | ✅ |
| Sales: edit | ✅ any sale | ✅ any sale | only sales they created, only on the same day |
| Payments: add | ✅ | ✅ | ✅ (dated today) |
| Payments: edit | ✅ any | ✅ any | only payments they took, only on the same day |
| Customers: add / edit (incl. from the sale form) | ✅ | ✅ | ✅ |
| Attendance: clock self in / out | ✅ | ✅ | ✅ |
| Attendance: correct anyone's times | ✅ | ✅ | ❌ |
| Delete any record | ✅ | ✅ | ❌ |
| Dashboard (billed, received, expenses, profit) | ✅ | ✅ | ❌ |
| Expenses and expense categories | ✅ | ✅ | ❌ |
| Price list and named discounts | ✅ | ✅ | ❌ |
| Custom discount amount on a sale | ✅ | ✅ | ❌ (named discounts only) |
| Inventory screen and manual stock adjustments | ✅ | ✅ | ❌ |
| Users screen (create profiles, assign roles, last sign-in) | ✅ | ❌ | ❌ |
| Activity Log | ✅ | ❌ | ❌ |
| CSV backup | ✅ | ❌ | ❌ |

### How roles appear in the website (important)

- **Nobody sees their own role**, and there are no "access denied" messages, permission
  lists or permission pages. The menu simply contains only the screens that user may use.
- If someone opens a screen they may not use (e.g. by typing its address), the site quietly
  shows their normal start screen instead.
- Roles are shown **only** to the Owner, **only** on the Users screen, where they are assigned.
- The page does read the user's role behind the scenes to build the menu; it is never displayed.

- The page gets its menu from the database function `my_menu()` (a list of screen names), so the
  role itself is never sent to the browser. Role-check helpers live in a `private` schema that the
  website cannot call directly.
- When a non-allowed action is attempted anyway, the database refuses it with a plain message about
  the record (e.g. "This sale can no longer be changed."), never a list of permissions.

### Staff limits enforced by the database

- Staff sales and payments are always dated **today** (they can't back-date).
- Staff may remove a line while editing their own same-day sale (that is editing, not deleting a
  record). Deleting whole sales, payments, customers etc. is Owner/Manager only.

### Accounts

- Each login has a row in `profiles` (full name, role, active). Inactive users can do nothing.
- A profile is created automatically when a login is created in Supabase.
  The **very first** login becomes the active Owner. Every later login starts as an
  **inactive Staff** member until the Owner sets their name, role and active on the Users screen
  (until that screen exists: Supabase Table Editor → `profiles`).
- There must always be at least one active Owner (the database blocks removing the last one).
- To remove someone, mark them **inactive**; don't delete the login (their sales, payments and
  attendance must keep pointing to them).
- Last sign-in comes from Supabase's login records via the owner-only function `list_users()`.

## Record history and Activity Log

- Every table has `created_by`, `created_at`, `updated_by`, `updated_at`, filled in **by database
  triggers** so they can't be faked.
- Triggers write every add / change / delete to `activity_log` (who, when, table, record, action,
  before/after values). Also logged: **line prices that differ from the price list**, and
  **manual stock adjustments with their reason**.
- Nobody can edit or delete log rows from the website. Only the Owner can view it.

## Sales and payments

- The website saves a sale and all its lines in one go with the database function
  `save_sale(p_sale, p_items)`, so a sale is never half-saved if the phone loses signal.
- A **sale** has: customer, date, one or more **line items**, a discount, and a total.
- A **line item** has: price list item, quantity, unit price, line total (quantity × unit price).
  - Unit price is filled in from the price list but can be changed by anyone who can add sales.
  - The list price at the time of sale is saved on the line too, so **past sales keep the price
    they were sold at** even if the price list changes later.
  - If unit price ≠ list price, the line is **flagged** (shown on the sale) and logged.
- **Discount:** a fixed rupee amount. Choose from the named discount list; Owner/Manager can
  instead type a custom amount. The database rejects a custom amount from Staff.
  Discount can't be more than the subtotal.
- **Sale total = sum of line totals − discount.**
- **Payments** are separate records on a sale: date, amount, received by (the logged-in user,
  set automatically). Advances and later payments are just more payment rows.
- **Owed = sale total − sum of payments.** Status is worked out: Paid / Part paid / Unpaid.
  Payments can't make the total paid go above the sale total.
- Customers include a built-in **"One-time customer"** for walk-ins (can't be deleted or renamed).
  The customer list shows **billed, paid, owed**, number of sales and last visit date.

## Price list

- Managed by Owner and Manager. Three groups:
  - **Photocopy:** paper size (A4 / A3 / A5) × sides (one / both). Photocopies are B&W.
  - **Printout:** paper size × sides × colour (B&W / Colour).
  - **Graphic design:** individual named items with their own price, e.g. "CV - 1 page",
    "CV - 3 pages", "Social Media Post Design", "Flyer Design", "Type Setting".
- **Counting is by sheet (decided).** Quantity = number of sheets. All copy/print prices are
  per sheet. Each sheet sold uses exactly **1 sheet** of paper (one side or both sides).
- **Starting prices (A4):**

  | Item | Price per sheet |
  |---|---|
  | Photocopy A4, one side / both sides | Rs. 20 / Rs. 20 |
  | Printout A4 B&W, one side / both sides | Rs. 20 / Rs. 20 |
  | Printout A4 Colour, one side / both sides | Rs. 50 / Rs. 100 |

  A3/A5 prices will be added later by the owner in the Price List screen.
  Graphic design items are set up **switched off at Rs. 0** until the owner enters real prices.
- Items can be switched off (hidden from new sales) instead of deleted, so old sales stay intact.

## Inventory (automatic)

- Stock is stored in the **smallest unit** (e.g. sheets). Each stock item can also have a pack
  unit and size (e.g. 1 ream = 500 sheets) so purchases can be entered in reams.
- Each price list item can be linked to one or more stock items with a **usage per unit**
  (e.g. "Photocopy A4 one side" uses 1 A4 sheet).
- **Paper is automatic; ink is tracked manually** (no ink links; ink is adjusted by hand).
- Starting stock item: "A4 paper" (counted in sheets, 1 ream = 500 sheets), linked to all A4
  photocopy and printout items.
- Every stock change is a row in `stock_movements` (sale, purchase, waste, correction).
  The quantity on hand is kept up to date from these by a database trigger.
- **Saving, editing or deleting a sale adjusts stock automatically** (done in the database).
- **Manual adjustments** (purchase, waste, correction) need a reason and are logged.
- Low-stock warning when quantity ≤ low-stock level. Stock may go **below zero**; it's allowed
  but shown with a clear warning.

## Expenses

- Simple entries: date, category, amount, note. Visible to Owner and Manager only.
- Expense categories are managed (add / rename / remove) by Owner and Manager. A category already
  used is hidden instead of deleted.
- Starting categories: Paper, Ink, Rent, Electricity, Water, Transport, Personal Expenses.
- (The earlier income categories are now price list items in the Graphic design / Photocopy /
  Printout groups.)

## Attendance

- Every user clocks **themselves** in and out with one button; the time is set by the database
  (the current time), not typed in.
- Owner and Manager can correct anyone's start/finish times (logged).
- Clocking in again while still clocked in **today** is refused. If the person is still
  clocked in from an **earlier day** (forgot to clock out), that record is left as it is,
  its note is marked "Forgot to clock out - needs correction", and they can clock in for today.
- Clocking out closes the person's **latest** open record, but only if it started within the
  **last 16 hours**. If it is older, clock-out is refused with "Your last clock-in was too long
  ago. Please ask a manager to correct it." (so a forgotten record is never closed with a wrong,
  very long shift).
- Attendance is linked to the user's login (`profiles`), so no separate staff list is needed.

## Dashboard (Owner and Manager)

This month: **billed** (sale totals by sale date), **received** (payments by payment date),
expenses, total owed to Printex, low-stock items, and **two clearly labelled profit figures**:
- "Profit on bills" = billed − expenses
- "Profit on cash received" = received − expenses

Figures come from the database function `dashboard(month)`, which returns nothing for Staff.

## Database plan (Supabase tables)

All tables also have `created_by`, `created_at`, `updated_by`, `updated_at`.

| Table | Main columns |
|---|---|
| `profiles` | id (= login user id), full_name, role (`owner`/`manager`/`staff`), active |
| `customers` | id, name, phone (optional), is_walk_in |
| `price_items` | id, item_group (`photocopy`/`printout`/`design`), name, paper_size, sides (`one`/`two`), colour (`bw`/`colour`), price, active |
| `stock_items` | id, name, base_unit (e.g. sheet), pack_unit (e.g. ream), pack_size, quantity, low_stock_level |
| `price_item_stock` | price_item_id, stock_item_id, usage_per_unit |
| `discounts` | id, name, amount, active |
| `sales` | id, sale_date, customer_id, discount_id (optional), discount_amount, subtotal, total, note |
| `sale_items` | id, sale_id, price_item_id, description, quantity, list_price, unit_price, line_total, price_changed |
| `payments` | id, sale_id, paid_on, amount, received_by |
| `stock_movements` | id, stock_item_id, change (+/−, in base units), reason (`sale`/`purchase`/`waste`/`correction`), sale_item_id (optional), note |
| `expense_categories` | id, name, archived, sort_order |
| `expenses` | id, expense_date, category_id, amount, note |
| `attendance` | id, user_id, work_date, start_time, finish_time, note |
| `activity_log` | id, happened_at, user_id, table_name, record_id, action, old_data, new_data, note |

- **View `customer_summary`:** billed, paid, owed, sale count, last visit per customer.
- **View `sale_summary`:** each sale with paid, owed and status (Paid / Part paid / Unpaid).
- **Functions the website calls:** `my_menu()`, `save_sale()`, `clock_in()`, `clock_out()`,
  `dashboard()`, `list_users()` (owner only; profiles plus email and last sign-in).
- Sale totals, price-change flags and stock movements are calculated **in the database**,
  so they are correct no matter who saves the sale.
- All setup lives in `supabase/schema.sql` so it can be re-run on a fresh project.

## Planned files

```
index.html           the only page: loading / login / inactive / app views
css/style.css        all styling (phone first; menu on the left from 800px wide; dark mode)
js/config.js         Supabase URL + anon (publishable) key + USERNAME_DOMAIN – the ONLY place they go
js/usernames.js      username ↔ login email conversion
js/supabase.js       creates the shared connection `db`; refuses a secret/service_role key
js/helpers.js        formatMoney, formatDate, formatTime, escapeHtml, el, placeholderHtml,
                     parseMoneyInput (typed "1,250.50" → 1250.5), showNotice (green/red message),
                     parseNumberInput (up to 3 decimals), formatNumber ("1,250.5")
js/menu.js           SCREENS list (name → label + file) and building the menu
js/app.js            login, my_menu(), menu, opening screens by #address, sign out
js/screens/*.js      one file per screen, each exports render(main, { db, user }):
                     dashboard, sales, customers, attendance, expenses, inventory,
                     pricelist, settings (categories + discounts), users, activity, backup
supabase/schema.sql  tables, views, triggers, RLS rules, starting data
```

### How the website works (step 3)

- Supabase JS is loaded in `index.html` from jsDelivr, pinned to `@supabase/supabase-js@2.45.4`.
  JavaScript files are ES modules (`type="module"`), so the site must be opened through a web
  server (XAMPP `http://localhost/printex/` or GitHub Pages), not by double-clicking the file.
- Screens are opened by the address after `#` (e.g. `#sales`). The allowed list comes only from
  `my_menu()`; an unknown or not-allowed `#name` silently goes to the first screen in the list.
- `my_menu()` returning an empty list → "Your account is not active yet. Please contact the owner."
- Wrong username, email or password → one generic message:
  "Wrong username, email or password. Please try again." (never reveal which usernames exist).

### Username logins

- The login box says **"Username or email"**. Input is trimmed and lower-cased.
  - Contains `@` → used as a normal email (the Owner's original email login keeps working).
  - Otherwise it must match `^[a-z0-9._]{1,50}$` and becomes `<username>@printex.invalid`.
    Anything else gets the generic wrong-login message without contacting Supabase.
- The made-up domain is `USERNAME_DOMAIN` in `js/config.js` (`.invalid` is reserved and can never
  receive mail). **Never change it once username accounts exist.**
- Shared code: `js/usernames.js` (`loginEmailFrom`, `loginNameFromEmail`, `isUsernameLogin`).
- The Users screen shows "Username: kamal" instead of the made-up email; the top bar falls back
  to the username when a profile has no name.
- **Creating a username account (until the Users screen can do it):** Supabase → Authentication →
  Users → Add user → Create new user → Email `kamal@printex.invalid`, a password, tick Auto Confirm
  User → Create user. Then activate them on the Users screen.
- Username accounts have no real mailbox, so "forgot password" emails can't work. The Owner resets
  a password in Supabase → SQL Editor:
  `update auth.users set encrypted_password = extensions.crypt('NewPassword', extensions.gen_salt('bf')) where email = 'kamal@printex.invalid';`
- Never show role names, permission lists or "access denied" anywhere.

## Known limits of the free plans

- A Supabase free project **pauses after about a week with no use**; restore it from the
  Supabase dashboard. Regular CSV backups are important.
- GitHub Pages on a free account needs a public repository (the code is public, the data is not).

## Build order

1. ✅ Owner creates GitHub and Supabase accounts (done).
2. ✅ Create Supabase project, run `schema.sql` (tables, triggers, RLS, starting data),
   create the owner login, turn off sign-ups, mark that login as owner.
3. ✅ Login screen + app layout + menu built from what the user may use.
4. ✅ Users screen (`js/screens/users.js`): list from `list_users()`; Owner edits name, role,
   active via `profiles` update; help box explains adding logins in the Supabase dashboard;
   reloads the page if the Owner changes their own role/active.
5. ✅ Settings (`js/screens/settings.js`): expense categories (add, rename, remove; a used
   category is hidden via `archived` and can be brought back) and named discounts (add, edit
   name/amount/on-off, remove; a used discount is switched off instead). "Used" is detected by the
   database refusing the delete (foreign key error `23503`). No starting discounts (owner's choice).
6. ✅ Inventory (`js/screens/inventory.js`): an "at a glance" overview. Summary strip at the top
   (Stock items · Need buying, naming the items · Runs out first, "about N days left" from the last
   7 days of sale movements). One row per item, problems first (Below zero → Low → OK): letter
   icon, half-circle gauge (12 bars, **full = 3 × low-stock level**, owner can later ask for a
   "normal full stock" field instead), status word, "In stock" shown in packs when easier
   ("2.8 reams", exact base units underneath), "Used (7 days)", then **Update stock** plus icon
   buttons for History and Edit. On a computer (≥1000px) each row is one table-like line.
   Only the newest list refresh is drawn (a slow older answer is ignored).
   "Update stock": Bought more (+), Spoiled or wasted (−), I counted the stock (the website
   reads the latest quantity and inserts the difference as a `correction`); amount in base units or
   packs; a note is required. History shows the latest 30 movements with who and when; manual ones
   can be undone (deletes the movement; the trigger puts the quantity back). Add/edit items (name,
   base unit, optional pack unit + size, low-stock level, in use). Remove = delete, or switch off
   if it has history or price-list links (foreign key error `23503`).
7. Price list, including links to stock items.
8. Customers.
9. Sales and payments (price-change flags, automatic stock updates).
10. Expenses.
11. Attendance (clock in/out, corrections).
12. Dashboard.
13. Activity Log screen.
14. CSV backup.
15. Test on phone and computer with three test logins (owner, manager, staff) to confirm the
    database really blocks what each role may not do, then publish on GitHub Pages.

## Open questions (update when answered)

- Graphic design prices: to be entered by the owner (items start switched off at Rs. 0).
