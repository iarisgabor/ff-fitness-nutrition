'use strict';

/* ---------- Constante de calcul ---------- */
const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, extreme: 1.9 };
const GOAL_CALORIE_MULTIPLIERS = { lose: 0.80, maintain: 1.00, gain: 1.10 };
const PROTEIN_G_PER_KG = { lose: 2.0, maintain: 1.6, gain: 1.8 };
const FAT_PERCENT_OF_TARGET = 0.25;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;
const LOW_CALORIE_FLOOR = 1200;
const ALLERGEN_TAGS = ['dairy', 'egg', 'fish', 'shellfish', 'treenut', 'peanut', 'gluten', 'soy', 'sesame'];
const NUTRITION_API_URL = 'https://ff-fitness-nutrition.iarisgabor.workers.dev/api/generate-plan';
const CREATE_CHECKOUT_SESSION_API_URL = 'https://ff-fitness-nutrition.iarisgabor.workers.dev/api/create-checkout-session';
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51U6TNTHpxrmSgd21A66pxhqEKFqXUnouZuNt5DOpiSeJYFhhgK4cmL1adUgQLIvCxiks2V1GYpLfloBpVVlk3xdH00cltzbARA'; // cheie publică — sigur de commis, nu e secret
const STRIPE_JS_URL = 'https://js.stripe.com/v3/';
const CHECKOUT_FETCH_TIMEOUT_MS = 15000;
const PAID_SESSION_STORAGE_KEY = 'ffFitnessPaidSessionId';
const LAST_RESULTS_STORAGE_KEY = 'ffFitnessLastResults';
const RECIPE_API_URL = 'https://ff-fitness-nutrition.iarisgabor.workers.dev/api/generate-recipe';
const SEND_PLAN_EMAIL_API_URL = 'https://ff-fitness-nutrition.iarisgabor.workers.dev/api/send-plan-email';
const TRANSLATE_API_URL = 'https://ff-fitness-nutrition.iarisgabor.workers.dev/api/translate-plan';
const WORKOUT_API_URL = 'https://ff-fitness-nutrition.iarisgabor.workers.dev/api/generate-workout-plan';
const TRANSLATE_WORKOUT_API_URL = 'https://ff-fitness-nutrition.iarisgabor.workers.dev/api/translate-workout-plan';
const WORKOUT_FETCH_TIMEOUT_MS = 150000;
const REGENERATE_COOLDOWN_MS = 15000;
const RECIPE_FETCH_TIMEOUT_MS = 15000;
const TRANSLATE_FETCH_TIMEOUT_MS = 30000;
const PLAN_SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const PDF_LIBRARY_URL = 'assets/vendor/jspdf.umd.min.js';
const PDF_ASSETS_URL = 'assets/vendor/pdf-assets.js';
const PDF_COLORS = {
  bg: '#0B0710',
  surface: '#17111F',
  border: '#2E2438',
  textPrimary: '#F5F3F7',
  textSecondary: '#B9AFC4',
  primaryButton: '#C70E6E',
  primaryHover: '#FF2E96',
};
const PDF_PAGE_MARGIN = 16;
const PDF_CONTENT_WIDTH = 210 - PDF_PAGE_MARGIN * 2;
const VALIDATION_RULES = {
  age: { min: 15, max: 100 },
  weight: { min: 30, max: 300 },
  height: { min: 120, max: 230 },
};
const LOCALE_BY_LANG = { ro: 'ro-RO', en: 'en-US' };

/* ---------- Conținut bilingv ---------- */
const CONTENT = {
  ro: {
    meta: {
      title: 'FF Fitness — Calculator TDEE & BMR',
      description: 'Calculează-ți TDEE-ul, BMR-ul, caloriile și proteinele zilnice necesare, cu sfaturi personalizate pentru obiectivul tău.',
    },
    nav: { calculator: 'Calculator', exercises: 'Exerciții', faq: 'FAQ' },
    hero: {
      title: 'Află-ți necesarul caloric zilnic',
      subtitle: 'Completează datele tale și primești imediat BMR, TDEE, un target caloric pentru obiectivul tău și necesarul de proteine.',
      about: 'FF Fitness este un calculator gratuit de necesar caloric (BMR/TDEE) și un generator de plan alimentar personalizat cu inteligență artificială. Planul alimentar (serviciu plătit, $5) include rețete complete, export PDF și opțiunea de a-l primi pe email — funcție pentru care folosim contul de Gmail al FF Fitness doar ca să trimitem acel email, niciodată contul tău Google.',
    },
    form: {
      sexLabel: 'Sex biologic',
      sexHint: 'Folosit pentru acuratețea formulei de calcul caloric.',
      male: 'Bărbat',
      female: 'Femeie',
      ageLabel: 'Vârstă (ani)',
      weightLabel: 'Greutate (kg)',
      heightLabel: 'Înălțime (cm)',
      activityLabel: 'Nivel de activitate',
      activityPlaceholder: 'Selectează nivelul de activitate…',
      activity: {
        sedentary: 'Sedentar (deloc sau foarte puțină mișcare)',
        light: 'Ușor activ (sport ușor, 1-3 zile/săpt.)',
        moderate: 'Moderat activ (sport moderat, 3-5 zile/săpt.)',
        active: 'Foarte activ (sport intens, 6-7 zile/săpt.)',
        extreme: 'Extrem de activ (sport foarte intens sau muncă fizică)',
      },
      goalLabel: 'Obiectiv',
      goal: { lose: 'Slăbire', maintain: 'Menținere', gain: 'Masă musculară' },
      submit: 'Calculează',
    },
    results: {
      bmrLabel: 'BMR', bmrHelp: 'Calorii arse în repaus complet',
      tdeeLabel: 'TDEE', tdeeHelp: 'Calorii arse zilnic la nivelul tău de activitate',
      targetLabel: 'Target caloric zilnic', targetHelp: 'Ajustat pentru obiectivul tău',
      macrosLabel: 'Macronutrienți', macrosHelp: 'Recomandat pentru obiectivul tău',
      proteinShort: 'Proteine', carbsShort: 'Carbo', fatShort: 'Grăsimi',
      lowCalorieWarning: 'Acest target este sub 1200 kcal/zi — ia în calcul un deficit mai mic sau sfatul unui specialist.',
      adviceTitle: 'Sfatul FF Fitness pentru tine',
    },
    exercises: {
      title: 'Alege un mușchi și antrenează-l',
      subtitle: 'Dă click pe o grupă musculară de pe hartă pentru a vedea exerciții dedicate, fiecare cu un videoclip demonstrativ.',
      toggleLabel: 'Vedere corp',
      frontLabel: 'Față',
      backLabel: 'Spate',
      selectHint: 'Alege o grupă musculară…',
      backToMap: '← Înapoi la harta corpului',
      backToPlan: '← Înapoi la planul tău',
      listHeading: 'Exerciții pentru {muscle}',
      setsLabel: 'Serii',
      repsLabel: 'Repetări',
      equipmentLabel: 'Echipament',
      difficultyLabel: 'Nivel',
      videoComingSoon: 'Video în curând',
      searchYoutube: 'Caută pe YouTube',
      emptyState: 'Nu am găsit încă exerciții pentru această grupă musculară.',
      muscles: {
        chest: 'Piept', shoulders: 'Umeri', biceps: 'Biceps', forearms: 'Antebrațe',
        abs: 'Abdomen', quads: 'Cvadricepși', calves: 'Gambe',
        back: 'Spate', traps: 'Trapez', triceps: 'Triceps', glutes: 'Fesieri', hamstrings: 'Ischio-gambieri',
      },
      equipment: {
        bodyweight: 'Greutate corporală', dumbbell: 'Gantere', barbell: 'Bară',
        machine: 'Aparat', cable: 'Cablu', kettlebell: 'Kettlebell', band: 'Bandă elastică',
      },
      difficulty: { beginner: 'Începător', intermediate: 'Intermediar', advanced: 'Avansat' },
    },
    aiWorkoutPlan: {
      title: 'Plan de antrenament cu AI',
      intro: 'Generează un plan de antrenament personalizat, potrivit obiectivului, nivelului și echipamentului tău.',
      goalLabel: 'Obiectiv',
      goal: { loseFat: 'Slăbire', strength: 'Forță', buildMuscle: 'Masă musculară', endurance: 'Rezistență' },
      daysLabel: 'Zile de antrenament pe săptămână',
      equipmentLabel: 'Echipament disponibil',
      equipment: { gym: 'Sală completă', homeBasic: 'Acasă (gantere/benzi)', bodyweight: 'Doar greutate corporală' },
      experienceLabel: 'Nivel de experiență',
      experience: { beginner: 'Începător', intermediate: 'Intermediar', advanced: 'Avansat' },
      injuriesLabel: 'Accidentări sau limitări',
      injuriesHint: 'Opțional. Menționăm mișcările de evitat, dar nu înlocuiește sfatul unui specialist.',
      injuriesPlaceholder: 'ex: genunchi, umăr…',
      generateButton: 'Generează planul',
      regenerateButton: 'Regenerează planul',
      loadingSteps: ['Analizează obiectivul tău…', 'Alege structura săptămânii…', 'Selectează exerciții potrivite echipamentului…', 'Calculează serii, repetări și pauze…', 'Construiește planul…'],
      streamingProgress: 'Ziua {n} din {total} e gata…',
      generatingAnnounce: 'Se generează planul de antrenament. Te rugăm așteaptă.',
      translatingText: 'Traducem planul…',
      translateError: 'Traducerea planului a eșuat. Planul rămâne afișat în limba anterioară — încearcă din nou să comuți limba.',
      dayLabel: 'Ziua',
      restLabel: 'Pauză',
      viewExercisesButton: 'Vezi exerciții',
      emptyError: 'Ceva nu a mers bine la generarea planului. Încearcă din nou.',
      rateLimitError: 'Ai atins limita de generări pentru această oră. Încearcă din nou peste puțin timp.',
      timeoutError: 'Generarea planului a durat prea mult. Încearcă din nou.',
      disclaimer: 'Planul de antrenament este generat automat și nu este creat sau verificat de un antrenor sau fizioterapeut — nu constituie sfat medical personalizat. Respectă tehnica corectă la fiecare exercițiu; dacă ești începător, ia în calcul îndrumare de la un specialist. Dacă ai o accidentare, o afecțiune medicală sau dureri, consultă un medic înainte de a începe.',
    },
    aiPlan: {
      title: 'Plan de nutriție cu AI',
      intro: 'Generează un plan de mese pe 7 zile, calculat să se încadreze în targetul tău caloric și de macronutrienți.',
      paywall: {
        title: 'Deblochează planul tău personalizat',
        subtitle: 'O plată unică — acces complet la planul tău alimentar AI.',
        benefit1: 'Plan de mese personalizat pe 7 zile, calculat pe targetul tău caloric și de macronutrienți',
        benefit2: 'Rețete AI detaliate pentru fiecare masă din plan',
        benefit3: 'Export PDF (rețete și plan complet) + trimitere pe email',
        benefit4: 'Adaptat la alergiile și magazinele tale preferate',
        priceNote: 'plată unică — regenerările sunt incluse',
        ctaButton: 'Deblochează planul — $5',
        fineprint: 'Plată securizată, procesată de Stripe. Fără abonament.',
        modalTitle: 'Finalizează plata',
        modalCloseLabel: 'Închide',
        modalLoadingText: 'Se pregătește plata…',
        checkoutLoadError: 'Nu am putut încărca formularul de plată. Încearcă din nou.',
        paymentMismatchError: 'Ai schimbat datele calculatorului — planul acesta e o configurație nouă și necesită o nouă plată.',
        goToPlanButton: 'Vezi planul tău →',
      },
      allergensLabel: 'Alergii sau intoleranțe',
      allergensHint: 'Bifează alergiile sau intoleranțele tale — excludem complet din generator orice rețetă care conține aceste ingrediente.',
      allergens: {
        dairy: 'Lactate', egg: 'Ouă', fish: 'Pește', shellfish: 'Fructe de mare',
        treenut: 'Nuci', peanut: 'Arahide', gluten: 'Gluten', soy: 'Soia', sesame: 'Susan',
      },
      storesLabel: 'Magazine disponibile',
      storesHint: 'Alege din ce magazine poți cumpăra — planul va folosi doar produse plauzibile pentru magazinele bifate.',
      storesRequiredError: 'Bifează cel puțin un magazin.',
      dislikesLabel: 'Alte alimente pe care nu le placi',
      dislikesHint: 'Opțional. Folosim acest câmp ca ghid orientativ, nu ca o excludere garantată — pentru alergii reale, folosește bifele de mai sus.',
      dislikesPlaceholder: 'ex: ciuperci, măsline…',
      generateButton: 'Generează planul',
      regenerateButton: 'Regenerează planul',
      loadingSteps: ['Analizează obiectivul tău…', 'Verifică alergiile…', 'Calculează caloriile și macronutrienții…', 'Alege rețete variate pentru fiecare zi…', 'Echilibrează proteine, carbohidrați și grăsimi…', 'Construiește planul…'],
      streamingProgress: 'Ziua {n} din 7 e gata…',
      generatingAnnounce: 'Se generează planul de nutriție. Te rugăm așteaptă.',
      translatingText: 'Traducem planul…',
      translateError: 'Traducerea planului a eșuat. Planul rămâne afișat în limba anterioară — încearcă din nou să comuți limba.',
      dayLabel: 'Ziua',
      totalLabel: 'Total',
      targetWord: 'target',
      emptyPoolError: 'Cu atât de multe excluderi bifate, nu mai rămân suficiente rețete pentru un plan complet. Debifează câteva opțiuni și încearcă din nou.',
      disclaimer: 'Planul de mese este generat automat, pe baza unei baze de date nutriționale și a targetului tău caloric și de macronutrienți — nu este creat sau verificat de un nutriționist și nu constituie sfat medical sau dietetic personalizat. Bifele de alergii exclud cu strictețe rețetele care conțin acel ingredient, dar nu pot garanta absența urmelor sau a contaminării încrucișate din bucătăria ta. Câmpul liber pentru alte preferințe este orientativ și nu filtrează la fel de sigur ca bifele — nu te baza pe el dacă ai o alergie reală. Dacă ai o alergie alimentară diagnosticată, o intoleranță sau altă afecțiune medicală, verifică fiecare rețetă pe cont propriu și consultă un medic sau un dietetician autorizat.',
      slots: { breakfast: 'Mic dejun', lunch: 'Prânz', dinner: 'Cină', snack: 'Gustare' },
      recipeButton: 'Vezi rețeta',
      recipeCloseLabel: 'Închide',
      recipeLoading: 'Se generează rețeta…',
      ingredientsLabel: 'Ingrediente',
      stepsLabel: 'Mod de preparare',
      servingsLabel: 'Porții',
      prepTimeLabel: 'Timp de preparare',
      pdfButton: 'Descarcă PDF',
      pdfGenerating: 'Se generează PDF-ul…',
      pdfError: 'A apărut o eroare — încearcă din nou',
      pdfFooterNote: 'Generat automat de FF Fitness — nu constituie sfat medical sau dietetic personalizat.',
      pdfAllButton: 'Descarcă tot planul (PDF)',
      pdfAllGenerating: 'Se generează PDF-ul…',
      pdfAllError: 'A apărut o eroare — încearcă din nou',
      pdfAllFooterNote: 'Generat automat de FF Fitness — nu constituie sfat medical sau dietetic personalizat.',
      recipesPreparing: 'Se pregătesc rețetele…',
      recipesPreparingProgress: 'Se pregătesc rețetele… ({done}/{total})',
    },
    planPage: {
      meta: {
        title: 'Planul tău alimentar AI — FF Fitness',
        description: 'Alege alergiile și magazinele preferate, generează-ți planul alimentar AI pe 7 zile și exportă-l ca PDF sau trimite-l pe email.',
      },
      heading: 'Planul tău alimentar AI',
      subheading: 'Alege alergiile și magazinele preferate, apoi generează-ți planul de mese pe 7 zile.',
      locked: {
        title: 'Nu ai încă un plan generat',
        body: 'Ca să ajungi aici, trebuie mai întâi să-ți calculezi necesarul caloric și să deblochezi planul alimentar AI.',
        ctaButton: 'Mergi la calculator',
      },
      missingResults: {
        title: 'Ți-am găsit plata, dar nu și calculul',
        body: 'Plata ta e confirmată, dar acest browser nu are datele calculatorului tău (calorii/macro-uri) — probabil ai deschis link-ul de plată pe alt dispozitiv. Mergi la calculator, recalculează, apoi revino aici.',
        ctaButton: 'Mergi la calculator',
      },
      targetSummary: {
        text: 'Plan calculat pentru {kcal} kcal/zi — {protein}g proteine, {carbs}g carbohidrați, {fat}g grăsimi.',
      },
      email: {
        title: 'Trimite planul pe email',
        hint: 'Primești planul complet, cu rețete cu tot, ca PDF atașat.',
        label: 'Adresa ta de email',
        placeholder: 'nume@exemplu.com',
        submitButton: 'Trimite pe email',
        sending: 'Se trimite…',
        success: 'Trimis! Verifică-ți inboxul (și folderul de spam).',
        fineprint: 'O singură trimitere per click — datele tale nu sunt folosite în alt scop.',
        errors: {
          invalidEmail: 'Introdu o adresă de email validă.',
          paymentRequired: 'Nu am găsit o plată validă pentru acest plan — încearcă din nou din pagina de plată.',
          paymentMismatch: 'Ai schimbat datele calculatorului — planul acesta e o configurație nouă și necesită o nouă plată.',
          capReached: 'Ai atins limita de trimiteri pe email pentru acest plan.',
          rateLimited: 'Prea multe încercări — mai încearcă o dată peste câteva minute.',
          generic: 'Trimiterea a eșuat. Încearcă din nou.',
        },
      },
    },
    advice: {
      lose: 'Un deficit de 20% e suficient pentru o slăbire constantă și sustenabilă — nu e nevoie să tai mai mult. Menține proteina ridicată ca să-ți protejezi masa musculară, continuă antrenamentele de forță, dormi 7-9 ore pe noapte și lasă rezultatele să apară în câteva săptămâni, nu peste noapte.',
      maintain: 'Ești la menținere — obiectivul e consistența, nu perfecțiunea. Mănâncă variat, ține proteina în zona recomandată, mișcă-te regulat și folosește această perioadă pentru a construi obiceiuri pe care le poți susține pe termen lung.',
      gain: 'Un surplus de 10% oferă energie pentru creștere fără acumulare excesivă de grăsime. Prioritizează antrenamentul de forță progresiv (stimulul real pentru mușchi), proteina suficientă la fiecare masă și somnul — acolo se întâmplă recuperarea și creșterea.',
    },
    faq: {
      title: 'Întrebări frecvente',
      items: [
        {
          q: 'Ce este TDEE-ul?',
          a: 'TDEE (Total Daily Energy Expenditure) reprezintă totalul caloriilor pe care corpul tău le arde într-o zi — metabolismul de bază, digestia și toată mișcarea, de la antrenamente la activitățile zilnice. Aici îl calculăm ca BMR × multiplicator de activitate. Dacă mănânci exact la nivelul TDEE-ului, greutatea ta rămâne stabilă.',
        },
        {
          q: 'Ce este BMR-ul?',
          a: 'BMR (Basal Metabolic Rate) este energia de care ai nevoie doar ca să funcționezi în repaus complet — respirație, circulație, activitate celulară. Reprezintă de obicei 60-75% din arderea zilnică totală. Îl calculăm cu formula Mifflin-St Jeor, pe baza sexului, vârstei, greutății și înălțimii tale.',
        },
        {
          q: 'Câte calorii ar trebui să mănânc ca să slăbesc?',
          a: 'Regula de bază e simplă: mănâncă sub TDEE-ul tău. Folosim un deficit moderat de 20%, suficient pentru o pierdere de grăsime constantă fără riscul de a pierde masă musculară sau de a te epuiza — deficitele foarte mari sunt greu de susținut și rareori dau rezultate mai bune pe termen lung. Ca prag general, sub 1200 kcal/zi ar trebui discutat cu un specialist.',
        },
        {
          q: 'Câtă proteină am nevoie?',
          a: 'În general, 1.6-2.2g de proteină per kilogram de greutate corporală acoperă nevoile majorității oamenilor activi. Calculatorul îți personalizează cifra în funcție de greutate și obiectiv — mai multă proteină în deficit caloric, ca să-ți protejezi mușchii, puțin peste menținere când vrei să crești masă musculară.',
        },
        {
          q: 'Calorii vs. macronutrienți',
          a: 'Totalul de calorii determină dacă slăbești, te menții sau te îngrași — e vorba de balanța energetică. Macronutrienții (proteine, carbohidrați, grăsimi) determină în schimb compoziția corporală, sațietatea și performanța la antrenament. Proteina merită urmărită cu atenție; carbohidrații și grăsimile pot fi ajustate mai liber în funcție de preferințe, atât timp cât totalul caloric rămâne corect.',
        },
        {
          q: 'Cum construiesc masă musculară?',
          a: 'Ai nevoie de patru lucruri simultan: calorii suficiente (un surplus ușor ajută, dar nu e obligatoriu la începători), proteină suficientă la fiecare masă, antrenament de forță progresiv — adică muți greutăți tot mai mari sau faci tot mai multe repetări în timp, pentru că acesta e stimulul real de creștere — și recuperare adecvată: somn de calitate și odihnă între antrenamente. Consistența pe parcursul lunilor contează mai mult decât orice truc.',
        },
      ],
    },
    footer: {
      rights: '© {year} FF Fitness. Toate drepturile rezervate.',
      disclaimer: 'Rezultatele sunt estimări cu scop informativ general și nu reprezintă sfat medical. Consultă un specialist înainte de a începe un plan de dietă sau antrenament.',
    },
    validation: {
      required: 'Acest câmp este obligatoriu.',
      ageRange: 'Introdu o vârstă între 15 și 100 de ani.',
      weightRange: 'Introdu o greutate între 30 și 300 kg.',
      heightRange: 'Introdu o înălțime între 120 și 230 cm.',
      selectActivity: 'Selectează nivelul de activitate.',
      selectGoal: 'Selectează un obiectiv.',
      selectSex: 'Selectează sexul biologic.',
    },
  },

  en: {
    meta: {
      title: 'FF Fitness — TDEE & BMR Calculator',
      description: 'Calculate your TDEE, BMR, daily calorie target and protein needs, with tailored advice for your goal.',
    },
    nav: { calculator: 'Calculator', exercises: 'Exercises', faq: 'FAQ' },
    hero: {
      title: 'Find your daily calorie needs',
      subtitle: 'Fill in your details and instantly get your BMR, TDEE, a calorie target for your goal, and your daily protein needs.',
      about: 'FF Fitness is a free calorie-needs calculator (BMR/TDEE) and an AI-powered personalized meal-plan generator. The meal plan (a paid feature, $5) includes full recipes, PDF export, and the option to have it emailed to you — a feature for which we use FF Fitness\'s own Gmail account only to send that one email, never your Google account.',
    },
    form: {
      sexLabel: 'Biological sex',
      sexHint: 'Used for calorie-formula accuracy.',
      male: 'Male',
      female: 'Female',
      ageLabel: 'Age (years)',
      weightLabel: 'Weight (kg)',
      heightLabel: 'Height (cm)',
      activityLabel: 'Activity level',
      activityPlaceholder: 'Select your activity level…',
      activity: {
        sedentary: 'Sedentary (little or no exercise)',
        light: 'Lightly active (light exercise 1-3 days/week)',
        moderate: 'Moderately active (moderate exercise 3-5 days/week)',
        active: 'Very active (hard exercise 6-7 days/week)',
        extreme: 'Extremely active (very hard exercise or physical job)',
      },
      goalLabel: 'Goal',
      goal: { lose: 'Lose weight', maintain: 'Maintain', gain: 'Build muscle' },
      submit: 'Calculate',
    },
    results: {
      bmrLabel: 'BMR', bmrHelp: 'Calories burned at complete rest',
      tdeeLabel: 'TDEE', tdeeHelp: 'Calories burned daily at your activity level',
      targetLabel: 'Daily calorie target', targetHelp: 'Adjusted for your goal',
      macrosLabel: 'Macronutrients', macrosHelp: 'Recommended for your goal',
      proteinShort: 'Protein', carbsShort: 'Carbs', fatShort: 'Fat',
      lowCalorieWarning: 'This target is under 1,200 kcal/day — consider a smaller deficit or a professional’s guidance.',
      adviceTitle: 'FF Fitness advice for you',
    },
    exercises: {
      title: 'Pick a muscle and train it',
      subtitle: 'Click a muscle group on the map to see dedicated exercises, each with a demonstration video.',
      toggleLabel: 'Body view',
      frontLabel: 'Front',
      backLabel: 'Back',
      selectHint: 'Pick a muscle group…',
      backToMap: '← Back to body map',
      backToPlan: '← Back to your plan',
      listHeading: '{muscle} exercises',
      setsLabel: 'Sets',
      repsLabel: 'Reps',
      equipmentLabel: 'Equipment',
      difficultyLabel: 'Level',
      videoComingSoon: 'Video coming soon',
      searchYoutube: 'Search on YouTube',
      emptyState: "We don't have exercises for this muscle group yet.",
      muscles: {
        chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', forearms: 'Forearms',
        abs: 'Abs', quads: 'Quads', calves: 'Calves',
        back: 'Back', traps: 'Traps', triceps: 'Triceps', glutes: 'Glutes', hamstrings: 'Hamstrings',
      },
      equipment: {
        bodyweight: 'Bodyweight', dumbbell: 'Dumbbell', barbell: 'Barbell',
        machine: 'Machine', cable: 'Cable', kettlebell: 'Kettlebell', band: 'Band',
      },
      difficulty: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
    },
    aiWorkoutPlan: {
      title: 'AI Workout Plan',
      intro: 'Generate a personalized workout plan, matched to your goal, level, and equipment.',
      goalLabel: 'Goal',
      goal: { loseFat: 'Lose fat', strength: 'Strength', buildMuscle: 'Build muscle', endurance: 'Endurance' },
      daysLabel: 'Training days per week',
      equipmentLabel: 'Available equipment',
      equipment: { gym: 'Full gym', homeBasic: 'Home (dumbbells/bands)', bodyweight: 'Bodyweight only' },
      experienceLabel: 'Experience level',
      experience: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
      injuriesLabel: 'Injuries or limitations',
      injuriesHint: "Optional. We'll flag movements to avoid, but this doesn't replace a professional's advice.",
      injuriesPlaceholder: 'e.g. knee, shoulder…',
      generateButton: 'Generate plan',
      regenerateButton: 'Regenerate plan',
      loadingSteps: ['Analyzing your goal…', 'Choosing your weekly structure…', 'Picking exercises for your equipment…', 'Calculating sets, reps, and rest…', 'Building your plan…'],
      streamingProgress: 'Day {n} of {total} is ready…',
      generatingAnnounce: 'Generating your workout plan. Please wait.',
      translatingText: 'Translating plan…',
      translateError: 'Translation failed. The plan is still shown in its previous language — try switching again.',
      dayLabel: 'Day',
      restLabel: 'Rest',
      viewExercisesButton: 'View exercises',
      emptyError: 'Something went wrong generating the plan. Please try again.',
      rateLimitError: 'You\'ve reached the hourly generation limit. Try again in a little while.',
      timeoutError: 'Plan generation took too long. Please try again.',
      disclaimer: 'This workout plan is generated automatically and is not created or reviewed by a certified trainer or physiotherapist — it is not personalized medical advice. Use correct form for every exercise; if you are a beginner, consider guided instruction. If you have an injury, a medical condition, or pain, consult a doctor before starting.',
    },
    aiPlan: {
      title: 'AI Nutrition Plan',
      intro: 'Generate a 7-day meal plan, calculated to fit your calorie and macronutrient target.',
      paywall: {
        title: 'Unlock your personalized plan',
        subtitle: 'A one-time payment — full access to your AI nutrition plan.',
        benefit1: 'Personalized 7-day meal plan, calculated to your calorie and macro targets',
        benefit2: 'Detailed AI recipes for every meal in the plan',
        benefit3: 'PDF export (recipes and full plan) + email delivery',
        benefit4: 'Adapted to your allergies and preferred stores',
        priceNote: 'one-time payment — regenerations included',
        ctaButton: 'Unlock plan — $5',
        fineprint: 'Secure payment, processed by Stripe. No subscription.',
        modalTitle: 'Complete your payment',
        modalCloseLabel: 'Close',
        modalLoadingText: 'Preparing payment…',
        checkoutLoadError: 'We couldn’t load the payment form. Please try again.',
        paymentMismatchError: 'You changed the calculator inputs — this is a new plan configuration and needs a new payment.',
        goToPlanButton: 'View your plan →',
      },
      allergensLabel: 'Allergies or intolerances',
      allergensHint: 'Check any allergies or intolerances — we completely exclude any recipe containing these ingredients from the generator.',
      allergens: {
        dairy: 'Dairy', egg: 'Eggs', fish: 'Fish', shellfish: 'Shellfish',
        treenut: 'Tree nuts', peanut: 'Peanuts', gluten: 'Gluten', soy: 'Soy', sesame: 'Sesame',
      },
      storesLabel: 'Available stores',
      storesHint: "Choose which stores you can shop at — the plan will only use products plausible for the stores you've checked.",
      storesRequiredError: 'Check at least one store.',
      dislikesLabel: 'Other foods you dislike',
      dislikesHint: 'Optional. We use this as a best-effort guide, not a guaranteed exclusion — for real allergies, use the checkboxes above.',
      dislikesPlaceholder: 'e.g. mushrooms, olives…',
      generateButton: 'Generate plan',
      regenerateButton: 'Regenerate plan',
      loadingSteps: ['Analyzing your goal…', 'Checking allergies…', 'Calculating calories and macros…', 'Picking varied recipes for each day…', 'Balancing protein, carbs, and fat…', 'Building your plan…'],
      streamingProgress: 'Day {n} of 7 is ready…',
      generatingAnnounce: 'Generating your nutrition plan. Please wait.',
      translatingText: 'Translating plan…',
      translateError: 'Translation failed. The plan is still shown in its previous language — try switching again.',
      dayLabel: 'Day',
      totalLabel: 'Total',
      targetWord: 'target',
      emptyPoolError: 'With this many exclusions checked, there aren’t enough recipes left for a full plan. Uncheck a few options and try again.',
      disclaimer: 'This meal plan is generated automatically from a nutrition database and your calorie/macro targets — it is not created or reviewed by a nutritionist and is not personalized medical or dietary advice. The allergy checkboxes strictly exclude any recipe containing that ingredient, but can’t guarantee your kitchen is free of traces or cross-contamination. The free-text field is best-effort only and doesn’t filter as reliably as the checkboxes — don’t rely on it for a real allergy. If you have a diagnosed food allergy, intolerance, or other medical condition, double-check every recipe yourself and consult a doctor or registered dietitian.',
      slots: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' },
      recipeButton: 'See recipe',
      recipeCloseLabel: 'Close',
      recipeLoading: 'Generating recipe…',
      ingredientsLabel: 'Ingredients',
      stepsLabel: 'Instructions',
      servingsLabel: 'Servings',
      prepTimeLabel: 'Prep time',
      pdfButton: 'Download PDF',
      pdfGenerating: 'Generating PDF…',
      pdfError: 'Something went wrong — try again',
      pdfFooterNote: 'Automatically generated by FF Fitness — not personalized medical or dietary advice.',
      pdfAllButton: 'Download full plan (PDF)',
      pdfAllGenerating: 'Generating PDF…',
      pdfAllError: 'Something went wrong — try again',
      pdfAllFooterNote: 'Automatically generated by FF Fitness — not personalized medical or dietary advice.',
      recipesPreparing: 'Preparing recipes…',
      recipesPreparingProgress: 'Preparing recipes… ({done}/{total})',
    },
    planPage: {
      meta: {
        title: 'Your AI Meal Plan — FF Fitness',
        description: 'Choose your allergies and preferred stores, generate your 7-day AI meal plan, and export it as a PDF or send it by email.',
      },
      heading: 'Your AI Meal Plan',
      subheading: 'Choose your allergies and preferred stores, then generate your 7-day meal plan.',
      locked: {
        title: 'You don’t have a plan yet',
        body: 'To get here, you first need to calculate your calorie target and unlock the AI nutrition plan.',
        ctaButton: 'Go to calculator',
      },
      missingResults: {
        title: 'We found your payment, but not your numbers',
        body: 'Your payment is confirmed, but this browser doesn’t have your calculator data (calories/macros) — you probably opened the payment link on a different device. Go to the calculator, recalculate, then come back here.',
        ctaButton: 'Go to calculator',
      },
      targetSummary: {
        text: 'Plan calculated for {kcal} kcal/day — {protein}g protein, {carbs}g carbs, {fat}g fat.',
      },
      email: {
        title: 'Email me the plan',
        hint: 'You’ll get the full plan, recipes included, as a PDF attachment.',
        label: 'Your email address',
        placeholder: 'name@example.com',
        submitButton: 'Send by email',
        sending: 'Sending…',
        success: 'Sent! Check your inbox (and spam folder).',
        fineprint: 'A single send per click — your data isn’t used for anything else.',
        errors: {
          invalidEmail: 'Enter a valid email address.',
          paymentRequired: 'We couldn’t find a valid payment for this plan — try again from the payment page.',
          paymentMismatch: 'You changed the calculator inputs — this is a new plan configuration and needs a new payment.',
          capReached: 'You’ve reached the email-send limit for this plan.',
          rateLimited: 'Too many attempts — try again in a few minutes.',
          generic: 'Sending failed. Please try again.',
        },
      },
    },
    advice: {
      lose: 'A 20% deficit is enough for steady, sustainable fat loss — no need to cut further. Keep protein high to protect your muscle mass, keep lifting, get 7-9 hours of sleep, and let results show up over weeks, not overnight.',
      maintain: 'You’re at maintenance — the goal here is consistency, not perfection. Eat a varied diet, keep protein in the recommended range, stay active regularly, and use this period to build habits you can sustain long-term.',
      gain: 'A 10% surplus gives you the energy to grow without excess fat gain. Prioritize progressive strength training (the real growth stimulus), enough protein at every meal, and sleep — that’s where recovery and growth actually happen.',
    },
    faq: {
      title: 'Frequently asked questions',
      items: [
        {
          q: 'What is TDEE?',
          a: 'TDEE (Total Daily Energy Expenditure) is the total number of calories your body burns in a day — your base metabolism, digestion, and all movement, from workouts to daily activity. Here it’s calculated as BMR × activity multiplier. Eating right at your TDEE keeps your weight stable.',
        },
        {
          q: 'What is BMR?',
          a: 'BMR (Basal Metabolic Rate) is the energy your body needs just to function at complete rest — breathing, circulation, cellular activity. It typically makes up 60-75% of your total daily burn. We calculate it using the Mifflin-St Jeor equation, based on your sex, age, weight, and height.',
        },
        {
          q: 'How many calories should I eat to lose weight?',
          a: 'The basic rule: eat below your TDEE. We use a moderate 20% deficit — enough for steady fat loss without the risk of losing muscle or burning out, since very aggressive deficits are hard to sustain and rarely produce better long-term results. As a general rule, going under 1,200 kcal/day is worth discussing with a professional.',
        },
        {
          q: 'How much protein do I need?',
          a: 'Generally, 1.6-2.2g of protein per kilogram of bodyweight covers the needs of most active people. This calculator personalizes the number based on your weight and goal — higher when you’re in a calorie deficit to protect muscle, slightly above maintenance when building muscle.',
        },
        {
          q: 'Calories vs. macros',
          a: 'Total calories determine whether you lose, maintain, or gain weight — it’s about energy balance. Macronutrients (protein, carbs, fat) shape body composition, satiety, and training performance instead. Protein is the one worth tracking deliberately; carbs and fat can flex more freely based on preference, as long as your total calories stay on target.',
        },
        {
          q: 'How to build muscle',
          a: 'You need four things at once: enough calories (a slight surplus helps, though it’s not mandatory for beginners), enough protein at every meal, progressive resistance training — lifting heavier or doing more reps over time, since that’s the actual growth stimulus — and proper recovery: quality sleep and rest between sessions. Consistency over months matters more than any single trick.',
        },
      ],
    },
    footer: {
      rights: '© {year} FF Fitness. All rights reserved.',
      disclaimer: 'Results are estimates for general informational purposes only and are not medical advice. Consult a qualified professional before starting any diet or exercise program.',
    },
    validation: {
      required: 'This field is required.',
      ageRange: 'Enter an age between 15 and 100.',
      weightRange: 'Enter a weight between 30 and 300 kg.',
      heightRange: 'Enter a height between 120 and 230 cm.',
      selectActivity: 'Select your activity level.',
      selectGoal: 'Select a goal.',
      selectSex: 'Select a biological sex.',
    },
  },
};

