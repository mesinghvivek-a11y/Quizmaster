-- Public bucket for question pictures (students read, only admins upload). Safe to re-run.
insert into storage.buckets(id, name, public) values ('qimg','qimg',true)
on conflict (id) do update set public = true;

drop policy if exists "admin selects qimg" on storage.objects;
create policy "admin selects qimg" on storage.objects for select to authenticated
  using (bucket_id = 'qimg' and public.is_admin());
drop policy if exists "admin inserts qimg" on storage.objects;
create policy "admin inserts qimg" on storage.objects for insert to authenticated
  with check (bucket_id = 'qimg' and public.is_admin());
drop policy if exists "admin updates qimg" on storage.objects;
create policy "admin updates qimg" on storage.objects for update to authenticated
  using (bucket_id = 'qimg' and public.is_admin()) with check (bucket_id = 'qimg' and public.is_admin());
drop policy if exists "admin deletes qimg" on storage.objects;
create policy "admin deletes qimg" on storage.objects for delete to authenticated
  using (bucket_id = 'qimg' and public.is_admin());
