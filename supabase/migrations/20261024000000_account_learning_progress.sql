create table if not exists public.account_learning_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  updated_at timestamptz not null default now(),
  constraint account_learning_progress_size check (octet_length(progress::text) <= 150000)
);

alter table public.account_learning_progress enable row level security;
revoke all on public.account_learning_progress from public, anon, authenticated;

create or replace function public.sync_my_learning_progress(p_progress jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing jsonb;
  v_result jsonb := '{}'::jsonb;
  v_value jsonb;
  v_key text;
  v_rating integer;
  v_solved integer;
  v_attempted integer;
  v_existing_attempted integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Anmeldung erforderlich';
  end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object'
    or octet_length(p_progress::text) > 150000
    or (p_progress - array[
      'schach-selbstlernen-v1',
      'schach-regeln-lernen-v1',
      'schach-eroeffnungen-gelernt-v1',
      'schach-mattsetzen-kurs-v1',
      'schach-endspiel-lernen-v1',
      'schach-taktik-progress-v1'
    ]) <> '{}'::jsonb then
    raise exception 'Ungültiger Fortschrittsdatensatz';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select progress into v_existing
  from public.account_learning_progress
  where user_id = v_user_id
  for update;
  v_existing := coalesce(v_existing, '{}'::jsonb);

  foreach v_key in array array[
    'schach-selbstlernen-v1',
    'schach-regeln-lernen-v1',
    'schach-eroeffnungen-gelernt-v1',
    'schach-mattsetzen-kurs-v1',
    'schach-endspiel-lernen-v1'
  ] loop
    if p_progress ? v_key then
      if jsonb_typeof(p_progress->v_key) <> 'array'
        or jsonb_array_length(p_progress->v_key) > 2000
        or exists (
          select 1
          from jsonb_array_elements(p_progress->v_key) as item(value)
          where jsonb_typeof(item.value) <> 'string'
        ) then
        raise exception 'Ungültiger Lernfortschritt';
      end if;
      select coalesce(jsonb_agg(to_jsonb(items.value) order by items.value), '[]'::jsonb)
      into v_value
      from (
        select distinct source.value
        from jsonb_array_elements_text(
          case when jsonb_typeof(v_existing->v_key) = 'array' then v_existing->v_key else '[]'::jsonb end
          || p_progress->v_key
        ) as source(value)
      ) as items;
      v_result := v_result || jsonb_build_object(v_key, v_value);
    elsif v_existing ? v_key then
      v_result := v_result || jsonb_build_object(v_key, v_existing->v_key);
    end if;
  end loop;

  if p_progress ? 'schach-taktik-progress-v1' then
    if jsonb_typeof(p_progress->'schach-taktik-progress-v1') <> 'object'
      or jsonb_typeof(p_progress->'schach-taktik-progress-v1'->'rating') is distinct from 'number'
      or jsonb_typeof(p_progress->'schach-taktik-progress-v1'->'solved') is distinct from 'number'
      or jsonb_typeof(p_progress->'schach-taktik-progress-v1'->'attempted') is distinct from 'number'
      or jsonb_typeof(p_progress->'schach-taktik-progress-v1'->'recent') is distinct from 'array'
      or (p_progress->'schach-taktik-progress-v1'->>'rating')::integer not between 400 and 2400
      or (p_progress->'schach-taktik-progress-v1'->>'solved')::integer not between 0 and 100000
      or (p_progress->'schach-taktik-progress-v1'->>'attempted')::integer not between 0 and 100000
      or jsonb_array_length(p_progress->'schach-taktik-progress-v1'->'recent') > 2000
      or exists (
        select 1
        from jsonb_array_elements(p_progress->'schach-taktik-progress-v1'->'recent') as item(value)
        where jsonb_typeof(item.value) <> 'string'
      ) then
      raise exception 'Ungültiger Taktikfortschritt';
    end if;

    v_solved := greatest(
      coalesce((v_existing->'schach-taktik-progress-v1'->>'solved')::integer, 0),
      (p_progress->'schach-taktik-progress-v1'->>'solved')::integer
    );
    v_attempted := greatest(
      coalesce((v_existing->'schach-taktik-progress-v1'->>'attempted')::integer, 0),
      (p_progress->'schach-taktik-progress-v1'->>'attempted')::integer
    );
    v_existing_attempted := coalesce((v_existing->'schach-taktik-progress-v1'->>'attempted')::integer, 0);
    v_rating := case
      when (p_progress->'schach-taktik-progress-v1'->>'attempted')::integer >= v_existing_attempted
        then (p_progress->'schach-taktik-progress-v1'->>'rating')::integer
      else coalesce((v_existing->'schach-taktik-progress-v1'->>'rating')::integer, 1000)
    end;
    select coalesce(jsonb_agg(to_jsonb(recent.id) order by recent.last_position), '[]'::jsonb)
    into v_value
    from (
      select merged.id, max(merged.position) as last_position
      from (
        select item.value as id, item.ordinality as position
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(v_existing->'schach-taktik-progress-v1'->'recent') = 'array'
              then v_existing->'schach-taktik-progress-v1'->'recent'
            else '[]'::jsonb
          end
        ) with ordinality as item(value, ordinality)
        union all
        select item.value as id, item.ordinality + 2000 as position
        from jsonb_array_elements_text(p_progress->'schach-taktik-progress-v1'->'recent')
          with ordinality as item(value, ordinality)
      ) as merged
      group by merged.id
      order by max(merged.position) desc
      limit 2000
    ) as recent;
    v_result := v_result || jsonb_build_object(
      'schach-taktik-progress-v1',
      jsonb_build_object(
        'rating', v_rating,
        'solved', v_solved,
        'attempted', v_attempted,
        'recent', v_value
      )
    );
  elsif v_existing ? 'schach-taktik-progress-v1' then
    v_result := v_result || jsonb_build_object('schach-taktik-progress-v1', v_existing->'schach-taktik-progress-v1');
  end if;

  insert into public.account_learning_progress(user_id, progress, updated_at)
  values (v_user_id, v_result, now())
  on conflict (user_id) do update
    set progress = excluded.progress,
        updated_at = excluded.updated_at;
  return v_result;
end;
$$;

revoke all on function public.sync_my_learning_progress(jsonb) from public, anon;
grant execute on function public.sync_my_learning_progress(jsonb) to authenticated;

notify pgrst, 'reload schema';
