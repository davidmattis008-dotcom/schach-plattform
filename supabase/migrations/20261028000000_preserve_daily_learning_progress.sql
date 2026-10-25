alter function public.sync_my_learning_progress(jsonb)
  rename to sync_my_learning_progress_before_daily;

revoke all on function public.sync_my_learning_progress_before_daily(jsonb) from public, anon, authenticated;

create function public.sync_my_learning_progress(p_progress jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_existing_tactics jsonb;
  v_input_tactics jsonb;
  v_result jsonb;
  v_result_tactics jsonb;
  v_daily_completed integer;
  v_existing_completed integer;
  v_input_completed integer;
  v_existing_last_date text;
  v_input_last_date text;
  v_existing_assignment_date text;
  v_input_assignment_date text;
  v_assignment_date text;
  v_assignment_id text;
  v_existing_assignment_id text;
  v_input_assignment_id text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select progress into v_existing
  from public.account_learning_progress
  where user_id = v_user_id
  for update;

  v_existing_tactics := v_existing->'schach-taktik-progress-v1';
  v_input_tactics := p_progress->'schach-taktik-progress-v1';
  v_result := public.sync_my_learning_progress_before_daily(p_progress);
  v_result_tactics := v_result->'schach-taktik-progress-v1';

  if v_result_tactics is null then
    return v_result;
  end if;

  if v_input_tactics is not null and jsonb_typeof(v_input_tactics) = 'object' then
    if v_input_tactics ? 'dailyExercisesCompleted'
      and (
        jsonb_typeof(v_input_tactics->'dailyExercisesCompleted') is distinct from 'number'
        or (v_input_tactics->>'dailyExercisesCompleted') !~ '^\d{1,6}$'
        or (v_input_tactics->>'dailyExercisesCompleted')::integer not between 0 and 100000
      ) then
      raise exception 'Ungültiger Lernpfad-Fortschritt';
    end if;
    if v_input_tactics ? 'dailyLastCompletedDate'
      and v_input_tactics->'dailyLastCompletedDate' <> 'null'::jsonb
      and (
        jsonb_typeof(v_input_tactics->'dailyLastCompletedDate') is distinct from 'string'
        or (v_input_tactics->>'dailyLastCompletedDate') !~ '^\d{4}-\d{2}-\d{2}$'
      ) then
      raise exception 'Ungültiges Abschlussdatum des Lernpfads';
    end if;
    if v_input_tactics ? 'dailyAssignmentDate'
      and v_input_tactics->'dailyAssignmentDate' <> 'null'::jsonb
      and (
        jsonb_typeof(v_input_tactics->'dailyAssignmentDate') is distinct from 'string'
        or (v_input_tactics->>'dailyAssignmentDate') !~ '^\d{4}-\d{2}-\d{2}$'
      ) then
      raise exception 'Ungültiges Aufgaben-Datum des Lernpfads';
    end if;
    if v_input_tactics ? 'dailyAssignmentId'
      and v_input_tactics->'dailyAssignmentId' <> 'null'::jsonb
      and (
        jsonb_typeof(v_input_tactics->'dailyAssignmentId') is distinct from 'string'
        or length(v_input_tactics->>'dailyAssignmentId') > 128
      ) then
      raise exception 'Ungültige tägliche Lernpfad-Aufgabe';
    end if;
  end if;

  v_existing_completed := case
    when coalesce(v_existing_tactics->>'dailyExercisesCompleted', '') ~ '^\d{1,6}$'
      and (v_existing_tactics->>'dailyExercisesCompleted')::numeric <= 100000
      then (v_existing_tactics->>'dailyExercisesCompleted')::integer
    else 0
  end;
  v_input_completed := case
    when coalesce(v_input_tactics->>'dailyExercisesCompleted', '') ~ '^\d{1,6}$'
      then (v_input_tactics->>'dailyExercisesCompleted')::integer
    else 0
  end;
  v_daily_completed := greatest(v_existing_completed, v_input_completed);

  v_existing_last_date := case
    when coalesce(v_existing_tactics->>'dailyLastCompletedDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then v_existing_tactics->>'dailyLastCompletedDate'
    else null
  end;
  v_input_last_date := case
    when coalesce(v_input_tactics->>'dailyLastCompletedDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then v_input_tactics->>'dailyLastCompletedDate'
    else null
  end;
  v_existing_assignment_date := case
    when coalesce(v_existing_tactics->>'dailyAssignmentDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then v_existing_tactics->>'dailyAssignmentDate'
    else null
  end;
  v_input_assignment_date := case
    when coalesce(v_input_tactics->>'dailyAssignmentDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then v_input_tactics->>'dailyAssignmentDate'
    else null
  end;
  v_existing_assignment_id := case
    when length(v_existing_tactics->>'dailyAssignmentId') <= 128
      then v_existing_tactics->>'dailyAssignmentId'
    else null
  end;
  v_input_assignment_id := case
    when length(v_input_tactics->>'dailyAssignmentId') <= 128
      then v_input_tactics->>'dailyAssignmentId'
    else null
  end;

  v_assignment_date := greatest(v_existing_assignment_date, v_input_assignment_date);
  v_assignment_id := case
    when v_input_assignment_date is not null
      and (v_existing_assignment_date is null or v_input_assignment_date >= v_existing_assignment_date)
      then coalesce(v_input_assignment_id, v_existing_assignment_id)
    else v_existing_assignment_id
  end;

  v_result_tactics := v_result_tactics || jsonb_build_object(
    'dailyExercisesCompleted', v_daily_completed,
    'dailyLastCompletedDate', greatest(v_existing_last_date, v_input_last_date),
    'dailyAssignmentDate', v_assignment_date,
    'dailyAssignmentId', v_assignment_id
  );
  v_result := jsonb_set(v_result, '{schach-taktik-progress-v1}', v_result_tactics, true);

  update public.account_learning_progress
  set progress = v_result, updated_at = now()
  where user_id = v_user_id;

  return v_result;
end;
$$;

revoke all on function public.sync_my_learning_progress(jsonb) from public, anon;
grant execute on function public.sync_my_learning_progress(jsonb) to authenticated;

notify pgrst, 'reload schema';
