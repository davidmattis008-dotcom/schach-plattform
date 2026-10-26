create or replace function public.get_my_learning_context(p_purpose text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_progress jsonb;
  v_context jsonb := '{}'::jsonb;
  v_key text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;
  if p_purpose is null or p_purpose not in ('game_review', 'tactic_hint', 'training_plan', 'course_question') then
    raise exception 'Ungültiger CageAI-Anfragezweck';
  end if;

  select progress into v_progress
  from public.account_learning_progress
  where user_id = auth.uid();
  v_progress := coalesce(v_progress, '{}'::jsonb);

  if p_purpose = 'course_question' then
    return '{}'::jsonb;
  end if;

  if v_progress ? 'schach-taktik-progress-v1' then
    v_context := v_context || jsonb_build_object(
      'schach-taktik-progress-v1',
      jsonb_build_object(
        'rating', v_progress->'schach-taktik-progress-v1'->'rating',
        'solved', v_progress->'schach-taktik-progress-v1'->'solved',
        'attempted', v_progress->'schach-taktik-progress-v1'->'attempted',
        'dailyExercisesCompleted', v_progress->'schach-taktik-progress-v1'->'dailyExercisesCompleted'
      )
    );
  end if;

  if p_purpose = 'training_plan' then
    foreach v_key in array array[
      'schach-regeln-lernen-v1',
      'schach-eroeffnungen-gelernt-v1',
      'schach-mattsetzen-kurs-v1',
      'schach-endspiel-lernen-v1'
    ] loop
      v_context := v_context || jsonb_build_object(
        v_key,
        case
          when jsonb_typeof(v_progress->v_key) = 'array'
            then least(2000, jsonb_array_length(v_progress->v_key))
          else 0
        end
      );
    end loop;
  end if;

  return v_context;
end;
$$;

revoke all on function public.get_my_learning_context(text) from public, anon;
grant execute on function public.get_my_learning_context(text) to authenticated;

notify pgrst, 'reload schema';
