-- Install in the existing Supabase project before deploying the updated site.
begin;

create schema if not exists qm_live;
revoke all on schema qm_live from public, anon, authenticated;

create table if not exists qm_live.rooms (
  code text primary key,
  owner_key uuid not null,
  host_session uuid not null,
  ended boolean not null default false,
  expires_at timestamptz not null default now() + interval '36 hours'
);

alter table qm_live.rooms add column if not exists owner_id uuid;
alter table qm_live.rooms add column if not exists checkpoint jsonb;
create or replace function public.qm_host_room(room_code text default null) returns jsonb
language sql stable security definer set search_path=pg_catalog,qm_live,pg_temp as $$
 select checkpoint || jsonb_build_object('code',code,'ownerKey',owner_key,'account',owner_id)
 from rooms where owner_id=auth.uid() and not ended and expires_at>now() and checkpoint is not null
 and (room_code is null or code=room_code) order by expires_at desc limit 1
$$;
revoke all on function public.qm_host_room(text) from public,anon;
grant execute on function public.qm_host_room(text) to authenticated;
create table if not exists qm_live.members (
  code text references qm_live.rooms on delete cascade,
  identity_key text not null,
  member_id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  seen_at timestamptz not null default now(),
  last_moderation uuid,
  status text not null default 'active' check (status in ('active', 'left', 'kicked', 'blocked')),
  primary key (code, identity_key),
  unique (code, member_id),
  unique (code, session_id)
);

-- Remember replaced connections so delayed retries cannot reclaim the current seat.
create table if not exists qm_live.sessions (
  code text references qm_live.rooms on delete cascade,
  session_id uuid not null,
  member_id uuid,
  device_key uuid,
  primary key (code, session_id)
);
create index if not exists qm_live_devices on qm_live.sessions (code, device_key, member_id);

create table if not exists qm_live.messages (
  seq bigint generated always as identity primary key,
  code text not null references qm_live.rooms on delete cascade,
  sender uuid,
  participant uuid,
  destination text not null,
  body jsonb not null,
  request_id uuid not null,
  unique (code, request_id)
);
create index if not exists qm_live_delivery on qm_live.messages (code, destination, seq);
revoke all on all tables in schema qm_live from public, anon, authenticated;