/* ---------- Bază de date mese (fallback local) ---------- */
const MEAL_DATABASE = [
  // ---- BREAKFAST (16) ----
  { id: 'b1', slot: 'breakfast', ro: { name: 'Ovăz cu iaurt și banană', desc: '50g fulgi ovăz, 150g iaurt grecesc, banană, scorțișoară' }, en: { name: 'Oats with yogurt and banana', desc: '50g rolled oats, 150g Greek yogurt, banana, cinnamon' }, kcal: 370, protein: 23, carbs: 62, fat: 4, tags: ['dairy'] },
  { id: 'b2', slot: 'breakfast', ro: { name: 'Ovăz peste noapte cu migdale', desc: '50g ovăz, 150ml lapte, 15g migdale, miere' }, en: { name: 'Overnight oats with almonds', desc: '50g oats, 150ml milk, 15g almonds, honey' }, kcal: 361, protein: 15, carbs: 50, fat: 12, tags: ['dairy', 'treenut'] },
  { id: 'b3', slot: 'breakfast', ro: { name: 'Ouă jumări cu pâine integrală', desc: '3 ouă, 1 felie pâine integrală, ulei de măsline' }, en: { name: 'Scrambled eggs with wholewheat toast', desc: '3 eggs, 1 slice wholewheat bread, olive oil' }, kcal: 335, protein: 23, carbs: 15, fat: 20, tags: ['egg', 'gluten'] },
  { id: 'b4', slot: 'breakfast', ro: { name: 'Omletă cu legume', desc: '3 ouă, 100g legume mixte, ulei de măsline' }, en: { name: 'Vegetable omelet', desc: '3 eggs, 100g mixed vegetables, olive oil' }, kcal: 319, protein: 22, carbs: 14, fat: 19, tags: ['egg'] },
  { id: 'b5', slot: 'breakfast', ro: { name: 'Bol de iaurt cu migdale și miere', desc: '200g iaurt grecesc, 15g migdale, miere, banană' }, en: { name: 'Yogurt bowl with almonds and honey', desc: '200g Greek yogurt, 15g almonds, honey, banana' }, kcal: 301, protein: 24, carbs: 35, fat: 9, tags: ['dairy', 'treenut'] },
  { id: 'b6', slot: 'breakfast', ro: { name: 'Brânză de vaci cu banană', desc: '200g brânză de vaci, banană, miere' }, en: { name: 'Cottage cheese with banana', desc: '200g cottage cheese, banana, honey' }, kcal: 272, protein: 22, carbs: 38, fat: 5, tags: ['dairy'] },
  { id: 'b7', slot: 'breakfast', ro: { name: 'Bol cu ouă și fasole neagră', desc: '2 ouă, 150g fasole neagră, 80g legume, ulei de măsline' }, en: { name: 'Egg and black bean bowl', desc: '2 eggs, 150g black beans, 80g vegetables, olive oil' }, kcal: 433, protein: 28, carbs: 47, fat: 15, tags: ['egg'] },
  { id: 'b8', slot: 'breakfast', ro: { name: 'Pâine integrală cu brânză de vaci', desc: '2 felii pâine integrală, 150g brânză de vaci, miere' }, en: { name: 'Wholewheat toast with cottage cheese', desc: '2 slices wholewheat bread, 150g cottage cheese, honey' }, kcal: 304, protein: 24, carbs: 40, fat: 6, tags: ['gluten', 'dairy'] },
  { id: 'b9', slot: 'breakfast', ro: { name: 'Clătite din ovăz și banană', desc: '60g ovăz, 2 ouă, banană, ulei de măsline, miere' }, en: { name: 'Oat and banana pancakes', desc: '60g oats, 2 eggs, banana, olive oil, honey' }, kcal: 521, protein: 22, carbs: 70, fat: 18, tags: ['egg'] },
  { id: 'b10', slot: 'breakfast', ro: { name: 'Terci de quinoa cu lapte', desc: '150g quinoa fiartă, 150ml lapte, banană, miere' }, en: { name: 'Quinoa porridge with milk', desc: '150g cooked quinoa, 150ml milk, banana, honey' }, kcal: 336, protein: 13, carbs: 64, fat: 5, tags: ['dairy'] },
  { id: 'b11', slot: 'breakfast', ro: { name: 'Iaurt cu ovăz și migdale', desc: '150g iaurt grecesc, 40g ovăz, 12g migdale' }, en: { name: 'Yogurt with oats and almonds', desc: '150g Greek yogurt, 40g oats, 12g almonds' }, kcal: 313, protein: 23, carbs: 35, fat: 9, tags: ['dairy', 'treenut'] },
  { id: 'b12', slot: 'breakfast', ro: { name: 'Ouă cu legume călite', desc: '2 ouă, 150g legume mixte, ulei de măsline' }, en: { name: 'Eggs with sautéed vegetables', desc: '2 eggs, 150g mixed vegetables, olive oil' }, kcal: 300, protein: 17, carbs: 20, fat: 17, tags: ['egg'] },
  { id: 'b13', slot: 'breakfast', ro: { name: 'Pâine integrală cu unt de arahide', desc: '2 felii pâine integrală, 20g unt de arahide, banană' }, en: { name: 'Wholewheat toast with peanut butter', desc: '2 slices wholewheat bread, 20g peanut butter, banana' }, kcal: 368, protein: 14, carbs: 55, fat: 12, tags: ['gluten', 'peanut'] },
  { id: 'b14', slot: 'breakfast', ro: { name: 'Brânză de vaci cu ovăz și migdale', desc: '150g brânză de vaci, 45g ovăz, 10g migdale, miere' }, en: { name: 'Cottage cheese with oats and almonds', desc: '150g cottage cheese, 45g oats, 10g almonds, honey' }, kcal: 371, protein: 24, carbs: 46, fat: 11, tags: ['dairy', 'treenut'] },
  { id: 'b15', slot: 'breakfast', ro: { name: 'Bol de quinoa cu fructe', desc: '180g quinoa fiartă, banană, miere — fără alergeni majori' }, en: { name: 'Quinoa fruit bowl', desc: '180g cooked quinoa, banana, honey — allergen-free' }, kcal: 326, protein: 9, carbs: 67, fat: 4, tags: [] },
  { id: 'b16', slot: 'breakfast', ro: { name: 'Bol de cartof dulce cu fasole neagră', desc: '200g cartof dulce copt, 100g fasole neagră, ulei de măsline' }, en: { name: 'Sweet potato and black bean bowl', desc: '200g baked sweet potato, 100g black beans, olive oil' }, kcal: 352, protein: 13, carbs: 65, fat: 5, tags: [] },

  // ---- MAIN — pool comun prânz/cină (24) ----
  { id: 'm1', slot: 'main', ro: { name: 'Pui la grătar cu orez și legume', desc: '150g piept de pui, 200g orez alb, 150g legume, ulei de măsline' }, en: { name: 'Grilled chicken with rice and vegetables', desc: '150g chicken breast, 200g white rice, 150g vegetables, olive oil' }, kcal: 645, protein: 56, carbs: 76, fat: 11, tags: [] },
  { id: 'm2', slot: 'main', ro: { name: 'Somon cu cartof dulce', desc: '150g somon, 200g cartof dulce copt, 100g legume, ulei de măsline' }, en: { name: 'Salmon with sweet potato', desc: '150g salmon, 200g baked sweet potato, 100g vegetables, olive oil' }, kcal: 594, protein: 40, carbs: 55, fat: 24, tags: ['fish'] },
  { id: 'm3', slot: 'main', ro: { name: 'Vită slabă cu orez brun', desc: '150g vită tocată slabă, 200g orez brun, 150g legume, ulei de măsline' }, en: { name: 'Lean beef with brown rice', desc: '150g lean ground beef, 200g brown rice, 150g vegetables, olive oil' }, kcal: 616, protein: 42, carbs: 71, fat: 17, tags: [] },
  { id: 'm4', slot: 'main', ro: { name: 'Bol de năut cu orez brun', desc: '200g năut fiert, 150g orez brun, 100g legume, ulei de măsline' }, en: { name: 'Chickpea bowl with brown rice', desc: '200g boiled chickpeas, 150g brown rice, 100g vegetables, olive oil' }, kcal: 617, protein: 25, carbs: 106, fat: 11, tags: [] },
  { id: 'm5', slot: 'main', ro: { name: 'Bol de creveți cu quinoa', desc: '180g creveți, 150g quinoa fiartă, 100g legume, ulei de măsline' }, en: { name: 'Shrimp and quinoa bowl', desc: '180g shrimp, 150g cooked quinoa, 100g vegetables, olive oil' }, kcal: 463, protein: 47, carbs: 47, fat: 10, tags: ['shellfish'] },
  { id: 'm6', slot: 'main', ro: { name: 'Bol de tofu cu fasole neagră', desc: '200g tofu ferm, 100g fasole neagră, 150g orez alb, ulei de măsline' }, en: { name: 'Tofu and black bean bowl', desc: '200g firm tofu, 100g black beans, 150g white rice, olive oil' }, kcal: 655, protein: 48, carbs: 72, fat: 23, tags: ['soy'] },
  { id: 'm7', slot: 'main', ro: { name: 'Pui cu quinoa și legume', desc: '150g piept de pui, 150g quinoa fiartă, 150g legume, ulei de măsline' }, en: { name: 'Chicken with quinoa and vegetables', desc: '150g chicken breast, 150g cooked quinoa, 150g vegetables, olive oil' }, kcal: 565, protein: 57, carbs: 52, fat: 13, tags: [] },
  { id: 'm8', slot: 'main', ro: { name: 'Salată de pui cu năut', desc: '130g piept de pui, 150g năut fiert, 150g legume/salată, ulei de măsline' }, en: { name: 'Chicken and chickpea salad', desc: '130g chicken breast, 150g boiled chickpeas, 150g salad vegetables, olive oil' }, kcal: 618, protein: 58, carbs: 61, fat: 16, tags: [] },
  { id: 'm9', slot: 'main', ro: { name: 'Bol de somon cu quinoa', desc: '130g somon, 150g quinoa fiartă, 100g legume' }, en: { name: 'Salmon and quinoa bowl', desc: '130g salmon, 150g cooked quinoa, 100g vegetables' }, kcal: 513, protein: 38, carbs: 45, fat: 19, tags: ['fish'] },
  { id: 'm10', slot: 'main', ro: { name: 'Tigaie de vită cu cartof dulce', desc: '150g vită tocată slabă, 200g cartof dulce copt, 100g legume, ulei de măsline' }, en: { name: 'Beef and sweet potato skillet', desc: '150g lean ground beef, 200g baked sweet potato, 100g vegetables, olive oil' }, kcal: 517, protein: 39, carbs: 55, fat: 15, tags: [] },
  { id: 'm11', slot: 'main', ro: { name: 'Pui cu cartof dulce și migdale', desc: '150g piept de pui, 150g cartof dulce copt, 100g legume, 10g migdale' }, en: { name: 'Chicken with sweet potato and almonds', desc: '150g chicken breast, 150g baked sweet potato, 100g vegetables, 10g almonds' }, kcal: 505, protein: 55, carbs: 46, fat: 11, tags: ['treenut'] },
  { id: 'm12', slot: 'main', ro: { name: 'Bol de fasole neagră cu orez brun', desc: '200g fasole neagră, 150g orez brun, 100g legume, ulei de măsline' }, en: { name: 'Black bean and brown rice bowl', desc: '200g black beans, 150g brown rice, 100g vegetables, olive oil' }, kcal: 553, protein: 25, carbs: 99, fat: 7, tags: [] },
  { id: 'm13', slot: 'main', ro: { name: 'Bol de pui în stil Caesar', desc: '170g piept de pui, 200g salată/legume, 100g quinoa, ulei de măsline (fără crutoane/brânză)' }, en: { name: 'Chicken Caesar-style bowl', desc: '170g chicken breast, 200g salad vegetables, 100g quinoa, olive oil (no croutons/cheese)' }, kcal: 590, protein: 63, carbs: 48, fat: 15, tags: [] },
  { id: 'm14', slot: 'main', ro: { name: 'Bol de creveți cu fasole neagră', desc: '150g creveți, 100g fasole neagră, 150g orez alb, ulei de măsline' }, en: { name: 'Shrimp and black bean bowl', desc: '150g shrimp, 100g black beans, 150g white rice, olive oil' }, kcal: 515, protein: 44, carbs: 68, fat: 7, tags: ['shellfish'] },
  { id: 'm15', slot: 'main', ro: { name: 'Bol Buddha cu tofu și tahini', desc: '180g tofu ferm, 150g quinoa fiartă, 100g legume, 15g tahini' }, en: { name: 'Tofu Buddha bowl with tahini', desc: '180g firm tofu, 150g cooked quinoa, 100g vegetables, 15g tahini' }, kcal: 593, protein: 43, carbs: 53, fat: 27, tags: ['soy', 'sesame'] },
  { id: 'm16', slot: 'main', ro: { name: 'Somon cu orez și legume', desc: '150g somon, 150g orez alb, 100g legume' }, en: { name: 'Salmon with rice and vegetables', desc: '150g salmon, 150g white rice, 100g vegetables' }, kcal: 569, protein: 40, carbs: 55, fat: 19, tags: ['fish'] },
  { id: 'm17', slot: 'main', ro: { name: 'Bol de vită cu năut', desc: '150g vită tocată slabă, 130g năut fiert, 100g legume' }, en: { name: 'Beef and chickpea bowl', desc: '150g lean ground beef, 130g boiled chickpeas, 100g vegetables' }, kcal: 511, protein: 47, carbs: 49, fat: 14, tags: [] },
  { id: 'm18', slot: 'main', ro: { name: 'Bol de pui cu brânză de vaci și orez', desc: '120g piept de pui, 100g brânză de vaci, 150g orez alb, 100g legume' }, en: { name: 'Chicken, cottage cheese and rice bowl', desc: '120g chicken breast, 100g cottage cheese, 150g white rice, 100g vegetables' }, kcal: 539, protein: 55, carbs: 60, fat: 7, tags: ['dairy'] },
  { id: 'm19', slot: 'main', ro: { name: 'Cartof dulce cu fasole neagră și tahini', desc: '200g cartof dulce copt, 150g fasole neagră, 100g legume, 15g tahini' }, en: { name: 'Sweet potato and black bean bowl with tahini', desc: '200g baked sweet potato, 150g black beans, 100g vegetables, 15g tahini' }, kcal: 532, protein: 23, carbs: 93, fat: 9, tags: ['sesame'] },
  { id: 'm20', slot: 'main', ro: { name: 'Pui cu piure de cartofi', desc: '150g piept de pui, 250g cartofi copți/pasați, 100g legume, ulei de măsline' }, en: { name: 'Chicken with mashed potato', desc: '150g chicken breast, 250g baked/mashed potato, 100g vegetables, olive oil' }, kcal: 585, protein: 56, carbs: 66, fat: 10, tags: [] },
  { id: 'm21', slot: 'main', ro: { name: 'Vită cu quinoa și legume', desc: '130g vită tocată slabă, 150g quinoa fiartă, 150g legume' }, en: { name: 'Beef with quinoa and vegetables', desc: '130g lean ground beef, 150g cooked quinoa, 150g vegetables' }, kcal: 479, protein: 39, carbs: 52, fat: 12, tags: [] },
  { id: 'm22', slot: 'main', ro: { name: 'Somon cu năut', desc: '130g somon, 130g năut fiert, 100g legume' }, en: { name: 'Salmon with chickpeas', desc: '130g salmon, 130g boiled chickpeas, 100g vegetables' }, kcal: 546, protein: 43, carbs: 49, fat: 20, tags: ['fish'] },
  { id: 'm23', slot: 'main', ro: { name: 'Bol caloric de pui cu orez și migdale', desc: '200g piept de pui, 250g orez alb, 100g legume, 15g migdale, ulei de măsline' }, en: { name: 'High-calorie chicken, rice and almond bowl', desc: '200g chicken breast, 250g white rice, 100g vegetables, 15g almonds, olive oil' }, kcal: 847, protein: 75, carbs: 87, fat: 20, tags: ['treenut'] },
  { id: 'm24', slot: 'main', ro: { name: 'Tigaie de tofu cu orez brun', desc: '200g tofu ferm, 200g orez brun, 150g legume, ulei de măsline' }, en: { name: 'Tofu and brown rice stir-fry', desc: '200g firm tofu, 200g brown rice, 150g vegetables, olive oil' }, kcal: 671, protein: 44, carbs: 76, fat: 24, tags: ['soy'] },

  // ---- SNACK (11) ----
  { id: 's1', slot: 'snack', ro: { name: 'Iaurt cu migdale', desc: '150g iaurt grecesc, 10g migdale' }, en: { name: 'Yogurt with almonds', desc: '150g Greek yogurt, 10g almonds' }, kcal: 149, protein: 17, carbs: 8, fat: 6, tags: ['dairy', 'treenut'] },
  { id: 's2', slot: 'snack', ro: { name: 'Banană cu unt de arahide', desc: '1 banană, 15g unt de arahide' }, en: { name: 'Banana with peanut butter', desc: '1 banana, 15g peanut butter' }, kcal: 177, protein: 4, carbs: 26, fat: 8, tags: ['peanut'] },
  { id: 's3', slot: 'snack', ro: { name: 'Brânză de vaci cu miere', desc: '150g brânză de vaci, miere' }, en: { name: 'Cottage cheese with honey', desc: '150g cottage cheese, honey' }, kcal: 143, protein: 16, carbs: 13, fat: 3, tags: ['dairy'] },
  { id: 's4', slot: 'snack', ro: { name: 'Pumn de migdale', desc: '30g migdale crude' }, en: { name: 'Handful of almonds', desc: '30g raw almonds' }, kcal: 174, protein: 6, carbs: 6, fat: 15, tags: ['treenut'] },
  { id: 's5', slot: 'snack', ro: { name: 'Două ouă fierte tari', desc: '2 ouă fierte, praf de sare' }, en: { name: 'Two hard-boiled eggs', desc: '2 boiled eggs, pinch of salt' }, kcal: 143, protein: 13, carbs: 1, fat: 10, tags: ['egg'] },
  { id: 's6', slot: 'snack', ro: { name: 'Hummus cu bastonașe de legume', desc: '100g năut, 15g tahini, ulei de măsline, legume proaspete' }, en: { name: 'Hummus with vegetable sticks', desc: '100g chickpeas, 15g tahini, olive oil, fresh vegetables' }, kcal: 326, protein: 13, carbs: 37, fat: 15, tags: ['sesame'] },
  { id: 's7', slot: 'snack', ro: { name: 'Iaurt proteic cu banană', desc: '200g iaurt grecesc, jumătate banană' }, en: { name: 'Protein yogurt with banana', desc: '200g Greek yogurt, half a banana' }, kcal: 175, protein: 21, carbs: 21, fat: 1, tags: ['dairy'] },
  { id: 's8', slot: 'snack', ro: { name: 'Năut rumenit la cuptor', desc: '150g năut fiert, ulei de măsline, la cuptor — fără alergeni majori' }, en: { name: 'Roasted chickpeas', desc: '150g boiled chickpeas, olive oil, oven-roasted — allergen-free' }, kcal: 286, protein: 13, carbs: 41, fat: 8, tags: [] },
  { id: 's9', slot: 'snack', ro: { name: 'Pâine integrală cu miere', desc: '1 felie pâine integrală, miere' }, en: { name: 'Wholewheat toast with honey', desc: '1 slice wholewheat bread, honey' }, kcal: 102, protein: 4, carbs: 20, fat: 1, tags: ['gluten'] },
  { id: 's10', slot: 'snack', ro: { name: 'Mini-bol de ovăz cu lapte', desc: '30g ovăz, 100ml lapte' }, en: { name: 'Oats and milk mini-bowl', desc: '30g oats, 100ml milk' }, kcal: 156, protein: 7, carbs: 25, fat: 3, tags: ['dairy'] },
  { id: 's11', slot: 'snack', ro: { name: 'Cartof dulce copt', desc: '150g cartof dulce copt, ulei de măsline — fără alergeni majori' }, en: { name: 'Baked sweet potato wedges', desc: '150g baked sweet potato, olive oil — allergen-free' }, kcal: 175, protein: 3, carbs: 31, fat: 5, tags: [] },
];

