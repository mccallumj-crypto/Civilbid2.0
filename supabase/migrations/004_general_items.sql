-- CivilBid 2.0 - Migration 004
-- Generalize NJDOT-only bid items into a universal Items library.

alter table public.njdot_bid_items rename to items;
alter table public.items add column company_id uuid references public.companies(id) on delete cascade;
alter table public.items add column source_type text not null default 'NJDOT';
alter table public.items add column source_name text;
alter table public.items add column custom_item boolean not null default false;

update public.items
set source_type = 'NJDOT', source_name = 'New Jersey Department of Transportation', custom_item = false
where company_id is null;

alter table public.njdot_bid_price_history rename to item_bid_price_history;
alter table public.item_bid_price_history rename column njdot_bid_item_id to item_id;

alter table public.estimate_items rename column njdot_bid_item_id to item_id;

create index if not exists idx_items_company on public.items(company_id);
create index if not exists idx_items_source on public.items(source_type);

-- Replace the old global NJDOT read policy. Global agency items are visible to
-- authenticated users; company-created items stay inside their company.
drop policy if exists "authenticated_read_njdot_items" on public.items;
create policy "items_read"
on public.items
for select
to authenticated
using (
  company_id is null
  or company_id = public.current_company_id()
);

-- Add explicit item permissions to the permission system.
insert into public.permissions(permission_key, name, category, description)
values
('items.view', 'View Items', 'Items', 'View agency and company bid items'),
('items.manage', 'Manage Items', 'Items', 'Create and modify company bid items')
on conflict (permission_key) do nothing;

insert into public.role_permissions(role, permission_key)
values
('owner','items.view'),('owner','items.manage'),
('admin','items.view'),('admin','items.manage'),
('estimator','items.view'),('estimator','items.manage'),
('project_manager','items.view'),
('foreman','items.view'),
('read_only','items.view')
on conflict (role, permission_key) do update set allowed = excluded.allowed;

create policy "items_insert"
on public.items
for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and custom_item = true
  and public.has_permission('items.manage')
);

create policy "items_update"
on public.items
for update
to authenticated
using (
  company_id = public.current_company_id()
  and public.has_permission('items.manage')
)
with check (
  company_id = public.current_company_id()
  and public.has_permission('items.manage')
);

create policy "items_delete"
on public.items
for delete
to authenticated
using (
  company_id = public.current_company_id()
  and public.has_permission('items.manage')
);

-- Existing NJDOT historical pricing remains global reference data under its
-- generalized table name. Company-specific bid history can be added later.
