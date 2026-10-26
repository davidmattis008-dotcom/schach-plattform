create table if not exists public.cage_ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null check (memory_type in (
    'training_goal',
    'playing_strength',
    'weakness',
    'training_preference',
    'progress',
    'personal_preference',
    'conversation_summary'
  )),
  content text not null check (
    char_length(btrim(content)) between 3 and 600
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cage_ai_memories_user_recent_idx
  on public.cage_ai_memories (user_id, updated_at desc);

create unique index if not exists cage_ai_memories_user_content_idx
  on public.cage_ai_memories (user_id, memory_type, lower(btrim(content)));

alter table public.cage_ai_memories enable row level security;
revoke all on public.cage_ai_memories from public, anon;
grant select, insert, delete on public.cage_ai_memories to authenticated;

create policy "Users can read their own CageAI memories"
  on public.cage_ai_memories
  for select
  to authenticated
  using (user_id = (select auth.uid()) and public.has_site_access());

create policy "Users can create their own CageAI memories"
  on public.cage_ai_memories
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.has_site_access());

create policy "Users can delete their own CageAI memories"
  on public.cage_ai_memories
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and public.has_site_access());

create or replace function public.enforce_cage_ai_memory_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_memory_count integer;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Eigene CageAI-Erinnerungen erforderlich';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  select count(*) into v_memory_count
  from public.cage_ai_memories
  where user_id = new.user_id;

  if v_memory_count >= 100 then
    raise exception using errcode = 'P0001', message = 'CageAI-Speicher ist voll';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_cage_ai_memory_limit() from public, anon, authenticated;

create trigger enforce_cage_ai_memory_limit
  before insert on public.cage_ai_memories
  for each row execute function public.enforce_cage_ai_memory_limit();
