create or replace function public.list_public_profile_games(p_username text)
returns table (record jsonb)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', left(a.record->>'id', 200),
    'playedAt', left(a.record->>'playedAt', 40),
    'timeControl', left(a.record->>'timeControl', 20),
    'whiteName', left(a.record->>'whiteName', 20),
    'blackName', left(a.record->>'blackName', 20),
    'color', left(a.record->>'color', 1),
    'result', a.record->'result',
    'resultText', left(a.record->>'resultText', 30),
    'reason', left(a.record->>'reason', 200),
    'moves', (
      select coalesce(
        jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'san', left(move.value->>'san', 16),
          'color', left(move.value->>'color', 1),
          'from', left(move.value->>'from', 2),
          'to', left(move.value->>'to', 2),
          'promotion', left(move.value->>'promotion', 1)
        )) order by move.ordinality),
        '[]'::jsonb
      )
      from jsonb_array_elements(a.record->'moves') with ordinality as move(value, ordinality)
    )
  ))
  from public.online_game_archive a
  join public.profiles p on p.id = a.user_id
  where p.username = left(trim(coalesce(p_username, '')), 20)
    and jsonb_typeof(a.record->'moves') = 'array'
    and jsonb_array_length(a.record->'moves') <= 500
  order by a.saved_at desc
  limit 5;
$$;

revoke all on function public.list_public_profile_games(text) from public, anon, authenticated;
grant execute on function public.list_public_profile_games(text) to anon, authenticated;

notify pgrst, 'reload schema';
