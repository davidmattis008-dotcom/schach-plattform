create table if not exists public.cage_ai_knowledge_sources (
  source_key text primary key check (source_key ~ '^[a-z0-9:_-]{1,120}$'),
  title text not null check (char_length(title) between 1 and 200),
  source_url text not null check (
    char_length(source_url) between 1 and 200
    and left(source_url, 1) = '/'
    and left(source_url, 2) <> '//'
  ),
  visibility text not null check (visibility in ('public', 'authenticated', 'admin')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.cage_ai_knowledge_chunks (
  source_key text not null references public.cage_ai_knowledge_sources(source_key) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  heading text not null check (char_length(heading) between 1 and 200),
  content text not null check (char_length(content) between 1 and 8000),
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(heading, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) stored,
  primary key (source_key, chunk_index)
);

create index if not exists cage_ai_knowledge_chunks_search_idx
  on public.cage_ai_knowledge_chunks using gin (search_vector);

alter table public.cage_ai_knowledge_sources enable row level security;
alter table public.cage_ai_knowledge_chunks enable row level security;
revoke all on public.cage_ai_knowledge_sources, public.cage_ai_knowledge_chunks
  from public, anon, authenticated;

create or replace function public.sync_cage_ai_knowledge(p_sources jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source jsonb;
  v_chunk jsonb;
  v_source_key text;
  v_title text;
  v_source_url text;
  v_visibility text;
  v_content_hash text;
  v_chunks jsonb;
  v_source_keys text[];
  v_existing_hash text;
  v_existing_title text;
  v_existing_url text;
  v_existing_visibility text;
  v_updated integer := 0;
  v_unchanged integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;
  perform pg_advisory_xact_lock(hashtext('cage_ai_knowledge_sync'));
  if p_sources is null
    or jsonb_typeof(p_sources) is distinct from 'array'
    or jsonb_array_length(p_sources) < 1
    or jsonb_array_length(p_sources) > 250
    or octet_length(p_sources::text) > 1000000 then
    raise exception 'Invalid CageAI knowledge payload';
  end if;

  if (
    select count(*) <> count(distinct value->>'sourceKey')
    from jsonb_array_elements(p_sources)
  ) then
    raise exception 'Duplicate CageAI knowledge source key';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_sources) as entry(value)
    where coalesce(entry.value->>'sourceKey', '') not like 'course:%'
  ) then
    raise exception 'The course knowledge sync may only manage course sources';
  end if;

  for v_source in select value from jsonb_array_elements(p_sources)
  loop
    v_source_key := v_source->>'sourceKey';
    v_title := v_source->>'title';
    v_source_url := v_source->>'sourceUrl';
    v_visibility := v_source->>'visibility';
    v_content_hash := v_source->>'contentHash';
    v_chunks := v_source->'chunks';

    if jsonb_typeof(v_source) <> 'object'
      or coalesce(v_source_key, '') !~ '^[a-z0-9:_-]{1,120}$'
      or char_length(coalesce(v_title, '')) not between 1 and 200
      or char_length(coalesce(v_source_url, '')) not between 1 and 200
      or left(coalesce(v_source_url, ''), 1) <> '/'
      or left(coalesce(v_source_url, ''), 2) = '//'
      or coalesce(v_visibility, '') not in ('public', 'authenticated', 'admin')
      or coalesce(v_content_hash, '') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(v_chunks) is distinct from 'array'
      or jsonb_array_length(v_chunks) < 1
      or jsonb_array_length(v_chunks) > 40 then
      raise exception 'Invalid CageAI knowledge source';
    end if;

    for v_chunk in select value from jsonb_array_elements(v_chunks)
    loop
      if jsonb_typeof(v_chunk) is distinct from 'object'
        or char_length(coalesce(v_chunk->>'heading', '')) not between 1 and 200
        or char_length(coalesce(v_chunk->>'content', '')) not between 1 and 8000 then
        raise exception 'Invalid CageAI knowledge chunk';
      end if;
    end loop;
  end loop;

  for v_source in select value from jsonb_array_elements(p_sources)
  loop
    v_source_key := v_source->>'sourceKey';
    v_title := v_source->>'title';
    v_source_url := v_source->>'sourceUrl';
    v_visibility := v_source->>'visibility';
    v_content_hash := v_source->>'contentHash';
    v_chunks := v_source->'chunks';

    select source.content_hash, source.title, source.source_url, source.visibility
      into v_existing_hash, v_existing_title, v_existing_url, v_existing_visibility
    from public.cage_ai_knowledge_sources as source
    where source.source_key = v_source_key;

    if found
      and v_existing_hash = v_content_hash
      and v_existing_title = v_title
      and v_existing_url = v_source_url
      and v_existing_visibility = v_visibility then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    insert into public.cage_ai_knowledge_sources (
      source_key, title, source_url, visibility, content_hash, updated_at
    ) values (
      v_source_key, v_title, v_source_url, v_visibility, v_content_hash, now()
    )
    on conflict (source_key) do update
    set title = excluded.title,
        source_url = excluded.source_url,
        visibility = excluded.visibility,
        content_hash = excluded.content_hash,
        updated_at = now();

    delete from public.cage_ai_knowledge_chunks as chunk
    where chunk.source_key = v_source_key;

    insert into public.cage_ai_knowledge_chunks (source_key, chunk_index, heading, content)
    select
      v_source_key,
      (entry.ordinality - 1)::integer,
      entry.value->>'heading',
      entry.value->>'content'
    from jsonb_array_elements(v_chunks) with ordinality as entry(value, ordinality);

    v_updated := v_updated + 1;
  end loop;

  select array_agg(value->>'sourceKey') into v_source_keys
  from jsonb_array_elements(p_sources);
  delete from public.cage_ai_knowledge_sources as source
  where source.source_key like 'course:%'
    and not (source.source_key = any(v_source_keys));

  return jsonb_build_object('updated', v_updated, 'unchanged', v_unchanged);
end;
$$;

revoke all on function public.sync_cage_ai_knowledge(jsonb) from public, anon, authenticated;
grant execute on function public.sync_cage_ai_knowledge(jsonb) to service_role;

drop function if exists public.search_cage_ai_knowledge(text, integer);

create or replace function public.search_cage_ai_knowledge(
  p_query text,
  p_limit integer default 5,
  p_source_keys text[] default null
)
returns table (
  source_key text,
  title text,
  source_url text,
  heading text,
  content text,
  rank real
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_query_text text;
  v_query tsquery;
  v_is_admin boolean;
begin
  if auth.uid() is null or not public.has_site_access() then
    raise exception using errcode = '42501', message = 'Authorized account required';
  end if;
  if p_query is null or char_length(p_query) > 500 then
    raise exception 'Invalid CageAI search query';
  end if;
  if p_source_keys is not null and (
    cardinality(p_source_keys) > 5
    or exists (
      select 1 from unnest(p_source_keys) as requested(source_key)
      where source_key !~ '^course:(lesson|rule|checkmate|opening):[a-z0-9-]{1,80}$'
    )
  ) then
    raise exception 'Invalid CageAI source filter';
  end if;

  v_query_text := trim(regexp_replace(lower(p_query), '[^[:alnum:]]+', ' ', 'g'));
  if v_query_text = '' then
    return;
  end if;
  select string_agg(words.word, ' | ') into v_query_text
  from (
    select distinct token as word
    from regexp_split_to_table(v_query_text, '\s+') as token
    where token <> ''
    limit 50
  ) as words;
  if v_query_text is null then return; end if;
  v_query := to_tsquery('simple', v_query_text);
  v_is_admin := public.is_site_admin(array['owner', 'admin']);

  return query
  select source.source_key,
    source.title,
    source.source_url,
    chunk.heading,
    chunk.content,
    ts_rank_cd(chunk.search_vector, v_query)::real
  from public.cage_ai_knowledge_chunks as chunk
  join public.cage_ai_knowledge_sources as source using (source_key)
  where chunk.search_vector @@ v_query
    and (p_source_keys is null or source.source_key = any(p_source_keys))
    and (source.visibility in ('public', 'authenticated')
      or (v_is_admin and source.visibility = 'admin'))
  order by ts_rank_cd(chunk.search_vector, v_query) desc, source.source_key, chunk.chunk_index
  limit least(greatest(coalesce(p_limit, 5), 1), 5);
end;
$$;

revoke all on function public.search_cage_ai_knowledge(text, integer, text[]) from public, anon;
grant execute on function public.search_cage_ai_knowledge(text, integer, text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
