-- Cine are voie sa administreze magazinul.
-- Conturile de admin se fac prin invitatie din panoul Supabase, nu prin inregistrare publica.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "isi vede propriul profil"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Intentionat NU exista nicio politica de update sau insert pe profiles:
-- cu RLS pornit si zero politici de scriere, coloana role nu poate fi schimbata
-- prin API de nimeni. Rolurile se dau doar din SQL/panoul Supabase.

create function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
