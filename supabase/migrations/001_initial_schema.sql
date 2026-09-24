create extension if not exists pgcrypto;

create table companies (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table profiles (id uuid primary key references auth.users(id) on delete cascade, company_id uuid references companies(id), full_name text, role text not null default 'estimator' check(role in ('owner','admin','estimator','project_manager','foreman','read_only')), created_at timestamptz not null default now());

create table projects (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), project_number text, name text not null, owner_name text, location text, bid_date date, status text not null default 'estimating', created_at timestamptz not null default now());
create index projects_company_idx on projects(company_id);

create table njdot_items (id uuid primary key default gen_random_uuid(), item_number text not null, description text not null, unit text not null, spec_section text, active boolean not null default true, unique(item_number));
create table njdot_bid_price_history (id uuid primary key default gen_random_uuid(), njdot_item_id uuid not null references njdot_items(id), bid_date date not null, project_reference text, contractor text, quantity numeric, unit_price numeric not null, created_at timestamptz not null default now());

create table suppliers (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), name text not null, contact_name text, phone text, email text, address text, notes text, active boolean not null default true, created_at timestamptz not null default now());
create table materials (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), material_code text, description text not null, category text, default_unit text not null, manufacturer text, notes text, active boolean not null default true, created_at timestamptz not null default now());
create table supplier_materials (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), supplier_id uuid not null references suppliers(id), material_id uuid not null references materials(id), supplier_sku text, unique(supplier_id,material_id));
create table material_price_history (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), material_id uuid not null references materials(id), supplier_id uuid references suppliers(id), unit_cost numeric(14,4) not null, unit text not null, effective_date date not null, expiration_date date, freight_cost numeric(14,4) default 0, source text, quote_reference text, entered_by uuid references profiles(id), created_at timestamptz not null default now());
create index material_price_history_lookup on material_price_history(company_id,material_id,effective_date desc);

create table labor_resources (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), name text not null, base_rate numeric(12,2) not null default 0, burden_rate numeric(12,2) not null default 0, effective_date date not null default current_date, active boolean not null default true);
create table equipment_resources (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), name text not null, equipment_code text, ownership_rate numeric(12,2) not null default 0, operating_rate numeric(12,2) not null default 0, effective_date date not null default current_date, active boolean not null default true);
create table trucking_resources (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), name text not null, unit text not null default 'HR', rate numeric(12,2) not null default 0, effective_date date not null default current_date, active boolean not null default true);

create table estimates (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), project_id uuid not null references projects(id), name text not null default 'Base Estimate', version integer not null default 1, status text not null default 'draft', overhead_pct numeric(8,4) not null default 0, profit_pct numeric(8,4) not null default 0, contingency_pct numeric(8,4) not null default 0, locked_at timestamptz, created_at timestamptz not null default now());
create table estimate_items (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), estimate_id uuid not null references estimates(id) on delete cascade, njdot_item_id uuid references njdot_items(id), item_number_snapshot text not null, description_snapshot text not null, unit_snapshot text not null, quantity numeric(14,3) not null default 0, direct_cost numeric(14,2) not null default 0, bid_unit_price numeric(14,4) not null default 0, sort_order integer not null default 0);

create type resource_type as enum ('labor','equipment','material','trucking','subcontractor');
create table estimate_item_resources (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), estimate_item_id uuid not null references estimate_items(id) on delete cascade, resource_type resource_type not null, resource_id uuid, description_snapshot text not null, supplier_snapshot text, quantity numeric(14,4) not null default 0, unit_snapshot text not null, unit_cost_snapshot numeric(14,4) not null default 0, waste_pct numeric(8,4) not null default 0, extended_cost numeric(14,2) not null default 0, created_at timestamptz not null default now());

create table daily_reports (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), project_id uuid not null references projects(id), report_date date not null, foreman_id uuid references profiles(id), weather text, notes text, submitted_at timestamptz, created_at timestamptz not null default now());
create table daily_production (id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), daily_report_id uuid not null references daily_reports(id) on delete cascade, estimate_item_id uuid references estimate_items(id), quantity numeric(14,3) not null, unit text not null, notes text);

-- Basic tenant isolation helper. More granular policies can be added as modules are activated.
alter table companies enable row level security;
alter table profiles enable row level security;
alter table projects enable row level security;
alter table suppliers enable row level security;
alter table materials enable row level security;
alter table supplier_materials enable row level security;
alter table material_price_history enable row level security;
alter table estimates enable row level security;
alter table estimate_items enable row level security;
alter table estimate_item_resources enable row level security;
alter table daily_reports enable row level security;
alter table daily_production enable row level security;