/* ---------- Rețete pas cu pas per masă (fallback local) ---------- */
const MEAL_RECIPE_STEPS = {
  b1: {
    prepMinutes: 10,
    ro: ['Fierbe fulgii de ovăz cu puțină apă sau lapte, la foc mic, 3-4 minute, amestecând.', 'Lasă să se răcească puțin, apoi adaugă iaurtul grecesc peste ovăz.', 'Feliază banana deasupra și presară scorțișoară.', 'Servește cald sau rece, după preferință.'],
    en: ['Cook the rolled oats with a splash of water or milk over low heat, 3-4 minutes, stirring.', 'Let cool slightly, then stir the Greek yogurt into the oats.', 'Slice the banana on top and sprinkle with cinnamon.', 'Serve warm or cold, as you prefer.'],
  },
  b2: {
    prepMinutes: 5,
    ro: ['Amestecă fulgii de ovăz cu laptele într-un borcan sau bol cu capac.', 'Adaugă migdalele tocate grosier și un praf de scorțișoară, dacă ai.', 'Acoperă și lasă la frigider peste noapte (minimum 4 ore).', 'A doua zi, amestecă bine, adaugă miere deasupra și servește rece.'],
    en: ['Mix the rolled oats with the milk in a jar or bowl with a lid.', 'Add the roughly chopped almonds and a pinch of cinnamon, if you like.', 'Cover and refrigerate overnight (at least 4 hours).', 'The next day, stir well, drizzle honey on top and serve cold.'],
  },
  b3: {
    prepMinutes: 10,
    ro: ['Bate ouăle într-un bol cu un praf de sare și piper.', 'Încălzește uleiul de măsline într-o tigaie antiaderentă la foc mediu.', 'Toarnă ouăle și amestecă continuu cu o spatulă, la foc mic, până se leagă cremos.', 'Prăjește feliile de pâine integrală la toaster sau în aceeași tigaie.', 'Servește ouăle jumări alături de pâinea prăjită.'],
    en: ['Beat the eggs in a bowl with a pinch of salt and pepper.', 'Heat the olive oil in a non-stick pan over medium heat.', 'Pour in the eggs and stir continuously with a spatula over low heat until creamy and set.', 'Toast the wholewheat bread slices in a toaster or the same pan.', 'Serve the scrambled eggs alongside the toast.'],
  },
  b4: {
    prepMinutes: 12,
    ro: ['Taie legumele mixte mărunt și călește-le în ulei de măsline 3-4 minute, până se înmoaie.', 'Bate ouăle într-un bol cu sare și piper.', 'Toarnă ouăle peste legume în tigaie și lasă la foc mic, fără să amesteci, 2-3 minute.', 'Împăturește omleta pe jumătate când s-a legat pe margini și mai lasă 1 minut.', 'Servește imediat, caldă.'],
    en: ['Chop the mixed vegetables finely and sauté them in olive oil for 3-4 minutes until softened.', 'Beat the eggs in a bowl with salt and pepper.', 'Pour the eggs over the vegetables in the pan and let cook over low heat, undisturbed, 2-3 minutes.', 'Fold the omelet in half once the edges are set and cook for another minute.', 'Serve immediately, while hot.'],
  },
  b5: {
    prepMinutes: 5,
    ro: ['Toarnă iaurtul grecesc într-un bol.', 'Feliază banana și așaz-o deasupra iaurtului.', 'Presară migdalele deasupra.', 'Adaugă un fir de miere și servește imediat.'],
    en: ['Spoon the Greek yogurt into a bowl.', 'Slice the banana and arrange it on top of the yogurt.', 'Sprinkle the almonds on top.', 'Drizzle with honey and serve right away.'],
  },
  b6: {
    prepMinutes: 5,
    ro: ['Pune brânza de vaci într-un bol.', 'Feliază banana deasupra.', 'Adaugă un fir de miere peste tot.', 'Amestecă ușor sau servește pe straturi, după preferință.'],
    en: ['Spoon the cottage cheese into a bowl.', 'Slice the banana on top.', 'Drizzle honey over everything.', 'Stir gently or serve layered, as you prefer.'],
  },
  b7: {
    prepMinutes: 12,
    ro: ['Fierbe sau prăjește ouăle (ochiuri sau jumări), după preferință.', 'Încălzește fasolea neagră fiartă într-o cratiță mică, cu un praf de sare.', 'Călește legumele în ulei de măsline câteva minute, până se înmoaie ușor.', 'Asamblează totul într-un bol: fasolea la bază, legumele deasupra, ouăle pe ultimul strat.', 'Servește cald.'],
    en: ['Fry or scramble the eggs, as you prefer.', 'Warm the cooked black beans in a small pot with a pinch of salt.', 'Sauté the vegetables in olive oil for a few minutes until slightly softened.', 'Assemble everything in a bowl: beans at the base, vegetables on top, eggs as the final layer.', 'Serve warm.'],
  },
  b8: {
    prepMinutes: 5,
    ro: ['Prăjește feliile de pâine integrală la toaster.', 'Întinde brânza de vaci pe fiecare felie.', 'Adaugă un fir de miere deasupra.', 'Servește imediat, cât pâinea e încă caldă.'],
    en: ['Toast the wholewheat bread slices.', 'Spread the cottage cheese over each slice.', 'Drizzle honey on top.', 'Serve right away while the toast is still warm.'],
  },
  b9: {
    prepMinutes: 15,
    ro: ['Pasează fulgii de ovăz într-un blender până devin o făină grosieră (sau folosește ovăz măcinat).', 'Zdrobește banana cu furculița și amestec-o cu ouăle bătute și ovăzul.', 'Încălzește puțin ulei de măsline într-o tigaie antiaderentă la foc mediu-mic.', 'Toarnă compoziția în tigaie, formând clătite mici, și prăjește 2 minute pe fiecare parte, până se rumenesc.', 'Servește cu un fir de miere deasupra.'],
    en: ['Blend the rolled oats into a coarse flour (or use ready-ground oats).', 'Mash the banana with a fork and mix it with the beaten eggs and the oats.', 'Heat a little olive oil in a non-stick pan over medium-low heat.', 'Pour the batter into the pan to form small pancakes, cooking 2 minutes per side until golden.', 'Serve with a drizzle of honey on top.'],
  },
  b10: {
    prepMinutes: 10,
    ro: ['Pune quinoa fiartă într-o cratiță mică împreună cu laptele.', 'Încălzește la foc mic, amestecând, 3-4 minute, până capătă consistență de terci.', 'Feliază banana și adaug-o deasupra.', 'Adaugă un fir de miere și servește cald.'],
    en: ['Put the cooked quinoa in a small pot together with the milk.', 'Heat over low heat, stirring, 3-4 minutes, until it reaches a porridge-like consistency.', 'Slice the banana and add it on top.', 'Drizzle with honey and serve warm.'],
  },
  b11: {
    prepMinutes: 5,
    ro: ['Toarnă iaurtul grecesc într-un bol.', 'Adaugă fulgii de ovăz peste iaurt și amestecă.', 'Lasă 5 minute la frigider ca ovăzul să se înmoaie ușor (opțional).', 'Presară migdalele deasupra și servește.'],
    en: ['Spoon the Greek yogurt into a bowl.', 'Add the rolled oats to the yogurt and stir to combine.', 'Let it sit in the fridge for 5 minutes to soften the oats slightly (optional).', 'Sprinkle the almonds on top and serve.'],
  },
  b12: {
    prepMinutes: 12,
    ro: ['Taie legumele mixte în bucăți mici și călește-le în ulei de măsline, la foc mediu, 5 minute.', 'Bate ouăle într-un bol cu sare și piper.', 'Toarnă ouăle peste legumele călite din tigaie.', 'Amestecă ușor până ouăle se leagă, fără să se usuce.', 'Servește imediat, cald.'],
    en: ['Chop the mixed vegetables into small pieces and sauté them in olive oil over medium heat for 5 minutes.', 'Beat the eggs in a bowl with salt and pepper.', 'Pour the eggs over the sautéed vegetables in the pan.', 'Stir gently until the eggs are just set, without drying them out.', 'Serve immediately, while hot.'],
  },
  b13: {
    prepMinutes: 5,
    ro: ['Prăjește feliile de pâine integrală la toaster.', 'Întinde untul de arahide pe fiecare felie.', 'Feliază banana și așaz-o deasupra.', 'Servește imediat.'],
    en: ['Toast the wholewheat bread slices.', 'Spread the peanut butter over each slice.', 'Slice the banana and arrange it on top.', 'Serve right away.'],
  },
  b14: {
    prepMinutes: 5,
    ro: ['Pune brânza de vaci într-un bol.', 'Adaugă fulgii de ovăz și amestecă bine.', 'Presară migdalele deasupra.', 'Adaugă un fir de miere și servește.'],
    en: ['Spoon the cottage cheese into a bowl.', 'Add the rolled oats and mix well.', 'Sprinkle the almonds on top.', 'Drizzle with honey and serve.'],
  },
  b15: {
    prepMinutes: 5,
    ro: ['Pune quinoa fiartă într-un bol.', 'Feliază banana deasupra.', 'Adaugă un fir de miere.', 'Amestecă ușor și servește cald sau rece.'],
    en: ['Spoon the cooked quinoa into a bowl.', 'Slice the banana on top.', 'Drizzle with honey.', 'Stir gently and serve warm or cold.'],
  },
  b16: {
    prepMinutes: 10,
    ro: ['Taie cartoful dulce copt în cuburi.', 'Încălzește fasolea neagră fiartă într-o cratiță mică, cu un praf de sare.', 'Asamblează cartoful dulce și fasolea într-un bol.', 'Stropește cu ulei de măsline deasupra și servește cald.'],
    en: ['Cube the baked sweet potato.', 'Warm the cooked black beans in a small pot with a pinch of salt.', 'Combine the sweet potato and beans in a bowl.', 'Drizzle olive oil on top and serve warm.'],
  },
  m1: {
    prepMinutes: 30,
    ro: ['Condimentează pieptul de pui cu sare, piper și, opțional, usturoi sau ierburi.', 'Prăjește-l la grătar sau într-o tigaie-grill, 5-6 minute pe fiecare parte, până e bine pătruns.', 'Fierbe orezul alb în apă cu puțină sare, conform instrucțiunilor de pe ambalaj (~15 minute).', 'Călește sau fierbe legumele la abur, cu un strop de ulei de măsline.', 'Asamblează totul într-o farfurie și servește cald.'],
    en: ['Season the chicken breast with salt, pepper and, optionally, garlic or herbs.', 'Grill it or cook it in a grill pan, 5-6 minutes per side, until fully cooked through.', 'Boil the white rice in salted water according to the package instructions (~15 minutes).', 'Sauté or steam the vegetables with a drizzle of olive oil.', 'Plate everything together and serve warm.'],
  },
  m2: {
    prepMinutes: 30,
    ro: ['Condimentează fileul de somon cu sare, piper și puțină lămâie, dacă ai.', 'Coace cartoful dulce tăiat cuburi la 200°C, 20-25 minute, cu un strop de ulei de măsline.', 'În ultimele 12-15 minute, adaugă somonul pe aceeași tavă sau prăjește-l separat în tigaie, 4 minute pe fiecare parte.', 'Călește sau fierbe legumele la abur.', 'Servește somonul alături de cartoful dulce și legume.'],
    en: ['Season the salmon fillet with salt, pepper and a squeeze of lemon, if you have it.', 'Roast the cubed sweet potato at 200°C (400°F) for 20-25 minutes with a drizzle of olive oil.', 'In the last 12-15 minutes, add the salmon to the same tray, or pan-fry it separately, 4 minutes per side.', 'Sauté or steam the vegetables.', 'Serve the salmon alongside the sweet potato and vegetables.'],
  },
  m3: {
    prepMinutes: 30,
    ro: ['Încălzește o tigaie cu puțin ulei de măsline și prăjește vita tocată la foc mediu-mare, 6-8 minute, sfărâmând-o cu o spatulă, până se rumenește uniform.', 'Condimentează cu sare, piper și, opțional, boia sau usturoi.', 'Fierbe orezul brun în apă cu sare, ~25-30 minute, conform instrucțiunilor.', 'Călește sau fierbe legumele la abur.', 'Servește vita alături de orezul brun și legume.'],
    en: ['Heat a pan with a little olive oil and cook the ground beef over medium-high heat, 6-8 minutes, breaking it up with a spatula until evenly browned.', 'Season with salt, pepper and, optionally, paprika or garlic.', 'Boil the brown rice in salted water, ~25-30 minutes, per the package instructions.', 'Sauté or steam the vegetables.', 'Serve the beef alongside the brown rice and vegetables.'],
  },
  m4: {
    prepMinutes: 30,
    ro: ['Fierbe orezul brun în apă cu sare, ~25-30 minute.', 'Încălzește năutul fiert într-o cratiță cu un strop de ulei de măsline, sare și piper, 5 minute.', 'Călește sau fierbe legumele la abur.', 'Asamblează năutul, orezul și legumele într-un bol.', 'Stropește cu ulei de măsline deasupra și servește.'],
    en: ['Boil the brown rice in salted water, ~25-30 minutes.', 'Warm the cooked chickpeas in a pot with a drizzle of olive oil, salt and pepper, 5 minutes.', 'Sauté or steam the vegetables.', 'Assemble the chickpeas, rice and vegetables in a bowl.', 'Drizzle olive oil on top and serve.'],
  },
  m5: {
    prepMinutes: 20,
    ro: ['Curăță creveții, dacă e nevoie, și condimentează-i cu sare, piper și usturoi.', 'Prăjește-i într-o tigaie cu puțin ulei de măsline, 2-3 minute pe fiecare parte, până devin roz și opaci.', 'Încălzește quinoa fiartă într-o cratiță mică.', 'Călește sau fierbe legumele la abur.', 'Asamblează creveții, quinoa și legumele într-un bol și servește.'],
    en: ['Clean the shrimp if needed and season with salt, pepper and garlic.', 'Pan-fry them in a little olive oil, 2-3 minutes per side, until pink and opaque.', 'Warm the cooked quinoa in a small pot.', 'Sauté or steam the vegetables.', 'Assemble the shrimp, quinoa and vegetables in a bowl and serve.'],
  },
  m6: {
    prepMinutes: 25,
    ro: ['Taie tofu-ul ferm în cuburi și tamponează-l cu un prosop de bucătărie pentru a elimina excesul de apă.', 'Prăjește-l în tigaie cu ulei de măsline, la foc mediu, 6-8 minute, întorcându-l, până se rumenește pe toate părțile.', 'Fierbe orezul alb în apă cu sare, ~15 minute.', 'Încălzește fasolea neagră fiartă cu un praf de sare.', 'Asamblează tofu, orezul și fasolea într-un bol și servește.'],
    en: ['Cube the firm tofu and pat it dry with a paper towel to remove excess water.', 'Pan-fry it in olive oil over medium heat, 6-8 minutes, turning, until browned on all sides.', 'Boil the white rice in salted water, ~15 minutes.', 'Warm the cooked black beans with a pinch of salt.', 'Assemble the tofu, rice and beans in a bowl and serve.'],
  },
  m7: {
    prepMinutes: 25,
    ro: ['Condimentează pieptul de pui cu sare, piper și ierburi, apoi prăjește-l în tigaie sau la grătar, 5-6 minute pe fiecare parte.', 'Încălzește quinoa fiartă într-o cratiță mică.', 'Călește sau fierbe legumele la abur, cu un strop de ulei de măsline.', 'Taie puiul feliuțe și asamblează totul într-o farfurie.', 'Servește cald.'],
    en: ['Season the chicken breast with salt, pepper and herbs, then pan-fry or grill it, 5-6 minutes per side.', 'Warm the cooked quinoa in a small pot.', 'Sauté or steam the vegetables with a drizzle of olive oil.', 'Slice the chicken and plate everything together.', 'Serve warm.'],
  },
  m8: {
    prepMinutes: 20,
    ro: ['Condimentează pieptul de pui cu sare și piper și prăjește-l în tigaie, 5-6 minute pe fiecare parte, apoi taie-l feliuțe.', 'Încălzește sau lasă la temperatura camerei năutul fiert.', 'Spală și taie legumele/salata.', 'Combină toate ingredientele într-un bol mare.', 'Stropește cu ulei de măsline și amestecă ușor înainte de servire.'],
    en: ['Season the chicken breast with salt and pepper and pan-fry it, 5-6 minutes per side, then slice it.', 'Warm the cooked chickpeas, or leave them at room temperature.', 'Wash and chop the salad vegetables.', 'Combine all the ingredients in a large bowl.', 'Drizzle with olive oil and toss gently before serving.'],
  },
  m9: {
    prepMinutes: 20,
    ro: ['Condimentează fileul de somon cu sare, piper și lămâie.', 'Prăjește-l în tigaie cu puțin ulei, 4 minute pe fiecare parte, până se rumenește.', 'Încălzește quinoa fiartă.', 'Călește sau fierbe legumele la abur.', 'Asamblează somonul, quinoa și legumele într-un bol și servește.'],
    en: ['Season the salmon fillet with salt, pepper and lemon.', 'Pan-fry it in a little oil, 4 minutes per side, until browned.', 'Warm the cooked quinoa.', 'Sauté or steam the vegetables.', 'Assemble the salmon, quinoa and vegetables in a bowl and serve.'],
  },
  m10: {
    prepMinutes: 30,
    ro: ['Coace cartoful dulce tăiat cuburi la 200°C, 20-25 minute, cu un strop de ulei de măsline.', 'Între timp, prăjește vita tocată într-o tigaie la foc mediu-mare, 6-8 minute, sfărâmând-o cu spatula.', 'Condimentează cu sare și piper.', 'Călește sau fierbe legumele la abur.', 'Combină vita, cartoful dulce și legumele în aceeași tigaie sau farfurie și servește cald.'],
    en: ['Roast the cubed sweet potato at 200°C (400°F) for 20-25 minutes with a drizzle of olive oil.', 'Meanwhile, cook the ground beef in a pan over medium-high heat, 6-8 minutes, breaking it up with a spatula.', 'Season with salt and pepper.', 'Sauté or steam the vegetables.', 'Combine the beef, sweet potato and vegetables in the same pan or a plate and serve warm.'],
  },
  m11: {
    prepMinutes: 30,
    ro: ['Condimentează pieptul de pui și prăjește-l în tigaie sau la grătar, 5-6 minute pe fiecare parte.', 'Coace sau fierbe cartoful dulce tăiat cuburi, până se înmoaie (20-25 minute la cuptor sau 15 minute fiert).', 'Călește sau fierbe legumele la abur.', 'Asamblează puiul, cartoful dulce și legumele într-o farfurie.', 'Presară migdalele tocate deasupra și servește.'],
    en: ['Season the chicken breast and pan-fry or grill it, 5-6 minutes per side.', 'Bake or boil the cubed sweet potato until soft (20-25 minutes in the oven or 15 minutes boiled).', 'Sauté or steam the vegetables.', 'Plate the chicken, sweet potato and vegetables together.', 'Sprinkle the chopped almonds on top and serve.'],
  },
  m12: {
    prepMinutes: 30,
    ro: ['Fierbe orezul brun în apă cu sare, ~25-30 minute.', 'Încălzește fasolea neagră fiartă cu un strop de ulei de măsline, sare și piper.', 'Călește sau fierbe legumele la abur.', 'Asamblează fasolea, orezul și legumele într-un bol.', 'Servește cald, cu ulei de măsline deasupra.'],
    en: ['Boil the brown rice in salted water, ~25-30 minutes.', 'Warm the cooked black beans with a drizzle of olive oil, salt and pepper.', 'Sauté or steam the vegetables.', 'Assemble the beans, rice and vegetables in a bowl.', 'Serve warm, with olive oil drizzled on top.'],
  },
  m13: {
    prepMinutes: 20,
    ro: ['Condimentează pieptul de pui cu sare și piper și prăjește-l în tigaie, 5-6 minute pe fiecare parte, apoi taie-l feliuțe.', 'Spală și taie salata/legumele.', 'Încălzește quinoa fiartă (înlocuiește crutoanele din rețeta clasică).', 'Asamblează salata, quinoa și puiul feliat într-un bol.', 'Stropește cu ulei de măsline și amestecă ușor înainte de servire.'],
    en: ['Season the chicken breast with salt and pepper and pan-fry it, 5-6 minutes per side, then slice it.', 'Wash and chop the salad vegetables.', 'Warm the cooked quinoa (it stands in for the croutons in the classic recipe).', 'Assemble the salad, quinoa and sliced chicken in a bowl.', 'Drizzle with olive oil and toss gently before serving.'],
  },
  m14: {
    prepMinutes: 20,
    ro: ['Curăță creveții și condimentează-i cu sare, piper și usturoi.', 'Prăjește-i în tigaie cu puțin ulei, 2-3 minute pe fiecare parte.', 'Fierbe orezul alb în apă cu sare, ~15 minute.', 'Încălzește fasolea neagră fiartă.', 'Asamblează creveții, orezul și fasolea într-un bol și servește.'],
    en: ['Clean the shrimp and season with salt, pepper and garlic.', 'Pan-fry them in a little oil, 2-3 minutes per side.', 'Boil the white rice in salted water, ~15 minutes.', 'Warm the cooked black beans.', 'Assemble the shrimp, rice and beans in a bowl and serve.'],
  },
  m15: {
    prepMinutes: 25,
    ro: ['Taie tofu-ul ferm în cuburi, tamponează-l și prăjește-l în tigaie cu puțin ulei, 6-8 minute, până se rumenește.', 'Încălzește quinoa fiartă.', 'Călește sau fierbe legumele la abur.', 'Asamblează tofu, quinoa și legumele într-un bol.', 'Stropește cu tahini deasupra (dilută-l cu puțină apă dacă vrei un sos mai fluid) și servește.'],
    en: ['Cube the firm tofu, pat it dry and pan-fry it in a little oil, 6-8 minutes, until browned.', 'Warm the cooked quinoa.', 'Sauté or steam the vegetables.', 'Assemble the tofu, quinoa and vegetables in a bowl.', 'Drizzle the tahini on top (thin it with a little water for a smoother sauce) and serve.'],
  },
  m16: {
    prepMinutes: 25,
    ro: ['Condimentează fileul de somon cu sare, piper și lămâie.', 'Prăjește-l în tigaie cu puțin ulei, 4 minute pe fiecare parte.', 'Fierbe orezul alb în apă cu sare, ~15 minute.', 'Călește sau fierbe legumele la abur.', 'Servește somonul alături de orez și legume.'],
    en: ['Season the salmon fillet with salt, pepper and lemon.', 'Pan-fry it in a little oil, 4 minutes per side.', 'Boil the white rice in salted water, ~15 minutes.', 'Sauté or steam the vegetables.', 'Serve the salmon alongside the rice and vegetables.'],
  },
  m17: {
    prepMinutes: 20,
    ro: ['Prăjește vita tocată într-o tigaie la foc mediu-mare, 6-8 minute, sfărâmând-o cu spatula.', 'Condimentează cu sare și piper.', 'Încălzește năutul fiert cu un strop de ulei de măsline.', 'Călește sau fierbe legumele la abur.', 'Asamblează vita, năutul și legumele într-un bol și servește.'],
    en: ['Cook the ground beef in a pan over medium-high heat, 6-8 minutes, breaking it up with a spatula.', 'Season with salt and pepper.', 'Warm the cooked chickpeas with a drizzle of olive oil.', 'Sauté or steam the vegetables.', 'Assemble the beef, chickpeas and vegetables in a bowl and serve.'],
  },
  m18: {
    prepMinutes: 25,
    ro: ['Condimentează pieptul de pui și prăjește-l în tigaie, 5-6 minute pe fiecare parte, apoi taie-l feliuțe.', 'Fierbe orezul alb în apă cu sare, ~15 minute.', 'Călește sau fierbe legumele la abur.', 'Asamblează puiul, orezul și legumele într-un bol.', 'Adaugă brânza de vaci deasupra și servește.'],
    en: ['Season the chicken breast and pan-fry it, 5-6 minutes per side, then slice it.', 'Boil the white rice in salted water, ~15 minutes.', 'Sauté or steam the vegetables.', 'Assemble the chicken, rice and vegetables in a bowl.', 'Add the cottage cheese on top and serve.'],
  },
  m19: {
    prepMinutes: 25,
    ro: ['Coace cartoful dulce tăiat cuburi la 200°C, 20-25 minute, cu un strop de ulei de măsline.', 'Încălzește fasolea neagră fiartă cu sare și piper.', 'Călește sau fierbe legumele la abur.', 'Asamblează cartoful dulce, fasolea și legumele într-un bol.', 'Stropește cu tahini deasupra și servește.'],
    en: ['Roast the cubed sweet potato at 200°C (400°F) for 20-25 minutes with a drizzle of olive oil.', 'Warm the cooked black beans with salt and pepper.', 'Sauté or steam the vegetables.', 'Assemble the sweet potato, beans and vegetables in a bowl.', 'Drizzle the tahini on top and serve.'],
  },
  m20: {
    prepMinutes: 30,
    ro: ['Condimentează pieptul de pui și prăjește-l în tigaie sau la grătar, 5-6 minute pe fiecare parte.', 'Fierbe cartofii în apă cu sare până se înmoaie (~15-18 minute), apoi pasează-i cu un strop de ulei de măsline până devin cremoși.', 'Călește sau fierbe legumele la abur.', 'Taie puiul feliuțe.', 'Servește puiul alături de piureul de cartofi și legume.'],
    en: ['Season the chicken breast and pan-fry or grill it, 5-6 minutes per side.', 'Boil the potatoes in salted water until soft (~15-18 minutes), then mash them with a drizzle of olive oil until creamy.', 'Sauté or steam the vegetables.', 'Slice the chicken.', 'Serve the chicken alongside the mashed potato and vegetables.'],
  },
  m21: {
    prepMinutes: 20,
    ro: ['Prăjește vita tocată într-o tigaie la foc mediu-mare, 6-8 minute, sfărâmând-o cu spatula.', 'Condimentează cu sare și piper.', 'Încălzește quinoa fiartă.', 'Călește sau fierbe legumele la abur.', 'Asamblează vita, quinoa și legumele într-o farfurie și servește.'],
    en: ['Cook the ground beef in a pan over medium-high heat, 6-8 minutes, breaking it up with a spatula.', 'Season with salt and pepper.', 'Warm the cooked quinoa.', 'Sauté or steam the vegetables.', 'Plate the beef, quinoa and vegetables together and serve.'],
  },
  m22: {
    prepMinutes: 20,
    ro: ['Condimentează fileul de somon cu sare, piper și lămâie.', 'Prăjește-l în tigaie cu puțin ulei, 4 minute pe fiecare parte.', 'Încălzește năutul fiert cu un strop de ulei de măsline.', 'Călește sau fierbe legumele la abur.', 'Servește somonul alături de năut și legume.'],
    en: ['Season the salmon fillet with salt, pepper and lemon.', 'Pan-fry it in a little oil, 4 minutes per side.', 'Warm the cooked chickpeas with a drizzle of olive oil.', 'Sauté or steam the vegetables.', 'Serve the salmon alongside the chickpeas and vegetables.'],
  },
  m23: {
    prepMinutes: 30,
    ro: ['Condimentează pieptul de pui și prăjește-l în tigaie sau la grătar, 6-7 minute pe fiecare parte (porție mai mare).', 'Fierbe orezul alb în apă cu sare, ~15-18 minute.', 'Călește sau fierbe legumele la abur, cu un strop de ulei de măsline.', 'Taie puiul feliuțe și asamblează totul într-o farfurie mare.', 'Presară migdalele deasupra și servește.'],
    en: ['Season the chicken breast and pan-fry or grill it, 6-7 minutes per side (this is a larger portion).', 'Boil the white rice in salted water, ~15-18 minutes.', 'Sauté or steam the vegetables with a drizzle of olive oil.', 'Slice the chicken and plate everything on a large plate.', 'Sprinkle the almonds on top and serve.'],
  },
  m24: {
    prepMinutes: 30,
    ro: ['Taie tofu-ul ferm în cuburi, tamponează-l și prăjește-l în tigaie cu ulei de măsline, 6-8 minute, până se rumenește pe toate părțile.', 'Fierbe orezul brun în apă cu sare, ~25-30 minute.', 'Călește sau fierbe legumele la abur.', 'Combină tofu, orezul și legumele în aceeași tigaie, la foc mic, 2 minute.', 'Servește cald.'],
    en: ['Cube the firm tofu, pat it dry and pan-fry it in olive oil, 6-8 minutes, until browned on all sides.', 'Boil the brown rice in salted water, ~25-30 minutes.', 'Sauté or steam the vegetables.', 'Combine the tofu, rice and vegetables in the same pan over low heat for 2 minutes.', 'Serve warm.'],
  },
  s1: {
    prepMinutes: 3,
    ro: ['Toarnă iaurtul grecesc într-un bol.', 'Presară migdalele deasupra.', 'Servește imediat.'],
    en: ['Spoon the Greek yogurt into a bowl.', 'Sprinkle the almonds on top.', 'Serve right away.'],
  },
  s2: {
    prepMinutes: 2,
    ro: ['Curăță banana.', 'Întinde untul de arahide deasupra sau folosește-l ca dip.', 'Servește imediat.'],
    en: ['Peel the banana.', 'Spread the peanut butter on top or use it as a dip.', 'Serve right away.'],
  },
  s3: {
    prepMinutes: 2,
    ro: ['Pune brânza de vaci într-un bol.', 'Adaugă un fir de miere deasupra.', 'Amestecă ușor și servește.'],
    en: ['Spoon the cottage cheese into a bowl.', 'Drizzle honey on top.', 'Stir gently and serve.'],
  },
  s4: {
    prepMinutes: 1,
    ro: ['Măsoară migdalele crude.', 'Servește direct, ca atare.'],
    en: ['Measure out the raw almonds.', 'Serve as is.'],
  },
  s5: {
    prepMinutes: 12,
    ro: ['Pune ouăle într-o cratiță cu apă rece, acoperă-le complet.', 'Adu apa la fierbere, apoi lasă-le 9-10 minute la foc mediu.', 'Scoate ouăle și răcește-le sub jet de apă rece.', 'Curăță-le de coajă, presară un praf de sare și servește.'],
    en: ['Place the eggs in a pot of cold water, fully covering them.', 'Bring the water to a boil, then let them cook 9-10 minutes over medium heat.', 'Remove the eggs and cool them under cold running water.', 'Peel them, sprinkle with a pinch of salt and serve.'],
  },
  s6: {
    prepMinutes: 10,
    ro: ['Pasează năutul fiert cu tahini, ulei de măsline și un praf de sare, în blender, până devine cremos (adaugă puțină apă dacă e prea gros).', 'Taie legumele proaspete în bastonașe.', 'Servește hummus-ul într-un bol, cu bastonașele de legume alături.'],
    en: ['Blend the cooked chickpeas with the tahini, olive oil and a pinch of salt until creamy (add a splash of water if too thick).', 'Cut the fresh vegetables into sticks.', 'Serve the hummus in a bowl with the vegetable sticks on the side.'],
  },
  s7: {
    prepMinutes: 3,
    ro: ['Toarnă iaurtul grecesc într-un bol.', 'Feliază jumătate de banană deasupra.', 'Servește imediat.'],
    en: ['Spoon the Greek yogurt into a bowl.', 'Slice half a banana on top.', 'Serve right away.'],
  },
  s8: {
    prepMinutes: 25,
    ro: ['Preîncălzește cuptorul la 200°C.', 'Usucă bine năutul fiert cu un prosop de bucătărie și amestecă-l cu ulei de măsline și sare.', 'Întinde-l pe o tavă cu hârtie de copt, într-un singur strat.', 'Coace 20-25 minute, amestecând la jumătatea timpului, până devine crocant.', 'Lasă să se răcească puțin înainte de servire.'],
    en: ['Preheat the oven to 200°C (400°F).', 'Pat the cooked chickpeas dry with a kitchen towel and toss them with olive oil and salt.', 'Spread them on a baking tray lined with parchment paper, in a single layer.', 'Roast for 20-25 minutes, shaking the tray halfway through, until crispy.', 'Let cool slightly before serving.'],
  },
  s9: {
    prepMinutes: 3,
    ro: ['Prăjește felia de pâine integrală la toaster.', 'Adaugă un fir de miere deasupra.', 'Servește imediat.'],
    en: ['Toast the slice of wholewheat bread.', 'Drizzle honey on top.', 'Serve right away.'],
  },
  s10: {
    prepMinutes: 5,
    ro: ['Pune fulgii de ovăz într-un bol mic.', 'Adaugă laptele peste ovăz.', 'Lasă 3-4 minute să se înmoaie (sau încălzește ușor la microunde) și servește.'],
    en: ['Put the rolled oats in a small bowl.', 'Pour the milk over the oats.', 'Let sit for 3-4 minutes to soften (or warm briefly in the microwave) and serve.'],
  },
  s11: {
    prepMinutes: 25,
    ro: ['Preîncălzește cuptorul la 200°C.', 'Taie cartoful dulce în felii sau bastonașe și amestecă-l cu ulei de măsline și un praf de sare.', 'Așază-l pe o tavă cu hârtie de copt.', 'Coace 20-25 minute, întorcând la jumătatea timpului, până se rumenește și se înmoaie.', 'Servește cald.'],
    en: ['Preheat the oven to 200°C (400°F).', 'Cut the sweet potato into slices or wedges and toss with olive oil and a pinch of salt.', 'Arrange on a baking tray lined with parchment paper.', 'Roast for 20-25 minutes, flipping halfway through, until browned and soft.', 'Serve warm.'],
  },
};

