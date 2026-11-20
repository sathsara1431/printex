-- =====================================================================
--  PRINTEX – DATABASE SETUP
-- =====================================================================
--  What this file does:
--    Creates every table, rule and automatic action the Printex website
--    needs, plus some starting data (categories, A4 prices, A4 paper,
--    and the "One-time customer").
--
--  How to use it:
--    Run it ONCE on a NEW, EMPTY Supabase project:
--    Supabase dashboard → SQL Editor → New query → paste everything → Run.
--    (Running it a second time on the same project will fail, because
--    the tables already exist. That is expected.)
--
--  Words you will see in the comments:
--    table    = a sheet of records, like one Excel sheet
--    column   = one piece of information in a record (e.g. "phone")
--    trigger  = an automatic action the database does by itself whenever
--               a record is added, changed or deleted
--    function = a small program stored inside the database
--    policy   = a rule saying who may read or change records (this is
--               called "Row Level Security", or RLS)
--
--  Roles: 'owner', 'manager', 'staff'. See CLAUDE.md for who can do what.
-- =====================================================================

begin;


-- =====================================================================
-- PART 1. A PRIVATE AREA FOR HELPER FUNCTIONS
-- ---------------------------------------------------------------------
-- The website can only call things in the "public" area. Helpers that
-- check a person's role are put in a "private" area, so nobody can ask
-- the database "what is my role?" from the website.
-- =====================================================================

create schema private;
grant usage on schema private to authenticated;

-- Today's date in Sri Lanka (the server itself runs on world time).
create function private.today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Colombo')::date $$;


-- =====================================================================
-- PART 2. USERS (PROFILES)
-- ---------------------------------------------------------------------
-- Supabase keeps the logins (email + password) itself. For every login
-- we keep one "profile" with the person's name, role and whether the
-- account is active.
-- =====================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Role helpers (private). They answer for the person who is logged in.
-- An inactive account counts as having no role at all.
create function private.my_role() returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create function private.is_active_user() returns boolean
language sql stable set search_path = ''
as $$ select private.my_role() is not null $$;

create function private.is_owner() returns boolean
language sql stable set search_path = ''
as $$ select coalesce(private.my_role() = 'owner', false) $$;

create function private.is_manager_or_owner() returns boolean
language sql stable set search_path = ''
as $$ select coalesce(private.my_role() in ('owner', 'manager'), false) $$;

-- "Did I create this record, today?" Used for the Staff same-day rule.
create function private.is_mine_today(p_created_by uuid, p_created_at timestamptz) returns boolean
language sql stable set search_path = ''
as $$
  select private.is_active_user()
     and p_created_by = auth.uid()
     and (p_created_at at time zone 'Asia/Colombo')::date = private.today()
$$;

-- When a new login is created in Supabase, make its profile automatically.
-- The very first login becomes the active Owner. Everyone after that
-- starts as an INACTIVE Staff member until the Owner switches them on.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_first boolean;
begin
  select not exists (select 1 from public.profiles where role = 'owner') into v_first;
  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    case when v_first then 'owner' else 'staff' end,
    v_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Safety net: never allow the last active Owner to be removed or downgraded,
-- otherwise nobody could manage users any more.
create function private.protect_last_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner' and old.active and (new.role <> 'owner' or not new.active) then
    if not exists (select 1 from public.profiles
                   where role = 'owner' and active and id <> old.id) then
      raise exception 'There must always be at least one active owner.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_last_owner
  before update on public.profiles
  for each row execute function private.protect_last_owner();


-- =====================================================================
-- PART 3. "WHO AND WHEN" ON EVERY RECORD
-- ---------------------------------------------------------------------
-- Every table has created_by / created_at / updated_by / updated_at.
-- This trigger fills them in by itself, so they can't be typed in or faked.
-- =====================================================================

create function private.set_audit_fields() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;   -- the original creation can't be changed
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;


-- =====================================================================
-- PART 4. ACTIVITY LOG
-- ---------------------------------------------------------------------
-- Every add / change / delete on the main tables is written here by a
-- trigger: who, when, which table, which record, and the values before
-- and after. Nobody can change or delete these rows from the website.
-- Only the Owner can read them.
-- =====================================================================

create table public.activity_log (
  id           bigint generated always as identity primary key,
  happened_at  timestamptz not null default now(),
  user_id      uuid,
  table_name   text not null,
  record_id    text,
  action       text not null,          -- 'insert', 'update' or 'delete'
  old_data     jsonb,                  -- the record before the change
  new_data     jsonb,                  -- the record after the change
  note         text                    -- extra explanation, e.g. "Price differs from price list"
);

create index activity_log_happened_at_idx on public.activity_log (happened_at desc);

create function private.log_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old  jsonb;
  v_new  jsonb;
  v_row  jsonb;
  v_note text;
  -- Columns the database recalculates by itself; a change to ONLY these
  -- is not worth a separate log line (the real change is logged elsewhere).
  v_ignore text[] := array['updated_at', 'updated_by', 'quantity', 'subtotal', 'total'];
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' and (v_old - v_ignore) = (v_new - v_ignore) then
    return null;
  end if;

  if tg_table_name = 'sale_items' and coalesce((v_new ->> 'price_changed')::boolean, false) then
    v_note := 'Price differs from price list (list Rs. ' || (v_new ->> 'list_price')
              || ', charged Rs. ' || (v_new ->> 'unit_price') || ')';
  elsif tg_table_name = 'stock_movements' then
    v_note := 'Stock ' || (v_row ->> 'reason') || ' ' || (v_row ->> 'change')
              || coalesce(': ' || nullif(v_row ->> 'note', ''), '');
  end if;

  insert into public.activity_log (user_id, table_name, record_id, action, old_data, new_data, note)
  values (auth.uid(), tg_table_name, v_row ->> 'id', lower(tg_op), v_old, v_new, v_note);
  return null;
