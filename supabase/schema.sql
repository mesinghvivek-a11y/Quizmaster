-- Run once in Supabase → SQL Editor
create table public.profiles(id uuid primary key references auth.users on delete cascade,name text,avatar text,is_admin boolean not null default false);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select using(auth.uid()=id);
create function public.new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,name,avatar) values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'avatar_url') on conflict do nothing;return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.new_user();

create table public.user_data(user_id uuid not null references auth.users on delete cascade,k text not null,v jsonb,updated_at timestamptz not null default now(),primary key(user_id,k));
alter table public.user_data enable row level security;
create policy "own data" on public.user_data for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table public.shared_subjects(slug text primary key,owner uuid not null default auth.uid() references auth.users on delete cascade,title text not null,data jsonb not null,created_at timestamptz not null default now());
alter table public.shared_subjects enable row level security;
create policy "anyone reads banks" on public.shared_subjects for select using(true);
create policy "owner inserts" on public.shared_subjects for insert with check(auth.uid()=owner);
create policy "owner deletes" on public.shared_subjects for delete using(auth.uid()=owner);

create table public.reports(id bigint generated always as identity primary key,user_id uuid not null default auth.uid() references auth.users on delete cascade,subject_id text,subject_name text,qid text,chapter text,qno text,prompt text,reason text,note text,status text not null default 'open',created_at timestamptz not null default now());
alter table public.reports enable row level security;
create policy "send report" on public.reports for insert with check(auth.uid()=user_id);
create policy "read own or admin" on public.reports for select using(auth.uid()=user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin));
create policy "admin updates" on public.reports for update using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin));
-- Make yourself admin (mentor): update public.profiles set is_admin=true where id=(select id from auth.users where email='you@example.com');
-- Live rooms use Realtime Broadcast/Presence: no table needed. Enable Realtime in project settings (default on).
