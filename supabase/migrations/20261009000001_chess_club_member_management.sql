drop function public.list_my_chess_club_groups();

create function public.list_my_chess_club_groups()
returns table (
  group_id uuid,
  club_id uuid,
  club_name text,
  group_name text,
  role text,
  member_count bigint,
  invite_code text,
  is_club_owner boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select g.id, c.id, c.name, g.name,
    case when gm.role = 'trainer' or cm.role in ('owner', 'trainer') then 'trainer' else 'member' end,
    (select count(*) from public.chess_club_group_members member_count where member_count.group_id = g.id),
    case when gm.role = 'trainer' or cm.role in ('owner', 'trainer') then g.invite_code else null end,
    c.created_by = auth.uid()
  from public.chess_club_groups g
  join public.chess_clubs c on c.id = g.club_id
  left join public.chess_club_group_members gm on gm.group_id = g.id and gm.user_id = auth.uid()
  left join public.chess_club_members cm on cm.club_id = c.id and cm.user_id = auth.uid()
  where auth.uid() is not null
    and gm.user_id is not null
  order by c.name, g.name;
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
  if auth.uid() is null or not exists (
    select 1 from public.chess_club_members
    where club_id = p_club_id and user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht Mitglied dieses Vereins';
  end if;

  return query
  select cm.user_id, p.username,
    case
      when cm.role = 'owner' then 'Vereinsgründer'
      when cm.role = 'trainer' or coalesce(bool_or(gm.role = 'trainer'), false) then 'Trainer'
      else 'Mitglied'
    end,
    count(distinct gm.group_id),
    cm.joined_at
  from public.chess_club_members cm
  join public.profiles p on p.id = cm.user_id
  left join public.chess_club_groups g on g.club_id = cm.club_id
  left join public.chess_club_group_members gm
    on gm.group_id = g.id and gm.user_id = cm.user_id
  where cm.club_id = p_club_id
  group by cm.user_id, p.username, cm.role, cm.joined_at
  order by case when cm.role = 'owner' then 0 when cm.role = 'trainer' then 1 else 2 end, p.username;
end;
$$;

create or replace function public.remove_chess_club_member(p_club_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_creator uuid;
  v_target_role text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;

  select created_by into v_creator
  from public.chess_clubs
  where id = p_club_id
  for update;
  if not found then raise exception 'Verein nicht gefunden'; end if;
  if v_creator <> v_actor or not exists (
    select 1 from public.chess_club_members
    where club_id = p_club_id and user_id = v_actor and role = 'owner'
  ) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer kann Mitglieder entfernen';
  end if;
  if p_user_id = v_actor then
    raise exception 'Der Vereinsgründer kann sich nicht selbst entfernen';
  end if;

  select role into v_target_role
  from public.chess_club_members
  where club_id = p_club_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Diese Person ist kein Mitglied dieses Vereins'; end if;
  if v_target_role = 'owner' then raise exception 'Der Vereinsgründer kann nicht entfernt werden'; end if;

  delete from public.chess_club_group_members group_member
  using public.chess_club_groups training_group
  where group_member.group_id = training_group.id
    and training_group.club_id = p_club_id
    and group_member.user_id = p_user_id;
  delete from public.chess_club_members
  where club_id = p_club_id and user_id = p_user_id;
end;
$$;

create or replace function public.start_chess_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tournament public.chess_tournaments%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  select * into v_tournament from public.chess_tournaments where id = p_tournament_id for update;
  if not found or v_tournament.creator_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Nur die erstellende Person kann das Turnier starten';
  end if;
  if v_tournament.club_group_id is not null and not exists (
    select 1 from public.chess_club_group_members group_member
    where group_member.group_id = v_tournament.club_group_id
      and group_member.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht mehr Mitglied dieser Turniergruppe';
  end if;
  if v_tournament.status <> 'open' then raise exception 'Dieses Turnier wurde bereits gestartet'; end if;
  select count(*) into v_count from public.chess_tournament_players where tournament_id = p_tournament_id;
  if v_count < 2 then raise exception 'Mindestens zwei Spieler müssen angemeldet sein'; end if;

  insert into public.chess_tournament_games(tournament_id, white_user_id, black_user_id)
  select p_tournament_id, white.user_id, black.user_id
  from public.chess_tournament_players white
  join public.chess_tournament_players black
    on white.tournament_id = black.tournament_id and white.user_id < black.user_id
  where white.tournament_id = p_tournament_id;

  update public.chess_tournaments set status = 'running', started_at = now()
  where id = p_tournament_id;
end;
$$;

create or replace function public.list_chess_tournament_players(p_tournament_id uuid)
returns table (user_id uuid, username text, score numeric, is_creator boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.chess_tournament_players participant
    join public.chess_tournaments tournament on tournament.id = participant.tournament_id
    where participant.tournament_id = p_tournament_id
      and participant.user_id = auth.uid()
      and (tournament.club_group_id is null or exists (
        select 1 from public.chess_club_group_members group_member
        where group_member.group_id = tournament.club_group_id
          and group_member.user_id = auth.uid()
      ))
  ) then
    raise exception using errcode = '42501', message = 'Du bist für dieses Turnier nicht angemeldet oder nicht mehr berechtigt';
  end if;

  return query
  select participant.user_id, player_profile.username, participant.score,
    tournament.creator_id = participant.user_id
  from public.chess_tournament_players participant
  join public.profiles player_profile on player_profile.id = participant.user_id
  join public.chess_tournaments tournament on tournament.id = participant.tournament_id
  where participant.tournament_id = p_tournament_id
  order by participant.score desc, player_profile.username;
end;
$$;

create or replace function public.list_chess_tournament_games(p_tournament_id uuid)
returns table (
  game_id uuid,
  white_user_id uuid,
  white_username text,
  black_user_id uuid,
  black_username text,
  status text,
  result text,
  white_report text,
  black_report text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.chess_tournament_players participant
    join public.chess_tournaments tournament on tournament.id = participant.tournament_id
    where participant.tournament_id = p_tournament_id
      and participant.user_id = auth.uid()
      and (tournament.club_group_id is null or exists (
        select 1 from public.chess_club_group_members group_member
        where group_member.group_id = tournament.club_group_id
          and group_member.user_id = auth.uid()
      ))
  ) then
    raise exception using errcode = '42501', message = 'Du bist für dieses Turnier nicht angemeldet oder nicht mehr berechtigt';
  end if;

  return query
  select game.id, game.white_user_id, white.username, game.black_user_id, black.username,
    game.status, game.result, game.white_report, game.black_report
  from public.chess_tournament_games game
  join public.profiles white on white.id = game.white_user_id
  join public.profiles black on black.id = game.black_user_id
  where game.tournament_id = p_tournament_id
  order by white.username, black.username;
end;
$$;

create or replace function public.report_chess_tournament_result(p_game_id uuid, p_result text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_game public.chess_tournament_games%rowtype;
  v_actor uuid := auth.uid();
  v_status text;
  v_white_username text;
  v_black_username text;
  v_initial_seconds integer;
  v_increment_seconds integer;
  v_rating_mode text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  if p_result is null or p_result not in ('white', 'black', 'draw') then raise exception 'Ungültiges Ergebnis'; end if;

  select * into v_game from public.chess_tournament_games where id = p_game_id for update;
  if not found or v_actor not in (v_game.white_user_id, v_game.black_user_id) then
    raise exception using errcode = '42501', message = 'Du bist an dieser Turnierpartie nicht beteiligt';
  end if;
  if not exists (
    select 1 from public.chess_tournaments tournament
    where tournament.id = v_game.tournament_id
      and (tournament.club_group_id is null or exists (
        select 1 from public.chess_club_group_members group_member
        where group_member.group_id = tournament.club_group_id
          and group_member.user_id = v_actor
      ))
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht mehr Mitglied dieser Turniergruppe';
  end if;
  if v_game.status = 'finished' then raise exception 'Dieses Ergebnis wurde bereits bestätigt'; end if;

  if v_actor = v_game.white_user_id then
    update public.chess_tournament_games set white_report = p_result where id = p_game_id;
    v_game.white_report := p_result;
  else
    update public.chess_tournament_games set black_report = p_result where id = p_game_id;
    v_game.black_report := p_result;
  end if;

  if v_game.white_report is not null and v_game.black_report is not null then
    if v_game.white_report = v_game.black_report then
      update public.chess_tournament_games
      set result = v_game.white_report, status = 'finished', finished_at = now()
      where id = p_game_id;

      select white.username, black.username, tournament.initial_seconds, tournament.increment_seconds
      into v_white_username, v_black_username, v_initial_seconds, v_increment_seconds
      from public.chess_tournaments tournament
      join public.profiles white on white.id = v_game.white_user_id
      join public.profiles black on black.id = v_game.black_user_id
      where tournament.id = v_game.tournament_id;

      v_rating_mode := case
        when (v_initial_seconds, v_increment_seconds) in ((60, 0), (120, 1)) then 'bullet'
        when (v_initial_seconds, v_increment_seconds) in ((180, 2), (300, 0), (300, 3)) then 'blitz'
        when (v_initial_seconds, v_increment_seconds) = (1800, 0) then 'classical'
        else 'rapid'
      end;

      perform public.record_online_chess_result(
        'tournament:' || v_game.tournament_id::text || ':' || v_game.id::text,
        v_rating_mode,
        v_white_username,
        v_black_username,
        v_game.white_report
      );

      update public.chess_tournament_players
      set score = score + case v_game.white_report when 'draw' then 0.5 else 1 end
      where tournament_id = v_game.tournament_id
        and user_id = case when v_game.white_report = 'white' then v_game.white_user_id
                           when v_game.white_report = 'black' then v_game.black_user_id
                           else null end;
      if v_game.white_report = 'draw' then
        update public.chess_tournament_players set score = score + 0.5
        where tournament_id = v_game.tournament_id and user_id in (v_game.white_user_id, v_game.black_user_id);
      end if;
      if not exists (
        select 1 from public.chess_tournament_games
        where tournament_id = v_game.tournament_id and id <> p_game_id and status <> 'finished'
      ) then
        update public.chess_tournaments set status = 'completed', completed_at = now()
        where id = v_game.tournament_id;
      end if;
      v_status := 'finished';
    else
      update public.chess_tournament_games set status = 'disputed' where id = p_game_id;
      v_status := 'disputed';
    end if;
  else
    v_status := 'pending';
  end if;
  return v_status;
end;
$$;

revoke all on function public.list_my_chess_club_groups() from public, anon;
revoke all on function public.list_chess_club_members(uuid) from public, anon;
revoke all on function public.remove_chess_club_member(uuid, uuid) from public, anon;
revoke all on function public.start_chess_tournament(uuid) from public, anon;
revoke all on function public.list_chess_tournament_players(uuid) from public, anon;
revoke all on function public.list_chess_tournament_games(uuid) from public, anon;
revoke all on function public.report_chess_tournament_result(uuid, text) from public, anon;

grant execute on function public.list_my_chess_club_groups() to authenticated;
grant execute on function public.list_chess_club_members(uuid) to authenticated;
grant execute on function public.remove_chess_club_member(uuid, uuid) to authenticated;
grant execute on function public.start_chess_tournament(uuid) to authenticated;
grant execute on function public.list_chess_tournament_players(uuid) to authenticated;
grant execute on function public.list_chess_tournament_games(uuid) to authenticated;
grant execute on function public.report_chess_tournament_result(uuid, text) to authenticated;

notify pgrst, 'reload schema';
