// Date placeholder — proiect demo, conținut fictiv.

const CATEGORIES = [
  { slug: "teologie", name: "Teologie" },
  { slug: "leadership", name: "Leadership" },
  { slug: "familie", name: "Familie" },
  { slug: "filosofie", name: "Filosofie" },
  { slug: "business", name: "Business" },
  { slug: "etica", name: "Etică" },
  { slug: "biblii-devotionale", name: "Biblii & Devoționale" },
];

const AUTHORS = [
  { id: "andrei-voiculescu", name: "Andrei Voiculescu", initials: "AV",
    bio: "Scrie la granița dintre teologie și filosofie, cu un ochi atent la întrebările pe care oamenii le evită la masa de duminică." },
  { id: "marina-cristea", name: "Marina Cristea", initials: "MC",
    bio: "Fost director de operațiuni, azi cercetează ce înseamnă să conduci oameni fără să-i epuizezi." },
  { id: "radu-ionescu", name: "Radu Ionescu", initials: "RI",
    bio: "Scrie despre familie ca despre un șantier permanent — niciodată terminat, mereu demn de întreținut." },
  { id: "elena-barbu", name: "Elena Barbu", initials: "EB",
    bio: "Profesoară de filosofie, convinsă că întrebările bune contează mai mult decât răspunsurile rapide." },
  { id: "cosmin-pirvu", name: "Cosmin Pîrvu", initials: "CP",
    bio: "Antreprenor la a treia afacere, scrie despre business ca despre o formă de caracter aplicat." },
  { id: "ioana-dumitrescu", name: "Ioana Dumitrescu", initials: "ID",
    bio: "Explorează etica aplicată în deciziile mici, cotidiene, unde de fapt se formează caracterul." },
  { id: "paul-georgescu", name: "Paul Georgescu", initials: "PG",
    bio: "Autor de devoționale citite de zeci de mii de oameni în fiecare dimineață, de peste un deceniu." },
  { id: "simona-alexe", name: "Simona Alexe", initials: "SA",
    bio: "Teolog cu formație academică solidă, scrie pentru cititori care nu se mulțumesc cu răspunsuri ușoare." },
  { id: "victor-matei", name: "Victor Matei", initials: "VM",
    bio: "A condus echipe de peste 200 de oameni; scrie despre autoritate, încredere și structurile care le susțin." },
  { id: "colectiv", name: "Colectiv editorial", initials: "CE",
    bio: "Echipa editorială din spatele edițiilor de referință ale librăriei." },
];