/* ---------- Algoritm local de plan (fallback fără AI) ---------- */
const DAY_STRUCTURE_TIERS = [
  { maxKcal: 1750, mains: 2, snacks: 0 },
  { maxKcal: 2300, mains: 2, snacks: 1 },
  { maxKcal: 2750, mains: 3, snacks: 1 },
  { maxKcal: 3200, mains: 3, snacks: 2 },
  { maxKcal: 3900, mains: 4, snacks: 1 },
  { maxKcal: Infinity, mains: 4, snacks: 2 },
];
const IMPROVE_ITERATIONS = 40;
const PLAN_SCORE_WEIGHTS = { kcal: 1.0, protein: 0.5 };

function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i')
    .replace(/ș/g, 's').replace(/ş/g, 's')
    .replace(/ț/g, 't').replace(/ţ/g, 't');
}

function filterByExclusions(meals, excludedTags) {
  if (!excludedTags.length) return meals;
  return meals.filter((meal) => !meal.tags.some((tag) => excludedTags.includes(tag)));
}

function matchesDislike(meal, dislikeTerms, lang) {
  const haystack = normalizeForMatch(`${meal[lang].name} ${meal[lang].desc}`);
  return dislikeTerms.some((term) => term && haystack.includes(term));
}

function applyDislikeFilter(meals, dislikeText, lang) {
  const terms = dislikeText.split(',').map((t) => normalizeForMatch(t.trim())).filter(Boolean);
  if (!terms.length) return meals;
  return meals.filter((meal) => !matchesDislike(meal, terms, lang));
}

