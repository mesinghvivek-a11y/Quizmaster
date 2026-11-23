begin;
set local role anon;
do $$
begin
 assert public.qm_room('create','TST01',gen_random_uuid(),gen_random_uuid())->>'error'='signin';
end $$;
set local role authenticated;
do $$
declare
 owner_id uuid:=gen_random_uuid(); player uuid:=gen_random_uuid(); key uuid:=gen_random_uuid(); tab uuid:=gen_random_uuid();
 code text:=upper(substr(gen_random_uuid()::text,1,5)); id text; reply jsonb; member_key uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 reply:=public.qm_room('create',code,key,tab,'{"snapshot":{"ph":"lobby"}}');
 assert reply ? 'cursor';
 perform public.qm_room('checkpoint',code,key,tab,'{"ph":"live","i":4}');
 assert public.qm_host_room(code)->>'ownerKey'=key::text;
 assert public.qm_host_room(code)->>'i'='4';
 perform set_config('request.jwt.claim.sub',player::text,true);
 assert public.qm_host_room(code) is null;
 id:=public.qm_room('join',code,member_key,gen_random_uuid())->>'member';
 assert id is not null;
 assert public.qm_room('join',code,member_key,gen_random_uuid())->>'member'=id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 tab:=gen_random_uuid();
 assert public.qm_room('restore',code,key,tab) ? 'cursor';
 perform public.qm_room('block',code,key,tab,jsonb_build_object('member',id,'request',gen_random_uuid()));
 perform set_config('request.jwt.claim.sub',player::text,true);
 assert public.qm_room('join',code,member_key,gen_random_uuid())->>'error'='unavailable';
end $$;
rollback;
