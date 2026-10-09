create or replace function public.admin_can_manage_chess_clubs()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.profiles profile
    join public.site_admins admin_access on admin_access.user_id = profile.id
    where profile.id = auth.uid()
      and lower(profile.username) = lower('DavidBickle')
  );
$$;

create or replace function public.can_manage_chess_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_club_id is not null and (
    public.admin_can_manage_chess_clubs()
    or exists (
      select 1
      from public.chess_clubs club
      join public.chess_club_members member
        on member.club_id = club.id and member.user_id = auth.uid() and member.role = 'owner'
      where club.id = p_club_id and club.created_by = auth.uid()
    )
  );
$$;

create or replace function public.log_chess_club_admin_action(
  p_action text,
  p_club_id uuid,
  p_target_user_id uuid,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.admin_can_manage_chess_clubs() then
    insert into public.admin_audit_log(actor_id, action, target_user_id, details)
    values (
      auth.uid(),
      p_action,
      p_target_user_id,
      jsonb_build_object('club_id', p_club_id) || coalesce(p_details, '{}'::jsonb)
    );
  end if;
end;
$$;

create or replace function public.admin_list_chess_club_groups()
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
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.admin_can_manage_chess_clubs() then
    raise exception using errcode = '42501', message = 'Keine Berechtigung zur Vereinsverwaltung';
  end if;

  return query
  select training_group.id, club.id, club.name, training_group.name, 'trainer'::text,
    (select count(*) from public.chess_club_group_members member_count where member_count.group_id = training_group.id),
    training_group.invite_code, true
  from public.chess_club_groups training_group
  join public.chess_clubs club on club.id = training_group.club_id
  order by club.name, training_group.name;
end;
$$;

create or replace function public.list_my_chess_club_groups()
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
  select training_group.id, club.id, club.name, training_group.name,
    case when group_member.role = 'trainer' or club_member.role in ('owner', 'trainer') then 'trainer' else 'member' end,
    (select count(*) from public.chess_club_group_members member_count where member_count.group_id = training_group.id),
    case when group_member.role = 'trainer' or club_member.role in ('owner', 'trainer') then training_group.invite_code else null end,
    club.created_by = auth.uid()
  from public.chess_club_groups training_group
  join public.chess_clubs club on club.id = training_group.club_id
  left join public.chess_club_group_members group_member
    on group_member.group_id = training_group.id and group_member.user_id = auth.uid()
  left join public.chess_club_members club_member
    on club_member.club_id = club.id and club_member.user_id = auth.uid()
  where auth.uid() is not null
    and (group_member.user_id is not null or (club_member.role = 'owner' and club.created_by = auth.uid()))
  order by club.name, training_group.name;
$$;

create or replace function public.create_chess_club_training_plan(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_due_at timestamptz,
  p_target_solutions integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.chess_club_groups training_group
    where training_group.id = p_group_id
      and (
        public.can_manage_chess_club(training_group.club_id)
        or exists (
          select 1 from public.chess_club_group_members group_member
          left join public.chess_club_members club_member
            on club_member.club_id = training_group.club_id and club_member.user_id = auth.uid()
          where group_member.group_id = training_group.id and group_member.user_id = auth.uid()
            and (group_member.role = 'trainer' or club_member.role in ('owner', 'trainer'))
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Nur Trainer können Trainingspläne erstellen';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 100 then raise exception 'Der Planname muss 3 bis 100 Zeichen lang sein'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'Die Beschreibung darf höchstens 500 Zeichen lang sein'; end if;
  if p_target_solutions is not null and p_target_solutions not between 1 and 5000 then raise exception 'Das Teamziel muss zwischen 1 und 5000 gelösten Aufgaben liegen'; end if;
  if p_due_at is not null and p_due_at <= now() then raise exception 'Die Abgabefrist muss in der Zukunft liegen'; end if;

  insert into public.chess_club_training_plans(group_id, name, description, due_at, target_solutions, created_by)
  values (p_group_id, trim(p_name), trim(coalesce(p_description, '')), p_due_at, p_target_solutions, auth.uid())
  returning id into v_plan_id;
  return v_plan_id;
end;
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
    select 1 from public.chess_club_groups training_group
    where training_group.id = p_group_id
      and (
        public.can_manage_chess_club(training_group.club_id)
        or exists (
          select 1 from public.chess_club_group_members group_member
          left join public.chess_club_members club_member
            on club_member.club_id = training_group.club_id and club_member.user_id = auth.uid()
          where group_member.group_id = training_group.id and group_member.user_id = auth.uid()
            and (group_member.role = 'trainer' or club_member.role in ('owner', 'trainer'))
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Nur Trainer können Aufgaben zuweisen';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 100 then raise exception 'Der Aufgabentitel muss 3 bis 100 Zeichen lang sein'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'Die Beschreibung darf höchstens 500 Zeichen lang sein'; end if;
  if char_length(coalesce(p_puzzle_id, '')) not between 1 and 80 then raise exception 'Ungültige Aufgabenstellung'; end if;
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
  select club_id into v_club_id from public.chess_club_groups where id = p_group_id;
  if auth.uid() is null or (
    not public.can_manage_chess_club(v_club_id)
    and not exists (
      select 1 from public.chess_club_group_members
      where group_id = p_group_id and user_id = auth.uid()
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
      select 1 from public.chess_club_members
      where club_id = p_club_id and user_id = auth.uid()
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

create or replace function public.list_chess_club_training_plans(p_group_id uuid)
returns table (
  plan_id uuid,
  name text,
  description text,
  due_at timestamptz,
  target_solutions integer,
  task_count bigint,
  solved_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.chess_club_groups where id = p_group_id;
  if auth.uid() is null or (
    not public.can_manage_chess_club(v_club_id)
    and not exists (
      select 1 from public.chess_club_group_members
      where group_id = p_group_id and user_id = auth.uid()
    )
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht berechtigt, diese Trainingsgruppe einzusehen';
  end if;

  return query
  select training_plan.id, training_plan.name, training_plan.description, training_plan.due_at,
    training_plan.target_solutions, count(distinct task.id),
    count(attempt.task_id) filter (where attempt.solved)
  from public.chess_club_training_plans training_plan
  left join public.chess_club_training_tasks task on task.plan_id = training_plan.id
  left join public.chess_club_task_attempts attempt on attempt.task_id = task.id
  where training_plan.group_id = p_group_id
  group by training_plan.id
  order by training_plan.due_at nulls last, training_plan.created_at desc;
end;
$$;

create or replace function public.list_chess_club_training_tasks(p_group_id uuid)
returns table (
  task_id uuid,
  plan_id uuid,
  plan_name text,
  title text,
  description text,
  puzzle_id text,
  due_at timestamptz,
  participant_count bigint,
  attempted_count bigint,
  solved_count bigint,
  my_attempts integer,
  my_solved boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.chess_club_groups where id = p_group_id;
  if auth.uid() is null or (
    not public.can_manage_chess_club(v_club_id)
    and not exists (
      select 1 from public.chess_club_group_members
      where group_id = p_group_id and user_id = auth.uid()
    )
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht berechtigt, diese Trainingsgruppe einzusehen';
  end if;

  return query
  select task.id, task.plan_id, training_plan.name, task.title, task.description, task.puzzle_id, task.due_at,
    (select count(*) from public.chess_club_group_members group_member where group_member.group_id = p_group_id),
    count(attempt.user_id),
    count(attempt.user_id) filter (where attempt.solved),
    coalesce(mine.attempts, 0),
    coalesce(mine.solved, false)
  from public.chess_club_training_tasks task
  left join public.chess_club_training_plans training_plan on training_plan.id = task.plan_id
  left join public.chess_club_task_attempts attempt on attempt.task_id = task.id
  left join public.chess_club_task_attempts mine on mine.task_id = task.id and mine.user_id = auth.uid()
  where task.group_id = p_group_id
  group by task.id, training_plan.name, mine.attempts, mine.solved
  order by task.due_at nulls last, task.created_at desc;
end;
$$;

create or replace function public.list_chess_club_task_participation(p_task_id uuid)
returns table (user_id uuid, username text, role text, attempts integer, solved boolean, last_attempt_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
  v_club_id uuid;
begin
  select task.group_id, training_group.club_id
  into v_group_id, v_club_id
  from public.chess_club_training_tasks task
  join public.chess_club_groups training_group on training_group.id = task.group_id
  where task.id = p_task_id;
  if v_group_id is null then raise exception 'Aufgabe nicht gefunden'; end if;
  if auth.uid() is null or (
    not public.can_manage_chess_club(v_club_id)
    and not exists (
      select 1 from public.chess_club_group_members group_member
      join public.chess_club_groups training_group on training_group.id = group_member.group_id
      left join public.chess_club_members club_member
        on club_member.club_id = training_group.club_id and club_member.user_id = auth.uid()
      where group_member.group_id = v_group_id and group_member.user_id = auth.uid()
        and (group_member.role = 'trainer' or club_member.role in ('owner', 'trainer'))
    )
  ) then
    raise exception using errcode = '42501', message = 'Nur Trainer können die Teilnahmeübersicht sehen';
  end if;

  return query
  select group_member.user_id, profile.username,
    case when group_member.role = 'trainer' or club_member.role in ('owner', 'trainer') then 'Trainer' else 'Mitglied' end,
    coalesce(attempt.attempts, 0), coalesce(attempt.solved, false), attempt.last_attempt_at
  from public.chess_club_group_members group_member
  join public.profiles profile on profile.id = group_member.user_id
  join public.chess_club_groups training_group on training_group.id = group_member.group_id
  left join public.chess_club_members club_member
    on club_member.club_id = training_group.club_id and club_member.user_id = group_member.user_id
  left join public.chess_club_task_attempts attempt
    on attempt.task_id = p_task_id and attempt.user_id = group_member.user_id
  where group_member.group_id = v_group_id
  order by case when group_member.role = 'trainer' or club_member.role in ('owner', 'trainer') then 0 else 1 end, profile.username;
end;
$$;

create or replace function public.list_chess_club_group_tournaments(p_group_id uuid)
returns table (
  tournament_id uuid,
  name text,
  initial_seconds integer,
  increment_seconds integer,
  max_players integer,
  status text,
  player_count bigint,
  is_joined boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.chess_club_groups where id = p_group_id;
  if auth.uid() is null or (
    not public.can_manage_chess_club(v_club_id)
    and not exists (
      select 1 from public.chess_club_group_members
      where group_id = p_group_id and user_id = auth.uid()
    )
  ) then
    raise exception using errcode = '42501', message = 'Du bist nicht berechtigt, diese Vereinsturniere einzusehen';
  end if;

  return query
  select tournament.id, tournament.name, tournament.initial_seconds, tournament.increment_seconds,
    tournament.max_players, tournament.status, count(participant.user_id),
    bool_or(participant.user_id = auth.uid())
  from public.chess_tournaments tournament
  left join public.chess_tournament_players participant on participant.tournament_id = tournament.id
  where tournament.club_group_id = p_group_id
  group by tournament.id
  order by case tournament.status when 'open' then 0 when 'running' then 1 else 2 end, tournament.created_at desc;
end;
$$;

create or replace function public.create_chess_club_group_tournament(
  p_group_id uuid,
  p_name text,
  p_initial_seconds integer,
  p_increment_seconds integer,
  p_max_players integer default 8
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.chess_club_groups training_group
    where training_group.id = p_group_id
      and (
        public.can_manage_chess_club(training_group.club_id)
        or exists (
          select 1 from public.chess_club_group_members group_member
          left join public.chess_club_members club_member
            on club_member.club_id = training_group.club_id and club_member.user_id = auth.uid()
          where group_member.group_id = training_group.id and group_member.user_id = auth.uid()
            and (group_member.role = 'trainer' or club_member.role in ('owner', 'trainer'))
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Nur Trainer können ein Vereinsturnier erstellen';
  end if;
  if exists (select 1 from public.community_suspensions suspension where suspension.user_id = auth.uid() and (suspension.expires_at is null or suspension.expires_at > now())) then
    raise exception using errcode = '42501', message = 'Du kannst mit einer aktiven Community-Sperre kein Turnier erstellen';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 80 then raise exception 'Der Turniername muss 3 bis 80 Zeichen lang sein'; end if;
  if p_initial_seconds not between 60 and 3600 or p_increment_seconds not between 0 and 60 then raise exception 'Ungültige Bedenkzeit'; end if;
  if p_max_players not between 2 and 16 then raise exception 'Ein Turnier braucht Platz für 2 bis 16 Spieler'; end if;

  insert into public.chess_tournaments(creator_id, name, initial_seconds, increment_seconds, max_players, club_group_id)
  values (auth.uid(), trim(p_name), p_initial_seconds, p_increment_seconds, p_max_players, p_group_id)
  returning id into v_id;
  if exists (
    select 1 from public.chess_club_group_members
    where group_id = p_group_id and user_id = auth.uid()
  ) then
    insert into public.chess_tournament_players(tournament_id, user_id) values (v_id, auth.uid());
  end if;
  return v_id;
end;
$$;

create or replace function public.join_chess_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tournament public.chess_tournaments%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  select * into v_tournament from public.chess_tournaments where id = p_tournament_id for update;
  if not found or v_tournament.status <> 'open' then raise exception 'Dieses Turnier nimmt keine Anmeldungen an'; end if;
  if v_tournament.club_group_id is not null and not exists (
    select 1 from public.chess_club_group_members group_member
    where group_member.group_id = v_tournament.club_group_id and group_member.user_id = v_actor
  ) then
    raise exception using errcode = '42501', message = 'Nur Mitglieder der Trainingsgruppe können diesem Vereinsturnier beitreten';
  end if;
  if exists (select 1 from public.community_suspensions suspension where suspension.user_id = v_actor and (suspension.expires_at is null or suspension.expires_at > now())) then
    raise exception using errcode = '42501', message = 'Du kannst dich mit einer aktiven Community-Sperre nicht anmelden';
  end if;
  if (select count(*) from public.chess_tournament_players where tournament_id = p_tournament_id) >= v_tournament.max_players then
    raise exception 'Das Turnier ist bereits voll';
  end if;
  insert into public.chess_tournament_players(tournament_id, user_id)
  values (p_tournament_id, v_actor)
  on conflict do nothing;
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
  v_club_id uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  select * into v_tournament from public.chess_tournaments where id = p_tournament_id for update;
  if not found or v_tournament.creator_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Nur die erstellende Person kann das Turnier starten';
  end if;
  if v_tournament.club_group_id is not null then
    select club_id into v_club_id from public.chess_club_groups where id = v_tournament.club_group_id;
    if not public.can_manage_chess_club(v_club_id) and not exists (
      select 1 from public.chess_club_group_members
      where group_id = v_tournament.club_group_id and user_id = auth.uid()
    ) then
      raise exception using errcode = '42501', message = 'Du bist nicht berechtigt, dieses Vereinsturnier zu starten';
    end if;
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

drop function public.list_chess_tournaments();

create function public.list_chess_tournaments()
returns table (
  tournament_id uuid,
  name text,
  creator_username text,
  initial_seconds integer,
  increment_seconds integer,
  max_players integer,
  status text,
  player_count bigint,
  is_joined boolean,
  is_creator boolean,
  can_join boolean,
  can_manage boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select tournament.id, tournament.name, creator.username,
    tournament.initial_seconds, tournament.increment_seconds, tournament.max_players,
    tournament.status, count(participant.user_id), coalesce(bool_or(participant.user_id = auth.uid()), false),
    tournament.creator_id = auth.uid(),
    tournament.club_group_id is null or exists (
      select 1 from public.chess_club_group_members group_member
      where group_member.group_id = tournament.club_group_id and group_member.user_id = auth.uid()
    ),
    tournament.club_group_id is not null and public.can_manage_chess_club((
      select training_group.club_id
      from public.chess_club_groups training_group
      where training_group.id = tournament.club_group_id
    )),
    tournament.created_at
  from public.chess_tournaments tournament
  join public.profiles creator on creator.id = tournament.creator_id
  left join public.chess_tournament_players participant on participant.tournament_id = tournament.id
  where auth.uid() is not null
    and (tournament.club_group_id is null or exists (
      select 1 from public.chess_club_group_members group_member
      where group_member.group_id = tournament.club_group_id and group_member.user_id = auth.uid()
    ) or public.can_manage_chess_club((
      select training_group.club_id
      from public.chess_club_groups training_group
      where training_group.id = tournament.club_group_id
    )))
  group by tournament.id, creator.username
  order by case tournament.status when 'open' then 0 when 'running' then 1 else 2 end, tournament.created_at desc
  limit 100;
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
    from public.chess_tournaments tournament
    where tournament.id = p_tournament_id
      and (
        (
          exists (
            select 1 from public.chess_tournament_players participant
            where participant.tournament_id = tournament.id and participant.user_id = auth.uid()
          )
          and (
            tournament.club_group_id is null
            or exists (
              select 1 from public.chess_club_group_members group_member
              where group_member.group_id = tournament.club_group_id and group_member.user_id = auth.uid()
            )
          )
        )
        or (
          tournament.club_group_id is not null
          and public.can_manage_chess_club((
            select training_group.club_id from public.chess_club_groups training_group
            where training_group.id = tournament.club_group_id
          ))
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Du bist für dieses Turnier nicht berechtigt';
  end if;

  return query
  select participant.user_id, profile.username, participant.score,
    tournament.creator_id = participant.user_id
  from public.chess_tournament_players participant
  join public.profiles profile on profile.id = participant.user_id
  join public.chess_tournaments tournament on tournament.id = participant.tournament_id
  where participant.tournament_id = p_tournament_id
  order by participant.score desc, profile.username;
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
    from public.chess_tournaments tournament
    where tournament.id = p_tournament_id
      and (
        (
          exists (
            select 1 from public.chess_tournament_players participant
            where participant.tournament_id = tournament.id and participant.user_id = auth.uid()
          )
          and (
            tournament.club_group_id is null
            or exists (
              select 1 from public.chess_club_group_members group_member
              where group_member.group_id = tournament.club_group_id and group_member.user_id = auth.uid()
            )
          )
        )
        or (
          tournament.club_group_id is not null
          and public.can_manage_chess_club((
            select training_group.club_id from public.chess_club_groups training_group
            where training_group.id = tournament.club_group_id
          ))
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'Du bist für dieses Turnier nicht berechtigt';
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

create or replace function public.update_chess_club(p_club_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.can_manage_chess_club(p_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann den Verein ändern';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 80 then
    raise exception 'Der Vereinsname muss 3 bis 80 Zeichen lang sein';
  end if;
  update public.chess_clubs set name = trim(p_name) where id = p_club_id;
  perform public.log_chess_club_admin_action(
    'chess_club_updated', p_club_id, null, jsonb_build_object('name', trim(p_name))
  );
end;
$$;

create or replace function public.delete_chess_club(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_creator_id uuid;
begin
  if not public.can_manage_chess_club(p_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann den Verein löschen';
  end if;
  select created_by into v_creator_id from public.chess_clubs where id = p_club_id;
  perform public.log_chess_club_admin_action(
    'chess_club_deleted', p_club_id, v_creator_id, '{}'::jsonb
  );
  delete from public.chess_clubs where id = p_club_id;
end;
$$;

create or replace function public.update_chess_club_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.chess_club_groups where id = p_group_id;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Gruppen ändern';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Der Gruppenname muss 2 bis 80 Zeichen lang sein';
  end if;
  update public.chess_club_groups set name = trim(p_name) where id = p_group_id;
  perform public.log_chess_club_admin_action(
    'chess_club_group_updated', v_club_id, null, jsonb_build_object('group_id', p_group_id, 'name', trim(p_name))
  );
end;
$$;

create or replace function public.delete_chess_club_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select club_id into v_club_id from public.chess_club_groups where id = p_group_id;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Gruppen löschen';
  end if;
  if (select count(*) from public.chess_club_groups where club_id = v_club_id) < 2 then
    raise exception 'Die letzte Trainingsgruppe kann nicht einzeln gelöscht werden';
  end if;
  perform public.log_chess_club_admin_action(
    'chess_club_group_deleted', v_club_id, null, jsonb_build_object('group_id', p_group_id)
  );
  delete from public.chess_club_groups where id = p_group_id;
end;
$$;

create or replace function public.update_chess_club_training_plan(
  p_plan_id uuid,
  p_name text,
  p_description text,
  p_due_at timestamptz,
  p_target_solutions integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select training_group.club_id into v_club_id
  from public.chess_club_training_plans training_plan
  join public.chess_club_groups training_group on training_group.id = training_plan.group_id
  where training_plan.id = p_plan_id;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Trainingspläne ändern';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 100 then raise exception 'Der Planname muss 3 bis 100 Zeichen lang sein'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'Die Beschreibung darf höchstens 500 Zeichen lang sein'; end if;
  if p_target_solutions is not null and p_target_solutions not between 1 and 5000 then raise exception 'Das Teamziel muss zwischen 1 und 5000 gelösten Aufgaben liegen'; end if;
  if p_due_at is not null and p_due_at <= now()
    and p_due_at is distinct from (select due_at from public.chess_club_training_plans where id = p_plan_id) then
    raise exception 'Eine neue Abgabefrist muss in der Zukunft liegen';
  end if;
  update public.chess_club_training_plans
  set name = trim(p_name), description = trim(coalesce(p_description, '')),
    due_at = p_due_at, target_solutions = p_target_solutions
  where id = p_plan_id;
  perform public.log_chess_club_admin_action(
    'chess_club_training_plan_updated', v_club_id, null, jsonb_build_object('plan_id', p_plan_id)
  );
end;
$$;

create or replace function public.delete_chess_club_training_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select training_group.club_id into v_club_id
  from public.chess_club_training_plans training_plan
  join public.chess_club_groups training_group on training_group.id = training_plan.group_id
  where training_plan.id = p_plan_id;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Trainingspläne löschen';
  end if;
  perform public.log_chess_club_admin_action(
    'chess_club_training_plan_deleted', v_club_id, null, jsonb_build_object('plan_id', p_plan_id)
  );
  delete from public.chess_club_training_plans where id = p_plan_id;
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
begin
  select task.group_id, training_group.club_id into v_group_id, v_club_id
  from public.chess_club_training_tasks task
  join public.chess_club_groups training_group on training_group.id = task.group_id
  where task.id = p_task_id;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Aufgaben ändern';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 100 then raise exception 'Der Aufgabentitel muss 3 bis 100 Zeichen lang sein'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'Die Beschreibung darf höchstens 500 Zeichen lang sein'; end if;
  if char_length(coalesce(p_puzzle_id, '')) not between 1 and 80 then raise exception 'Ungültige Aufgabenstellung'; end if;
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

create or replace function public.delete_chess_club_training_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
begin
  select training_group.club_id into v_club_id
  from public.chess_club_training_tasks task
  join public.chess_club_groups training_group on training_group.id = task.group_id
  where task.id = p_task_id;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Aufgaben löschen';
  end if;
  perform public.log_chess_club_admin_action(
    'chess_club_training_task_deleted', v_club_id, null, jsonb_build_object('task_id', p_task_id)
  );
  delete from public.chess_club_training_tasks where id = p_task_id;
end;
$$;

create or replace function public.update_chess_club_group_tournament(
  p_tournament_id uuid,
  p_name text,
  p_initial_seconds integer,
  p_increment_seconds integer,
  p_max_players integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
  v_status text;
begin
  select training_group.club_id, tournament.status into v_club_id, v_status
  from public.chess_tournaments tournament
  join public.chess_club_groups training_group on training_group.id = tournament.club_group_id
  where tournament.id = p_tournament_id
  for update of tournament;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Turniere ändern';
  end if;
  if v_status <> 'open' then raise exception 'Laufende oder beendete Turniere können nicht geändert werden'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 80 then raise exception 'Der Turniername muss 3 bis 80 Zeichen lang sein'; end if;
  if p_initial_seconds not between 60 and 3600 or p_increment_seconds not between 0 and 60 then raise exception 'Ungültige Bedenkzeit'; end if;
  if p_max_players not between 2 and 16 then raise exception 'Ein Turnier braucht Platz für 2 bis 16 Spieler'; end if;
  if p_max_players < (select count(*) from public.chess_tournament_players where tournament_id = p_tournament_id) then
    raise exception 'Die maximale Spielerzahl kann nicht unter die aktuelle Anmeldezahl gesetzt werden';
  end if;
  update public.chess_tournaments
  set name = trim(p_name), initial_seconds = p_initial_seconds,
    increment_seconds = p_increment_seconds, max_players = p_max_players
  where id = p_tournament_id;
  perform public.log_chess_club_admin_action(
    'chess_club_tournament_updated', v_club_id, null, jsonb_build_object('tournament_id', p_tournament_id)
  );
end;
$$;

create or replace function public.delete_chess_club_group_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_club_id uuid;
  v_status text;
begin
  select training_group.club_id, tournament.status into v_club_id, v_status
  from public.chess_tournaments tournament
  join public.chess_club_groups training_group on training_group.id = tournament.club_group_id
  where tournament.id = p_tournament_id
  for update of tournament;
  if not public.can_manage_chess_club(v_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Turniere löschen';
  end if;
  if v_status <> 'open' then raise exception 'Laufende oder beendete Turniere können nicht gelöscht werden'; end if;
  perform public.log_chess_club_admin_action(
    'chess_club_tournament_deleted', v_club_id, null, jsonb_build_object('tournament_id', p_tournament_id)
  );
  delete from public.chess_tournaments where id = p_tournament_id;
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
  v_admin boolean := public.admin_can_manage_chess_clubs();
  v_target_role text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Anmeldung erforderlich'; end if;
  perform 1 from public.chess_clubs where id = p_club_id for update;
  if not found then raise exception 'Verein nicht gefunden'; end if;
  if not public.can_manage_chess_club(p_club_id) then
    raise exception using errcode = '42501', message = 'Nur der Vereinsgründer oder die zuständige Administration kann Mitglieder entfernen';
  end if;
  if p_user_id = v_actor then raise exception 'Du kannst dein eigenes Konto nicht aus dem Verein entfernen'; end if;

  select role into v_target_role
  from public.chess_club_members
  where club_id = p_club_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Diese Person ist kein Mitglied dieses Vereins'; end if;
  if v_target_role = 'owner' and not v_admin then
    raise exception 'Der Vereinsgründer kann nur durch die zuständige Administration entfernt werden';
  end if;

  delete from public.chess_tournament_players participant
  using public.chess_tournaments tournament, public.chess_club_groups training_group
  where participant.tournament_id = tournament.id
    and tournament.club_group_id = training_group.id
    and training_group.club_id = p_club_id
    and tournament.status = 'open'
    and participant.user_id = p_user_id;
  delete from public.chess_club_group_members group_member
  using public.chess_club_groups training_group
  where group_member.group_id = training_group.id
    and training_group.club_id = p_club_id
    and group_member.user_id = p_user_id;
  delete from public.chess_club_members
  where club_id = p_club_id and user_id = p_user_id;
  perform public.log_chess_club_admin_action(
    'chess_club_member_removed', p_club_id, p_user_id, '{}'::jsonb
  );
end;
$$;

revoke all on function public.admin_can_manage_chess_clubs() from public, anon;
grant execute on function public.admin_can_manage_chess_clubs() to authenticated;
revoke all on function public.can_manage_chess_club(uuid) from public, anon, authenticated;
revoke all on function public.log_chess_club_admin_action(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_list_chess_club_groups() from public, anon;
grant execute on function public.admin_list_chess_club_groups() to authenticated;
revoke all on function public.join_chess_tournament(uuid) from public, anon;
grant execute on function public.join_chess_tournament(uuid) to authenticated;
revoke all on function public.list_chess_tournaments() from public, anon;
grant execute on function public.list_chess_tournaments() to authenticated;

revoke all on function public.update_chess_club(uuid, text) from public, anon;
revoke all on function public.delete_chess_club(uuid) from public, anon;
revoke all on function public.update_chess_club_group(uuid, text) from public, anon;
revoke all on function public.delete_chess_club_group(uuid) from public, anon;
revoke all on function public.update_chess_club_training_plan(uuid, text, text, timestamptz, integer) from public, anon;
revoke all on function public.delete_chess_club_training_plan(uuid) from public, anon;
revoke all on function public.update_chess_club_training_task(uuid, uuid, text, text, text, timestamptz) from public, anon;
revoke all on function public.delete_chess_club_training_task(uuid) from public, anon;
revoke all on function public.update_chess_club_group_tournament(uuid, text, integer, integer, integer) from public, anon;
revoke all on function public.delete_chess_club_group_tournament(uuid) from public, anon;

grant execute on function public.update_chess_club(uuid, text) to authenticated;
grant execute on function public.delete_chess_club(uuid) to authenticated;
grant execute on function public.update_chess_club_group(uuid, text) to authenticated;
grant execute on function public.delete_chess_club_group(uuid) to authenticated;
grant execute on function public.update_chess_club_training_plan(uuid, text, text, timestamptz, integer) to authenticated;
grant execute on function public.delete_chess_club_training_plan(uuid) to authenticated;
grant execute on function public.update_chess_club_training_task(uuid, uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.delete_chess_club_training_task(uuid) to authenticated;
grant execute on function public.update_chess_club_group_tournament(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.delete_chess_club_group_tournament(uuid) to authenticated;

notify pgrst, 'reload schema';
