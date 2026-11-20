-- =====================================================================
--  UPDATE 001 – PICTURES (ICONS) FOR STOCK ITEMS          (20 Nov 2026)
-- ---------------------------------------------------------------------
--  For a database that was set up BEFORE this date with schema.sql.
--  (A brand-new setup doesn't need this – schema.sql already includes it.)
--
--  How to run: Supabase → SQL Editor → New query → paste all of this →
--  Run. You should see "Success. No rows returned". Run it only once.
-- =====================================================================

begin;

-- 1. A new, optional column that remembers each item's picture by name
--    (e.g. 'droplet'). Only lower-case letters, numbers and dashes allowed.
alter table public.stock_items
  add column icon text check (icon ~ '^[a-z0-9-]{1,40}$');

-- 2. Let Owners and Managers set the picture when adding or editing an item.
--    (The existing access rules still decide WHO may add or edit.)
grant insert (icon), update (icon) on public.stock_items to authenticated;

-- 3. Give the starting A4 paper item the "paper sheet" picture.
update public.stock_items set icon = 'file' where name = 'A4 paper' and icon is null;

commit;
