-- Dataset rows synced from the Chrome extension (payload without large base64 images by default).
-- Apply in Supabase SQL editor or via: supabase db push (after link)

create table if not exists public.dph_dataset_entries (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  url text,
  timestamp_ms bigint,
  status text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists dph_dataset_entries_user_id_idx
  on public.dph_dataset_entries (user_id);

create index if not exists dph_dataset_entries_updated_at_idx
  on public.dph_dataset_entries (updated_at desc);

alter table public.dph_dataset_entries enable row level security;

create policy "dph_dataset_entries_select_own"
  on public.dph_dataset_entries for select
  to authenticated
  using (auth.uid() = user_id);

create policy "dph_dataset_entries_insert_own"
  on public.dph_dataset_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "dph_dataset_entries_update_own"
  on public.dph_dataset_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dph_dataset_entries_delete_own"
  on public.dph_dataset_entries for delete
  to authenticated
  using (auth.uid() = user_id);
