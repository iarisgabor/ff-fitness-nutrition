# Ia bunicii mele

**Live: https://ia-bunicii-mele.vercel.app**
Administrare: https://ia-bunicii-mele.vercel.app/admin.html

Magazin online pentru iile cusute de mână de bunica. Pagina principală e un film
derulat la scroll: camera stă pe pânză și urmărește acul de la primul punct al altiței
până la ultimul punct din tiv, moment în care se vede ia întreagă. Nu există nicio
imagine în tot filmul — silueta cămășii și fiecare punct de cruce sunt generate din cod.

## Cum e făcut

Site static, fără framework și fără pas de build. Trei pagini, aceeași lume vizuală:

| Fișier | Ce e |
|---|---|
| `index.html` | filmul + povestea + cum se face + iile + întrebări |
| `magazin.html` | toate iile, cu link de plată la fiecare |
| `admin.html` | intrare în cont + adăugat/schimbat ii (doar pentru admin) |

| Fișier | Ce face |
|---|---|
| `js/pattern.js` | generează ia: silueta, registrele (altiță, încreț, râuri, poale) și fiecare punct, în ordinea în care s-ar coase |
| `js/film.js` | canvas-ul filmului: camera care urmărește acul, țesătura, acul și firul, textele suprapuse |
| `js/site.js` | antet, titlul care se ridică literă cu literă, aparițiile la scroll, cifrele |
| `js/shop.js` | citește iile din Supabase și le desenează; fără poză, generează un motiv cusut din numele iei |
| `js/admin.js` | login, listă, adăugare/schimbare/ștergere, încărcat poze |
| `css/site.css` | paleta, tipografia, componentele comune |
| `css/film.css` | scena filmului și textele de peste el |

Bibliotecile (GSAP, ScrollTrigger, supabase-js) sunt în `vendor/`, nu de pe CDN.

**Filmul nu folosește Lenis, intenționat.** Scrub-ul e legat direct de scroll: un singur
strat de netezire, altfel filmul pare că fuge după deget.

## Coșul și plata

Plata se face pe site, în coșul din dreapta — fără linkuri și fără să pleci de pe
pagină. Fiecare ie e unică, deci nu există cantitate: o ie e ori în coș, ori nu.

- `js/cos.js` — coșul (ținut în `localStorage`, doar ca listă de id-uri) și fereastra
  de plată Stripe montată în panou
- `supabase/functions/checkout` — deschide sesiunea de plată. **Prețurile se citesc din
  baza de date, nu din ce trimite browserul** — clientul trimite doar id-uri, deci suma
  nu poate fi umblată. Refuză cu 409 dacă o ie din coș s-a vândut între timp.
- `supabase/functions/stripe-webhook` — singurul loc care marchează o ie ca vândută,
  după ce verifică semnătura Stripe. Dacă scrierea în bază pică, întoarce 500 ca Stripe
  să reîncerce; altfel ia ar rămâne la vânzare deși a fost plătită.

La fiecare încărcare, coșul își recitește iile din bază: dacă una s-a vândut sau a fost
ascunsă, iese singură din coș.

Coloana `products.stripe_link` a rămas de pe vremea Payment Links și nu mai e citită
de nimic.

## Ce ține baza de date

Un singur tabel de conținut, `products` — iile. Nu există tabel de comenzi: evidența
comenzilor, adresele și bonurile stau în Stripe. `profiles` ține doar cine e admin.

Migrările sunt în `supabase/migrations/`, în ordinea aplicării. Fiecare tabel are RLS
pornit și politicile scrise în aceeași migrare cu el.

- oricine poate **citi** iile cu `active = true`
- doar un cont cu `role = 'admin'` poate scrie
- `profiles` **nu are nicio politică de update** — rolul nu poate fi schimbat prin API
  de nimeni; se schimbă doar din SQL sau din panoul Supabase

## Ce mai trebuie făcut

**În panoul Supabase** (o singură dată):

1. **Contul de admin** — Authentication → Users → Add user, cu `iaris.gabor28@gmail.com`
   și o parolă aleasă de tine, bifat *Auto Confirm User*. Rolul de admin se dă automat
   la creare (vezi migrarea `20260908120300`), deci după asta poți intra direct pe
   `/admin.html`.
2. **Închide înregistrarea publică** — Authentication → Sign In / Providers →
   *Allow new users to sign up* pe off. Momentan e pornită: oricine își poate face cont,
   dar un cont nou primește rolul `viewer`, care nu poate scrie absolut nimic.
   (`supabase/config.toml` are deja `enable_signup = false`, dar un `supabase config push`
   ar schimba și alte setări ale proiectului, așa că nu l-am rulat.)

**În Stripe** (o singură dată — nu mai e nevoie de niciun link per produs):

1. **Webhook** — Developers → Webhooks → Add endpoint, adresa
   `https://ggeyhtaggxggjuifpumh.supabase.co/functions/v1/stripe-webhook`,
   cu evenimentul `checkout.session.completed`. Îți dă un *signing secret*
   (`whsec_…`).
2. **Cele trei secrete** se pun în Supabase → Edge Functions → Secrets:
   `STRIPE_SECRET_KEY` (`sk_test_…` sau `sk_live_…`), `STRIPE_PUBLISHABLE_KEY`
   (`pk_…`) și `STRIPE_WEBHOOK_SECRET` (`whsec_…`).

Până când secretele astea există, butonul „Plătește" răspunde cu un mesaj cinstit,
nu cu o pagină albă. Cheia publishable e trimisă spre browser de funcția `checkout`,
ca să nu stea scrisă în cod.

**În conținut:**

- **Emailul de contact** e `salut@iabuniciimele.ro` (inventat) — în `index.html` și
  `magazin.html`.
- **Rețelele sociale** — iconițele au fost scoase din subsol până apar linkurile reale.
- **Cifrele din „Cum se face"** — `180` de ore e o estimare, nu un număr verificat.
- **Cele trei ii de exemplu** din magazin sunt puse de mine ca să nu arate gol.
  Se șterg din panoul de administrare când intră iile adevărate.

Dacă adaugi vreodată resetare de parolă sau linkuri magice, adresa de producție trebuie
trecută în Supabase la Authentication → URL Configuration (redirect URLs).

## Local

```sh
npx serve .          # sau orice server static
```

Filmul are două cârlige pentru verificare: `?jump=<pixeli>` încarcă pagina deja derulată
și așezată, iar `window.__ready` devine `true` doar când chiar e gata. Pe astea se
sprijină `scripts/verify.js` din skill-ul scroll-film-studio (capturi + test de fluiditate).

## Publicare

```sh
vercel deploy --prod
```

Proiectele noi de Vercel stau uneori în spatele unui zid de autentificare (Deployment
Protection). Se scoate din Project → Settings → Deployment Protection.

După publicare, adresa de producție trebuie adăugată în Supabase la redirect URLs.