function planDayStructure(targetKcal) {
  const tier = DAY_STRUCTURE_TIERS.find((t) => targetKcal <= t.maxKcal);
  return { breakfast: 1, mains: tier.mains, snacks: tier.snacks };
}

function sumMacros(meals) {
  return meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function scoreDay(meals, targets) {
  const totals = sumMacros(meals);
  const kcalDiff = Math.abs(totals.kcal - targets.kcal) / targets.kcal;
  const proteinDiff = Math.abs(totals.protein - targets.protein) / targets.protein;
  return kcalDiff * PLAN_SCORE_WEIGHTS.kcal + proteinDiff * PLAN_SCORE_WEIGHTS.protein;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMeals(pool, count, usedIds) {
  if (count === 0) return [];
  const fresh = pool.filter((m) => !usedIds.has(m.id));
  const source = fresh.length >= count ? fresh : pool;
  const picked = [];
  const localUsed = new Set();
  while (picked.length < count) {
    const candidates = source.filter((m) => !localUsed.has(m.id));
    if (!candidates.length) break;
    const meal = pickRandom(candidates);
    picked.push(meal);
    localUsed.add(meal.id);
  }
  return picked;
}

function buildInitialDay(pools, structure, usedIds) {
  return {
    breakfast: pickMeals(pools.breakfast, structure.breakfast, usedIds),
    mains: pickMeals(pools.main, structure.mains, usedIds),
    snacks: pickMeals(pools.snack, structure.snacks, usedIds),
  };
}

function flattenDay(day) {
  return [...day.breakfast, ...day.mains, ...day.snacks];
}

function improveDay(day, pools, structure, targets) {
  let best = day;
  let bestScore = scoreDay(flattenDay(best), targets);
  const slots = [];
  if (structure.breakfast) slots.push({ key: 'breakfast', pool: 'breakfast' });
  if (structure.mains) slots.push({ key: 'mains', pool: 'main' });
  if (structure.snacks) slots.push({ key: 'snacks', pool: 'snack' });
  if (!slots.length) return best;

  for (let i = 0; i < IMPROVE_ITERATIONS; i++) {
    const { key, pool: poolKey } = pickRandom(slots);
    const pool = pools[poolKey];
    if (!pool.length || !best[key].length) continue;
    const idx = Math.floor(Math.random() * best[key].length);
    const usedElsewhere = new Set(flattenDay(best).map((m) => m.id));
    usedElsewhere.delete(best[key][idx].id);
    const candidates = pool.filter((m) => !usedElsewhere.has(m.id));
    if (!candidates.length) continue;
    const candidate = pickRandom(candidates);
    const trial = { ...best, [key]: best[key].map((m, i2) => (i2 === idx ? candidate : m)) };
    const trialScore = scoreDay(flattenDay(trial), targets);
    if (trialScore < bestScore) {
      best = trial;
      bestScore = trialScore;
    }
  }
  return best;
}

function canGeneratePlan(pools) {
  return pools.breakfast.length > 0 && pools.main.length > 0;
}

function mealToPlanMeal(m, slot) {
  return {
    id: m.id,
    slot,
    name: { ro: m.ro.name, en: m.en.name },
    description: { ro: m.ro.desc, en: m.en.desc },
    kcal: m.kcal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
  };
}

function dayToPlanFormat(day, index) {
  const meals = [
    ...day.breakfast.map((m) => mealToPlanMeal(m, 'breakfast')),
    ...day.mains.map((m, i) => mealToPlanMeal(m, i % 2 === 0 ? 'lunch' : 'dinner')),
    ...day.snacks.map((m) => mealToPlanMeal(m, 'snack')),
  ];
  const totals = sumMacros(meals);
  return {
    day: index + 1,
    meals,
    totalKcal: totals.kcal,
    totalProtein: totals.protein,
    totalCarbs: totals.carbs,
    totalFat: totals.fat,
  };
}

function generateWeekPlanLocal(targets, excludedTags, dislikeText, lang) {
  const bySlot = (slot) => applyDislikeFilter(filterByExclusions(MEAL_DATABASE.filter((m) => m.slot === slot), excludedTags), dislikeText, lang);
  const pools = { breakfast: bySlot('breakfast'), main: bySlot('main'), snack: bySlot('snack') };

  if (!canGeneratePlan(pools)) return null;

  const structure = planDayStructure(targets.kcal);
  const usedIds = new Set();
  const days = [];

  for (let i = 0; i < 7; i++) {
    let day = buildInitialDay(pools, structure, usedIds);
    day = improveDay(day, pools, structure, targets);
    flattenDay(day).forEach((m) => usedIds.add(m.id));
    days.push(dayToPlanFormat(day, i));
  }

  return { days };
}

/* ---------- Stare ---------- */
let currentLang = localStorage.getItem('ffFitnessLang') || 'ro';
// { bmr, tdee, target, protein, carbs, fat, goal, belowFloor } — persistat durabil (nu doar în
// memorie), pentru că plan.html are nevoie de targeturi la fiecare vizită, nu doar imediat
// după revenirea de la Stripe.
let lastResults = (() => {
  try {
    const raw = localStorage.getItem(LAST_RESULTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
})();
let lastPlanData = null;
let firstSubmitAttempted = false;
let mealIndex = new Map(); // mealKey -> meal (name/description bilingve + macro-uri)
let recipeCache = new Map(); // mealKey -> rețetă (ingrediente/pași bilingve)
let currentRecipeMealKey = null;
let currentRecipeData = null; // { meal, recipe } — ultima pereche afișată cu succes în modal
let pdfLibraryPromise = null;
let planRenderToken = 0; // bumped de orice operație care deține UI-ul planului; rezolvările întârziate verifică și abandonează dacă sunt stale
let inFlightTranslation = null; // { planData, lang, promise } — deduplică cereri de traducere concurente identice
let currentMuscleGroup = null; // grupa musculară curent afișată pe #exercise-list, sau null
let exerciseListReturnTarget = null; // { dayIndex } dacă am ajuns pe #exercise-list din planul AI, altfel null (din harta corpului)
let highlightedExerciseId = null; // id-ul exercițiului evidențiat curent pe #exercise-list, sau null
let lastWorkoutPlanData = null; // { days, lang, translatedLangs }
let workoutPlanRenderToken = 0;
let inFlightWorkoutTranslation = null;
let currentPaidSessionId = (() => {
  try { return localStorage.getItem(PAID_SESSION_STORAGE_KEY); } catch (err) { return null; }
})();
let stripeJsPromise = null;
let stripeClientInstance = null;
let embeddedCheckoutInstance = null;

/* ---------- Utilitare ---------- */
function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function formatNumber(n, decimals = 0) {
  return n.toLocaleString(LOCALE_BY_LANG[currentLang], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/* ---------- Funcții pure de calcul ---------- */
function calculateBMR({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

function calculateTDEE(bmr, activityKey) {
  return bmr * ACTIVITY_MULTIPLIERS[activityKey];
}

function calculateCalorieTarget(tdee, goalKey) {
  return tdee * GOAL_CALORIE_MULTIPLIERS[goalKey];
}

function calculateProtein(weightKg, goalKey) {
  return weightKg * PROTEIN_G_PER_KG[goalKey];
}

function calculateFat(targetKcal, proteinG) {
  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const fatKcal = Math.min(targetKcal * FAT_PERCENT_OF_TARGET, Math.max(0, targetKcal - proteinKcal));
  return fatKcal / KCAL_PER_G_FAT;
}

function calculateCarbs(targetKcal, proteinG, fatG) {
  const remainderKcal = targetKcal - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT;
  return Math.max(0, remainderKcal / KCAL_PER_G_CARB);
}

/* ---------- Traducere UI ---------- */
function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('ffFitnessLang', lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = getByPath(CONTENT[lang], el.dataset.i18n);
    if (value != null) el.textContent = value;
  });

  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const [attr, path] = el.dataset.i18nAttr.split(':');
    const value = getByPath(CONTENT[lang], path);
    if (value != null) el.setAttribute(attr, value);
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  });

  updateCopyright();
  renderFAQ();
  if (lastResults) renderResults(lastResults, false);
  if (lastPlanData) {
    const needsTranslation = lastPlanData.lang
      && lastPlanData.lang !== lang
      && !(lastPlanData.translatedLangs && lastPlanData.translatedLangs.has(lang));

    if (needsTranslation) {
      translateAndRenderPlan(lang);
    } else {
      planRenderToken += 1;
      document.getElementById('plan-error').textContent = '';
      document.getElementById('plan-loading').hidden = true;
      document.getElementById('plan-output').hidden = false;
      renderPlanAccordion(lastPlanData);
      if (currentRecipeMealKey) refreshOpenRecipeDialog();
    }
  } else if (currentRecipeMealKey) {
    refreshOpenRecipeDialog();
  }

  if (currentMuscleGroup) renderExerciseList(currentMuscleGroup, highlightedExerciseId);
  updateExerciseListBackLabel();
  resetBodymapCaption();
  if (lastResults && document.getElementById('plan-target-summary')) renderPlanTargetSummary();

  if (lastWorkoutPlanData) {
    const workoutNeedsTranslation = lastWorkoutPlanData.lang
      && lastWorkoutPlanData.lang !== lang
      && !(lastWorkoutPlanData.translatedLangs && lastWorkoutPlanData.translatedLangs.has(lang));

    if (workoutNeedsTranslation) {
      translateAndRenderWorkoutPlan(lang);
    } else {
      workoutPlanRenderToken += 1;
      document.getElementById('workout-plan-error').textContent = '';
      document.getElementById('workout-plan-loading').hidden = true;
      document.getElementById('workout-plan-output').hidden = false;
      renderWorkoutPlanAccordion(lastWorkoutPlanData);
    }
  }

  const calcForm = document.getElementById('calc-form');
  if (calcForm) refreshErrorMessages(calcForm);
}

function updateCopyright() {
  const year = new Date().getFullYear();
  const el = document.getElementById('copyright-text');
  el.textContent = CONTENT[currentLang].footer.rights.replace('{year}', year);
}

/* ---------- Validare ---------- */
function validateForm(form) {
  const t = CONTENT[currentLang].validation;
  const errors = {};

  const sex = form.querySelector('input[name="sex"]:checked');
  if (!sex) errors.sex = t.selectSex;

  const age = form.age.value.trim();
  if (age === '') errors.age = t.required;
  else if (Number(age) < VALIDATION_RULES.age.min || Number(age) > VALIDATION_RULES.age.max) errors.age = t.ageRange;

  const weight = form.weight.value.trim();
  if (weight === '') errors.weight = t.required;
  else if (Number(weight) < VALIDATION_RULES.weight.min || Number(weight) > VALIDATION_RULES.weight.max) errors.weight = t.weightRange;

  const height = form.height.value.trim();
  if (height === '') errors.height = t.required;
  else if (Number(height) < VALIDATION_RULES.height.min || Number(height) > VALIDATION_RULES.height.max) errors.height = t.heightRange;

  const activity = form.activity.value;
  if (!activity) errors.activity = t.selectActivity;

  const goal = form.querySelector('input[name="goal"]:checked');
  if (!goal) errors.goal = t.selectGoal;

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    values: valid ? {
      sex: sex.value,
      age: Number(age),
      weight: Number(weight),
      height: Number(height),
      activity,
      goal: goal.value,
    } : null,
  };
}

function renderErrors(form, errors) {
  ['sex', 'age', 'weight', 'height', 'activity', 'goal'].forEach((field) => {
    const errorEl = document.getElementById(`${field}-error`);
    const message = errors[field] || '';
    if (errorEl) errorEl.textContent = message;

    const input = form.elements[field];
    if (!input) return;
    const els = input.length ? Array.from(input) : [input];
    els.forEach((el) => el.classList.toggle('invalid', Boolean(message)));
  });

  const firstErrorField = Object.keys(errors)[0];
  if (firstErrorField) {
    const input = form.elements[firstErrorField];
    const target = input && input.length ? input[0] : input;
    if (target) target.focus();
  }
}

function refreshErrorMessages(form) {
  const { errors } = validateForm(form);
  ['sex', 'age', 'weight', 'height', 'activity', 'goal'].forEach((field) => {
    const errorEl = document.getElementById(`${field}-error`);
    if (errorEl && errorEl.textContent) errorEl.textContent = errors[field] || '';
  });
}

function clearFieldError(form, field) {
  const errorEl = document.getElementById(`${field}-error`);
  if (errorEl) errorEl.textContent = '';
  const input = form.elements[field];
  if (!input) return;
  const els = input.length ? Array.from(input) : [input];
  els.forEach((el) => el.classList.remove('invalid'));
}

/* ---------- Randare rezultate ---------- */
function getAdviceText(goalKey) {
  return CONTENT[currentLang].advice[goalKey];
}

function renderResults(data, animate = true) {
  lastResults = data;
  try { localStorage.setItem(LAST_RESULTS_STORAGE_KEY, JSON.stringify(data)); } catch (err) { /* ignore */ }

  // #results nu există pe plan.html — applyLanguage() re-cheamă renderResults() ori de câte
  // ori lastResults e adevărat, pe ambele pagini, deci funcția trebuie să rămână sigură de
  // apelat acolo: salvăm targetul mai sus, dar nu mai atingem DOM inexistent.
  const panel = document.getElementById('results');
  if (!panel) return;

  const t = CONTENT[currentLang].results;

  document.getElementById('bmr-value').textContent = formatNumber(data.bmr);
  document.getElementById('tdee-value').textContent = formatNumber(data.tdee);
  document.getElementById('target-value').textContent = formatNumber(data.target);
  document.getElementById('protein-value').textContent = formatNumber(data.protein);
  document.getElementById('carbs-value').textContent = formatNumber(data.carbs);
  document.getElementById('fat-value').textContent = formatNumber(data.fat);

  const warningEl = document.getElementById('low-calorie-warning');
  warningEl.hidden = !data.belowFloor;
  warningEl.textContent = t.lowCalorieWarning;

  document.getElementById('advice-text').textContent = getAdviceText(data.goal);

  panel.hidden = false;

  if (animate) {
    panel.classList.remove('reveal');
    // eslint-disable-next-line no-unused-expressions
    panel.offsetHeight; // forțează reflow ca animația să pornească de la 0
    panel.classList.add('reveal');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- Navigare secțiuni ---------- */
function showView(viewName) {
  document.querySelectorAll('.view').forEach((section) => {
    section.hidden = section.id !== viewName;
  });
  document.querySelectorAll('[data-view]').forEach((btn) => {
    if (btn.classList.contains('nav-link')) {
      if (btn.dataset.view === viewName) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }
  });
  const heading = document.querySelector(`#${viewName} h1, #${viewName} h2`);
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }
  closeMobileNav();
}

function initNavigation() {
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
}

/* ---------- Meniu mobil ---------- */
function closeMobileNav() {
  const nav = document.getElementById('main-nav');
  const hamburger = document.getElementById('hamburger');
  nav.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
}

function initHamburger() {
  const nav = document.getElementById('main-nav');
  const hamburger = document.getElementById('hamburger');

  hamburger.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
  });

  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('open')) return;
    if (nav.contains(e.target) || hamburger.contains(e.target)) return;
    closeMobileNav();
  });
}

/* ---------- Comutare limbă ---------- */
function initLanguageToggle() {
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
  });
}

/* ---------- FAQ / Acordeon ---------- */
function renderFAQ() {
  const container = document.getElementById('accordion');
  if (!container) return;
  const openIndex = container.dataset.openIndex;
  container.innerHTML = '';

  CONTENT[currentLang].faq.items.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'accordion-item';

    const triggerId = `faq-trigger-${index}`;
    const panelId = `faq-panel-${index}`;

    itemEl.innerHTML = `
      <h3>
        <button type="button" class="accordion-trigger" id="${triggerId}" aria-expanded="false" aria-controls="${panelId}">
          <span>${item.q}</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </h3>
      <div class="accordion-panel" id="${panelId}" role="region" aria-labelledby="${triggerId}">
        <div class="inner"><p>${item.a}</p></div>
      </div>
    `;
    container.appendChild(itemEl);
  });

  if (openIndex != null) {
    const trigger = container.querySelector(`#faq-trigger-${openIndex}`);
    if (trigger) toggleAccordionItem(trigger, container, Number(openIndex));
  }
}

function toggleAccordionItem(trigger, container, index) {
  const panel = document.getElementById(trigger.getAttribute('aria-controls'));
  const willOpen = trigger.getAttribute('aria-expanded') !== 'true';

  container.querySelectorAll('.accordion-trigger').forEach((t) => {
    t.setAttribute('aria-expanded', 'false');
    document.getElementById(t.getAttribute('aria-controls')).classList.remove('open');
  });

  if (willOpen) {
    trigger.setAttribute('aria-expanded', 'true');
    panel.classList.add('open');
    container.dataset.openIndex = String(index);
  } else {
    delete container.dataset.openIndex;
  }
}

function initAccordion() {
  const container = document.getElementById('accordion');
  container.addEventListener('click', (e) => {
    const trigger = e.target.closest('.accordion-trigger');
    if (!trigger) return;
    const index = Array.from(container.querySelectorAll('.accordion-trigger')).indexOf(trigger);
    toggleAccordionItem(trigger, container, index);
  });
}

/* ---------- Harta corpului & listă exerciții ---------- */
function showBodyView(view) {
  // setarea proprietății .hidden nu se reflectă fiabil pe elemente <svg> în toate browserele,
  // așa că manipulăm direct atributul HTML hidden.
  const front = document.getElementById('bodymap-front');
  const back = document.getElementById('bodymap-back');
  if (view === 'front') {
    front.removeAttribute('hidden');
    back.setAttribute('hidden', '');
  } else {
    front.setAttribute('hidden', '');
    back.removeAttribute('hidden');
  }
  document.querySelectorAll('.bodymap-toggle-btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.bodyView === view));
  });
}

function setBodymapCaption(text) {
  const el = document.getElementById('bodymap-caption');
  if (el) el.textContent = text;
}

function resetBodymapCaption() {
  setBodymapCaption(CONTENT[currentLang].exercises.selectHint);
}

function openExerciseList(muscleId, options = {}) {
  currentMuscleGroup = muscleId;
  exerciseListReturnTarget = options.returnToDayIndex != null ? { dayIndex: options.returnToDayIndex } : null;
  highlightedExerciseId = options.highlightExerciseId || null;
  renderExerciseList(muscleId, highlightedExerciseId);
  updateExerciseListBackLabel();
  showView('exercise-list');
}

function updateExerciseListBackLabel() {
  const t = CONTENT[currentLang].exercises;
  const btn = document.getElementById('exercise-list-back-btn');
  if (btn) btn.textContent = exerciseListReturnTarget ? t.backToPlan : t.backToMap;
}

