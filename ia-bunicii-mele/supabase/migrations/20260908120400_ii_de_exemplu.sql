-- Trei ii de exemplu, ca magazinul sa nu arate gol la prima vizita.
-- Se sterg din panoul de administrare cand intra iile adevarate.

insert into public.products (slug, name, description, price_cents, size, status, sort)
values
  ('ie-cu-altita-neagra', 'Ie cu altiță neagră',
   'Bumbac alb, altiță bătută des în negru și roșu, râuri oblice pe toată mâneca.',
   89000, 'M', 'disponibila', 1),
  ('ie-cu-rauri-rosii', 'Ie cu râuri roșii',
   'Model mai deschis: râurile în roșu de garanță, încrețul cusut cu fir de aur.',
   76000, 'S', 'disponibila', 2),
  ('ie-de-sarbatoare', 'Ie de sărbătoare',
   'Cea mai încărcată dintre toate — altiță pe toată lățimea mânecii, cu aur între registre.',
   120000, 'L', 'disponibila', 3)
on conflict (slug) do nothing;
