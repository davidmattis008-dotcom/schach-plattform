delete from public.chat_reports where chat_type = 'global';

alter table public.chat_reports
  drop constraint if exists chat_reports_chat_type_check;

alter table public.chat_reports
  add constraint chat_reports_chat_type_check check (chat_type = 'direct');

drop trigger if exists enforce_global_chat_suspension on public.global_chat_messages;

create or replace function public.report_chat_message(
  p_chat_type text,
  p_message_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reported_user_id uuid;
  v_body text;
  v_report_id uuid;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if p_chat_type is distinct from 'direct' then raise exception 'Ungültiger Chattyp'; end if;
  if length(trim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'Der Meldegrund muss zwischen 5 und 500 Zeichen lang sein';
  end if;

  select m.sender_id, m.body into v_reported_user_id, v_body
  from public.direct_messages m
  where m.id = p_message_id
    and (m.sender_id = auth.uid() or m.recipient_id = auth.uid());
  if found and not exists (
    select 1 from public.direct_messages m
    where m.id = p_message_id and m.sender_id = auth.uid()
  ) and not exists (
    select 1 from public.friend_requests f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.recipient_id = v_reported_user_id)
        or (f.requester_id = v_reported_user_id and f.recipient_id = auth.uid()))
  ) then
    raise exception 'Du kannst diese private Nachricht nicht melden';
  end if;

  if v_reported_user_id is null then raise exception 'Nachricht nicht gefunden'; end if;
  if v_reported_user_id = auth.uid() then raise exception 'Du kannst deine eigene Nachricht nicht melden'; end if;

  insert into public.chat_reports(
    reporter_id, reported_user_id, chat_type, message_id, message_body, reason
  ) values (
    auth.uid(), v_reported_user_id, 'direct', p_message_id, v_body, trim(p_reason)
  )
  returning id into v_report_id;
  return v_report_id;
exception
  when unique_violation then
    raise exception 'Diese Nachricht hast du bereits gemeldet';
end;
$$;

create or replace function public.admin_resolve_chat_report(
  p_report_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_report public.chat_reports%rowtype;
begin
  if not public.is_site_admin(array['owner', 'admin', 'moderator']) then
    raise exception using errcode = '42501', message = 'Keine Admin-Berechtigung';
  end if;
  if p_resolution not in ('dismiss', 'remove_message') then
    raise exception 'Ungültige Moderationsaktion';
  end if;

  select * into v_report from public.chat_reports r
  where r.id = p_report_id and r.status = 'open'
  for update;
  if not found then raise exception 'Offene Meldung nicht gefunden'; end if;

  if p_resolution = 'remove_message' then
    delete from public.direct_messages m where m.id = v_report.message_id;
  end if;

  update public.chat_reports r
  set status = case when p_resolution = 'dismiss' then 'dismissed' else 'resolved' end,
      resolution = p_resolution, resolved_by = v_actor, resolved_at = now(),
      message_body = ''
  where r.id = p_report_id;

  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values (v_actor, 'chat_report_' || p_resolution, v_report.reported_user_id,
    jsonb_build_object('report_id', p_report_id, 'chat_type', v_report.chat_type,
      'message_id', v_report.message_id, 'reason', v_report.reason));
end;
$$;

revoke all on function public.get_global_chat_messages() from public, anon, authenticated;
revoke all on function public.send_global_chat_message(text) from public, anon, authenticated;
drop function public.get_global_chat_messages();
drop function public.send_global_chat_message(text);
drop table public.global_chat_messages;

notify pgrst, 'reload schema';
