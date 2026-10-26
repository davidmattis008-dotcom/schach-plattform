create table if not exists public.cage_ai_training_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null check (
    jsonb_typeof(preferences) = 'object'
    and octet_length(preferences::text) <= 2000
  ),
  plan jsonb not null check (
    jsonb_typeof(plan) = 'object'
    and octet_length(plan::text) <= 20000
  ),
  updated_at timestamptz not null default now()
);

alter table public.cage_ai_training_plans enable row level security;
revoke all on public.cage_ai_training_plans from public, anon;
grant select, insert, update on public.cage_ai_training_plans to authenticated;

create policy "Users can read their own CageAI training plan"
  on public.cage_ai_training_plans
  for select
  to authenticated
  using (user_id = (select auth.uid()) and public.has_site_access());

create policy "Users can create their own CageAI training plan"
  on public.cage_ai_training_plans
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and public.has_site_access());

create policy "Users can update their own CageAI training plan"
  on public.cage_ai_training_plans
  for update
  to authenticated
  using (user_id = (select auth.uid()) and public.has_site_access())
  with check (user_id = (select auth.uid()) and public.has_site_access());

create or replace function public.get_my_recent_game_training_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_summary jsonb;
begin
  if auth.uid() is null or not public.has_site_access() then
    raise exception using errcode = '42501', message = 'Authorized account required';
  end if;

  with recent_games as (
    select
      record->>'result' as result,
      case
        when jsonb_typeof(record->'moves') = 'array'
          then least(jsonb_array_length(record->'moves'), 500)
        else 0
      end as move_count,
      left(coalesce(record->>'timeControl', ''), 20) as time_control
    from public.online_game_archive
    where user_id = auth.uid()
    order by saved_at desc
    limit 20
  )
  select jsonb_build_object(
    'sampleSize', count(*),
    'wins', count(*) filter (where result = 'win'),
    'draws', count(*) filter (where result = 'draw'),
    'losses', count(*) filter (where result = 'loss'),
    'averageMoves', coalesce(round(avg(move_count)), 0)::integer,
    'timeControls', coalesce((
      select jsonb_agg(distinct time_control order by time_control)
      from recent_games
      where time_control <> ''
    ), '[]'::jsonb)
  )
  into v_summary
  from recent_games;

  return v_summary;
end;
$$;

revoke all on function public.get_my_recent_game_training_summary() from public, anon;
grant execute on function public.get_my_recent_game_training_summary() to authenticated;

create or replace function public.set_my_cage_ai_training_task(
  p_task_id text,
  p_completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan jsonb;
  v_tasks jsonb;
begin
  if auth.uid() is null or not public.has_site_access() then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;
  if p_task_id is null or char_length(p_task_id) > 100 or p_completed is null then
    raise exception 'Ungültige Trainingsaufgabe';
  end if;

  select plan into v_plan
  from public.cage_ai_training_plans
  where user_id = auth.uid()
  for update;
  if v_plan is null then
    raise exception 'Kein Trainingsplan vorhanden';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(v_plan->'tasks') as task(value)
    where task.value->>'id' = p_task_id
  ) then
    raise exception 'Trainingsaufgabe nicht gefunden';
  end if;

  select jsonb_agg(
    case
      when task.value->>'id' = p_task_id
        then jsonb_set(task.value, '{completed}', to_jsonb(p_completed), true)
      else task.value
    end
    order by task.ordinality
  )
  into v_tasks
  from jsonb_array_elements(v_plan->'tasks') with ordinality as task(value, ordinality);

  v_plan := jsonb_set(v_plan, '{tasks}', v_tasks, true);
  update public.cage_ai_training_plans
  set plan = v_plan, updated_at = now()
  where user_id = auth.uid();
  return v_plan;
end;
$$;

revoke all on function public.set_my_cage_ai_training_task(text, boolean) from public, anon;
grant execute on function public.set_my_cage_ai_training_task(text, boolean) to authenticated;
