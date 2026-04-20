-- Dataset schema v1 (admin-only, includes images via Supabase Storage references)
-- Apply via Supabase SQL editor or: supabase db push

-- ── Helpers ────────────────────────────────────────────────────────────────
create or replace function public.dph_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- ── Core dataset entry ─────────────────────────────────────────────────────
create table if not exists public.dataset_entries (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  url text not null,
  timestamp_ms bigint not null,
  status text not null check (status in ('raw','auto','verified')),

  page_title text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb
);

create index if not exists dataset_entries_updated_at_idx
  on public.dataset_entries (updated_at desc);

-- ── Assets (Storage object registry) ───────────────────────────────────────
create table if not exists public.dataset_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  kind text not null check (kind in ('entry_thumbnail','viewport_screenshot','pattern_crop','dom_dump')),
  bucket text not null,
  path text not null,
  mime_type text,
  byte_size bigint,
  sha256 text
);

create unique index if not exists dataset_assets_bucket_path_uidx
  on public.dataset_assets (bucket, path);

-- ── Per-viewport captures ──────────────────────────────────────────────────
create table if not exists public.dataset_viewports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  entry_id text not null references public.dataset_entries (id) on delete cascade,
  viewport_index integer not null check (viewport_index >= 0),
  scroll_y numeric not null,
  viewport_width integer not null,
  viewport_height integer not null,
  device_pixel_ratio numeric not null default 1,
  step_label text,
  phase text not null check (phase in ('scan','interact')),

  screenshot_asset_id uuid references public.dataset_assets (id) on delete set null
);

create unique index if not exists dataset_viewports_entry_idx_uidx
  on public.dataset_viewports (entry_id, viewport_index);

-- ── Labels (auto + verified) ───────────────────────────────────────────────
create table if not exists public.dataset_labels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  entry_id text not null references public.dataset_entries (id) on delete cascade,
  viewport_index integer,

  source text not null check (source in ('auto','verified')),
  accepted boolean not null default false,

  category text not null,
  severity text,
  confidence numeric,
  bbox_xywh jsonb, -- {x,y,width,height} in viewport image pixel space
  bbox_source text check (bbox_source in ('dom','vlm')),
  model text,

  location text,
  description text,
  evidence text,
  notes text,

  crop_asset_id uuid references public.dataset_assets (id) on delete set null
);

create index if not exists dataset_labels_entry_idx
  on public.dataset_labels (entry_id);

create index if not exists dataset_labels_entry_viewport_idx
  on public.dataset_labels (entry_id, viewport_index);

-- ── RLS: admin-only for all dataset tables ─────────────────────────────────
alter table public.dataset_entries enable row level security;
alter table public.dataset_assets enable row level security;
alter table public.dataset_viewports enable row level security;
alter table public.dataset_labels enable row level security;

drop policy if exists dataset_entries_admin_all on public.dataset_entries;
create policy dataset_entries_admin_all
  on public.dataset_entries
  for all
  to authenticated
  using (public.dph_is_admin())
  with check (public.dph_is_admin());

drop policy if exists dataset_assets_admin_all on public.dataset_assets;
create policy dataset_assets_admin_all
  on public.dataset_assets
  for all
  to authenticated
  using (public.dph_is_admin())
  with check (public.dph_is_admin());

drop policy if exists dataset_viewports_admin_all on public.dataset_viewports;
create policy dataset_viewports_admin_all
  on public.dataset_viewports
  for all
  to authenticated
  using (public.dph_is_admin())
  with check (public.dph_is_admin());

drop policy if exists dataset_labels_admin_all on public.dataset_labels;
create policy dataset_labels_admin_all
  on public.dataset_labels
  for all
  to authenticated
  using (public.dph_is_admin())
  with check (public.dph_is_admin());

-- Note: Supabase Storage bucket policies must also be configured in Dashboard:
-- - Create bucket: dph-dataset
-- - Allow read/write only for admins (based on JWT app_metadata.role)