function goBackFromExerciseList() {
  const target = exerciseListReturnTarget;
  showView('exercises');
  if (!target) return;
  const container = document.getElementById('workout-plan-accordion');
  const trigger = container.querySelector(`#workout-trigger-${target.dayIndex}`);
  if (!trigger) return;
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    toggleAccordionItem(trigger, container, target.dayIndex);
  }
  const item = trigger.closest('.accordion-item') || trigger;
  item.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildExerciseCard(exercise, isHighlighted) {
  const t = CONTENT[currentLang].exercises;
  const name = exercise.name[currentLang];
  const videoHtml = exercise.videoId
    ? `<div class="video-wrapper"><iframe src="https://www.youtube-nocookie.com/embed/${exercise.videoId}" title="${name}" loading="lazy" allowfullscreen></iframe></div>`
    : `<div class="video-fallback"><div class="video-fallback-inner">
        <span>${t.videoComingSoon}</span>
        <a class="video-fallback-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise tutorial`)}" target="_blank" rel="noopener noreferrer">${t.searchYoutube}</a>
      </div></div>`;

  const card = document.createElement('div');
  card.id = `exercise-card-${exercise.id}`;
  card.className = 'result-card exercise-card' + (isHighlighted ? ' exercise-card--highlighted' : '');
  card.innerHTML = `
    <div class="exercise-card-header">
      <h3>${name}</h3>
      <span class="badge badge--${exercise.difficulty}">${t.difficulty[exercise.difficulty]}</span>
    </div>
    <p class="exercise-desc">${exercise.description[currentLang]}</p>
    <div class="exercise-meta">
      <span>${t.setsLabel}: ${exercise.sets}</span>
      <span>${t.repsLabel}: ${exercise.reps}</span>
      <span>${t.equipmentLabel}: ${t.equipment[exercise.equipment]}</span>
    </div>
    ${videoHtml}
  `;
  return card;
}

function renderExerciseList(muscleId, highlightExerciseId) {
  const t = CONTENT[currentLang].exercises;
  const container = document.getElementById('exercise-list-container');
  const heading = document.getElementById('exercise-list-heading');
  heading.textContent = t.listHeading.replace('{muscle}', t.muscles[muscleId]);

  container.innerHTML = '';
  const matches = EXERCISES.filter((e) => e.muscleGroup === muscleId);

  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'field-hint';
    empty.textContent = t.emptyState;
    container.appendChild(empty);
    return;
  }

  matches.forEach((exercise) => container.appendChild(buildExerciseCard(exercise, exercise.id === highlightExerciseId)));

  if (highlightExerciseId) {
    const target = document.getElementById(`exercise-card-${highlightExerciseId}`);
    if (target) {
      requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }
}

function initBodyMap() {
  document.querySelectorAll('.bodymap-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => showBodyView(btn.dataset.bodyView));
  });

  document.querySelectorAll('.muscle-region').forEach((region) => {
    const muscleId = region.dataset.muscle;
    region.addEventListener('click', () => openExerciseList(muscleId));
    region.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openExerciseList(muscleId);
      }
    });
    region.addEventListener('pointerenter', () => setBodymapCaption(CONTENT[currentLang].exercises.muscles[muscleId]));
    region.addEventListener('focus', () => setBodymapCaption(CONTENT[currentLang].exercises.muscles[muscleId]));
    region.addEventListener('pointerleave', resetBodymapCaption);
    region.addEventListener('blur', resetBodymapCaption);
  });

  document.getElementById('exercise-list-back-btn').addEventListener('click', goBackFromExerciseList);

  resetBodymapCaption();
}

/* ---------- Formular ---------- */
function initForm() {
  const form = document.getElementById('calc-form');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    firstSubmitAttempted = true;
    const { valid, errors, values } = validateForm(form);
    renderErrors(form, errors);
    if (!valid) return;

    const bmr = calculateBMR({ sex: values.sex, weightKg: values.weight, heightCm: values.height, age: values.age });
    const tdee = calculateTDEE(bmr, values.activity);
    const target = calculateCalorieTarget(tdee, values.goal);
    const protein = calculateProtein(values.weight, values.goal);
    const fat = calculateFat(target, protein);
    const carbs = calculateCarbs(target, protein, fat);

    renderResults({
      bmr, tdee, target, protein, fat, carbs,
      goal: values.goal,
      belowFloor: target < LOW_CALORIE_FLOOR,
    });
  });

  ['age', 'weight', 'height', 'activity'].forEach((field) => {
    const input = form.elements[field];
    input.addEventListener('blur', () => {
      if (firstSubmitAttempted) return;
      const { errors } = validateForm(form);
      if (errors[field]) renderErrors(form, { [field]: errors[field] });
      else clearFieldError(form, field);
    });
    input.addEventListener('input', () => {
      if (!firstSubmitAttempted) return;
      const { errors } = validateForm(form);
      if (!errors[field]) clearFieldError(form, field);
    });
  });

  form.querySelectorAll('input[name="sex"], input[name="goal"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const field = radio.name;
      if (!firstSubmitAttempted) { clearFieldError(form, field); return; }
      const { errors } = validateForm(form);
      if (!errors[field]) clearFieldError(form, field);
    });
  });
}

/* ---------- Plan de nutriție AI ---------- */
function getSelectedAllergens(form) {
  return Array.from(form.querySelectorAll('input[name="allergen"]:checked')).map((el) => el.value);
}

function getSelectedStores(form) {
  return Array.from(form.querySelectorAll('input[name="store"]:checked')).map((el) => el.value);
}

function loadSavedAllergyPrefs() {
  try {
    const raw = localStorage.getItem('ffFitnessAllergyPrefs');
    return raw ? JSON.parse(raw) : { allergens: [], stores: [], dislikes: '' };
  } catch (err) {
    return { allergens: [], stores: [], dislikes: '' };
  }
}

function saveAllergyPrefs(allergens, stores, dislikes) {
  localStorage.setItem('ffFitnessAllergyPrefs', JSON.stringify({ allergens, stores, dislikes }));
}

function applySavedAllergyPrefs(form) {
  const saved = loadSavedAllergyPrefs();
  form.querySelectorAll('input[name="allergen"]').forEach((el) => {
    el.checked = saved.allergens.includes(el.value);
  });
  // Suprascrie bifele implicite (toate bifate în HTML) DOAR dacă există o selecție salvată —
  // altfel un vizitator nou păstrează implicitul sensibil (toate magazinele bifate).
  if (saved.stores && saved.stores.length) {
    form.querySelectorAll('input[name="store"]').forEach((el) => {
      el.checked = saved.stores.includes(el.value);
    });
  }
  form.dislikes.value = saved.dislikes || '';
}

// Distanța minimă între afișarea a două zile consecutive din plan — la generare live, AI-ul
// oricum ia mai mult decât atât între zile, deci pauza asta nu se simte. Dar la un plan servit
// din cache (toate cele 7 zile ajung practic simultan, într-un singur chunk NDJSON), fără
// pauza asta userul ar vedea tot planul apărând dintr-o dată în loc de zi-cu-zi.
const PLAN_DAY_REVEAL_MIN_INTERVAL_MS = 450;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPlanFromApi(payload, onDay) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);
  try {
    const res = await fetch(NUTRITION_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res.status === 402 || res.status === 403) {
      // Plată necesară/nepotrivită — distinct de o eroare reală de rețea, ca să nu cadă pe
      // generateWeekPlanLocal() mai jos (ar însemna un ocol gratuit al paywall-ului).
      let reason = 'payment_required';
      try { reason = (await res.json()).error || reason; } catch (err) { /* ignore */ }
      return { paymentRequired: true, reason };
    }
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const days = [];
    let lastRevealAt = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch (e) { continue; }
        if (obj.error) return days.length ? { days, lang: payload.lang } : null;
        days.push(obj);
        if (onDay) {
          if (lastRevealAt) {
            const elapsed = Date.now() - lastRevealAt;
            if (elapsed < PLAN_DAY_REVEAL_MIN_INTERVAL_MS) await wait(PLAN_DAY_REVEAL_MIN_INTERVAL_MS - elapsed);
          }
          lastRevealAt = Date.now();
          onDay(obj, days.length);
        }
      }
    }
    return days.length ? { days, lang: payload.lang } : null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Semnătură compactă a planului curent (numele meselor, în engleză ca ancoră stabilă
// indiferent de limba afișată) — trimisă la server ca "excludeSignature" la regenerare, ca
// să primim o altă variantă din pool-ul de cache în loc de a forța mereu un apel AI nou.
// Trebuie să rămână în sincron cu computePlanSignature() din worker/index.js.
function computePlanSignature(planData) {
  if (!planData || !Array.isArray(planData.days)) return null;
  return planData.days.map((d) => d.meals.map((m) => (m.name && m.name.en) || '').join(',')).join('|');
}

async function generatePlan(targets, goal, allergens, dislikes, stores, wantsDifferentPlan, onDay, paymentSessionId) {
  const payload = {
    targetKcal: targets.kcal,
    targetProtein: targets.protein,
    targetCarbs: targets.carbs,
    targetFat: targets.fat,
    goal,
    excludedTags: allergens,
    dislikeText: dislikes,
    stores,
    lang: currentLang,
    paymentSessionId,
  };
  if (wantsDifferentPlan) {
    const signature = computePlanSignature(lastPlanData);
    if (signature) payload.excludeSignature = signature;
  }

  // apiResult truthy acoperă și { paymentRequired: true, ... } — se propagă direct, fără să
  // cadă pe fallback-ul local (vezi comentariul din fetchPlanFromApi).
  const apiResult = await fetchPlanFromApi(payload, onDay);
  if (apiResult) return apiResult;

  return generateWeekPlanLocal(targets, allergens, dislikes, currentLang);
}

/* ---------- Plată Stripe pentru planul alimentar AI ---------- */
function setStoredPaidSessionId(id) {
  currentPaidSessionId = id;
  try { localStorage.setItem(PAID_SESSION_STORAGE_KEY, id); } catch (err) { /* ignore */ }
}

function clearStoredPaidSessionId() {
  currentPaidSessionId = null;
  try { localStorage.removeItem(PAID_SESSION_STORAGE_KEY); } catch (err) { /* ignore */ }
}

// Aproximare cosmetică ("a plătit browserul ăsta vreodată"), nu autoritativă — gate-ul real e
// server-side (verifyPaidEntitlement în worker/index.js). O aproximare greșită aici înseamnă
// cel mult un buton redundant, niciodată un ocol al plății.
function updateIndexPaywallState() {
  const unlockBtn = document.getElementById('plan-unlock-btn');
  const goToPlanBtn = document.getElementById('plan-go-to-plan-btn');
  if (!unlockBtn || !goToPlanBtn) return;
  const hasSession = Boolean(currentPaidSessionId);
  unlockBtn.hidden = hasSession;
  goToPlanBtn.hidden = !hasSession;
}

function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  if (stripeJsPromise) return stripeJsPromise;
  stripeJsPromise = loadScriptOnce(STRIPE_JS_URL).catch((err) => {
    stripeJsPromise = null;
    throw err;
  });
  return stripeJsPromise;
}

async function createCheckoutSession() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECKOUT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CREATE_CHECKOUT_SESSION_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: currentLang }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.clientSecret || !data.sessionId) return null;
    return data;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function openPaymentModal() {
  const dialog = document.getElementById('payment-modal');
  const loadingEl = document.getElementById('payment-modal-loading');
  const errorEl = document.getElementById('payment-modal-error');
  const mountEl = document.getElementById('payment-modal-mount');
  const t = CONTENT[currentLang].aiPlan.paywall;

  errorEl.textContent = '';
  mountEl.innerHTML = '';
  loadingEl.hidden = false;
  if (!dialog.open) dialog.showModal();

  try {
    await loadStripeJs();
    const session = await createCheckoutSession();
    if (!session) {
      loadingEl.hidden = true;
      errorEl.textContent = t.checkoutLoadError;
      return;
    }

    if (!stripeClientInstance) stripeClientInstance = window.Stripe(STRIPE_PUBLISHABLE_KEY);
    embeddedCheckoutInstance = await stripeClientInstance.createEmbeddedCheckoutPage({
      fetchClientSecret: () => Promise.resolve(session.clientSecret),
    });
    embeddedCheckoutInstance.mount('#payment-modal-mount');
    loadingEl.hidden = true;
  } catch (err) {
    loadingEl.hidden = true;
    errorEl.textContent = t.checkoutLoadError;
  }
}

function closePaymentModal() {
  if (embeddedCheckoutInstance) {
    embeddedCheckoutInstance.destroy();
    embeddedCheckoutInstance = null;
  }
  const dialog = document.getElementById('payment-modal');
  if (dialog.open) dialog.close();
}

function initPaymentModal() {
  const dialog = document.getElementById('payment-modal');
  document.getElementById('payment-modal-close').addEventListener('click', closePaymentModal);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closePaymentModal();
  });
  dialog.addEventListener('close', () => {
    if (embeddedCheckoutInstance) {
      embeddedCheckoutInstance.destroy();
      embeddedCheckoutInstance = null;
    }
  });
}

function renderPlanTargetSummary() {
  const el = document.getElementById('plan-target-summary');
  if (!el || !lastResults) return;
  const t = CONTENT[currentLang].planPage.targetSummary;
  el.textContent = t.text
    .replace('{kcal}', formatNumber(lastResults.target))
    .replace('{protein}', formatNumber(lastResults.protein))
    .replace('{carbs}', formatNumber(lastResults.carbs))
    .replace('{fat}', formatNumber(lastResults.fat));
}

// plan.html are trei stări posibile: fără sesiune plătită cunoscută (locked), sesiune plătită
// dar fără targeturi de calculator în acest browser (missing-results — ex. link-ul de plată
// deschis pe alt dispozitiv), sau amândouă prezente (ready). Verificarea reală a plății rămâne
// exclusiv server-side (verifyPaidEntitlement) — starea de aici e doar UX, nu o graniță de
// securitate: o aproximare greșită duce cel mult la un formular arătat degeaba, niciodată la
// generare gratuită (server-ul respinge oricum fără paymentSessionId valid).
function updatePlanPageState() {
  const lockedEl = document.getElementById('plan-locked-state');
  const missingEl = document.getElementById('plan-missing-results-state');
  const readyEl = document.getElementById('plan-ready-state');
  if (!lockedEl || !missingEl || !readyEl) return;

  const hasSession = Boolean(currentPaidSessionId);
  const hasResults = Boolean(lastResults);

  lockedEl.hidden = hasSession;
  missingEl.hidden = !(hasSession && !hasResults);
  readyEl.hidden = !(hasSession && hasResults);

  if (hasSession && hasResults) {
    applySavedAllergyPrefs(document.getElementById('plan-form'));
    renderPlanTargetSummary();
  }
}

// Apelat o singură dată, la boot pe plan.html: dacă userul tocmai s-a întors de la Stripe
// (Embedded Checkout navighează întreaga pagină către return_url la finalul plății), preia
// sesiunea plătită din URL și curăță URL-ul. Nu declanșează generarea automat — userul alege
// activ alergeni/magazine și apasă Generează, exact scopul mutării formularului pe această pagină.
function initPlanPageArrival() {
  const sessionId = new URLSearchParams(location.search).get('session_id');
  if (sessionId) {
    history.replaceState(null, '', location.pathname);
    setStoredPaidSessionId(sessionId);
  }
  updatePlanPageState();
}

async function translatePlanMeals(planData, targetLang) {
  if (inFlightTranslation && inFlightTranslation.planData === planData && inFlightTranslation.lang === targetLang) {
    return inFlightTranslation.promise;
  }

  const promise = (async () => {
    const flatMeals = [];
    planData.days.forEach((day) => {
      day.meals.forEach((m) => {
        flatMeals.push({ name: m.name[planData.lang], description: m.description[planData.lang] });
      });
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TRANSLATE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(TRANSLATE_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetLang, meals: flatMeals }),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !Array.isArray(data.meals) || data.meals.length !== flatMeals.length) return false;

      let i = 0;
      planData.days.forEach((day) => {
        day.meals.forEach((m) => {
          const translated = data.meals[i];
          i += 1;
          if (translated && typeof translated.name === 'string' && typeof translated.description === 'string') {
            m.name[targetLang] = translated.name;
            m.description[targetLang] = translated.description;
          }
        });
      });

      if (!planData.translatedLangs) planData.translatedLangs = new Set([planData.lang]);
      planData.translatedLangs.add(targetLang);
      return true;
    } catch (err) {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  inFlightTranslation = { planData, lang: targetLang, promise };
  try {
    return await promise;
  } finally {
    if (inFlightTranslation && inFlightTranslation.promise === promise) inFlightTranslation = null;
  }
}

async function translateAndRenderPlan(lang) {
  const planData = lastPlanData;
  planRenderToken += 1;
  const myToken = planRenderToken;

  const t = CONTENT[lang].aiPlan;
  const loadingEl = document.getElementById('plan-loading');
  const loadingTextEl = document.getElementById('plan-loading-text');
  const loadingAnnounceEl = document.getElementById('plan-loading-announce');
  const outputEl = document.getElementById('plan-output');
  const errorEl = document.getElementById('plan-error');

  errorEl.textContent = '';
  outputEl.hidden = true;
  loadingEl.hidden = false;
  loadingTextEl.textContent = t.translatingText;
  loadingAnnounceEl.textContent = t.translatingText;

  const ok = await translatePlanMeals(planData, lang);

  if (myToken !== planRenderToken) return;

  loadingEl.hidden = true;

  if (!ok) {
    errorEl.textContent = t.translateError;
    return;
  }

  outputEl.hidden = false;
  renderPlanAccordion(lastPlanData);
  if (currentRecipeMealKey) refreshOpenRecipeDialog();
}

function buildPlanDayElement(day, dayIndex) {
  const t = CONTENT[currentLang].aiPlan;
  const itemEl = document.createElement('div');
  itemEl.className = 'accordion-item';
  const triggerId = `plan-trigger-${dayIndex}`;
  const panelId = `plan-panel-${dayIndex}`;

  const groupsHtml = PLAN_SLOT_ORDER.map((slot) => {
    const mealsInSlot = day.meals.filter((m) => m.slot === slot);
    if (!mealsInSlot.length) return '';

    const rowsHtml = mealsInSlot.map((m) => {
      const mealKey = `${dayIndex}-${slot}-${m.name[currentLang]}`;
      mealIndex.set(mealKey, m);
      return `
      <div class="plan-meal-row">
        <div class="plan-meal-text">
          <span class="plan-meal-name">${m.name[currentLang]}</span>
          <span class="plan-meal-desc">${m.description[currentLang]}</span>
        </div>
        <span class="plan-meal-macros">${formatNumber(m.kcal)} kcal · P ${formatNumber(m.protein)}g · C ${formatNumber(m.carbs)}g · G ${formatNumber(m.fat)}g</span>
        <button type="button" class="recipe-btn" data-meal-key="${mealKey}">${t.recipeButton}</button>
      </div>`;
    }).join('');

    return `<div class="plan-slot-group"><h4 class="plan-slot-heading">${t.slots[slot]}</h4>${rowsHtml}</div>`;
  }).join('');

  itemEl.innerHTML = `
    <h3>
      <button type="button" class="accordion-trigger" id="${triggerId}" aria-expanded="false" aria-controls="${panelId}">
        <span>${t.dayLabel} ${day.day} · ${formatNumber(day.totalKcal)} kcal</span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </h3>
    <div class="accordion-panel" id="${panelId}" role="region" aria-labelledby="${triggerId}">
      <div class="inner">
        ${groupsHtml}
        <p class="plan-day-total">${t.totalLabel}: ${formatNumber(day.totalKcal)} kcal (${t.targetWord} ${formatNumber(lastResults.target)}) · P ${formatNumber(day.totalProtein)}g · C ${formatNumber(day.totalCarbs)}g · G ${formatNumber(day.totalFat)}g</p>
      </div>
    </div>
  `;
  return itemEl;
}

function appendPlanDay(day, dayIndex) {
  document.getElementById('plan-accordion').appendChild(buildPlanDayElement(day, dayIndex));
}

function renderPlanAccordion(planData) {
  const container = document.getElementById('plan-accordion');
  const openIndex = container.dataset.openIndex;
  container.innerHTML = '';
  mealIndex.clear();

  planData.days.forEach((day, dayIndex) => {
    container.appendChild(buildPlanDayElement(day, dayIndex));
  });

  if (openIndex != null) {
    const trigger = container.querySelector(`#plan-trigger-${openIndex}`);
    if (trigger) toggleAccordionItem(trigger, container, Number(openIndex));
  }
}

function initPlanAccordion() {
  const container = document.getElementById('plan-accordion');
  container.addEventListener('click', (e) => {
    const recipeBtn = e.target.closest('.recipe-btn');
    if (recipeBtn) {
      openRecipeDialog(recipeBtn.dataset.mealKey);
      return;
    }
    const trigger = e.target.closest('.accordion-trigger');
    if (!trigger) return;
    const index = Array.from(container.querySelectorAll('.accordion-trigger')).indexOf(trigger);
    toggleAccordionItem(trigger, container, index);
  });
}

/* ---------- Rețete pas cu pas ---------- */
const RECIPE_STEP_TEMPLATE = {
  ro: [
    'Pregătește și cântărește toate ingredientele din lista de mai sus.',
    'Gătește sau amestecă ingredientele principale (la grătar, în tigaie, la cuptor sau fierte, după caz), sau combină-le direct dacă rețeta nu necesită gătire.',
    'Asezonează după gust, cu sare, piper sau condimentele preferate.',
    'Combină toate componentele într-un bol sau farfurie și servește imediat.',
  ],
  en: [
    'Prepare and measure out all the ingredients listed above.',
    'Cook or mix the main ingredients (grilled, pan-fried, baked or boiled, as appropriate), or combine them directly if the recipe needs no cooking.',
    'Season to taste with salt, pepper, or your preferred spices.',
    'Combine everything in a bowl or plate and serve immediately.',
  ],
};

/* ---------- Adnotare rețete cu magazinele unde găsești ingredientele ---------- */
const STORE_DISPLAY_NAMES = {
  lidl: 'Lidl',
  kaufland: 'Kaufland',
  profi: 'Profi',
  'mega-image': 'Mega Image',
  carrefour: 'Carrefour',
  auchan: 'Auchan',
};
const STORE_ORDER = ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'];

