-- Profilul se face singur cand apare un cont nou.
-- Un singur email primeste rolul de admin: proprietarul magazinului.
-- Restul conturilor raman 'viewer', adica nu pot scrie nimic (vezi politicile din products).

create function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case when new.email = 'iaris.gabor28@gmail.com' then 'admin' else 'viewer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- daca acel cont exista deja, primeste rolul acum
insert into public.profiles (id, role)
select id, 'admin' from auth.users where email = 'iaris.gabor28@gmail.com'
on conflict (id) do update set role = 'admin';
