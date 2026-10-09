create or replace function public.list_chess_club_group_members(p_group_id uuid)
returns table (user_id uuid, username text, role text, solved_tasks bigint, attempted_tasks bigint, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select training_group.club_id into v_club_id
  from public.chess_club_groups training_group
  where training_group.id = p_group_id;
  if auth.uid() is null or (
    not public.can_manage_chess_club(v_club_id)
    and not exists (
      select 1 from public.chess_club_group_members group_member
      where group_member.group_id = p_group_id and group_member.user_id = auth.uid()
    )
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht berechtigt, diese Trainingsgruppe einzusehen';
  end if;

  return query
  select group_member.user_id, profile.username,
    case when group_member.role = 'trainer' or club_member.role in ('owner', 'trainer') then 'Trainer' else 'Mitglied' end,
    count(attempt.task_id) filter (where attempt.solved),
    count(attempt.task_id),
    group_member.joined_at
  from public.chess_club_group_members group_member
  join public.profiles profile on profile.id = group_member.user_id
  join public.chess_club_groups training_group on training_group.id = group_member.group_id
  left join public.chess_club_members club_member
    on club_member.club_id = training_group.club_id and club_member.user_id = group_member.user_id
  left join public.chess_club_training_tasks task on task.group_id = group_member.group_id
  left join public.chess_club_task_attempts attempt
    on attempt.task_id = task.id and attempt.user_id = group_member.user_id
  where group_member.group_id = p_group_id
  group by group_member.user_id, profile.username, group_member.role, club_member.role, group_member.joined_at
  order by case when group_member.role = 'trainer' or club_member.role in ('owner', 'trainer') then 0 else 1 end, profile.username;
end;
$$;

create or replace function public.list_chess_club_members(p_club_id uuid)
returns table (
  user_id uuid,
  username text,
  role text,
  group_count bigint,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or (
    not public.can_manage_chess_club(p_club_id)
    and not exists (
      select 1 from public.chess_club_members club_member_access
      where club_member_access.club_id = p_club_id and club_member_access.user_id = auth.uid()
    )
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht berechtigt, diese Vereinsmitglieder einzusehen';
  end if;

  return query
  select club_member.user_id, profile.username,
    case
      when club_member.role = 'owner' then 'Vereinsgründer'
      when club_member.role = 'trainer' or coalesce(bool_or(group_member.role = 'trainer'), false) then 'Trainer'
      else 'Mitglied'
    end,
    count(distinct group_member.group_id),
    club_member.joined_at
  from public.chess_club_members club_member
  join public.profiles profile on profile.id = club_member.user_id
  left join public.chess_club_groups training_group on training_group.club_id = club_member.club_id
  left join public.chess_club_group_members group_member
    on group_member.group_id = training_group.id and group_member.user_id = club_member.user_id
  where club_member.club_id = p_club_id
  group by club_member.user_id, profile.username, club_member.role, club_member.joined_at
  order by case when club_member.role = 'owner' then 0 when club_member.role = 'trainer' then 1 else 2 end, profile.username;
end;
$$;

create or replace function public.leave_chess_club(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;

  perform 1 from public.chess_clubs club where club.id = p_club_id for update;
  if not found then raise exception 'Verein nicht gefunden'; end if;

  select club_member.role into v_role
  from public.chess_club_members club_member
  where club_member.club_id = p_club_id and club_member.user_id = v_actor
  for update;
  if not found then raise exception 'Du bist kein Mitglied dieses Vereins'; end if;
  if v_role = 'owner' then
    raise exception 'Der Vereinsgründer kann den Verein nicht verlassen. Übertrage zuerst die Verantwortung oder lösche den Verein.';
  end if;

  delete from public.chess_tournament_players participant
  using public.chess_tournaments tournament, public.chess_club_groups training_group
  where participant.tournament_id = tournament.id
    and tournament.club_group_id = training_group.id
    and training_group.club_id = p_club_id
    and tournament.status = 'open'
    and participant.user_id = v_actor;

  delete from public.chess_club_group_members group_member
  using public.chess_club_groups training_group
  where group_member.group_id = training_group.id
    and training_group.club_id = p_club_id
    and group_member.user_id = v_actor;

  delete from public.chess_club_members club_member
  where club_member.club_id = p_club_id and club_member.user_id = v_actor;
end;
$$;

revoke all on function public.list_chess_club_group_members(uuid) from public, anon;
grant execute on function public.list_chess_club_group_members(uuid) to authenticated;
revoke all on function public.list_chess_club_members(uuid) from public, anon;
grant execute on function public.list_chess_club_members(uuid) to authenticated;
revoke all on function public.leave_chess_club(uuid) from public, anon;
grant execute on function public.leave_chess_club(uuid) to authenticated;

notify pgrst, 'reload schema';