// Grupare manuală ingredient -> magazine, derivată din STORE_PRODUCT_CATALOG din
// worker/index.js (întreținută separat, la fel ca celelalte cataloage duplicate manual din
// acest proiect — vezi architecture.md). Intrările mai specifice trebuie să apară înaintea
// celor generice (ex. "cartof dulce" înaintea lui "cartof"), pentru că se oprește la prima
// potrivire. Un ingredient care nu apare deloc în catalog (ex. tofu, creveți, tahini) rămâne
// fără nicio potrivire — mai bine fără paranteză decât cu o informație inventată.
const INGREDIENT_STORE_MAP = [
  { ro: ['cartof dulce', 'cartofi dulci'], en: ['sweet potato'], stores: ['kaufland', 'mega-image', 'auchan'] },
  { ro: ['cartof', 'cartofi'], en: ['potato'], stores: ['profi', 'carrefour'] },
  { ro: ['piept de curcan', 'curcan'], en: ['turkey breast', 'turkey'], stores: ['kaufland', 'mega-image', 'auchan'] },
  { ro: ['piept de pui', 'pui'], en: ['chicken breast', 'chicken'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['somon afumat'], en: ['smoked salmon'], stores: ['profi'] },
  { ro: ['somon'], en: ['salmon'], stores: ['lidl', 'profi', 'mega-image', 'auchan'] },
  { ro: ['file de cod', 'cod'], en: ['cod'], stores: ['kaufland', 'carrefour'] },
  { ro: ['carne tocata de vita', 'vita tocata'], en: ['ground beef', 'lean beef'], stores: ['lidl', 'carrefour', 'auchan'] },
  { ro: ['carne tocata de porc'], en: ['ground pork'], stores: ['profi'] },
  { ro: ['muschiulet de porc'], en: ['pork tenderloin'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['oua', 'ou fiert', 'ouă'], en: ['eggs', 'egg'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['iaurt grecesc', 'iaurt'], en: ['greek yogurt', 'yogurt'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['branza cottage', 'branza de vaci'], en: ['cottage cheese'], stores: ['lidl', 'profi', 'carrefour', 'auchan'] },
  { ro: ['telemea'], en: ['telemea', 'feta'], stores: ['kaufland'] },
  { ro: ['lapte'], en: ['milk'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['orez alb'], en: ['white rice'], stores: ['kaufland', 'profi', 'auchan'] },
  { ro: ['orez brun'], en: ['brown rice'], stores: ['lidl', 'mega-image'] },
  { ro: ['paste integrale'], en: ['wholewheat pasta'], stores: ['kaufland', 'mega-image'] },
  { ro: ['paine integrala'], en: ['wholewheat bread'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['fulgi de ovaz', 'ovaz'], en: ['rolled oats', 'oats'], stores: ['lidl', 'profi', 'carrefour', 'auchan'] },
  { ro: ['cus-cus', 'cuscus'], en: ['couscous'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['quinoa'], en: ['quinoa'], stores: ['lidl', 'carrefour'] },
  { ro: ['naut'], en: ['chickpeas'], stores: ['kaufland', 'carrefour', 'auchan'] },
  { ro: ['fasole neagra'], en: ['black beans'], stores: ['profi'] },
  { ro: ['linte'], en: ['lentils'], stores: ['mega-image'] },
  { ro: ['migdale'], en: ['almonds'], stores: ['lidl', 'mega-image'] },
  { ro: ['miez de nuca', 'nuci'], en: ['walnuts'], stores: ['kaufland'] },
  { ro: ['seminte de chia', 'chia'], en: ['chia seeds'], stores: ['mega-image'] },
  { ro: ['ulei de masline'], en: ['olive oil'], stores: ['lidl', 'profi', 'carrefour', 'auchan'] },
  { ro: ['miere'], en: ['honey'], stores: ['kaufland'] },
  { ro: ['banana', 'banane'], en: ['banana'], stores: ['mega-image'] },
  { ro: ['mere', 'mar'], en: ['apples', 'apple'], stores: ['profi', 'carrefour'] },
  { ro: ['portocale', 'portocala'], en: ['oranges', 'orange'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['fructe de padure congelate'], en: ['frozen berries'], stores: ['lidl'] },
  { ro: ['broccoli congelat', 'broccoli'], en: ['frozen broccoli', 'broccoli'], stores: ['kaufland', 'carrefour'] },
  { ro: ['spanac'], en: ['spinach'], stores: ['profi'] },
  { ro: ['mix legume congelate', 'legume congelate'], en: ['frozen vegetables', 'mixed vegetables'], stores: ['lidl', 'mega-image', 'auchan'] },
  { ro: ['castraveti'], en: ['cucumber', 'cucumbers'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['rosii'], en: ['tomato', 'tomatoes'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
  { ro: ['ardei'], en: ['bell pepper', 'pepper'], stores: ['lidl', 'kaufland', 'profi', 'mega-image', 'carrefour', 'auchan'] },
];

// Caută prima intrare din INGREDIENT_STORE_MAP al cărei cuvânt-cheie (pentru limba dată)
// apare ca substring în textul ingredientului; null dacă niciun ingredient cunoscut nu se
// potrivește (ingredient în afara catalogului de magazine).
function findIngredientStores(text, lang) {
  const normalized = normalizeForMatch(text);
  for (const entry of INGREDIENT_STORE_MAP) {
    const keywords = entry[lang] || [];
    if (keywords.some((kw) => normalized.includes(normalizeForMatch(kw)))) {
      return entry.stores;
    }
  }
  return null;
}

// Adaugă "(Magazin1, Magazin2)" la finalul unei linii de ingredient, cu magazinele care chiar
// vând acel produs, restrânse la magazinele bifate de user la generarea planului
// (selectedStoreIds) — nu la toate 6, ca să nu recomandăm un magazin pe care userul nu l-a
// ales. Fără nicio adnotare dacă ingredientul nu se potrivește cu catalogul cunoscut, sau
// dacă niciunul din magazinele care îl vând nu e printre cele selectate.
function annotateIngredientWithStores(text, lang, selectedStoreIds) {
  const matchedStores = findIngredientStores(text, lang);
  if (!matchedStores || !matchedStores.length) return text;
  const allowed = selectedStoreIds && selectedStoreIds.length ? selectedStoreIds : STORE_ORDER;
  const applicable = STORE_ORDER.filter((id) => matchedStores.includes(id) && allowed.includes(id));
  if (!applicable.length) return text;
  const names = applicable.map((id) => STORE_DISPLAY_NAMES[id]).join(', ');
  return `${text} (${names})`;
}

function annotateIngredientsWithStores(ingredients, selectedStoreIds) {
  return {
    ro: ingredients.ro.map((line) => annotateIngredientWithStores(line, 'ro', selectedStoreIds)),
    en: ingredients.en.map((line) => annotateIngredientWithStores(line, 'en', selectedStoreIds)),
  };
}

function buildLocalRecipe(meal) {
  const written = meal.id && MEAL_RECIPE_STEPS[meal.id];
  return {
    servings: 1,
    prepMinutes: written ? written.prepMinutes : null,
    ingredients: {
      ro: meal.description.ro.split(',').map((s) => s.trim()).filter(Boolean),
      en: meal.description.en.split(',').map((s) => s.trim()).filter(Boolean),
    },
    steps: written
      ? { ro: written.ro, en: written.en }
      : { ro: [...RECIPE_STEP_TEMPLATE.ro], en: [...RECIPE_STEP_TEMPLATE.en] },
  };
}

async function fetchRecipeFromApi(meal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RECIPE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(RECIPE_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: meal.name,
        description: meal.description,
        kcal: meal.kcal,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API status ${res.status}`);
    const data = await res.json();
    if (!data || !data.ingredients || !data.steps) throw new Error('Invalid API response');
    return data;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getRecipe(meal, selectedStoreIds) {
  const apiResult = await fetchRecipeFromApi(meal);
  const recipe = apiResult || buildLocalRecipe(meal);
  recipe.ingredients = annotateIngredientsWithStores(recipe.ingredients, selectedStoreIds);
  return recipe;
}

function renderRecipeDialogContent(meal, recipe) {
  const t = CONTENT[currentLang].aiPlan;

  document.getElementById('recipe-modal-title').textContent = meal.name[currentLang];

  const macroParts = [
    `${formatNumber(meal.kcal)} kcal`,
    `P ${formatNumber(meal.protein)}g`,
    `C ${formatNumber(meal.carbs)}g`,
    `G ${formatNumber(meal.fat)}g`,
  ];
  if (recipe.servings) macroParts.push(`${t.servingsLabel}: ${formatNumber(recipe.servings)}`);
  if (recipe.prepMinutes) macroParts.push(`${t.prepTimeLabel}: ${formatNumber(recipe.prepMinutes)} min`);
  document.getElementById('recipe-modal-macros').textContent = macroParts.join(' · ');

  document.getElementById('recipe-modal-ingredients').innerHTML =
    recipe.ingredients[currentLang].map((ing) => `<li>${ing}</li>`).join('');
  document.getElementById('recipe-modal-steps').innerHTML =
    recipe.steps[currentLang].map((step) => `<li>${step}</li>`).join('');
}

async function openRecipeDialog(mealKey) {
  const meal = mealIndex.get(mealKey);
  if (!meal) return;

  const dialog = document.getElementById('recipe-modal');
  const loadingEl = document.getElementById('recipe-modal-loading');
  const bodyEl = document.getElementById('recipe-modal-body');

  currentRecipeMealKey = mealKey;
  document.getElementById('recipe-modal-title').textContent = meal.name[currentLang];
  document.getElementById('recipe-modal-macros').textContent = '';
  bodyEl.hidden = true;
  loadingEl.hidden = false;
  if (!dialog.open) dialog.showModal();

  const cached = recipeCache.get(mealKey);
  const recipe = cached || await getRecipe(meal, lastPlanData && lastPlanData.stores);
  if (!cached) recipeCache.set(mealKey, recipe);

  if (currentRecipeMealKey !== mealKey || !dialog.open) return;

  currentRecipeData = { meal, recipe };
  renderRecipeDialogContent(meal, recipe);
  loadingEl.hidden = true;
  bodyEl.hidden = false;
}

function closeRecipeDialog() {
  const dialog = document.getElementById('recipe-modal');
  if (dialog.open) dialog.close();
  currentRecipeMealKey = null;
  currentRecipeData = null;
}

function refreshOpenRecipeDialog() {
  const dialog = document.getElementById('recipe-modal');
  if (!dialog.open || !currentRecipeMealKey) return;
  const meal = mealIndex.get(currentRecipeMealKey);
  const recipe = recipeCache.get(currentRecipeMealKey);
  if (!meal || !recipe) return;
  renderRecipeDialogContent(meal, recipe);
}

function initRecipeDialog() {
  const dialog = document.getElementById('recipe-modal');
  document.getElementById('recipe-modal-close').addEventListener('click', closeRecipeDialog);
  document.getElementById('recipe-pdf-btn').addEventListener('click', handleDownloadPdf);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    currentRecipeMealKey = null;
    currentRecipeData = null;
  });
}

/* ---------- Export PDF rețetă ---------- */
/* Fonturile și logo-ul sunt embedate ca base64 în assets/vendor/pdf-assets.js (nu fetch-uite la runtime):
   fetch() către fișiere locale eșuează în browsere sub file:// fără flag-uri speciale, dar încărcarea
   prin tag <script src>, ca mai jos, funcționează mereu, indiferent cum e servit site-ul. */
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(script);
  });
}

function loadPdfLibrary() {
  if (pdfLibraryPromise) return pdfLibraryPromise;
  const tasks = [];
  if (!(window.jspdf && window.jspdf.jsPDF)) tasks.push(loadScriptOnce(PDF_LIBRARY_URL));
  if (!window.PDF_ASSET_DATA) tasks.push(loadScriptOnce(PDF_ASSETS_URL));
  if (!tasks.length) return Promise.resolve();
  pdfLibraryPromise = Promise.all(tasks).catch((err) => {
    pdfLibraryPromise = null;
    throw err;
  });
  return pdfLibraryPromise;
}

function registerPdfFonts(doc) {
  const fonts = window.PDF_ASSET_DATA;
  doc.addFileToVFS('Oswald-Bold.ttf', fonts.oswaldBold);
  doc.addFont('Oswald-Bold.ttf', 'Oswald', 'bold');
  doc.addFileToVFS('Inter-Regular.ttf', fonts.interRegular);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
}

function rasterizeSvgToPngDataUrl(svgEl, sizePx) {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true);
    clone.setAttribute('width', String(sizePx));
    clone.setAttribute('height', String(sizePx));
    const svgString = new XMLSerializer().serializeToString(clone);
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = sizePx;
      canvas.height = sizePx;
      canvas.getContext('2d').drawImage(img, 0, 0, sizePx, sizePx);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('SVG rasterization failed'));
    img.src = svgDataUrl;
  });
}

function slugify(text) {
  return normalizeForMatch(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'reteta';
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpRgb(c1, c2, t) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
}

function drawGradientRect(doc, x, y, w, h, hexStart, hexEnd, steps) {
  const c1 = hexToRgb(hexStart);
  const c2 = hexToRgb(hexEnd);
  const stepW = w / steps;
  for (let i = 0; i < steps; i++) {
    const [r, g, b] = lerpRgb(c1, c2, i / (steps - 1));
    doc.setFillColor(r, g, b);
    doc.rect(x + i * stepW, y, stepW + 0.5, h, 'F');
  }
}

function pdfFillBackground(doc) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFillColor(PDF_COLORS.bg);
  doc.rect(0, 0, w, h, 'F');
}

function pdfEnsureSpace(doc, cursor, neededHeight) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursor.y + neededHeight > pageHeight - PDF_PAGE_MARGIN) {
    doc.addPage();
    pdfFillBackground(doc);
    cursor.y = PDF_PAGE_MARGIN;
  }
}

function pdfSectionHeading(doc, cursor, label) {
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(PDF_COLORS.primaryHover);
  doc.text(label.toUpperCase(), PDF_PAGE_MARGIN, cursor.y);
  cursor.y += 7;
}

// Banner-ul de header (fundal, gradient, logo, "FF FITNESS", badge AI) — identic pentru orice
// PDF FF Fitness. Extras din buildRecipePdf, refolosit acum și de buildPlanPdf. Returnează
// înălțimea banner-ului, ca apelantul să știe de unde pornește conținutul.
async function drawPdfHeaderBanner(doc, pageWidth) {
  const headerHeight = 34;
  pdfFillBackground(doc);
  drawGradientRect(doc, 0, 0, pageWidth, headerHeight, PDF_COLORS.primaryButton, PDF_COLORS.primaryHover, 48);

  try {
    const logoDataUrl = 'data:image/png;base64,' + window.PDF_ASSET_DATA.logoPng;
    const logoSize = 16;
    doc.addImage(logoDataUrl, 'PNG', PDF_PAGE_MARGIN, (headerHeight - logoSize) / 2, logoSize, logoSize);
  } catch (err) { /* logo opțional — continuă fără el dacă nu poate fi încărcat */ }

  doc.setFont('Oswald', 'bold');
  doc.setFontSize(15);
  doc.setTextColor('#FFFFFF');
  doc.text('FF FITNESS', PDF_PAGE_MARGIN + 20, headerHeight / 2 + 2);

  try {
    const badgeEl = document.querySelector('.ai-plan-header .ai-badge');
    if (badgeEl) {
      const badgeDataUrl = await rasterizeSvgToPngDataUrl(badgeEl, 128);
      const badgeSize = 11;
      doc.addImage(badgeDataUrl, 'PNG', pageWidth - PDF_PAGE_MARGIN - badgeSize, (headerHeight - badgeSize) / 2, badgeSize, badgeSize);
    }
  } catch (err) { /* decorativ — opțional */ }

  return headerHeight;
}

// Lista de ingrediente + pașii numerotați — extras din buildRecipePdf, refolosit acum și per
// masă în buildPlanPdf. Mută cursorul (obiect, mutat direct) pe măsură ce desenează.
function drawRecipeIngredientsAndSteps(doc, cursor, recipe, lang, t) {
  pdfEnsureSpace(doc, cursor, 20);
  pdfSectionHeading(doc, cursor, t.ingredientsLabel);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(PDF_COLORS.textPrimary);
  recipe.ingredients[lang].forEach((ingredient) => {
    const lines = doc.splitTextToSize('•  ' + ingredient, PDF_CONTENT_WIDTH - 4);
    pdfEnsureSpace(doc, cursor, lines.length * 5.5 + 2);
    doc.text(lines, PDF_PAGE_MARGIN + 2, cursor.y);
    cursor.y += lines.length * 5.5 + 2;
  });
  cursor.y += 6;

  pdfEnsureSpace(doc, cursor, 20);
  pdfSectionHeading(doc, cursor, t.stepsLabel);
  const stepIndent = 10;
  recipe.steps[lang].forEach((step, index) => {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(step, PDF_CONTENT_WIDTH - stepIndent);
    const blockHeight = lines.length * 5.5 + 3;
    pdfEnsureSpace(doc, cursor, blockHeight);

    doc.setFillColor(PDF_COLORS.primaryHover);
    doc.circle(PDF_PAGE_MARGIN + 3, cursor.y - 1.6, 3, 'F');
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor('#FFFFFF');
    doc.text(String(index + 1), PDF_PAGE_MARGIN + 3, cursor.y - 0.3, { align: 'center' });

    doc.setFont('Inter', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(PDF_COLORS.textPrimary);
    doc.text(lines, PDF_PAGE_MARGIN + stepIndent, cursor.y);
    cursor.y += blockHeight;
  });
  cursor.y += 8;
}

async function buildRecipePdf(meal, recipe, lang) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await registerPdfFonts(doc);

  const t = CONTENT[lang].aiPlan;
  const r = CONTENT[lang].results;
  const pageWidth = doc.internal.pageSize.getWidth();

  const headerHeight = await drawPdfHeaderBanner(doc, pageWidth);
  const cursor = { y: headerHeight + 15 };

  doc.setFont('Oswald', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(PDF_COLORS.textPrimary);
  const titleLines = doc.splitTextToSize(meal.name[lang].toUpperCase(), PDF_CONTENT_WIDTH);
  doc.text(titleLines, PDF_PAGE_MARGIN, cursor.y);
  cursor.y += titleLines.length * 8.5 + 2;

  const slotLabel = (t.slots && t.slots[meal.slot]) || '';
  if (slotLabel) {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(PDF_COLORS.primaryHover);
    doc.text(slotLabel.toUpperCase(), PDF_PAGE_MARGIN, cursor.y);
  }
  cursor.y += 10;

  const statCardHeight = 24;
  doc.setDrawColor(PDF_COLORS.border);
  doc.setFillColor(PDF_COLORS.surface);
  doc.roundedRect(PDF_PAGE_MARGIN, cursor.y, PDF_CONTENT_WIDTH, statCardHeight, 3, 3, 'FD');

  const statItems = [
    { value: formatNumber(meal.kcal), label: 'kcal' },
    { value: formatNumber(meal.protein) + 'g', label: r.proteinShort },
    { value: formatNumber(meal.carbs) + 'g', label: r.carbsShort },
    { value: formatNumber(meal.fat) + 'g', label: r.fatShort },
  ];
  if (recipe.servings) statItems.push({ value: String(recipe.servings), label: t.servingsLabel });
  if (recipe.prepMinutes) statItems.push({ value: recipe.prepMinutes + ' min', label: t.prepTimeLabel });

  const colWidth = PDF_CONTENT_WIDTH / statItems.length;
  statItems.forEach((item, i) => {
    const colCenterX = PDF_PAGE_MARGIN + i * colWidth + colWidth / 2;
    doc.setFont('Oswald', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(PDF_COLORS.textPrimary);
    doc.text(item.value, colCenterX, cursor.y + 10, { align: 'center' });
    doc.setFont('Inter', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(PDF_COLORS.textSecondary);
    doc.text(String(item.label).toUpperCase(), colCenterX, cursor.y + 16.5, { align: 'center' });
  });
  cursor.y += statCardHeight + 12;

  drawRecipeIngredientsAndSteps(doc, cursor, recipe, lang, t);

  pdfEnsureSpace(doc, cursor, 16);
  doc.setDrawColor(PDF_COLORS.border);
  doc.line(PDF_PAGE_MARGIN, cursor.y, pageWidth - PDF_PAGE_MARGIN, cursor.y);
  cursor.y += 6;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(PDF_COLORS.textSecondary);
  const footerLines = doc.splitTextToSize(t.pdfFooterNote, PDF_CONTENT_WIDTH);
  doc.text(footerLines, PDF_PAGE_MARGIN, cursor.y);

  return doc;
}

// Documentul complet al planului (7 zile, toate mesele, cu rețete complete — ingrediente+pași).
// Presupune că recipeCache are deja fiecare masă încărcată (vezi ensureAllRecipesLoaded, apelat
// înainte, de handleDownloadPlanPdf/handleSendPlanEmail) — buildLocalRecipe e doar o plasă de
// siguranță finală, nu calea normală. lang trebuie să fie currentLang (altfel toate lookup-urile
// din recipeCache ratează, fiindcă mealKey include limba din numele mesei).
async function buildPlanPdf(planData, targets, lang) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  await registerPdfFonts(doc);

  const t = CONTENT[lang].aiPlan;
  const pageWidth = doc.internal.pageSize.getWidth();

  const headerHeight = await drawPdfHeaderBanner(doc, pageWidth);
  const cursor = { y: headerHeight + 15 };

  doc.setFont('Oswald', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(PDF_COLORS.textPrimary);
  doc.text(t.title.toUpperCase(), PDF_PAGE_MARGIN, cursor.y);
  cursor.y += 10;

  doc.setFont('Inter', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(PDF_COLORS.textSecondary);
  doc.text(
    `${t.targetWord}: ${formatNumber(targets.kcal)} kcal · P ${formatNumber(targets.protein)}g · C ${formatNumber(targets.carbs)}g · G ${formatNumber(targets.fat)}g`,
    PDF_PAGE_MARGIN,
    cursor.y,
  );
  cursor.y += 12;

  planData.days.forEach((day, dayIndex) => {
    pdfEnsureSpace(doc, cursor, 20);
    pdfSectionHeading(doc, cursor, `${t.dayLabel} ${day.day} · ${formatNumber(day.totalKcal)} kcal`);

    PLAN_SLOT_ORDER.forEach((slot) => {
      const mealsInSlot = day.meals.filter((m) => m.slot === slot);
      mealsInSlot.forEach((meal) => {
        const mealKey = `${dayIndex}-${slot}-${meal.name[lang]}`;
        const recipe = recipeCache.get(mealKey) || buildLocalRecipe(meal);

        pdfEnsureSpace(doc, cursor, 14);
        doc.setFont('Oswald', 'bold');
        doc.setFontSize(12.5);
        doc.setTextColor(PDF_COLORS.textPrimary);
        const nameLines = doc.splitTextToSize(meal.name[lang], PDF_CONTENT_WIDTH);
        doc.text(nameLines, PDF_PAGE_MARGIN, cursor.y);
        cursor.y += nameLines.length * 5.5;

        doc.setFont('Inter', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(PDF_COLORS.primaryHover);
        const slotLabel = (t.slots && t.slots[slot]) || slot;
        const slotAndMacros = `${slotLabel} · ${formatNumber(meal.kcal)} kcal · P ${formatNumber(meal.protein)}g · C ${formatNumber(meal.carbs)}g · G ${formatNumber(meal.fat)}g`;
        doc.text(slotAndMacros.toUpperCase(), PDF_PAGE_MARGIN, cursor.y);
        cursor.y += 7;

        drawRecipeIngredientsAndSteps(doc, cursor, recipe, lang, t);

        pdfEnsureSpace(doc, cursor, 6);
        doc.setDrawColor(PDF_COLORS.border);
        doc.line(PDF_PAGE_MARGIN, cursor.y, pageWidth - PDF_PAGE_MARGIN, cursor.y);
        cursor.y += 8;
      });
    });

    pdfEnsureSpace(doc, cursor, 10);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(PDF_COLORS.textSecondary);
    doc.text(
      `${t.totalLabel}: ${formatNumber(day.totalKcal)} kcal · P ${formatNumber(day.totalProtein)}g · C ${formatNumber(day.totalCarbs)}g · G ${formatNumber(day.totalFat)}g`,
      PDF_PAGE_MARGIN,
      cursor.y,
    );
    cursor.y += 12;
  });

  pdfEnsureSpace(doc, cursor, 16);
  doc.setDrawColor(PDF_COLORS.border);
  doc.line(PDF_PAGE_MARGIN, cursor.y, pageWidth - PDF_PAGE_MARGIN, cursor.y);
  cursor.y += 6;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(PDF_COLORS.textSecondary);
  const footerLines = doc.splitTextToSize(t.pdfAllFooterNote, PDF_CONTENT_WIDTH);
  doc.text(footerLines, PDF_PAGE_MARGIN, cursor.y);

  return doc;
}

// Se asigură, înainte de a construi PDF-ul complet, că fiecare masă din plan are rețeta
// încărcată în recipeCache — din cache-ul server (rapid, cazul obișnuit pentru planuri deja
// pre-generate în fundal) sau, doar dacă lipsește de tot, generată live pe loc (getRecipe are
// deja acest fallback, plus fallback-ul local dacă rețeaua eșuează — niciodată nu respinge).
async function ensureAllRecipesLoaded(planData, stores, onProgress) {
  const tasks = [];
  let done = 0;
  const total = planData.days.reduce((sum, d) => sum + d.meals.length, 0);
  planData.days.forEach((day, dayIndex) => {
    day.meals.forEach((meal) => {
      const mealKey = `${dayIndex}-${meal.slot}-${meal.name[currentLang]}`;
      if (recipeCache.has(mealKey)) {
        done++;
        if (onProgress) onProgress(done, total);
        return;
      }
      tasks.push(getRecipe(meal, stores).then((recipe) => {
        recipeCache.set(mealKey, recipe);
        done++;
        if (onProgress) onProgress(done, total);
      }));
    });
  });
  await Promise.all(tasks);
}

async function handleDownloadPdf() {
  if (!currentRecipeData) return;

  const btn = document.getElementById('recipe-pdf-btn');
  const label = document.getElementById('recipe-pdf-btn-label');
  const t = CONTENT[currentLang].aiPlan;

  btn.disabled = true;
  label.textContent = t.pdfGenerating;

  try {
    await loadPdfLibrary();
    const { meal, recipe } = currentRecipeData;
    const doc = await buildRecipePdf(meal, recipe, currentLang);
    doc.save(`FF-Fitness-Reteta-${slugify(meal.name[currentLang])}.pdf`);
    btn.disabled = false;
    label.textContent = CONTENT[currentLang].aiPlan.pdfButton;
  } catch (err) {
    console.error('PDF export failed:', err);
    label.textContent = CONTENT[currentLang].aiPlan.pdfError;
    setTimeout(() => {
      btn.disabled = false;
      label.textContent = CONTENT[currentLang].aiPlan.pdfButton;
    }, 3000);
  }
}

async function handleDownloadPlanPdf() {
  if (!lastPlanData || !lastResults) return;

  const btn = document.getElementById('plan-pdf-all-btn');
  const label = document.getElementById('plan-pdf-all-btn-label');
  const statusEl = document.getElementById('plan-export-status');
  const statusTextEl = document.getElementById('plan-export-status-text');
  const t = CONTENT[currentLang].aiPlan;

  btn.disabled = true;
  label.textContent = t.pdfAllGenerating;
  statusEl.hidden = false;
  statusTextEl.textContent = t.recipesPreparing;

  try {
    const stores = lastPlanData.stores || [];
    await ensureAllRecipesLoaded(lastPlanData, stores, (done, total) => {
      statusTextEl.textContent = t.recipesPreparingProgress.replace('{done}', done).replace('{total}', total);
    });
    await loadPdfLibrary();
    const targets = { kcal: lastResults.target, protein: lastResults.protein, carbs: lastResults.carbs, fat: lastResults.fat };
    const doc = await buildPlanPdf(lastPlanData, targets, currentLang);
    doc.save('FF-Fitness-Plan-Alimentar.pdf');
    btn.disabled = false;
    label.textContent = CONTENT[currentLang].aiPlan.pdfAllButton;
  } catch (err) {
    console.error('Plan PDF export failed:', err);
    label.textContent = CONTENT[currentLang].aiPlan.pdfAllError;
    setTimeout(() => {
      btn.disabled = false;
      label.textContent = CONTENT[currentLang].aiPlan.pdfAllButton;
    }, 3000);
  } finally {
    statusEl.hidden = true;
  }
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const SEND_PLAN_EMAIL_ERROR_KEY_MAP = {
  payment_required: 'paymentRequired',
  payment_mismatch: 'paymentMismatch',
  email_cap_reached: 'capReached',
  rate_limited: 'rateLimited',
};

async function handleSendPlanEmail(event) {
  event.preventDefault();
  if (!currentPaidSessionId || !lastPlanData || !lastResults) return;

  const emailInput = document.getElementById('plan-email-input');
  const errorEl = document.getElementById('plan-email-error');
  const statusEl = document.getElementById('plan-email-status');
  const submitBtn = document.getElementById('plan-email-submit-btn');
  const exportStatusEl = document.getElementById('plan-export-status');
  const exportStatusTextEl = document.getElementById('plan-export-status-text');
  const t = CONTENT[currentLang].planPage.email;

  const email = emailInput.value.trim();
  errorEl.textContent = '';
  statusEl.textContent = '';
  statusEl.removeAttribute('data-state');

  if (!validateEmail(email)) {
    errorEl.textContent = t.errors.invalidEmail;
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = t.sending;

  try {
    const stores = lastPlanData.stores || [];
    exportStatusEl.hidden = false;
    exportStatusTextEl.textContent = CONTENT[currentLang].aiPlan.recipesPreparing;
    await ensureAllRecipesLoaded(lastPlanData, stores, (done, total) => {
      exportStatusTextEl.textContent = CONTENT[currentLang].aiPlan.recipesPreparingProgress.replace('{done}', done).replace('{total}', total);
    });
    await loadPdfLibrary();
    const targets = { kcal: lastResults.target, protein: lastResults.protein, carbs: lastResults.carbs, fat: lastResults.fat };
    const doc = await buildPlanPdf(lastPlanData, targets, currentLang);
    // 'base64' nu e un tip de output suportat de build-ul vendorizat (verificat direct în
    // sursă) — doar 'datauristring', de unde trebuie scos manual prefixul "data:...;base64,".
    const pdfBase64 = doc.output('datauristring').split(',')[1];

    const res = await fetch(SEND_PLAN_EMAIL_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        paymentSessionId: currentPaidSessionId,
        email,
        lang: currentLang,
        goal: lastResults.goal,
        targetKcal: lastResults.target,
        targetProtein: lastResults.protein,
        targetCarbs: lastResults.carbs,
        targetFat: lastResults.fat,
        excludedTags: getSelectedAllergens(document.getElementById('plan-form')),
        stores,
        pdfBase64,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const key = SEND_PLAN_EMAIL_ERROR_KEY_MAP[body.error];
      statusEl.textContent = (key && t.errors[key]) || t.errors.generic;
      statusEl.setAttribute('data-state', 'error');
      return;
    }

    statusEl.textContent = t.success;
    statusEl.setAttribute('data-state', 'success');
    emailInput.value = '';
  } catch (err) {
    statusEl.textContent = t.errors.generic;
    statusEl.setAttribute('data-state', 'error');
  } finally {
    submitBtn.disabled = false;
    exportStatusEl.hidden = true;
  }
}

async function handlePlanGenerate(bypassCache = false) {
  if (!lastResults) return;

  planRenderToken += 1;

  recipeCache.clear();
  closeRecipeDialog();

  const form = document.getElementById('plan-form');
  const allergens = getSelectedAllergens(form);
  const dislikes = form.dislikes.value.trim();
  const stores = getSelectedStores(form);

  const generateBtn = document.getElementById('plan-generate-btn');
  const regenerateBtn = document.getElementById('plan-regenerate-btn');
  const loadingEl = document.getElementById('plan-loading');
  const loadingTextEl = document.getElementById('plan-loading-text');
  const loadingAnnounceEl = document.getElementById('plan-loading-announce');
  const outputEl = document.getElementById('plan-output');
  const accordionEl = document.getElementById('plan-accordion');
  const errorEl = document.getElementById('plan-error');
  const t = CONTENT[currentLang].aiPlan;

  if (stores.length === 0) {
    errorEl.textContent = t.storesRequiredError;
    return;
  }

  // Salvat abia după validare — nu vrem să lăsăm o revenire ulterioară cu magazine 0 bifate.
  saveAllergyPrefs(allergens, stores, dislikes);

  if (!currentPaidSessionId) {
    await openPaymentModal();
    return;
  }

  generateBtn.disabled = true;
  regenerateBtn.disabled = true;
  errorEl.textContent = '';
  accordionEl.innerHTML = '';
  mealIndex.clear();
  outputEl.hidden = true;
  loadingEl.hidden = false;
  loadingTextEl.textContent = t.loadingSteps[0];
  loadingAnnounceEl.textContent = t.generatingAnnounce;

  let stepIndex = 0;
  const stepInterval = setInterval(() => {
    stepIndex = (stepIndex + 1) % t.loadingSteps.length;
    loadingTextEl.textContent = t.loadingSteps[stepIndex];
  }, 2800);

  const targets = {
    kcal: lastResults.target,
    protein: lastResults.protein,
    carbs: lastResults.carbs,
    fat: lastResults.fat,
  };

  let daysReceived = 0;
  const onDay = (day, count) => {
    clearInterval(stepInterval);
    daysReceived = count;
    outputEl.hidden = false;
    appendPlanDay(day, count - 1);
    const progressText = t.streamingProgress.replace('{n}', count);
    loadingTextEl.textContent = progressText;
    loadingAnnounceEl.textContent = progressText;
  };

  const plan = await generatePlan(targets, lastResults.goal, allergens, dislikes, stores, bypassCache, onDay, currentPaidSessionId);
  clearInterval(stepInterval);
  loadingEl.hidden = true;
  generateBtn.disabled = false;

  if (plan && plan.paymentRequired) {
    outputEl.hidden = true;
    clearStoredPaidSessionId();
    updatePlanPageState();
    errorEl.textContent = plan.reason === 'payment_mismatch' ? t.paywall.paymentMismatchError : '';
    await openPaymentModal();
    return;
  }

  if (!plan) {
    outputEl.hidden = true;
    errorEl.textContent = t.emptyPoolError;
    return;
  }

  lastPlanData = plan;
  lastPlanData.stores = stores;
  lastPlanData.translatedLangs = new Set([lastPlanData.lang || currentLang]);
  if (daysReceived === 0) renderPlanAccordion(plan);
  outputEl.hidden = false;
  regenerateBtn.hidden = false;
  regenerateBtn.disabled = true;
  document.getElementById('plan-pdf-all-btn').hidden = false;
  document.getElementById('plan-email-card').hidden = false;
  setTimeout(() => { regenerateBtn.disabled = false; }, REGENERATE_COOLDOWN_MS);
}

// index.html — doar CTA-ul de plată; formularul/generarea trăiesc pe plan.html.
function initPaywallCard() {
  updateIndexPaywallState();
  document.getElementById('plan-unlock-btn').addEventListener('click', () => openPaymentModal());
}

// plan.html — formular, generare, rețete, export PDF, email.
function initPlanPage() {
  initPlanPageArrival();

  const form = document.getElementById('plan-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handlePlanGenerate(false);
  });

  document.getElementById('plan-regenerate-btn').addEventListener('click', () => handlePlanGenerate(true));
  document.getElementById('plan-pdf-all-btn').addEventListener('click', handleDownloadPlanPdf);
  document.getElementById('plan-email-form').addEventListener('submit', handleSendPlanEmail);
  initPlanAccordion();
  initRecipeDialog();
  initPaymentModal();
}

/* ---------- Plan de antrenament AI ---------- */
async function fetchWorkoutPlanFromApi(payload, onDay) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKOUT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(WORKOUT_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      let errorCode = 'upstream_failed';
      try {
        const errBody = await res.json();
        if (errBody && errBody.error) errorCode = errBody.error;
      } catch (e) { /* corp de răspuns nefolositor, păstrăm codul implicit */ }
      return { error: errorCode };
    }
    if (!res.body) return { error: 'upstream_failed' };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const days = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch (e) { continue; }
        if (obj.error) return days.length ? { days, lang: payload.lang } : { error: obj.error };
        days.push(obj);
        if (onDay) onDay(obj, days.length);
      }
    }
    return days.length ? { days, lang: payload.lang } : { error: 'upstream_failed' };
  } catch (err) {
    return { error: err && err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateWorkoutPlan(formValues, onDay, bypassCache = false) {
  const payload = {
    goal: formValues.goal,
    days: formValues.days,
    equipment: formValues.equipment,
    experience: formValues.experience,
    injuriesText: formValues.injuries,
    lang: currentLang,
    skipCache: Boolean(bypassCache),
  };
  return fetchWorkoutPlanFromApi(payload, onDay);
}

async function translateWorkoutPlanMeals(planData, targetLang) {
  if (inFlightWorkoutTranslation && inFlightWorkoutTranslation.planData === planData && inFlightWorkoutTranslation.lang === targetLang) {
    return inFlightWorkoutTranslation.promise;
  }

  const promise = (async () => {
    const items = [];
    planData.days.forEach((day) => {
      items.push(day.focus[planData.lang]);
      day.exercises.forEach((ex) => {
        items.push(ex.notes[planData.lang]);
      });
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WORKOUT_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(TRANSLATE_WORKOUT_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetLang, items }),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !Array.isArray(data.items) || data.items.length !== items.length) return false;

      let i = 0;
      planData.days.forEach((day) => {
        const translatedFocus = data.items[i]; i += 1;
        if (typeof translatedFocus === 'string') day.focus[targetLang] = translatedFocus;
        day.exercises.forEach((ex) => {
          const translatedNotes = data.items[i]; i += 1;
          if (typeof translatedNotes === 'string') ex.notes[targetLang] = translatedNotes;
        });
      });

      if (!planData.translatedLangs) planData.translatedLangs = new Set([planData.lang]);
      planData.translatedLangs.add(targetLang);
      return true;
    } catch (err) {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  inFlightWorkoutTranslation = { planData, lang: targetLang, promise };
  try {
    return await promise;
  } finally {
    if (inFlightWorkoutTranslation && inFlightWorkoutTranslation.promise === promise) inFlightWorkoutTranslation = null;
  }
}

async function translateAndRenderWorkoutPlan(lang) {
  const planData = lastWorkoutPlanData;
  workoutPlanRenderToken += 1;
  const myToken = workoutPlanRenderToken;

  const t = CONTENT[lang].aiWorkoutPlan;
  const loadingEl = document.getElementById('workout-plan-loading');
  const loadingTextEl = document.getElementById('workout-plan-loading-text');
  const loadingAnnounceEl = document.getElementById('workout-plan-loading-announce');
  const outputEl = document.getElementById('workout-plan-output');
  const errorEl = document.getElementById('workout-plan-error');

  errorEl.textContent = '';
  outputEl.hidden = true;
  loadingEl.hidden = false;
  loadingTextEl.textContent = t.translatingText;
  loadingAnnounceEl.textContent = t.translatingText;

  const ok = await translateWorkoutPlanMeals(planData, lang);

  if (myToken !== workoutPlanRenderToken) return;

  loadingEl.hidden = true;

  if (!ok) {
    errorEl.textContent = t.translateError;
    return;
  }

  outputEl.hidden = false;
  renderWorkoutPlanAccordion(lastWorkoutPlanData);
}

function buildWorkoutDayElement(day, dayIndex) {
  const t = CONTENT[currentLang].aiWorkoutPlan;
  const et = CONTENT[currentLang].exercises;
  const itemEl = document.createElement('div');
  itemEl.className = 'accordion-item';
  const triggerId = `workout-trigger-${dayIndex}`;
  const panelId = `workout-panel-${dayIndex}`;

  const rowsHtml = day.exercises.map((ex) => {
    const catalogExercise = EXERCISES.find((e) => e.id === ex.exerciseId);
    const displayName = catalogExercise ? catalogExercise.name[currentLang] : ex.exerciseId;
    const muscleGroup = catalogExercise ? catalogExercise.muscleGroup : '';
    const muscleLabel = et.muscles[muscleGroup] || muscleGroup;
    const notes = ex.notes[currentLang];
    return `
      <div class="plan-meal-row">
        <div class="plan-meal-text">
          <span class="plan-meal-name">${displayName}</span>
          <span class="plan-meal-desc">${muscleLabel}${notes ? ' · ' + notes : ''}</span>
        </div>
        <span class="plan-meal-macros">${ex.sets} × ${ex.reps} · ${t.restLabel} ${ex.restSeconds}s</span>
        <button type="button" class="recipe-btn workout-crosslink-btn" data-exercise-id="${ex.exerciseId}" data-muscle="${muscleGroup}" data-day-index="${dayIndex}">${t.viewExercisesButton}</button>
      </div>`;
  }).join('');

  itemEl.innerHTML = `
    <h3>
      <button type="button" class="accordion-trigger" id="${triggerId}" aria-expanded="false" aria-controls="${panelId}">
        <span>${t.dayLabel} ${day.day} · ${day.focus[currentLang]}</span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </h3>
    <div class="accordion-panel" id="${panelId}" role="region" aria-labelledby="${triggerId}">
      <div class="inner">
        ${rowsHtml}
      </div>
    </div>
  `;
  return itemEl;
}

function appendWorkoutDay(day, dayIndex) {
  document.getElementById('workout-plan-accordion').appendChild(buildWorkoutDayElement(day, dayIndex));
}

function renderWorkoutPlanAccordion(planData) {
  const container = document.getElementById('workout-plan-accordion');
  const openIndex = container.dataset.openIndex;
  container.innerHTML = '';

  planData.days.forEach((day, dayIndex) => {
    container.appendChild(buildWorkoutDayElement(day, dayIndex));
  });

  if (openIndex != null) {
    const trigger = container.querySelector(`#workout-trigger-${openIndex}`);
    if (trigger) toggleAccordionItem(trigger, container, Number(openIndex));
  }
}

function initWorkoutPlanAccordion() {
  const container = document.getElementById('workout-plan-accordion');
  container.addEventListener('click', (e) => {
    const crosslinkBtn = e.target.closest('.workout-crosslink-btn');
    if (crosslinkBtn) {
      openExerciseList(crosslinkBtn.dataset.muscle, {
        highlightExerciseId: crosslinkBtn.dataset.exerciseId,
        returnToDayIndex: Number(crosslinkBtn.dataset.dayIndex),
      });
      return;
    }
    const trigger = e.target.closest('.accordion-trigger');
    if (!trigger) return;
    const index = Array.from(container.querySelectorAll('.accordion-trigger')).indexOf(trigger);
    toggleAccordionItem(trigger, container, index);
  });
}

function validateWorkoutForm(form) {
  const t = CONTENT[currentLang].validation;
  const errors = {};

  const goal = form.querySelector('input[name="workoutGoal"]:checked');
  if (!goal) errors.workoutGoal = t.selectGoal;

  const days = form.querySelector('input[name="workoutDays"]:checked');
  if (!days) errors.workoutDays = t.required;

  const equipment = form.querySelector('input[name="workoutEquipment"]:checked');
  if (!equipment) errors.workoutEquipment = t.required;

  const experience = form.querySelector('input[name="workoutExperience"]:checked');
  if (!experience) errors.workoutExperience = t.required;

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    values: valid ? {
      goal: goal.value,
      days: Number(days.value),
      equipment: equipment.value,
      experience: experience.value,
      injuries: form.injuries.value.trim(),
    } : null,
  };
}

function renderWorkoutFormErrors(errors) {
  ['workoutGoal', 'workoutDays', 'workoutEquipment', 'workoutExperience'].forEach((field) => {
    const errorEl = document.getElementById(`${field}-error`);
    if (errorEl) errorEl.textContent = errors[field] || '';
  });
}

function getWorkoutErrorMessage(errorCode) {
  const t = CONTENT[currentLang].aiWorkoutPlan;
  if (errorCode === 'rate_limited') return t.rateLimitError;
  if (errorCode === 'timeout') return t.timeoutError;
  return t.emptyError;
}

async function handleWorkoutPlanGenerate(bypassCache = false) {
  const form = document.getElementById('workout-plan-form');
  const { valid, errors, values } = validateWorkoutForm(form);
  renderWorkoutFormErrors(errors);
  if (!valid) return;

  workoutPlanRenderToken += 1;

  const generateBtn = document.getElementById('workout-plan-generate-btn');
  const regenerateBtn = document.getElementById('workout-plan-regenerate-btn');
  const loadingEl = document.getElementById('workout-plan-loading');
  const loadingTextEl = document.getElementById('workout-plan-loading-text');
  const loadingAnnounceEl = document.getElementById('workout-plan-loading-announce');
  const outputEl = document.getElementById('workout-plan-output');
  const accordionEl = document.getElementById('workout-plan-accordion');
  const errorEl = document.getElementById('workout-plan-error');
  const t = CONTENT[currentLang].aiWorkoutPlan;

  generateBtn.disabled = true;
  regenerateBtn.disabled = true;
  errorEl.textContent = '';
  accordionEl.innerHTML = '';
  outputEl.hidden = true;
  loadingEl.hidden = false;
  loadingTextEl.textContent = t.loadingSteps[0];
  loadingAnnounceEl.textContent = t.generatingAnnounce;

  let stepIndex = 0;
  const stepInterval = setInterval(() => {
    stepIndex = (stepIndex + 1) % t.loadingSteps.length;
    loadingTextEl.textContent = t.loadingSteps[stepIndex];
  }, 2800);

  let daysReceived = 0;
  const onDay = (day, count) => {
    clearInterval(stepInterval);
    daysReceived = count;
    outputEl.hidden = false;
    appendWorkoutDay(day, count - 1);
    const progressText = t.streamingProgress.replace('{n}', count).replace('{total}', values.days);
    loadingTextEl.textContent = progressText;
    loadingAnnounceEl.textContent = progressText;
  };

  const plan = await generateWorkoutPlan(values, onDay, bypassCache);
  clearInterval(stepInterval);
  loadingEl.hidden = true;
  generateBtn.disabled = false;

  if (!plan || plan.error) {
    outputEl.hidden = true;
    errorEl.textContent = getWorkoutErrorMessage(plan && plan.error);
    return;
  }

  lastWorkoutPlanData = plan;
  lastWorkoutPlanData.translatedLangs = new Set([lastWorkoutPlanData.lang || currentLang]);
  if (daysReceived === 0) renderWorkoutPlanAccordion(plan);
  outputEl.hidden = false;
  regenerateBtn.hidden = false;
  regenerateBtn.disabled = true;
  setTimeout(() => { regenerateBtn.disabled = false; }, REGENERATE_COOLDOWN_MS);
}

function initAiWorkoutPlanSection() {
  const form = document.getElementById('workout-plan-form');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleWorkoutPlanGenerate(false);
  });

  form.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const errorEl = document.getElementById(`${radio.name}-error`);
      if (errorEl) errorEl.textContent = '';
    });
  });

  document.getElementById('workout-plan-regenerate-btn').addEventListener('click', () => handleWorkoutPlanGenerate(true));
  initWorkoutPlanAccordion();
}

/* ---------- Bootstrap ---------- */
function init() {
  initHamburger();
  initLanguageToggle();

  const page = document.body.dataset.page;
  if (page === 'plan') {
    initPlanPage();
  } else {
    initNavigation();
    initAccordion();
    initForm();
    initPaywallCard();
    initPaymentModal();
    initBodyMap();
    initAiWorkoutPlanSection();
  }

  applyLanguage(currentLang);
}

document.addEventListener('DOMContentLoaded', init);
