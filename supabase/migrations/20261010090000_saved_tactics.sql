create table public.saved_tactics (
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id text not null check (char_length(puzzle_id) between 1 and 80),
  saved_at timestamptz not null default now(),
  primary key (user_id, puzzle_id)
);

alter table public.saved_tactics enable row level security;
revoke all on public.saved_tactics from public, anon, authenticated;

create or replace function public.save_tactics_puzzle(p_puzzle_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;
  if char_length(trim(coalesce(p_puzzle_id, ''))) not between 1 and 80 then
    raise exception 'Ungültige Taktikaufgabe';
  end if;

  insert into public.saved_tactics(user_id, puzzle_id)
  values (auth.uid(), trim(p_puzzle_id))
  on conflict (user_id, puzzle_id) do nothing;
end;
$$;

create or replace function public.remove_saved_tactics_puzzle(p_puzzle_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;
  delete from public.saved_tactics
  where user_id = auth.uid() and puzzle_id = trim(coalesce(p_puzzle_id, ''));
end;
$$;

create or replace function public.list_my_saved_tactics()
returns table (puzzle_id text, saved_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select saved.puzzle_id, saved.saved_at
  from public.saved_tactics saved
  where auth.uid() is not null and saved.user_id = auth.uid()
  order by saved.saved_at desc, saved.puzzle_id;
$$;

create or replace function public.create_chess_club_training_task(
  p_group_id uuid,
  p_plan_id uuid,
  p_title text,
  p_description text,
  p_puzzle_id text,
  p_due_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_task_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.chess_club_group_members gm
    join public.chess_club_groups g on g.id = gm.group_id
    left join public.chess_club_members cm on cm.club_id = g.club_id and cm.user_id = auth.uid()
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
      and (gm.role = 'trainer' or cm.role in ('owner', 'trainer'))
  ) then
    raise exception using errcode = '42501', message = 'Nur Trainer können Aufgaben zuweisen';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 100 then raise exception 'Der Aufgabentitel muss 3 bis 100 Zeichen lang sein'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'Die Beschreibung darf höchstens 500 Zeichen lang sein'; end if;
  if char_length(trim(coalesce(p_puzzle_id, ''))) not between 1 and 80 then raise exception 'Ungültige Aufgabenstellung'; end if;
  if not exists (
    select 1 from public.saved_tactics saved
    where saved.user_id = auth.uid() and saved.puzzle_id = trim(p_puzzle_id)
  ) then
    raise exception 'Speichere die Taktikaufgabe zuerst, bevor du sie der Gruppe zuweist';
  end if;
  if p_due_at is not null and p_due_at <= now() then raise exception 'Die Abgabefrist muss in der Zukunft liegen'; end if;
  if p_plan_id is not null and not exists (
    select 1 from public.chess_club_training_plans where id = p_plan_id and group_id = p_group_id
  ) then raise exception 'Trainingsplan nicht gefunden'; end if;

  insert into public.chess_club_training_tasks(group_id, plan_id, title, description, puzzle_id, due_at, created_by)
  values (p_group_id, p_plan_id, trim(p_title), trim(coalesce(p_description, '')), trim(p_puzzle_id), p_due_at, auth.uid())
  returning id into v_task_id;
  return v_task_id;
end;
$$;

create or replace function public.update_chess_club_training_task(
  p_task_id uuid,
  p_plan_id uuid,
  p_title text,
  p_description text,
  p_puzzle_id text,
  p_due_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
  v_club_id uuid;
  v_current_puzzle_id text;
begin
  select task.group_id, training_group.club_id, task.puzzle_id
  into v_group_id, v_club_id, v_current_puzzle_id
  from public.chess_club_training_tasks task
  join public.chess_club_groups training_group on training_group.id = task.group_id
  where task.id = p_task_id;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Aufgaben ändern';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 100 then raise exception 'Der Aufgabentitel muss 3 bis 100 Zeichen lang sein'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'Die Beschreibung darf höchstens 500 Zeichen lang sein'; end if;
  if char_length(trim(coalesce(p_puzzle_id, ''))) not between 1 and 80 then raise exception 'Ungültige Aufgabenstellung'; end if;
  if trim(p_puzzle_id) is distinct from v_current_puzzle_id and not exists (
    select 1 from public.saved_tactics saved
    where saved.user_id = auth.uid() and saved.puzzle_id = trim(p_puzzle_id)
  ) then
    raise exception 'Speichere die Taktikaufgabe zuerst, bevor du sie der Gruppe zuweist';
  end if;
  if p_due_at is not null and p_due_at <= now()
    and p_due_at is distinct from (select due_at from public.chess_club_training_tasks where id = p_task_id) then
    raise exception 'Eine neue Abgabefrist muss in der Zukunft liegen';
  end if;
  if p_plan_id is not null and not exists (
    select 1 from public.chess_club_training_plans where id = p_plan_id and group_id = v_group_id
  ) then raise exception 'Trainingsplan nicht gefunden'; end if;
  update public.chess_club_training_tasks
  set plan_id = p_plan_id, title = trim(p_title), description = trim(coalesce(p_description, '')),
    puzzle_id = trim(p_puzzle_id), due_at = p_due_at
  where id = p_task_id;
  perform public.log_chess_club_admin_action(
    'chess_club_training_task_updated', v_club_id, null, jsonb_build_object('task_id', p_task_id)
  );
end;
$$;

revoke all on function public.save_tactics_puzzle(text) from public, anon;
revoke all on function public.remove_saved_tactics_puzzle(text) from public, anon;
revoke all on function public.list_my_saved_tactics() from public, anon;
revoke all on function public.create_chess_club_training_task(uuid, uuid, text, text, text, timestamptz) from public, anon;
revoke all on function public.update_chess_club_training_task(uuid, uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.save_tactics_puzzle(text) to authenticated;
grant execute on function public.remove_saved_tactics_puzzle(text) to authenticated;
grant execute on function public.list_my_saved_tactics() to authenticated;
grant execute on function public.create_chess_club_training_task(uuid, uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.update_chess_club_training_task(uuid, uuid, text, text, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
