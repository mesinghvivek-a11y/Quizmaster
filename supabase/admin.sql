-- Run once in Supabase → SQL Editor (safe to re-run)

-- 1) Make yourself admin: put YOUR Google email, sign in once on the site first, then run this line.
insert into public.profiles(id, is_admin)
select id, true from auth.users where email = 'YOUR_EMAIL@gmail.com'
on conflict (id) do update set is_admin = true;

-- 2) Helper
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

-- 3) Subject library (everyone reads; only admins write)
create table if not exists public.subjects(
  id text primary key, name text not null, subtitle text,
  status text not null default 'upcoming' check (status in ('live','upcoming','hidden')),
  eta text, chapters int default 0, questions int default 0, pyq int default 0,
  version int not null default 1, path text, sort int default 100,
  created_at timestamptz default now(), updated_at timestamptz default now());
alter table public.subjects enable row level security;
drop policy if exists "read subjects" on public.subjects;
create policy "read subjects" on public.subjects for select using (status in ('live','upcoming') or public.is_admin());
drop policy if exists "admin writes subjects" on public.subjects;
create policy "admin writes subjects" on public.subjects for all using (public.is_admin()) with check (public.is_admin());

-- 4) Storage bucket for question banks (public read, admin write)
insert into storage.buckets(id, name, public) values ('banks','banks',true)
on conflict (id) do update set public = true;
drop policy if exists "admin selects banks" on storage.objects;
create policy "admin selects banks" on storage.objects for select to authenticated using (bucket_id='banks' and public.is_admin());
drop policy if exists "admin inserts banks" on storage.objects;
create policy "admin inserts banks" on storage.objects for insert to authenticated with check (bucket_id='banks' and public.is_admin());
drop policy if exists "admin updates banks" on storage.objects;
create policy "admin updates banks" on storage.objects for update to authenticated using (bucket_id='banks' and public.is_admin());
drop policy if exists "admin deletes banks" on storage.objects;
create policy "admin deletes banks" on storage.objects for delete to authenticated using (bucket_id='banks' and public.is_admin());

-- 5) Ordinary users can no longer publish/share subjects
drop policy if exists "owner inserts" on public.shared_subjects;

-- 6) Admin overview numbers
create or replace function public.admin_stats() returns json
language sql security definer set search_path = public as
$$ select case when public.is_admin() then json_build_object(
  'users',(select count(distinct user_id) from public.user_data),
  'reports_open',(select count(*) from public.reports where status='open'),
  'reports',(select count(*) from public.reports)) end $$;