end;
$$;


-- =====================================================================
-- PART 5. CUSTOMERS
-- =====================================================================

create table public.customers (
  id          bigint generated always as identity primary key,
  name        text not null check (btrim(name) <> ''),
  phone       text,
  is_walk_in  boolean not null default false,   -- true only for "One-time customer"
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Only one "One-time customer" can exist.
create unique index customers_one_walk_in on public.customers (is_walk_in) where is_walk_in;

-- The "One-time customer" can't be deleted or renamed.
create function private.protect_walk_in() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_walk_in then
      raise exception 'The One-time customer cannot be deleted.';
    end if;
    return old;
  end if;
  if old.is_walk_in and (new.name <> old.name or not new.is_walk_in) then
    raise exception 'The One-time customer cannot be renamed.';
  end if;
  if not old.is_walk_in and new.is_walk_in then
    raise exception 'There can only be one One-time customer.';
  end if;
  return new;
end;
$$;

create trigger customers_protect_walk_in
  before update or delete on public.customers
  for each row execute function private.protect_walk_in();


-- =====================================================================
-- PART 6. STOCK (INVENTORY)
-- ---------------------------------------------------------------------
-- Stock is counted in the smallest unit (e.g. sheets). A pack unit
-- (e.g. 1 ream = 500 sheets) lets purchases be entered in reams.
-- The quantity is NEVER typed in directly: it changes only through
-- "stock movements" (sale, purchase, waste, correction).
-- =====================================================================

create table public.stock_items (
  id               bigint generated always as identity primary key,
  name             text not null unique check (btrim(name) <> ''),
  base_unit        text not null default 'sheet',        -- smallest unit
  pack_unit        text,                                  -- e.g. 'ream' (optional)
  pack_size        numeric(12,3) check (pack_size > 0),   -- e.g. 500 sheets in a ream
  quantity         numeric(12,3) not null default 0,      -- can go below zero (shown with a warning)
  low_stock_level  numeric(12,3) not null default 0 check (low_stock_level >= 0),
  active           boolean not null default true,
  icon             text check (icon ~ '^[a-z0-9-]{1,40}$'),  -- picture name, e.g. 'droplet' (optional)
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);


-- =====================================================================
-- PART 7. PRICE LIST
-- ---------------------------------------------------------------------
-- Three groups:
--   photocopy : paper size + sides                (always B&W)
--   printout  : paper size + sides + colour
--   design    : named items with their own price  (no size/sides/colour)
-- All copy/print prices are PER SHEET. Items are switched off rather
-- than deleted, so old sales stay correct.
-- =====================================================================

create table public.price_items (
  id          bigint generated always as identity primary key,
  item_group  text not null check (item_group in ('photocopy', 'printout', 'design')),
  name        text not null check (btrim(name) <> ''),
  paper_size  text check (paper_size in ('A4', 'A3', 'A5')),
  sides       text check (sides in ('one', 'two')),
  colour      text check (colour in ('bw', 'colour')),
  price       numeric(12,2) not null check (price >= 0),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  -- Make sure each group has exactly the details it needs:
  check (
       (item_group = 'photocopy' and paper_size is not null and sides is not null and colour is null)
    or (item_group = 'printout'  and paper_size is not null and sides is not null and colour is not null)
    or (item_group = 'design'    and paper_size is null and sides is null and colour is null)
  )
);

-- No two items with the same name, and no duplicate size/sides/colour combinations.
create unique index price_items_name_unique on public.price_items (lower(name));
create unique index price_items_combo_unique
  on public.price_items (item_group, paper_size, sides, coalesce(colour, ''))
  where item_group <> 'design';

-- Which stock each price list item uses, and how much per unit sold.
-- Example: "Photocopy A4 – one side" uses 1 sheet of "A4 paper".
create table public.price_item_stock (
  id              bigint generated always as identity primary key,
  price_item_id   bigint not null references public.price_items(id) on delete cascade,
  stock_item_id   bigint not null references public.stock_items(id),
  usage_per_unit  numeric(12,3) not null check (usage_per_unit > 0),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  unique (price_item_id, stock_item_id)
);


-- =====================================================================
-- PART 8. DISCOUNTS
-- ---------------------------------------------------------------------
-- Named discounts (fixed rupee amounts) managed by Owner and Manager.
-- =====================================================================

create table public.discounts (
  id          bigint generated always as identity primary key,
  name        text not null unique check (btrim(name) <> ''),
  amount      numeric(12,2) not null check (amount > 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);


-- =====================================================================
-- PART 9. SALES AND SALE LINES
-- ---------------------------------------------------------------------
-- A sale has a customer, a date, one or more lines, and a discount.
-- Subtotal and total are worked out by the database, never typed in:
--     line total = quantity × unit price
--     subtotal   = all line totals added up
--     total      = subtotal − discount
-- =====================================================================

create table public.sales (
  id               bigint generated always as identity primary key,
  sale_date        date not null default private.today(),
  customer_id      bigint not null references public.customers(id),
  discount_id      bigint references public.discounts(id),   -- a named discount, or empty
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  subtotal         numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);

create index sales_customer_idx on public.sales (customer_id);
create index sales_date_idx on public.sales (sale_date);

create table public.sale_items (
  id             bigint generated always as identity primary key,
  sale_id        bigint not null references public.sales(id) on delete cascade,
  price_item_id  bigint not null references public.price_items(id),
  description    text not null default '',
  quantity       integer not null check (quantity > 0),    -- number of sheets / items
  list_price     numeric(12,2) not null default 0,         -- price list price ON THE DAY OF SALE
  unit_price     numeric(12,2) not null check (unit_price >= 0),  -- price actually charged
  line_total     numeric(12,2) not null default 0,
  price_changed  boolean not null default false,           -- true if unit_price ≠ list_price
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

create index sale_items_sale_idx on public.sale_items (sale_id);

-- Can the logged-in person change this sale (and its lines)?
--   Owner / Manager: any sale.  Staff: only their own, only on the same day.
create function private.can_edit_sale(p_sale_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sales s
    where s.id = p_sale_id
      and (private.is_manager_or_owner() or private.is_mine_today(s.created_by, s.created_at))
  )
$$;

-- Before a sale is saved: handle the date, the discount and the totals.
create function private.sale_before_save() returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Staff sales are always dated today (no back-dating).
  if not private.is_manager_or_owner() then
    if tg_op = 'INSERT' then
      new.sale_date := private.today();
    else
      new.sale_date := old.sale_date;
    end if;
  end if;

  -- Discount
  if new.discount_id is not null then
    if tg_op = 'INSERT' or new.discount_id is distinct from old.discount_id then
      -- A named discount was chosen: copy its amount onto the sale.
      select amount into new.discount_amount
      from public.discounts where id = new.discount_id and active;
      if not found then
        raise exception 'That discount is not available.';
      end if;
    else
      -- Same named discount as before: keep the amount it had at the time.
      new.discount_amount := old.discount_amount;
    end if;
  elsif not private.is_manager_or_owner() then
    -- Only Owner / Manager may type a custom discount amount.
    if (tg_op = 'INSERT' and new.discount_amount <> 0)
       or (tg_op = 'UPDATE' and new.discount_amount is distinct from old.discount_amount) then
      raise exception 'Please choose a discount from the list.';
    end if;
  end if;

  -- Totals
  select coalesce(sum(line_total), 0) into new.subtotal
  from public.sale_items where sale_id = new.id;
  new.total := new.subtotal - new.discount_amount;
  return new;
end;
$$;

create trigger sales_before_save
  before insert or update on public.sales
  for each row execute function private.sale_before_save();

-- Before a sale line is saved: copy the list price, work out the line total,
-- and flag the line if the price charged is different from the price list.
create function private.sale_item_before_save() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_price  numeric(12,2);
  v_name   text;
  v_active boolean;
begin
  if tg_op = 'UPDATE' then
    new.sale_id := old.sale_id;   -- a line can't be moved to another sale
  end if;

  if tg_op = 'INSERT' or new.price_item_id is distinct from old.price_item_id then
    select price, name, active into v_price, v_name, v_active
    from public.price_items where id = new.price_item_id;
    if not found or not v_active then
      raise exception 'That price list item is not available.';
    end if;
    new.list_price := v_price;
    if coalesce(btrim(new.description), '') = '' then
      new.description := v_name;
    end if;
  else
    new.list_price := old.list_price;   -- keep the price from the day of the sale
  end if;

  if new.unit_price is null then
    new.unit_price := new.list_price;
  end if;
  new.line_total    := round(new.quantity * new.unit_price, 2);
  new.price_changed := new.unit_price <> new.list_price;
  return new;
end;
$$;

create trigger sale_items_before_save
  before insert or update on public.sale_items
  for each row execute function private.sale_item_before_save();

-- After a line is added, changed or removed: recalculate the sale's totals.
-- (Touching the sale makes its "before save" trigger above add up the lines again.)
create function private.sale_item_refresh_sale() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.sales set subtotal = subtotal
  where id = coalesce(new.sale_id, old.sale_id);
  return null;
end;
$$;

create trigger sale_items_refresh_sale
  after insert or update or delete on public.sale_items
  for each row execute function private.sale_item_refresh_sale();


-- =====================================================================
-- PART 10. PAYMENTS
-- ---------------------------------------------------------------------
-- Each payment belongs to a sale. Advances and later payments are just
-- more payments.  Owed = sale total − all payments.
-- =====================================================================

create table public.payments (
  id           bigint generated always as identity primary key,
  sale_id      bigint not null references public.sales(id) on delete cascade,
  paid_on      date not null default private.today(),
  amount       numeric(12,2) not null check (amount > 0),
  received_by  uuid not null references public.profiles(id),
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create index payments_sale_idx on public.payments (sale_id);
create index payments_paid_on_idx on public.payments (paid_on);

-- "Received by" is the person logged in. Staff payments are always dated today.
-- Owner / Manager may correct the date and who received it.
create function private.payment_before_save() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.received_by is null or not private.is_manager_or_owner() then
      new.received_by := auth.uid();
    end if;
    if not private.is_manager_or_owner() then
      new.paid_on := private.today();
    end if;
  else
    new.sale_id := old.sale_id;   -- a payment can't be moved to another sale
    if not private.is_manager_or_owner() then
      new.received_by := old.received_by;
      new.paid_on     := old.paid_on;
    end if;
  end if;
  return new;
end;
$$;

create trigger payments_before_save
  before insert or update on public.payments
  for each row execute function private.payment_before_save();


-- =====================================================================
-- PART 11. FINAL CHECKS ON A SALE
-- ---------------------------------------------------------------------
-- These checks wait until everything in one save is finished, then make sure:
--   * the sale has at least one line
--   * the discount is not bigger than the subtotal
--   * payments don't add up to more than the sale total
-- =====================================================================

create function private.check_sale() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale_id bigint;
  v_total   numeric(12,2);
  v_paid    numeric(12,2);
begin
  if tg_table_name = 'sales' then
    v_sale_id := new.id;
  else
    v_sale_id := new.sale_id;
  end if;

  select total into v_total from public.sales where id = v_sale_id;
  if not found then
    return null;   -- the sale was deleted; nothing to check
  end if;

  if not exists (select 1 from public.sale_items where sale_id = v_sale_id) then
    raise exception 'A sale must have at least one item.';
  end if;

  if v_total < 0 then
    raise exception 'The discount cannot be more than the sale amount.';
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments where sale_id = v_sale_id;
  if v_paid > v_total then
    raise exception 'Payments (Rs. %) cannot be more than the sale total (Rs. %).', v_paid, v_total;
  end if;

  return null;
end;
$$;

create constraint trigger sales_final_check
  after insert or update on public.sales
  deferrable initially deferred
  for each row execute function private.check_sale();

create constraint trigger payments_final_check
  after insert or update on public.payments
  deferrable initially deferred
  for each row execute function private.check_sale();


-- =====================================================================
-- PART 12. STOCK MOVEMENTS (AUTOMATIC + MANUAL)
-- ---------------------------------------------------------------------
-- Every change to stock is one row here, in the smallest unit:
--   'sale'       – made automatically from sale lines (minus)
--   'purchase'   – stock bought (plus)
--   'waste'      – spoiled / jammed paper etc. (minus)
--   'correction' – fixing a count (plus or minus)
-- Manual movements must have a note explaining why.
-- =====================================================================

create table public.stock_movements (
  id             bigint generated always as identity primary key,
  stock_item_id  bigint not null references public.stock_items(id),
  change         numeric(12,3) not null check (change <> 0),
  reason         text not null check (reason in ('sale', 'purchase', 'waste', 'correction')),
  sale_item_id   bigint references public.sale_items(id) on delete cascade,
  note           text,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  check ((reason = 'sale') = (sale_item_id is not null)),           -- only sales link to a sale line
  check (reason <> 'purchase' or change > 0),                       -- purchases add stock
  check (reason <> 'waste' or change < 0),                          -- waste removes stock
  check (reason = 'sale' or coalesce(btrim(note), '') <> '')        -- manual changes need a reason
);

create index stock_movements_item_idx on public.stock_movements (stock_item_id);
create index stock_movements_sale_item_idx on public.stock_movements (sale_item_id);

-- Keep the stock quantity up to date whenever a movement is added, changed or removed.
create function private.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.stock_items set quantity = quantity - old.change where id = old.stock_item_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.stock_items set quantity = quantity + new.change where id = new.stock_item_id;
  end if;
  return null;
end;
$$;

create trigger stock_movements_apply
  after insert or update or delete on public.stock_movements
  for each row execute function private.apply_stock_movement();

-- Sale lines use up stock automatically.
--   New line      → take the stock away.
--   Changed line  → put the old amount back, take the new amount away.
--   Removed line  → its stock movements are removed too (that's the
--                   "on delete cascade" above), which puts the stock back.
create function private.sale_item_stock() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.quantity = old.quantity and new.price_item_id = old.price_item_id then
      return null;   -- nothing that affects stock has changed
    end if;
    delete from public.stock_movements where sale_item_id = old.id;
  end if;

  insert into public.stock_movements (stock_item_id, change, reason, sale_item_id, note)
  select l.stock_item_id, -(new.quantity * l.usage_per_unit), 'sale', new.id, 'Sale #' || new.sale_id
  from public.price_item_stock l
  where l.price_item_id = new.price_item_id;

  return null;
end;
$$;

create trigger sale_items_stock
  after insert or update on public.sale_items
  for each row execute function private.sale_item_stock();


-- =====================================================================
-- PART 13. EXPENSES
-- =====================================================================

create table public.expense_categories (
  id          bigint generated always as identity primary key,
  name        text not null unique check (btrim(name) <> ''),
  archived    boolean not null default false,   -- "removed" categories that are already used are hidden
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table public.expenses (
  id            bigint generated always as identity primary key,
  expense_date  date not null default private.today(),
  category_id   bigint not null references public.expense_categories(id),
  amount        numeric(12,2) not null check (amount > 0),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

create index expenses_date_idx on public.expenses (expense_date);


-- =====================================================================
-- PART 14. ATTENDANCE
-- ---------------------------------------------------------------------
-- Everyone clocks themselves in and out (see clock_in / clock_out below);
-- the time is the database's clock, not typed in.
-- Owner / Manager can correct times.
-- =====================================================================

create table public.attendance (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id),
  work_date    date not null default private.today(),
  start_time   timestamptz not null default now(),
  finish_time  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  check (finish_time is null or finish_time > start_time)
);

create index attendance_user_date_idx on public.attendance (user_id, work_date);


-- =====================================================================
-- PART 15. SWITCH ON THE AUTOMATIC ACTIONS FOR EVERY TABLE
-- ---------------------------------------------------------------------
-- For each main table: fill in "who and when", and write to the Activity Log.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'customers', 'stock_items', 'price_items', 'price_item_stock',
    'discounts', 'sales', 'sale_items', 'payments', 'stock_movements',
    'expense_categories', 'expenses', 'attendance'
  ] loop
    execute format(
      'create trigger %1$s_audit before insert or update on public.%1$I
         for each row execute function private.set_audit_fields()', t);
    execute format(
      'create trigger %1$s_log after insert or update or delete on public.%1$I
         for each row execute function private.log_change()', t);
  end loop;
end;
$$;


-- =====================================================================
-- PART 16. READY-MADE SUMMARIES (VIEWS)
-- ---------------------------------------------------------------------
-- A view is a saved question; its answer is always up to date.
-- "security_invoker" means the normal access rules still apply.
-- =====================================================================

-- Each sale with how much is paid, how much is owed, and its status.
create view public.sale_summary with (security_invoker = true) as
select
  s.*,
  coalesce(p.paid, 0)                as paid,
  s.total - coalesce(p.paid, 0)      as owed,
  case
    when s.total - coalesce(p.paid, 0) <= 0 then 'Paid'
    when coalesce(p.paid, 0) > 0            then 'Part paid'
    else 'Unpaid'
  end                                as status
from public.sales s
left join (
  select sale_id, sum(amount) as paid from public.payments group by sale_id
) p on p.sale_id = s.id;

-- Each customer with billed, paid, owed, number of sales and last visit.
create view public.customer_summary with (security_invoker = true) as
select
  c.id, c.name, c.phone, c.is_walk_in,
  coalesce(s.billed, 0)                          as billed,
  coalesce(p.paid, 0)                            as paid,
  coalesce(s.billed, 0) - coalesce(p.paid, 0)    as owed,
  coalesce(s.sale_count, 0)                      as sale_count,
  s.last_visit
from public.customers c
left join (
  select customer_id, sum(total) as billed, count(*) as sale_count, max(sale_date) as last_visit
  from public.sales group by customer_id
) s on s.customer_id = c.id
left join (
  select sa.customer_id, sum(pa.amount) as paid
  from public.payments pa join public.sales sa on sa.id = pa.sale_id
  group by sa.customer_id
) p on p.customer_id = c.id;


-- =====================================================================
-- PART 17. FUNCTIONS THE WEBSITE CALLS
-- =====================================================================

-- Which screens should the menu show for the person logged in?
-- Returns a list of screen names (never the role itself).
create function public.my_menu() returns text[]
language sql stable security definer set search_path = ''
as $$
  select case private.my_role()
    when 'owner'   then array['dashboard','sales','customers','attendance','expenses',
                              'inventory','price_list','settings','users','activity','backup']
    when 'manager' then array['dashboard','sales','customers','attendance','expenses',
                              'inventory','price_list','settings']
    when 'staff'   then array['sales','customers','attendance']
    else array[]::text[]
  end
$$;

-- Save a sale and all its lines in ONE go (so it's never half-saved).
--   p_sale  : {"id": null or number, "sale_date", "customer_id", "discount_id",
--              "discount_amount", "note"}
--   p_items : [{"id": null or number, "price_item_id", "description",
--               "quantity", "unit_price"}, ...]
-- Lines that are no longer in the list are removed. Returns the sale id.
-- This runs with the logged-in person's own permissions.
create function public.save_sale(p_sale jsonb, p_items jsonb) returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id    bigint := (p_sale ->> 'id')::bigint;
  v_keep  bigint[];
  v_item  jsonb;
begin
  if v_id is null then
    insert into public.sales (sale_date, customer_id, discount_id, discount_amount, note)
    values (
      coalesce((p_sale ->> 'sale_date')::date, private.today()),
      (p_sale ->> 'customer_id')::bigint,
      (p_sale ->> 'discount_id')::bigint,
      coalesce((p_sale ->> 'discount_amount')::numeric, 0),
      p_sale ->> 'note'
    )
    returning id into v_id;
  else
    update public.sales set
      sale_date       = coalesce((p_sale ->> 'sale_date')::date, sale_date),
      customer_id     = (p_sale ->> 'customer_id')::bigint,
      discount_id     = (p_sale ->> 'discount_id')::bigint,
      discount_amount = coalesce((p_sale ->> 'discount_amount')::numeric, 0),
      note            = p_sale ->> 'note'
    where id = v_id;
    if not found then
      raise exception 'This sale can no longer be changed.';
    end if;

    -- Remove lines that were taken out of the sale.
    v_keep := array(
      select (x ->> 'id')::bigint
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
      where x ->> 'id' is not null
    );
    delete from public.sale_items where sale_id = v_id and id <> all (v_keep);
  end if;

  -- Add new lines and update existing ones.
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if v_item ->> 'id' is null then
      insert into public.sale_items (sale_id, price_item_id, description, quantity, unit_price)
      values (
        v_id,
        (v_item ->> 'price_item_id')::bigint,
        coalesce(v_item ->> 'description', ''),
        (v_item ->> 'quantity')::integer,
        (v_item ->> 'unit_price')::numeric
      );
    else
      update public.sale_items set
        price_item_id = (v_item ->> 'price_item_id')::bigint,
        description   = coalesce(v_item ->> 'description', description),
        quantity      = (v_item ->> 'quantity')::integer,
        unit_price    = (v_item ->> 'unit_price')::numeric
      where id = (v_item ->> 'id')::bigint and sale_id = v_id;
      if not found then
        raise exception 'A line on this sale could not be found.';
      end if;
    end if;
  end loop;

  return v_id;
end;
$$;

-- Clock in: starts a new attendance record at the current time.
--   * Still clocked in from TODAY  → refused ("You are already clocked in.").
--   * Still clocked in from an EARLIER day (forgot to clock out) → that old
--     record is kept exactly as it is, but its note is marked
--     "Forgot to clock out - needs correction" so the Owner/Manager can fix
--     the finish time. Then the person is clocked in for today as normal.
create function public.clock_in() returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  r      public.attendance;
  v_flag constant text := 'Forgot to clock out - needs correction';
begin
  if not private.is_active_user() then
    raise exception 'Your account is not active.';
  end if;

  -- Already clocked in today and not clocked out yet?
  if exists (select 1 from public.attendance
             where user_id = auth.uid()
               and finish_time is null
               and work_date = private.today()) then
    raise exception 'You are already clocked in.';
  end if;

  -- Mark any open records from earlier days (only once each; times are not touched).
  update public.attendance
  set note = case
               when coalesce(btrim(note), '') = '' then v_flag
               else note || ' | ' || v_flag
             end
  where user_id = auth.uid()
    and finish_time is null
    and work_date < private.today()
    and position(v_flag in coalesce(note, '')) = 0;

  insert into public.attendance (user_id) values (auth.uid()) returning * into r;
  return r;
end;
$$;

-- Clock out: finishes your latest open attendance record at the current time.
--   * No open record                        → refused ("You are not clocked in.").
--   * Latest open record started more than
--     16 hours ago (forgot to clock out)    → refused; a manager must correct it.
--     This stops a forgotten record from being closed with a wrong, very long shift.
create function public.clock_out() returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  r public.attendance;
begin
  if not private.is_active_user() then
    raise exception 'Your account is not active.';
  end if;

  -- Find your latest open record.
  select * into r
  from public.attendance
  where user_id = auth.uid() and finish_time is null
  order by start_time desc
  limit 1;

  if not found then
    raise exception 'You are not clocked in.';
  end if;

  if r.start_time < now() - interval '16 hours' then
    raise exception 'Your last clock-in was too long ago. Please ask a manager to correct it.';
  end if;

  update public.attendance set finish_time = now()
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- Dashboard figures for one month (Owner / Manager only; others get nothing).
create function public.dashboard(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  d1 date;
  d2 date;
  v_billed   numeric(12,2);
  v_received numeric(12,2);
  v_expenses numeric(12,2);
  v_owed     numeric(12,2);
  v_low      integer;
begin
  if not private.is_manager_or_owner() then
    return null;
  end if;

  d1 := date_trunc('month', coalesce(p_month, private.today()))::date;
  d2 := (d1 + interval '1 month')::date;

  select coalesce(sum(total), 0)  into v_billed   from public.sales    where sale_date    >= d1 and sale_date    < d2;
  select coalesce(sum(amount), 0) into v_received from public.payments where paid_on      >= d1 and paid_on      < d2;
  select coalesce(sum(amount), 0) into v_expenses from public.expenses where expense_date >= d1 and expense_date < d2;
  select coalesce(sum(owed), 0)   into v_owed     from public.sale_summary;
  select count(*) into v_low from public.stock_items where active and quantity <= low_stock_level;

  return jsonb_build_object(
    'month',            d1,
    'billed',           v_billed,
    'received',         v_received,
    'expenses',         v_expenses,
    'profit_billed',    v_billed - v_expenses,     -- "Profit on bills"
    'profit_received',  v_received - v_expenses,   -- "Profit on cash received"
    'owed',             v_owed,                    -- all money still owed (any month)
    'low_stock_items',  v_low
  );
end;
$$;

-- Users screen (Owner only): everyone's name, email, role, active and last sign-in.
create function public.list_users()
returns table (id uuid, email text, full_name text, role text, active boolean,
               last_sign_in_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_owner() then
    return;   -- not the owner: return an empty list
  end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.active, u.last_sign_in_at, u.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.full_name;
end;
$$;

-- Only logged-in users may call these functions.
revoke execute on function public.my_menu()                  from public, anon;
revoke execute on function public.save_sale(jsonb, jsonb)    from public, anon;
revoke execute on function public.clock_in()                 from public, anon;
revoke execute on function public.clock_out()                from public, anon;
revoke execute on function public.dashboard(date)            from public, anon;
revoke execute on function public.list_users()               from public, anon;
grant  execute on function public.my_menu()                  to authenticated;
grant  execute on function public.save_sale(jsonb, jsonb)    to authenticated;
grant  execute on function public.clock_in()                 to authenticated;
grant  execute on function public.clock_out()                to authenticated;
grant  execute on function public.dashboard(date)            to authenticated;
grant  execute on function public.list_users()               to authenticated;


-- =====================================================================
-- PART 18. BASIC ACCESS
-- ---------------------------------------------------------------------
-- People who are NOT logged in ("anon") get nothing at all.
-- Logged-in people get basic access, which the rules in PART 19 then narrow down.
-- A few columns are locked so they can only be changed by the database itself.
-- =====================================================================

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Profiles: everyone can see names, but NOT roles (only the Owner sees roles,
-- through list_users). New profiles are only made automatically.
revoke all on public.profiles from authenticated;
grant select (id, full_name, active) on public.profiles to authenticated;
grant update (full_name, role, active) on public.profiles to authenticated;

-- Stock quantity can only change through stock movements.
revoke all on public.stock_items from authenticated;
grant select, delete on public.stock_items to authenticated;
grant insert (name, base_unit, pack_unit, pack_size, low_stock_level, active, icon) on public.stock_items to authenticated;
grant update (name, base_unit, pack_unit, pack_size, low_stock_level, active, icon) on public.stock_items to authenticated;

-- Stock movements can be added or removed, never edited (add a correction instead).
revoke update on public.stock_movements from authenticated;

-- The Activity Log can only be read; only the database writes to it.
revoke insert, update, delete on public.activity_log from authenticated;

-- Summaries are read-only.
revoke insert, update, delete on public.sale_summary, public.customer_summary from authenticated;


-- =====================================================================
-- PART 19. WHO MAY DO WHAT (ROW LEVEL SECURITY)
-- ---------------------------------------------------------------------
-- RLS is switched on for every table. With RLS on, NOTHING is allowed
-- unless a policy below allows it.
-- =====================================================================

alter table public.profiles            enable row level security;
alter table public.activity_log        enable row level security;
alter table public.customers           enable row level security;
alter table public.stock_items         enable row level security;
alter table public.price_items         enable row level security;
alter table public.price_item_stock    enable row level security;
alter table public.discounts           enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.payments            enable row level security;
alter table public.stock_movements     enable row level security;
alter table public.expense_categories  enable row level security;
alter table public.expenses            enable row level security;
alter table public.attendance          enable row level security;

-- PROFILES: everyone active can see names; only the Owner can change them.
create policy "profiles: active users read" on public.profiles
  for select to authenticated using (private.is_active_user() or id = auth.uid());
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (private.is_owner()) with check (private.is_owner());

-- ACTIVITY LOG: Owner reads only.
create policy "activity_log: owner reads" on public.activity_log
  for select to authenticated using (private.is_owner());

-- CUSTOMERS: everyone active can see, add and edit; Owner/Manager delete.
create policy "customers: active users read" on public.customers
  for select to authenticated using (private.is_active_user());
create policy "customers: active users add" on public.customers
  for insert to authenticated with check (private.is_active_user());
create policy "customers: active users edit" on public.customers
  for update to authenticated using (private.is_active_user()) with check (private.is_active_user());
create policy "customers: managers delete" on public.customers
  for delete to authenticated using (private.is_manager_or_owner());

-- STOCK ITEMS: Owner/Manager only.
create policy "stock_items: managers all" on public.stock_items
  for all to authenticated using (private.is_manager_or_owner()) with check (private.is_manager_or_owner());

-- PRICE LIST: everyone active can read (needed to make sales); Owner/Manager change.
create policy "price_items: active users read" on public.price_items
  for select to authenticated using (private.is_active_user());
create policy "price_items: managers add" on public.price_items
  for insert to authenticated with check (private.is_manager_or_owner());
create policy "price_items: managers edit" on public.price_items
  for update to authenticated using (private.is_manager_or_owner()) with check (private.is_manager_or_owner());
create policy "price_items: managers delete" on public.price_items
  for delete to authenticated using (private.is_manager_or_owner());

-- PRICE ITEM ↔ STOCK LINKS: Owner/Manager only.
create policy "price_item_stock: managers all" on public.price_item_stock
  for all to authenticated using (private.is_manager_or_owner()) with check (private.is_manager_or_owner());

-- DISCOUNTS: everyone active can read (to choose one); Owner/Manager change.
create policy "discounts: active users read" on public.discounts
  for select to authenticated using (private.is_active_user());
create policy "discounts: managers add" on public.discounts
  for insert to authenticated with check (private.is_manager_or_owner());
create policy "discounts: managers edit" on public.discounts
  for update to authenticated using (private.is_manager_or_owner()) with check (private.is_manager_or_owner());
create policy "discounts: managers delete" on public.discounts
  for delete to authenticated using (private.is_manager_or_owner());

-- SALES: everyone active can see and add. Editing: Owner/Manager any sale,
-- Staff only their own on the same day. Deleting: Owner/Manager.
create policy "sales: active users read" on public.sales
  for select to authenticated using (private.is_active_user());
create policy "sales: active users add" on public.sales
  for insert to authenticated with check (private.is_active_user());
create policy "sales: edit allowed sales" on public.sales
  for update to authenticated
  using (private.is_manager_or_owner() or private.is_mine_today(created_by, created_at))
  with check (private.is_manager_or_owner() or private.is_mine_today(created_by, created_at));
create policy "sales: managers delete" on public.sales
  for delete to authenticated using (private.is_manager_or_owner());

-- SALE LINES: readable by everyone active; changeable when the sale is changeable.
create policy "sale_items: active users read" on public.sale_items
  for select to authenticated using (private.is_active_user());
create policy "sale_items: add to editable sale" on public.sale_items
  for insert to authenticated with check (private.can_edit_sale(sale_id));
create policy "sale_items: edit on editable sale" on public.sale_items
  for update to authenticated using (private.can_edit_sale(sale_id)) with check (private.can_edit_sale(sale_id));
create policy "sale_items: remove from editable sale" on public.sale_items
  for delete to authenticated using (private.can_edit_sale(sale_id));

-- PAYMENTS: everyone active can see and add. Editing: Owner/Manager any,
-- Staff only their own on the same day. Deleting: Owner/Manager.
create policy "payments: active users read" on public.payments
  for select to authenticated using (private.is_active_user());
create policy "payments: active users add" on public.payments
  for insert to authenticated with check (private.is_active_user());
create policy "payments: edit allowed payments" on public.payments
  for update to authenticated
  using (private.is_manager_or_owner() or private.is_mine_today(created_by, created_at))
  with check (private.is_manager_or_owner() or private.is_mine_today(created_by, created_at));
create policy "payments: managers delete" on public.payments
  for delete to authenticated using (private.is_manager_or_owner());

-- STOCK MOVEMENTS: Owner/Manager see them and add/remove MANUAL ones.
-- Sale movements are made and removed only by the database.
create policy "stock_movements: managers read" on public.stock_movements
  for select to authenticated using (private.is_manager_or_owner());
create policy "stock_movements: managers add manual" on public.stock_movements
  for insert to authenticated with check (private.is_manager_or_owner() and reason <> 'sale');
create policy "stock_movements: managers remove manual" on public.stock_movements
  for delete to authenticated using (private.is_manager_or_owner() and reason <> 'sale');

-- EXPENSES AND EXPENSE CATEGORIES: Owner/Manager only.
create policy "expense_categories: managers all" on public.expense_categories
  for all to authenticated using (private.is_manager_or_owner()) with check (private.is_manager_or_owner());
create policy "expenses: managers all" on public.expenses
  for all to authenticated using (private.is_manager_or_owner()) with check (private.is_manager_or_owner());

-- ATTENDANCE: each person sees their own; Owner/Manager see and correct everyone's.
-- (Clocking in/out goes through clock_in / clock_out, not these rules.)
create policy "attendance: read own or managers read all" on public.attendance
  for select to authenticated
  using (private.is_manager_or_owner() or (private.is_active_user() and user_id = auth.uid()));
create policy "attendance: managers add" on public.attendance
  for insert to authenticated with check (private.is_manager_or_owner());
create policy "attendance: managers correct" on public.attendance
  for update to authenticated using (private.is_manager_or_owner()) with check (private.is_manager_or_owner());
create policy "attendance: managers delete" on public.attendance
  for delete to authenticated using (private.is_manager_or_owner());


-- =====================================================================
-- PART 20. STARTING DATA
-- =====================================================================

-- The built-in walk-in customer.
insert into public.customers (name, is_walk_in) values ('One-time customer', true);

-- Expense categories.
insert into public.expense_categories (name, sort_order) values
  ('Paper', 1), ('Ink', 2), ('Rent', 3), ('Electricity', 4),
  ('Water', 5), ('Transport', 6), ('Personal Expenses', 7);

-- A4 paper, counted in sheets; 1 ream = 500 sheets. Warn below 1 ream.
-- (Starts at 0 – add your current stock as a "purchase" or "correction".)
insert into public.stock_items (name, base_unit, pack_unit, pack_size, low_stock_level, icon)
values ('A4 paper', 'sheet', 'ream', 500, 500, 'file');

-- A4 prices (per sheet). A3/A5 will be added later in the Price List screen.
insert into public.price_items (item_group, name, paper_size, sides, colour, price, sort_order) values
  ('photocopy', 'Photocopy A4 – one side',          'A4', 'one', null,     20,  1),
  ('photocopy', 'Photocopy A4 – both sides',        'A4', 'two', null,     20,  2),
  ('printout',  'Printout A4 B&W – one side',       'A4', 'one', 'bw',     20,  3),
  ('printout',  'Printout A4 B&W – both sides',     'A4', 'two', 'bw',     20,  4),
  ('printout',  'Printout A4 Colour – one side',    'A4', 'one', 'colour', 50,  5),
  ('printout',  'Printout A4 Colour – both sides',  'A4', 'two', 'colour', 100, 6);

-- Graphic design items: switched OFF at Rs. 0 until you enter your real prices.
insert into public.price_items (item_group, name, price, active, sort_order) values
  ('design', 'CV - 1 page',              0, false, 10),
  ('design', 'CV - 3 pages',             0, false, 11),
  ('design', 'Social Media Post Design', 0, false, 12),
  ('design', 'Flyer Design',             0, false, 13),
  ('design', 'Type Setting',             0, false, 14);

-- Every A4 copy/print sheet sold uses exactly 1 sheet of A4 paper.
insert into public.price_item_stock (price_item_id, stock_item_id, usage_per_unit)
select p.id, s.id, 1
from public.price_items p
cross join public.stock_items s
where p.paper_size = 'A4' and s.name = 'A4 paper';

-- If any logins were created BEFORE this file was run, give them profiles now
-- (the oldest login becomes the Owner if there is no Owner yet).
insert into public.profiles (id, full_name, role, active)
select
  u.id,
  split_part(u.email, '@', 1),
  case when row_number() over (order by u.created_at) = 1
        and not exists (select 1 from public.profiles where role = 'owner')
       then 'owner' else 'staff' end,
  row_number() over (order by u.created_at) = 1
    and not exists (select 1 from public.profiles where role = 'owner')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

commit;

-- =====================================================================
-- DONE. Next: create your owner login (see the instructions you were given).
-- =====================================================================
