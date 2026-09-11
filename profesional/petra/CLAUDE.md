# CLAUDE.md — Petra Butincu, "Studio Alb"

Portofoliu pentru **un fotograf real**: Petra Butincu, Oradea — beauty, fashion
editorial și campanii de produs cosmetic. **Nu e demo și nu e șablon.**

Fără framework, fără build step, fără backend — HTML/CSS/JS static, GSAP +
Lenis vendorizate local (`vendor/`). Direcție vizuală **"Studio Alb"**: fundal
ivoire cald, tipografie serif neagră uriașă, mult spațiu alb.

## ATENȚIE: există alte două site-uri pentru aceeași persoană

- `profesional/petra-butincu-portofoliu/` — React+Vite+Tailwind+GSAP, temă
  închisă, nelansat. 24 de decizii de design documentate în
  `.tmp/grill-me/portofoliu-fotograf.md`.
- `profesional/petra-butincu-film/` ("CAMERA OBSCURĂ") — static, hero cu
  film generat AI care redă în buclă.

Acesta e al **treilea** proiect, o direcție vizuală și tehnică deliberat
diferită de amândouă (fundal deschis vs. temele lor închise; fără build step
vs. React; fără fișier video vs. filmul AI). Decizia dintre cele trei nu e
tranșată — nu presupune că una o înlocuiește pe alta fără să întrebi. Nu muta
poze/decizii între ele fără să verifici ce variantă duce mai departe clienta.

Există și un folder gol, orfan, `profesional/petra-butincu/` (fără conținut,
creat din greșeală) — nu face parte din niciunul din cele trei proiecte.

## Hartă de fișiere

| Vrei să schimbi | Fișier |
|---|---|
| nume, oraș, telefon, email, Instagram | `js/config.js` — singura sursă pentru **atribute** (href-uri), nu pentru textul vizibil (vezi comentariul din fișier) |
| proiectele din grilă, ce poze intră unde | `js/proiecte.js` |
| titlul, textul „Despre", testimonialele, cifrele | `index.html`, direct (text literal, ca la `profesional/instalatii`) |
| culori, fonturi, layout | `css/styles.css` |
| dezvăluiri la scroll, titlul literă-cu-literă | `js/reveal.js` |
| preview la hover/tap, clasa `.proiect--lat` | `js/gallery.js` |
| lightbox-ul (dialog, tastatură, swipe, morph) | `js/lightbox.js` |
| bara sticky de WhatsApp pe mobil | `js/sticky-cta.js` |
| legarea butoanelor de contact + avertismentul de Instagram neconfirmat | `js/contact-links.js` |

## Comenzi

```bash
cd scripts && npm install          # o singură dată — instalează doar `sharp`
node scripts/optimizeaza-poze.mjs  # regenerează assets/foto/*.webp + manifest.json + og-cover.jpg

npx serve .                        # server local (sau: python -m http.server)
```

**Niciodată `file://`** — rupe `@font-face`-urile self-hostuite (CORS) și
`fetch('assets/foto/manifest.json')` din `js/gallery.js`.

## Reguli care nu se văd din cod

**Pozele originale nu se comit.** `poze-fotograf/` e gitignorat (mai puțin
`.gitkeep`) — sunt cele 8 fotografii reale, copiate din
`petra-butincu-portofoliu/poze-fotograf/`. Se comit doar derivatele WebP din
`assets/foto/`. Renumești un fișier din `poze-fotograf/` → strici referința
din `js/proiecte.js` (id-ul vine din numele fișierului).

**`scripts/package.json` e izolat intenționat**, separat de rădăcina
proiectului. Dacă `sharp` ar sta la rădăcină, Vercel ar putea încerca
`npm install && npm run build` chiar și pe un preset static — izolat în
`scripts/`, Root Directory-ul pe care-l vede Vercel rămâne un arbore pur static.

**"fotografă" (feminin), nu "Fotograf"** — alegere deliberată, nu scăpare.
Site-ul CAMERA OBSCURĂ folosește deja "fotografă" live (verificat în
`site/index.html`); site-ul React a ales "Fotograf" ca titlu neutru separat.
Cele trei nu sunt sincronizate — verifică cu Petra care variantă preferă
înainte de lansare, apoi aplică uniform (aici: `js/config.js` + `index.html`).

**Numele brandurilor (Lumedics, Splendor Professional) apar explicit** în
`js/proiecte.js` și `index.html`, la fel ca în `proiecte.ts` din site-ul React
— dreptul de portofoliu pe ele NU e confirmat încă (vezi checklist mai jos).