create or replace function public.qm_room(
  p_action text, p_code text, p_key uuid, p_session uuid, p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, qm_live, pg_temp as $$
declare
  room rooms%rowtype;
  member members%rowtype;
  account_id uuid := auth.uid();
  ident text;
  host boolean;
  latest bigint;
  events jsonb;
  roster jsonb;
  dest text;
  moderation_id uuid;
begin
  if account_id is null then return '{"error":"signin"}'; end if;
  if p_code is null or p_code !~ '^[A-Z0-9]{5}$' or p_key is null or p_session is null then
    return '{"error":"unavailable"}';
  end if;
  ident := case when account_id is null then 'guest:' || p_key else 'account:' || account_id end;

  if p_action = 'create' then
    delete from rooms where expires_at <= now();
    insert into rooms (code, owner_key, host_session,owner_id,checkpoint) values (p_code, p_key, p_session,account_id,p_data->'snapshot')
      on conflict do nothing;
  end if;

  -- Hold one room lock through authorization, message writes, and cursor snapshots.
  -- PostgreSQL sequence numbers alone do not guarantee commit order.
  select * into room from rooms where code = p_code and expires_at > now() for update;
  if not found then return '{"error":"unavailable"}'; end if;
  host := room.owner_key = p_key and (room.owner_id is null or room.owner_id=account_id);

  if (p_action in ('create', 'restore') and not host)
    or (room.ended and p_action in ('create', 'restore', 'join')) then
    return '{"error":"unavailable"}';
  end if;

  if host then
    if p_action = 'restore' and room.host_session <> p_session then
      if exists (select 1 from sessions where code = p_code and session_id = p_session) then
        return '{"error":"superseded"}';
      end if;
      update rooms set host_session = p_session where code = p_code;
      room.host_session := p_session;
    end if;
    if room.host_session <> p_session then return '{"error":"superseded"}'; end if;
  else
    select * into member from members where code = p_code and identity_key = ident;
    if member.status = 'blocked' or exists (
      select 1 from sessions s join members b on b.code = s.code and b.member_id = s.member_id
      where s.code = p_code and s.device_key = p_key and b.status = 'blocked'
        and (account_id is null or b.identity_key like 'guest:%')
    ) then
      -- A blocked account signing out on a known device, or a blocked guest signing
      -- in on the same browser, sees the same response as an unknown room code.
      return '{"error":"unavailable"}';
    end if;

    if p_action = 'join' then
      if member.status = 'kicked' and
        (not coalesce((p_data->>'manual')::boolean, false) or member.session_id = p_session) then
        return '{"error":"kicked"}';
      end if;
      if member.session_id is distinct from p_session and
        exists (select 1 from sessions where code = p_code and session_id = p_session) then
        return '{"error":"superseded"}';
      end if;
      if member.status = 'left' and member.session_id = p_session then
        return '{"error":"superseded"}';
      end if;
      insert into members (code, identity_key, session_id) values (p_code, ident, p_session)
        on conflict (code, identity_key) do update
        set session_id = excluded.session_id, status = 'active', seen_at = now()
        returning * into member;
    else
      if member.member_id is null or member.status = 'left' then return '{"error":"unavailable"}'; end if;
      if member.status = 'kicked' then return '{"error":"kicked"}'; end if;
      if member.session_id <> p_session then return '{"error":"superseded"}'; end if;
    end if;
  end if;

  if p_action in ('create', 'restore', 'join') then
    insert into sessions (code, session_id, member_id, device_key)
      values (p_code, p_session, member.member_id, case when not host then p_key end)
      on conflict do nothing;
    select coalesce(max(seq), 0) into latest from messages where code = p_code;
    return jsonb_build_object('cursor', latest, 'hostSession', room.host_session, 'member', member.member_id);

  elsif host and p_action='checkpoint' then
    update rooms set checkpoint=p_data,owner_id=account_id where code=p_code and not ended;
    return '{}';
  elsif host and p_action in ('kick', 'block') then
    moderation_id := (p_data->>'request')::uuid;
    if moderation_id is null then return '{"error":"invalid"}'; end if;
    update members set status = case when p_action = 'kick' then 'kicked' else 'blocked' end,
                       last_moderation = moderation_id
      where code = p_code and member_id = (p_data->>'member')::uuid and status <> 'blocked'
        and last_moderation is distinct from moderation_id;
    return '{}';

  elsif not host and p_action = 'leave' then
    update members set status = 'left' where code = p_code and member_id = member.member_id;
    return '{}';

  elsif host and p_action = 'close' then
    -- A finished test stays readable long enough for guests to receive the leaderboard.
    if not room.ended then delete from rooms where code = p_code; end if;
    return '{}';

  elsif p_action = 'send' then
    if room.ended then return '{}'; end if;
    dest := case when host then p_data->>'to' else 'host' end;
    if not host and coalesce(p_data->'msg'->>'t', '') not in ('hi', 'a') then
      return '{"error":"invalid"}';
    end if;
    if host and dest is distinct from '*' and not exists (
      select 1 from members where code = p_code and session_id::text = dest and status = 'active'
    ) then return '{}'; end if;
    insert into messages (code, sender, participant, destination, body, request_id)
      values (p_code, case when not host then p_session end, member.member_id,
              dest, p_data->'msg', (p_data->>'request')::uuid)
      on conflict (code, request_id) do nothing;
    if host and dest = '*' and p_data->'msg'->>'t' = 'end' then
      update rooms set ended = true where code = p_code;
    end if;
    return '{}';

  elsif p_action = 'poll' then
    if not host and member.seen_at < now() - interval '3 seconds' then
      update members set seen_at = now() where code = p_code and identity_key = ident;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'seq', e.seq, 'from', e.sender, 'member', e.participant, 'msg', e.body
    ) order by e.seq), '[]'::jsonb) into events
    from (
      select m.* from messages m
      left join members u on u.code = m.code and u.member_id = m.participant and u.status = 'active'
      where m.code = p_code and m.seq > coalesce((p_data->>'after')::bigint, 0) and (
        (host and m.destination = 'host' and u.member_id is not null
          and (m.sender = u.session_id or m.body->>'t' = 'a'))
        or (not host and m.sender is null and m.destination in ('*', p_session::text))
      )
      order by m.seq limit 100
    ) e;
    if host then
      select coalesce(jsonb_agg(jsonb_build_object(
        'member', member_id, 'session', session_id, 'status', status,
        'online', seen_at > now() - interval '15 seconds'
      )), '[]'::jsonb) into roster from members where code = p_code;
    end if;
    return jsonb_build_object('events', events, 'hostSession', room.host_session, 'members', roster);
  end if;
  return '{"error":"unavailable"}';
end;
$$;

revoke all on function public.qm_room(text, text, uuid, uuid, jsonb) from public;
grant execute on function public.qm_room(text, text, uuid, uuid, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
