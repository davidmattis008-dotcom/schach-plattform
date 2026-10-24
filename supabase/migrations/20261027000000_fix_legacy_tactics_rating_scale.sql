create or replace function public.sync_my_learning_progress(p_progress jsonb)
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
  v_legacy_input jsonb := p_progress;
  v_result jsonb;
  v_result_tactics jsonb;
  v_input_attempted integer := 0;
  v_existing_attempted integer := 0;
  v_rating integer;
  v_placement_attempts integer;
  v_difficulty_offset integer;
  v_raw_rating integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object'
    or octet_length(p_progress::text) > 150000 then
    raise exception 'Ungültiger Fortschrittsdatensatz';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select progress into v_existing
  from public.account_learning_progress
  where user_id = v_user_id
  for update;
  v_existing_tactics := v_existing->'schach-taktik-progress-v1';
  v_input_tactics := p_progress->'schach-taktik-progress-v1';

  if v_input_tactics is not null and jsonb_typeof(v_input_tactics) <> 'object' then
    raise exception 'Ungültiger Taktikfortschritt';
  end if;
  if v_input_tactics is not null then
    if v_input_tactics ? 'ratingScaleVersion' then
      if jsonb_typeof(v_input_tactics->'ratingScaleVersion') is distinct from 'number'
        or v_input_tactics->>'ratingScaleVersion' <> '2'
        or jsonb_typeof(v_input_tactics->'rating') is distinct from 'number'
        or (v_input_tactics->>'rating') !~ '^\d+$'
        or (v_input_tactics->>'rating')::integer not between 0 and 3000 then
        raise exception 'Ungültige Taktik-Elo';
      end if;
      v_raw_rating := greatest(
        400,
        least(2400, round(400 + ((v_input_tactics->>'rating')::numeric * 2000 / 3000))::integer)
      );
      v_legacy_input := jsonb_set(
        p_progress,
        '{schach-taktik-progress-v1,rating}',
        to_jsonb(v_raw_rating),
        true
      );
    end if;
    if v_input_tactics ? 'placementAttempts'
      and (jsonb_typeof(v_input_tactics->'placementAttempts') is distinct from 'number'
        or (v_input_tactics->>'placementAttempts') !~ '^\d+$'
        or (v_input_tactics->>'placementAttempts')::integer not between 0 and 5) then
      raise exception 'Ungültiger Elo-Einstufungsfortschritt';
    end if;
    if v_input_tactics ? 'difficultyOffset'
      and (jsonb_typeof(v_input_tactics->'difficultyOffset') is distinct from 'number'
        or v_input_tactics->>'difficultyOffset' not in ('-300', '-200', '-100', '0', '100', '200', '300')) then
      raise exception 'Ungültige Taktik-Aufgabenstärke';
    end if;
    if v_input_tactics ? 'attempted' then
      v_input_attempted := (v_input_tactics->>'attempted')::integer;
    end if;
  end if;
  if v_existing_tactics is not null and v_existing_tactics ? 'attempted' then
    v_existing_attempted := (v_existing_tactics->>'attempted')::integer;
  end if;

  v_result := public.sync_my_learning_progress_legacy(v_legacy_input);
  v_result_tactics := v_result->'schach-taktik-progress-v1';
  if v_result_tactics is null then
    return v_result;
  end if;

  if v_input_tactics is not null and v_input_tactics ? 'rating'
    and v_input_attempted >= v_existing_attempted then
    if v_input_tactics->>'ratingScaleVersion' = '2' then
      v_rating := (v_input_tactics->>'rating')::integer;
    else
      v_rating := round(
        ((greatest(400, least(2400, (v_input_tactics->>'rating')::numeric)) - 400) * 3000 / 2000)
      )::integer;
    end if;
  elsif v_existing_tactics is not null and v_existing_tactics ? 'rating' then
    if v_existing_tactics->>'ratingScaleVersion' = '2' then
      v_rating := (v_existing_tactics->>'rating')::integer;
    else
      v_rating := round(
        ((greatest(400, least(2400, (v_existing_tactics->>'rating')::numeric)) - 400) * 3000 / 2000)
      )::integer;
    end if;
  else
    v_rating := 1500;
  end if;

  if v_input_tactics is not null and v_input_tactics ? 'placementAttempts' then
    v_placement_attempts := greatest(
      coalesce((v_existing_tactics->>'placementAttempts')::integer, case when v_existing_attempted > 0 then 5 else 0 end),
      (v_input_tactics->>'placementAttempts')::integer
    );
  else
    v_placement_attempts := coalesce(
      (v_existing_tactics->>'placementAttempts')::integer,
      case when v_existing_attempted > 0 then 5 else 0 end
    );
  end if;

  if v_input_tactics is not null and v_input_tactics ? 'difficultyOffset' then
    v_difficulty_offset := (v_input_tactics->>'difficultyOffset')::integer;
  else
    v_difficulty_offset := coalesce((v_existing_tactics->>'difficultyOffset')::integer, 0);
  end if;

  v_result_tactics := v_result_tactics || jsonb_build_object(
    'rating', greatest(0, least(3000, v_rating)),
    'placementAttempts', greatest(0, least(5, v_placement_attempts)),
    'difficultyOffset', v_difficulty_offset,
    'ratingScaleVersion', 2
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
