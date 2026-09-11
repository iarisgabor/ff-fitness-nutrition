/* Cele 4 proiecte reale — titluri/descrieri identice cu cele din
   profesional/petra-butincu-portofoliu/src/data/proiecte.ts (sursa de adevăr
   pentru acest conținut, aceleași 8 fotografii reale). `cadre` sunt id-urile
   din assets/foto/manifest.json, generate de scripts/optimizeaza-poze.mjs
   din numele fișierelor din poze-fotograf/ — primul cadru din listă e
   coperta cardului. Nu are un flag "lat" manual: gallery.js citește
   orientarea reală a copertei din manifest și adaugă clasa .proiect--lat
   automat pentru cadrele orizontale (azi doar Splendor). */

window.PROIECTE = [
  {
    id: 'fashion-plaja',
    titlu: 'Alb pe mare',
    client: 'Editorial',
    gen: 'Fashion',
    descriere: 'Serie editorială de fashion fotografiată la mare, în lumina joasă de după-amiază târzie.',
    cadre: ['fashion-plaja-rochie-01', 'fashion-plaja-corset-02', 'fashion-plaja-paiete-03', 'fashion-plaja-dantela-04']
  },
  {
    id: 'lumedics',
    titlu: 'Lumină controlată',
    client: 'Lumedics',
    gen: 'Campanie produs',
    descriere: 'Campanie pentru dispozitive de îngrijire cu LED: un cadru curat pe alb, unul dramatic pe roșu.',
    cadre: ['lumedics-masca-led-01', 'lumedics-dispozitiv-led-02']
  },
  {
    id: 'beauty-crin',
    titlu: 'Pistrui și crin',
    client: 'Editorial',
    gen: 'Beauty',
    descriere: 'Prim-plan de beauty construit pe textură: pistrui, sclipici și petale, la aceeași distanță de ochi.',
    cadre: ['beauty-crin-01']
  },
  {
    id: 'splendor',
    titlu: 'Silk Wear',
    client: 'Splendor Professional',
    gen: 'Campanie produs',
    descriere: 'Campanie de fond de ten, pe ton cald, cu produsul ținut în cadru.',
    cadre: ['splendor-silk-wear-01']
  }
];
