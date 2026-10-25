create table if not exists public.site_access_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_access_allowlist enable row level security;
revoke all on public.site_access_allowlist from public, anon, authenticated;

insert into public.site_access_allowlist (user_id, enabled, granted_by)
select user_id, true, user_id
from public.site_admins
on conflict (user_id) do update
set enabled = true, updated_at = now();

create or replace function public.has_site_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.site_access_allowlist a
      where a.user_id = auth.uid() and a.enabled
    )
    or public.is_site_admin(array['owner', 'admin', 'moderator'])
  );
$$;

revoke all on function public.has_site_access() from public;
grant execute on function public.has_site_access() to anon, authenticated, service_role;

create or replace function public.get_my_site_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.has_site_access();
$$;

revoke all on function public.get_my_site_access() from public, anon;
grant execute on function public.get_my_site_access() to authenticated;

create or replace function public.enforce_site_access()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() = 'service_role' then return; end if;
  if not public.has_site_access() then
    raise exception using errcode = '42501', message = 'Account is not authorized for this application';
  end if;
end;
$$;

revoke all on function public.enforce_site_access() from public;
grant execute on function public.enforce_site_access() to authenticator, anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_site_access';
notify pgrst, 'reload config';

create or replace function public.admin_list_site_access_users(p_query text)
returns table (user_id uuid, username text, email text, has_access boolean, is_admin boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
begin
  if not public.is_site_admin(array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'Keine Admin-Berechtigung';
  end if;
  if char_length(v_query) < 2 or char_length(v_query) > 254 then
    raise exception 'Die Suche muss zwischen 2 und 254 Zeichen lang sein';
  end if;

  return query
  select p.id,
    pr.username,
    p.email,
    coalesce(a.enabled, false) or (sa.user_id is not null),
    sa.user_id is not null
  from auth.users p
  left join public.profiles pr on pr.id = p.id
  left join public.site_access_allowlist a on a.user_id = p.id
  left join public.site_admins sa on sa.user_id = p.id
  where position(lower(v_query) in lower(coalesce(pr.username, ''))) > 0
    or position(lower(v_query) in lower(coalesce(p.email, ''))) > 0
  order by coalesce(pr.username, p.email)
  limit 50;
end;
$$;

create or replace function public.admin_set_site_access(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_site_admin(array['owner', 'admin']) then
    raise exception using errcode = '42501', message = 'Keine Admin-Berechtigung';
  end if;
  if p_user_id is null or p_enabled is null then
    raise exception 'Ungültige Zugriffsänderung';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Konto nicht gefunden';
  end if;
  if exists (select 1 from public.site_admins a where a.user_id = p_user_id) then
    raise exception 'Administrationskonten behalten dauerhaft Zugriff';
  end if;

  insert into public.site_access_allowlist (user_id, enabled, granted_by, updated_at)
  values (p_user_id, p_enabled, auth.uid(), now())
  on conflict (user_id) do update
  set enabled = excluded.enabled,
      granted_by = excluded.granted_by,
      updated_at = now();

  insert into public.admin_audit_log (actor_id, action, target_user_id, details)
  values (
    auth.uid(),
    case when p_enabled then 'site_access_granted' else 'site_access_revoked' end,
    p_user_id,
    jsonb_build_object('enabled', p_enabled)
  );
end;
$$;

create or replace function public.get_profile_avatar_path(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_avatar_url text;
  v_marker text := '/storage/v1/object/public/profile-avatars/';
  v_marker_position integer;
  v_object_path text;
begin
  if not public.has_site_access() then
    raise exception using errcode = '42501', message = 'Keine Zugriffsberechtigung';
  end if;

  select p.avatar_url into v_avatar_url
  from public.profiles p
  where p.id = p_user_id;
  if v_avatar_url is null then return null; end if;

  v_marker_position := strpos(v_avatar_url, v_marker);
  if v_marker_position > 0 then
    v_object_path := split_part(
      substr(v_avatar_url, v_marker_position + length(v_marker)),
      '?',
      1
    );
  elsif v_avatar_url ~ '^[0-9a-fA-F-]{36}/' then
    v_object_path := v_avatar_url;
  else
    return null;
  end if;

  if split_part(v_object_path, '/', 1) <> p_user_id::text then return null; end if;
  return v_object_path;
end;
$$;

revoke all on function public.admin_list_site_access_users(text) from public, anon;
revoke all on function public.admin_set_site_access(uuid, boolean) from public, anon;
revoke all on function public.get_profile_avatar_path(uuid) from public, anon;
grant execute on function public.admin_list_site_access_users(text) to authenticated;
grant execute on function public.admin_set_site_access(uuid, boolean) to authenticated;
grant execute on function public.get_profile_avatar_path(uuid) to authenticated;

revoke all on function public.get_public_profile(text) from anon;
grant execute on function public.get_public_profile(text) to authenticated;
revoke all on function public.list_public_profile_games(text) from anon;
grant execute on function public.list_public_profile_games(text) to authenticated;

do $$
declare
  v_table record;
begin
  for v_table in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  loop
    execute format(
      'drop policy if exists site_access_gate on %I.%I',
      v_table.nspname,
      v_table.relname
    );
    execute format(
      'create policy site_access_gate on %I.%I as restrictive for all to anon, authenticated using (public.has_site_access()) with check (public.has_site_access())',
      v_table.nspname,
      v_table.relname
    );
  end loop;
end;
$$;

update storage.buckets
set public = false
where id = 'profile-avatars';

drop policy if exists "Public profile avatars are viewable" on storage.objects;
drop policy if exists "Authorized test users can view profile avatars" on storage.objects;
create policy "Authorized test users can view profile avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-avatars' and public.has_site_access());

drop policy if exists "Users upload their own profile avatars" on storage.objects;
create policy "Users upload their own profile avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and public.has_site_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update their own profile avatars" on storage.objects;
create policy "Users update their own profile avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-avatars'
    and public.has_site_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and public.has_site_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete their own profile avatars" on storage.objects;
create policy "Users delete their own profile avatars"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and public.has_site_access()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists site_access_gate on realtime.messages;
create policy site_access_gate
  on realtime.messages as restrictive for all to anon, authenticated
  using (public.has_site_access())
  with check (public.has_site_access());
drop policy if exists "Authorized test accounts can use realtime channels" on realtime.messages;
create policy "Authorized test accounts can use realtime channels"
  on realtime.messages for all to authenticated
  using (public.has_site_access())
  with check (public.has_site_access());

notify pgrst, 'reload schema';
