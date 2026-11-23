-- Fix: "new row violates row-level security policy" when publishing a subject.
-- Re-uploading (upsert) needs SELECT + INSERT + UPDATE policies on the bucket. Safe to re-run.
insert into storage.buckets(id, name, public) values ('banks','banks',true)
on conflict (id) do update set public = true;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

drop policy if exists "admin selects banks" on storage.objects;
create policy "admin selects banks" on storage.objects for select to authenticated
  using (bucket_id = 'banks' and public.is_admin());
drop policy if exists "admin inserts banks" on storage.objects;
create policy "admin inserts banks" on storage.objects for insert to authenticated
  with check (bucket_id = 'banks' and public.is_admin());
drop policy if exists "admin updates banks" on storage.objects;
create policy "admin updates banks" on storage.objects for update to authenticated
  using (bucket_id = 'banks' and public.is_admin()) with check (bucket_id = 'banks' and public.is_admin());
drop policy if exists "admin deletes banks" on storage.objects;
create policy "admin deletes banks" on storage.objects for delete to authenticated
  using (bucket_id = 'banks' and public.is_admin());
