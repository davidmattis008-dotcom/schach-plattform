do $$
begin
  if exists (
    select 1
    from public.profiles
    where username is not null
    group by lower(username)
    having count(*) > 1
  ) then
    raise exception 'Profiles contain usernames that differ only by letter case. Resolve those duplicates before applying this migration.';
  end if;
end;
$$;

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));

create or replace function public.lookup_auth_email_by_username(p_username text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p_username ~ '^[a-zA-Z0-9_]{3,20}$'
    and lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

revoke all on function public.lookup_auth_email_by_username(text) from public, anon, authenticated;
grant execute on function public.lookup_auth_email_by_username(text) to service_role;
