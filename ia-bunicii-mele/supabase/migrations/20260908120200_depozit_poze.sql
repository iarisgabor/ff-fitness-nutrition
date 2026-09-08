-- Depozitul cu pozele iilor: citit de oricine, scris doar de admini.

insert into storage.buckets (id, name, public)
values ('ii', 'ii', true)
on conflict (id) do nothing;

create policy "pozele iilor se vad de oricine"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'ii');

create policy "doar adminii incarca poze"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ii' and public.is_admin());

create policy "doar adminii schimba poze"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'ii' and public.is_admin())
  with check (bucket_id = 'ii' and public.is_admin());

create policy "doar adminii sterg poze"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ii' and public.is_admin());
