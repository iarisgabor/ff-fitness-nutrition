# POS NOU — nomenclator librărie → import Bluecash50

Context de business: un nomenclator de bibliotecă/librărie (carte creștină, în mare parte)
trebuie curățat de elemente care nu sunt cărți și importat într-o casă de marcat/POS
**Datecs BlueCash 50** (terminal fiscal Android + POS bancar integrat).

## Fișiere din acest folder

| Fișier | Rol |
|---|---|
| `Nomenclator (2).xlsx` | Sursa originală, brută — 776 articole, include și non-cărți (consumabile, echipamente IT, mobilier, merchandise). **Nu se modifică.** |
| `Nomenclator (2) - curatat.xlsx` | Nomenclator curat, doar cărți (685 rânduri), cu coloanele originale + coduri de bare completate acolo unde s-au găsit online. Sursa de adevăr pentru orice regenerare de import. |
| `plu.csv` | Fișier-exemplu primit de la user, arată formatul exact așteptat de BlueCash50 la import (19 rânduri demo, rămase din achiziția POS-ului — **nu sunt categorii reale**, sunt doar produse-exemplu). |
| `plu_import.csv` | **Fișierul final de import** în BlueCash50 — regenerat din `Nomenclator (2) - curatat.xlsx`. Vezi formatul mai jos. |
| `Book1.ods` | Template vechi (2 rânduri) primit inițial de la user pentru un alt sistem POS ("BuCon.ro" — nume nedeslușit/probabil neclar auzit, s-a dovedit a fi de fapt Bluecash50). Istoric, nu se mai folosește. |
| `Import BuCon.ods` | Prima încercare de import, bazată pe presupunerea greșită că sistemul țintă era "BuCon". **Deprecated — ignoră.** |
| `imagini_decenu/` | 63 coperte de carte (JPEG reale, max 1200px pe latura lungă) descărcate pentru cele 64 de cărți ale editurii **decenu.eu**, numite `<cod_de_bare>.jpg` (sau `<cod_articol>.jpg` pentru cele 4 fără cod de bare). Vezi observația despre imagini mai jos — probabil neutilizate de BlueCash50. |

## Formatul `plu_import.csv` (Bluecash50 PLU import)

Fără header, separator `;`, line-ending CRLF, encoding UTF-8. Un rând = un articol:

```
Nume;TVA;Pret;CodDeBare;Departament;Grupa;NumeFisierJPG;UnitateMasura;Reducere;0
```

Convenții stabilite împreună cu userul (confirmate explicit, nu presupuneri):
- **TVA = 2** pentru toate cărțile (cod TVA din sistemul Bluecash, nu procent)
- **Departament = 1** pentru toate (departament unic)
- **Grupa = 2** pentru cărți generale; **Grupa = 4** pentru cărțile editurii **decenu.eu** (grupă separată, cerută explicit de user) — **atenție: grupa 4 trebuie creată manual în meniul BlueCash50 înainte de import**, altfel produsele ajung într-o grupă goală/nedenumită
- **Unitate de masura = 1** (bucată)
- **Reducere = 1**
- Ultimul câmp (fără nume în header) = `0` constant, semnificație necunoscută
- `NumeFisierJPG` — completat doar pentru cele 63 de cărți decenu.eu cu poză descărcată; gol pentru restul

## Ce s-a curățat din nomenclatorul original (776 → 685)

Grupe eliminate integral (nu sunt cărți):
- `consumabile-ae` (28) — birotică, ceai, curățenie, corzi chitară
- `Echipamente IT` (15) — scannere Zebra, imprimante, licențe, monitoare
- `obiecte de inventar` (13) — mobilier, laptop
- `CENTRALA` (5) — telefoane, casă de marcat
- `Chosen` (18) — merchandise (tricouri, șepci, puzzle) pentru serialul TV, nu cărți
- `GLS` (10) — materiale conferință Global Leadership Summit, la cererea explicită a userului

Plus 2 rânduri individuale din grupe altfel valide: "Servicii de procesare" (Bookzone) și "CD Big Data" (Act si politon).

## De rezolvat / gaps cunoscute

- **27 de cărți încă nu au cod de bare** — nu s-au găsit online cu suficientă încredere
  (biblii cu variante de legătură, materiale de nișă Alpha International/IEA, câteva
  titluri decenu.eu foarte recente 2025-2026 fără ISBN publicat). Lista completă e în
  istoricul conversației; pot fi regăsite filtrând `Cod de bare` gol în
  `Nomenclator (2) - curatat.xlsx`.
- **Imaginile de copertă (`imagini_decenu/`) probabil nu sunt afișate de BlueCash50.**
  Am verificat manualul oficial (qretail.ro, "Manual de utilizare BlueCash 50") —
  ecranul de adăugare/editare articol din modulul **Items PLU** listează explicit doar:
  nume, preț, stoc, coduri de bare, tip preț, UM, TVA, departament, grup. **Niciun câmp
  de imagine per-produs.** Singura funcție legată de imagini din tot manualul e un
  logo monocrom BMP 384×384px tipărit pe bonul fiscal (antet chitanță) — complet
  nelegat de produse individuale. Users a fost informat, a zis "e ok", dar dacă revine
  cu întrebarea, nu presupune că feature-ul există — verifică mai întâi dacă a apărut
  ceva nou (firmware/soft de gestiune separat de la Datecs) înainte de a relua munca de
  descărcare imagini.
- Cazuri cu cod de bare "aproape sigur, dar sursă indirectă" — verifică fizic dacă apar probleme:
  8113 "Cum sa devii o persoana cu influenta" (editura reală Amaltea, nu Scriptum),
  8250 "Destinat pentru a crede?..." (editura reală Newordpress, nu Kerigma),
  7231 "Dificultati conjugale" (cod obținut prin conversie ISBN-10→13).

## Workflow / unelte

Nu există Python în acest mediu — se lucrează cu **Node.js + pachetul npm `xlsx`** (SheetJS,
citește/scrie și `.ods`) pentru orice manipulare de fișiere Excel/ODS/CSV. Scripturile de
lucru au fost scrise ad-hoc în scratchpad-ul de sesiune (temporar, nu persistă) — pentru orice
regenerare viitoare a `plu_import.csv` din `Nomenclator (2) - curatat.xlsx`, rescrie logica
după tabelul de convenții de mai sus, nu presupune că un script vechi mai există.

Pentru căutări mari (coduri de bare, coperte) pe internet, s-a folosit paralelizare cu
sub-agenți (Task/Agent tool) — eficient pentru loturi de 12-16 cărți per agent, cu instrucțiuni
stricte de precizie (mai bine "NOT FOUND" decât un cod greșit, care ar strica scanarea la
POS). Codurile ISBN găsite au fost **validate matematic** (cifră de control EAN-13) înainte
de a fi scrise în fișiere — un cod care pică validarea NU se scrie, chiar dacă a fost "găsit".