**Nu se inventează testimoniale, cifre sau istoric personal care par reale.**
Testimonialele spun explicit „Client demonstrativ"/„Text de probă"; cifrele
arată „—", niciodată un număr inventat; textul „Despre" conține DOAR fapte
confirmate (nume, oraș, specialități, cei doi clienți reali) — fără ani de
experiență sau narațiune personală inventate.

**Grid-ul din „Lucrări" e vertical-întâi** — 7 din 8 fotografii sunt
verticale. Rapoartele native sunt hardcodate per proiect în `css/styles.css`
(`aspect-ratio`), nu decupate. Cardul lat (`.proiect--lat`) se deduce automat
din orientarea reală a copertei citită din `manifest.json`, în `js/gallery.js`
— nu e un flag ținut de mână care poate rămâne nesincronizat.

**Fără ecran de încărcare, deliberat** — spre deosebire de fratele React.
Hero-ul de-aici e tipografie-întâi (un titlu uriaș + o singură poză mică,
asimetrică), nu un fundal foto Ken Burns greu care are nevoie să fie așteptat.

**`prefers-reduced-motion` oprește tot**: Lenis nici nu se instanțiază
(`js/lenis-init.js`), reveal-urile GSAP arată direct starea finală, morph-ul
de View Transitions e neutralizat prin CSS. Verifică-l dacă adaugi animații.

**Lightbox-ul oprește explicit Lenis** la deschidere (`js/lightbox.js`) —
`overflow:hidden` pe `<body>` singur nu ajunge, Lenis își interceptează
propriul eveniment de scroll și tot mișcă pagina sub lightbox.

**Fără formular de contact, intenționat** — doar `mailto:`, `wa.me`, `tel:`,
ca la `profesional/instalatii` și la celelalte două site-uri Petra.

## De completat înainte de lansare

- [ ] Portret al Petrei + text "Despre" personalizat (acum: cerc punctat „Portret" + bio din fapte confirmate, marcat „de personalizat")
- [ ] Testimoniale reale, cu acordul clienților (acum: „Client demonstrativ")
- [ ] 3 cifre reale (acum: „—")
- [ ] **Verificat manual linkul de Instagram** — `petra.g.photography` a fost dedus din adresa de email, nu confirmat prin deschiderea profilului; există un cont omonim (`@petra.photography`) care aparține altcuiva. Setează `SITE.instagram.confirmat = true` în `js/config.js` doar după verificare (altfel consola browserului repetă avertismentul la fiecare încărcare).
- [ ] Confirmat dreptul de portofoliu pe brandurile vizibile în cadre (Lumedics, Splendor Professional)
- [ ] Decis "fotografă" vs. "Fotograf" cu Petra (vezi secțiunea de mai sus)
- [ ] Domeniu ales → completează `SITE.online.domeniu` în `js/config.js`, `sitemap.xml`, linia `Sitemap:` din `robots.txt`, și `url`/`sameAs` în JSON-LD din `index.html`
- [ ] Scos `<meta name="robots" content="noindex, nofollow">` din `index.html` + `Disallow: /` din `robots.txt`

## Deploy

**Live (noindex, link nedistribuit public):** https://petra-zeta.vercel.app

Vercel, proiect `petra` (org `iarisgabors-projects`), fără framework preset
(site static, fără `package.json` la rădăcină — vezi mai sus), Root Directory
`profesional/petra`, conectat la `github.com/iarisgabor/ff-fitness-nutrition`
(același repo Git ca restul monorepo-ului — fiecare proiect Vercel din el își
setează propriul Root Directory). Push pe `origin/main` ar trebui să
redeployeze automat prin integrarea Git; verifică totuși manual după un push,
fiindcă legătura a fost configurată separat de link-ul CLI inițial (vezi
istoricul din sesiunea care a publicat site-ul, 2026-09-11).

Pentru un deploy manual din CLI: `vercel --prod --yes`, rulat din **rădăcina
monorepo-ului** (nu din `profesional/petra/`) — Root Directory fiind setat la
`profesional/petra`, un deploy pornit direct din acel folder eșuează cu
„Root Directory does not exist" (CLI-ul urcă doar folderul curent, iar
setarea de Root Directory se așteaptă apoi la o subcale care nu mai există în
ce s-a urcat). Necesită un link Vercel și la rădăcina monorepo-ului
(`.vercel/project.json`, gitignored), nu doar în `profesional/petra/.vercel/`.
