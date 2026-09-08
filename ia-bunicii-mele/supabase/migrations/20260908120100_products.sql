-- Iile din magazin. Plata se face prin link de Stripe, deci aici nu se tine
-- nicio informatie de plata si niciun tabel de comenzi.

create table public.products (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'RON',
  size text,
  status text not null default 'disponibila' check (status in ('disponibila', 'vanduta')),
  image_path text,
  stripe_link text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index products_vizibile_idx on public.products (active, sort, id);

alter table public.products enable row level security;

create policy "iile active se vad de oricine"
  on public.products for select
  to anon, authenticated
  using (active = true);

create policy "adminii vad toate iile"
  on public.products for select
  to authenticated
  using (public.is_admin());

create policy "adminii adauga ii"
  on public.products for insert
  to authenticated
  with check (public.is_admin());

create policy "adminii schimba ii"
  on public.products for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "adminii sterg ii"
  on public.products for delete
  to authenticated
  using (public.is_admin());
