create table public.chess_club_news (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.chess_clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.chess_club_messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.chess_clubs(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index chess_club_news_club_created_idx
  on public.chess_club_news (club_id, created_at desc);
create index chess_club_messages_club_created_idx
  on public.chess_club_messages (club_id, created_at desc);
create index chess_club_messages_sender_created_idx
  on public.chess_club_messages (sender_id, created_at desc);

alter table public.chess_club_news enable row level security;
alter table public.chess_club_messages enable row level security;
revoke all on public.chess_club_news, public.chess_club_messages from public, anon, authenticated;

create or replace function public.list_my_chess_club_news(p_club_id uuid)
returns table (id uuid, title text, body text, username text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  if not exists (
    select 1 from public.chess_club_members m
    where m.club_id = p_club_id and m.user_id = auth.uid()
  ) then raise exception using errcode = '42501', message = 'Nur Vereinsmitglieder können Neuigkeiten lesen'; end if;

  return query
  select n.id, n.title, n.body, p.username, n.created_at
  from public.chess_club_news n
  join public.profiles p on p.id = n.author_id
  where n.club_id = p_club_id
  order by n.created_at desc
  limit 50;
end;
$$;

create or replace function public.publish_chess_club_news(p_club_id uuid, p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'Der Titel muss 1 bis 120 Zeichen lang sein'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'Der Text muss 1 bis 2000 Zeichen lang sein'; end if;
  if not exists (
    select 1
    from public.chess_club_members m
    where m.club_id = p_club_id
      and m.user_id = v_actor
      and (
        m.role in ('owner', 'trainer')
        or exists (
          select 1
          from public.chess_club_groups g
          join public.chess_club_group_members gm on gm.group_id = g.id
          where g.club_id = p_club_id and gm.user_id = v_actor and gm.role = 'trainer'
        )
      )
  ) then raise exception using errcode = '42501', message = 'Nur Trainer können Neuigkeiten veröffentlichen'; end if;

  insert into public.chess_club_news (club_id, author_id, title, body)
  values (p_club_id, v_actor, trim(p_title), trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_my_chess_club_messages(p_club_id uuid)
returns table (id uuid, sender_id uuid, username text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  if not exists (
    select 1 from public.chess_club_members m
    where m.club_id = p_club_id and m.user_id = auth.uid()
  ) then raise exception using errcode = '42501', message = 'Nur Vereinsmitglieder können den Chat lesen'; end if;

  return query
  select recent.id, recent.sender_id, p.username, recent.body, recent.created_at
  from (
    select m.id, m.sender_id, m.body, m.created_at
    from public.chess_club_messages m
    where m.club_id = p_club_id
    order by m.created_at desc
    limit 100
  ) recent
  join public.profiles p on p.id = recent.sender_id
  order by recent.created_at;
end;
$$;

create or replace function public.send_chess_club_message(p_club_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'Nachrichten müssen 1 bis 500 Zeichen lang sein'; end if;
  if not exists (
    select 1 from public.chess_club_members m
    where m.club_id = p_club_id and m.user_id = v_actor
  ) then raise exception using errcode = '42501', message = 'Nur Vereinsmitglieder können im Vereinschat schreiben'; end if;
  if (
    select count(*) from public.chess_club_messages m
    where m.sender_id = v_actor and m.created_at > now() - interval '1 minute'
  ) >= 15 then raise exception 'Du hast gerade viele Nachrichten gesendet. Bitte warte kurz'; end if;

  insert into public.chess_club_messages (club_id, sender_id, body)
  values (p_club_id, v_actor, trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.list_my_chess_club_news(uuid) from public, anon;
revoke all on function public.publish_chess_club_news(uuid, text, text) from public, anon;
revoke all on function public.list_my_chess_club_messages(uuid) from public, anon;
revoke all on function public.send_chess_club_message(uuid, text) from public, anon;
grant execute on function public.list_my_chess_club_news(uuid) to authenticated;
grant execute on function public.publish_chess_club_news(uuid, text, text) to authenticated;
grant execute on function public.list_my_chess_club_messages(uuid) to authenticated;
grant execute on function public.send_chess_club_message(uuid, text) to authenticated;

notify pgrst, 'reload schema';