const BOOKS = [
  // Teologie
  { id: 1, slug: "harul-care-ne-cauta", title: "Harul care ne caută", authorId: "andrei-voiculescu",
    category: "teologie", price: 79, year: 2024, isNew: true, isFeatured: true,
    description: "O explorare a harului nu ca idee abstractă, ci ca experiență care schimbă felul în care privim eșecul, timpul și oamenii din jur." },
  { id: 2, slug: "teologia-intalnirii", title: "Teologia întâlnirii", authorId: "simona-alexe",
    category: "teologie", price: 84, year: 2023, isNew: false, isFeatured: false,
    description: "Despre momentele în care credința nu mai e teorie, ci se întâmplă în fața unei alte persoane." },
  { id: 3, slug: "cuvantul-dincolo-de-litera", title: "Cuvântul dincolo de literă", authorId: "andrei-voiculescu",
    category: "teologie", price: 69, year: 2022, isNew: false, isFeatured: false,
    description: "O invitație la citirea atentă a textelor sacre, dincolo de citatele scoase din context." },
  { id: 4, slug: "credinta-ca-forma-de-curaj", title: "Credința ca formă de curaj", authorId: "paul-georgescu",
    category: "teologie", price: 74, year: 2024, isNew: true, isFeatured: false,
    description: "Credința privită nu ca refugiu, ci ca decizie repetată de a rămâne, chiar și atunci când răspunsurile lipsesc." },

  // Leadership
  { id: 5, slug: "liderul-tacut", title: "Liderul tăcut", authorId: "marina-cristea",
    category: "leadership", price: 89, year: 2023, isNew: false, isFeatured: true,
    description: "De ce cei mai buni lideri vorbesc mai puțin decât crezi și ascultă mai mult decât par." },
  { id: 6, slug: "autoritate-fara-frica", title: "Autoritate fără frică", authorId: "victor-matei",
    category: "leadership", price: 94, year: 2024, isNew: true, isFeatured: true,
    description: "Cum construiești autoritate reală într-o echipă fără să te sprijini pe frică sau control." },
  { id: 7, slug: "cine-conduce-de-fapt", title: "Cine conduce, de fapt?", authorId: "marina-cristea",
    category: "leadership", price: 79, year: 2022, isNew: false, isFeatured: false,
    description: "O privire onestă asupra dinamicilor invizibile de putere din orice organizație." },
  { id: 8, slug: "structuri-de-incredere", title: "Structuri de încredere", authorId: "victor-matei",
    category: "leadership", price: 99, year: 2023, isNew: false, isFeatured: false,
    description: "Încrederea nu e un sentiment, e o structură. Cum o construiești, cărămidă cu cărămidă." },

  // Familie
  { id: 9, slug: "casa-ca-sanctuar", title: "Casa ca sanctuar", authorId: "radu-ionescu",
    category: "familie", price: 64, year: 2023, isNew: false, isFeatured: false,
    description: "Despre casă ca spațiu care fie vindecă, fie rănește — și cum alegem, zi de zi, care din cele două." },
  { id: 10, slug: "parinti-in-timp-real", title: "Părinți în timp real", authorId: "radu-ionescu",
    category: "familie", price: 69, year: 2024, isNew: true, isFeatured: true,
    description: "Ghid onest pentru părinți care nu mai vor rețete perfecte, ci prezență reală." },
  { id: 11, slug: "cuplul-care-ramane", title: "Cuplul care rămâne", authorId: "ioana-dumitrescu",
    category: "familie", price: 74, year: 2022, isNew: false, isFeatured: false,
    description: "Ce ține un cuplu împreună după ce trece euforia începutului — și de ce merită efortul." },
  { id: 12, slug: "mostenirea-tacuta", title: "Moștenirea tăcută", authorId: "radu-ionescu",
    category: "familie", price: 59, year: 2021, isNew: false, isFeatured: false,
    description: "Ce transmitem copiilor noștri fără să spunem un cuvânt — și cum devenim conștienți de asta." },

  // Filosofie
  { id: 13, slug: "despre-limitele-libertatii", title: "Despre limitele libertății", authorId: "elena-barbu",
    category: "filosofie", price: 89, year: 2023, isNew: false, isFeatured: true,
    description: "O reconsiderare a libertății ca disciplină, nu ca absență a oricărei constrângeri." },
  { id: 14, slug: "sensul-ca-practica-zilnica", title: "Sensul ca practică zilnică", authorId: "elena-barbu",
    category: "filosofie", price: 94, year: 2024, isNew: true, isFeatured: false,
    description: "Sensul nu se găsește o dată pentru totdeauna — se exersează, ca un mușchi, în deciziile mărunte." },
  { id: 15, slug: "filosofia-celui-care-ramane", title: "Filosofia celui care rămâne", authorId: "andrei-voiculescu",
    category: "filosofie", price: 84, year: 2022, isNew: false, isFeatured: false,
    description: "Despre virtutea, tot mai rară, de a rămâne — într-o relație, o vocație, o convingere." },
  { id: 16, slug: "adevarul-incomod", title: "Adevărul incomod", authorId: "elena-barbu",
    category: "filosofie", price: 79, year: 2021, isNew: false, isFeatured: false,
    description: "De ce preferăm minciunile confortabile adevărurilor care ne cer să ne schimbăm." },

  // Business
  { id: 17, slug: "profit-cu-constiinta", title: "Profit cu conștiință", authorId: "cosmin-pirvu",
    category: "business", price: 99, year: 2024, isNew: true, isFeatured: true,
    description: "Se poate face profit fără compromisuri etice? Un antreprenor răspunde din experiență directă." },
  { id: 18, slug: "firma-ca-organism-viu", title: "Firma ca organism viu", authorId: "cosmin-pirvu",
    category: "business", price: 104, year: 2023, isNew: false, isFeatured: false,
    description: "De ce organizațiile sănătoase se comportă mai degrabă ca ecosisteme decât ca mașinării." },
  { id: 19, slug: "deciziile-mici-care-conteaza", title: "Deciziile mici care contează", authorId: "victor-matei",
    category: "business", price: 89, year: 2022, isNew: false, isFeatured: false,
    description: "Marile crize de business încep de obicei dintr-o sută de decizii mici, ignorate la timpul lor." },
  { id: 20, slug: "etica-unei-afaceri-sanatoase", title: "Etica unei afaceri sănătoase", authorId: "cosmin-pirvu",
    category: "business", price: 94, year: 2023, isNew: false, isFeatured: false,
    description: "Un cadru practic pentru decizii de business care rezistă și la lumina zilei, și la bilanț." },

  // Etică
  { id: 21, slug: "granite-morale", title: "Granițe morale", authorId: "ioana-dumitrescu",
    category: "etica", price: 74, year: 2023, isNew: false, isFeatured: false,
    description: "Cum trasăm granițe morale clare într-o lume care preferă nuanțele confortabile." },
  { id: 22, slug: "compasul-interior", title: "Compasul interior", authorId: "ioana-dumitrescu",
    category: "etica", price: 79, year: 2024, isNew: true, isFeatured: false,
    description: "Despre formarea unui simț moral care funcționează și atunci când nimeni nu se uită." },
  { id: 23, slug: "cand-regulile-nu-ajung", title: "Când regulile nu ajung", authorId: "elena-barbu",
    category: "etica", price: 84, year: 2022, isNew: false, isFeatured: false,
    description: "Ce facem în zonele gri, acolo unde nicio regulă scrisă nu ne spune exact ce e corect." },
  { id: 24, slug: "etica-micilor-alegeri", title: "Etica micilor alegeri", authorId: "ioana-dumitrescu",
    category: "etica", price: 69, year: 2021, isNew: false, isFeatured: false,
    description: "Caracterul nu se testează în marile crize, ci în alegerile mărunte, repetate, din fiecare zi." },

  // Biblii & Devoționale
  { id: 25, slug: "biblia-de-studiu-editie-cu-comentarii", title: "Biblia de studiu — ediție cu comentarii", authorId: "colectiv",
    category: "biblii-devotionale", price: 149, year: 2023, isNew: false, isFeatured: true,
    description: "Ediție completă, cu comentarii și note explicative, gândită pentru studiu aprofundat." },
  { id: 26, slug: "90-de-zile-cu-psalmii", title: "90 de zile cu Psalmii", authorId: "paul-georgescu",
    category: "biblii-devotionale", price: 54, year: 2024, isNew: true, isFeatured: false,
    description: "Un parcurs de trei luni prin Psalmi, cu reflecții scurte pentru fiecare zi." },
  { id: 27, slug: "devotionalul-dimineti", title: "Devoționalul dimineții", authorId: "paul-georgescu",
    category: "biblii-devotionale", price: 49, year: 2022, isNew: false, isFeatured: false,
    description: "Cel mai citit devoțional al librăriei, gândit pentru primele minute ale zilei." },
  { id: 28, slug: "biblia-editie-de-buzunar", title: "Biblia — ediție de buzunar", authorId: "colectiv",
    category: "biblii-devotionale", price: 89, year: 2021, isNew: false, isFeatured: false,
    description: "Format compact, potrivit pentru citit oriunde — în geantă, în tren, la birou." },
];

function getAuthor(authorId) {
  return AUTHORS.find((a) => a.id === authorId);
}

function getCategoryName(slug) {
  const c = CATEGORIES.find((c) => c.slug === slug);
  return c ? c.name : slug;
}

function getBookBySlug(slug) {
  return BOOKS.find((b) => b.slug === slug);
}

function formatPrice(n) {
  return n.toFixed(0) + " lei";
}
