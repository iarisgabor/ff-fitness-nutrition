'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
const PLAN_MAX_TOKENS = 20000;
const PLAN_DAY_COUNT = 7;
const PLAN_CACHE_VERSION = 'v2'; // v2: bucket-uri mai late + pool mai mare, ca sa creasca rata de cache-hit
const PLAN_CACHE_POOL_SIZE = 12;
const PLAN_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 zile
const RECIPE_MAX_TOKENS = 1500;
const PLAN_RATE_LIMIT_PER_HOUR = 8;
const RECIPE_RATE_LIMIT_PER_HOUR = 30;
const TRANSLATE_MAX_TOKENS = 4000;
const TRANSLATE_RATE_LIMIT_PER_HOUR = 20;
const TRANSLATE_MEALS_MAX = 40;
const WORKOUT_PLAN_MAX_TOKENS = 8000;
const WORKOUT_RATE_LIMIT_PER_HOUR = 20;
const TRANSLATE_WORKOUT_RATE_LIMIT_PER_HOUR = 20;
const TRANSLATE_WORKOUT_ITEMS_MAX = 150;
const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const CHECKOUT_PRICE_USD_CENTS = 500;
const CHECKOUT_RATE_LIMIT_PER_HOUR = 20;
const PAID_SESSION_KV_PREFIX = 'paid_session:';
const WORKOUT_MUSCLE_GROUPS = ['chest', 'shoulders', 'biceps', 'forearms', 'abs', 'quads', 'calves', 'back', 'traps', 'triceps', 'glutes', 'hamstrings'];

// Catalog minimal (id, grupă musculară, echipament, nume EN) al exercițiilor curate din
// exercises-data.js (frontend) — trebuie ținut sincronizat manual cu acel fișier, nu există
// build/import comun între site-ul static și acest Worker. Folosit ca material de referință
// în prompt și ca enum pentru schema JSON, ca AI-ul să aleagă DOAR exerciții reale, curate,
// cu videoclip — nu să inventeze nume libere care nu se potrivesc cu nimic din catalog.
const EXERCISE_CATALOG = [
  { id: 'chest-barbell-bench-press', muscleGroup: 'chest', equipment: 'barbell', name: 'Barbell Bench Press' },
  { id: 'chest-incline-dumbbell-press', muscleGroup: 'chest', equipment: 'dumbbell', name: 'Incline Dumbbell Press' },
  { id: 'chest-push-up', muscleGroup: 'chest', equipment: 'bodyweight', name: 'Push-Up' },
  { id: 'chest-cable-fly', muscleGroup: 'chest', equipment: 'cable', name: 'Cable Fly' },
  { id: 'shoulders-overhead-press', muscleGroup: 'shoulders', equipment: 'barbell', name: 'Overhead Press' },
  { id: 'shoulders-lateral-raise', muscleGroup: 'shoulders', equipment: 'dumbbell', name: 'Lateral Raise' },
  { id: 'shoulders-front-raise', muscleGroup: 'shoulders', equipment: 'dumbbell', name: 'Front Raise' },
  { id: 'shoulders-face-pull', muscleGroup: 'shoulders', equipment: 'cable', name: 'Face Pull' },
  { id: 'biceps-barbell-curl', muscleGroup: 'biceps', equipment: 'barbell', name: 'Barbell Curl' },
  { id: 'biceps-dumbbell-curl', muscleGroup: 'biceps', equipment: 'dumbbell', name: 'Dumbbell Curl' },
  { id: 'biceps-hammer-curl', muscleGroup: 'biceps', equipment: 'dumbbell', name: 'Hammer Curl' },
  { id: 'biceps-cable-curl', muscleGroup: 'biceps', equipment: 'cable', name: 'Cable Curl' },
  { id: 'forearms-wrist-curl', muscleGroup: 'forearms', equipment: 'dumbbell', name: 'Wrist Curl' },
  { id: 'forearms-reverse-curl', muscleGroup: 'forearms', equipment: 'barbell', name: 'Reverse Curl' },
  { id: 'forearms-farmers-carry', muscleGroup: 'forearms', equipment: 'dumbbell', name: "Farmer's Carry" },
  { id: 'forearms-dead-hang', muscleGroup: 'forearms', equipment: 'bodyweight', name: 'Dead Hang' },
  { id: 'abs-plank', muscleGroup: 'abs', equipment: 'bodyweight', name: 'Plank' },
  { id: 'abs-crunch', muscleGroup: 'abs', equipment: 'bodyweight', name: 'Crunch' },
  { id: 'abs-leg-raise', muscleGroup: 'abs', equipment: 'bodyweight', name: 'Leg Raise' },
  { id: 'abs-russian-twist', muscleGroup: 'abs', equipment: 'bodyweight', name: 'Russian Twist' },
  { id: 'quads-back-squat', muscleGroup: 'quads', equipment: 'barbell', name: 'Back Squat' },
  { id: 'quads-leg-press', muscleGroup: 'quads', equipment: 'machine', name: 'Leg Press' },
  { id: 'quads-walking-lunge', muscleGroup: 'quads', equipment: 'dumbbell', name: 'Walking Lunge' },
  { id: 'quads-leg-extension', muscleGroup: 'quads', equipment: 'machine', name: 'Leg Extension' },
  { id: 'calves-standing-calf-raise', muscleGroup: 'calves', equipment: 'machine', name: 'Standing Calf Raise' },
  { id: 'calves-seated-calf-raise', muscleGroup: 'calves', equipment: 'machine', name: 'Seated Calf Raise' },
  { id: 'calves-single-leg-calf-raise', muscleGroup: 'calves', equipment: 'bodyweight', name: 'Single-Leg Calf Raise' },
  { id: 'calves-dumbbell-calf-raise', muscleGroup: 'calves', equipment: 'dumbbell', name: 'Dumbbell Calf Raise' },
  { id: 'back-pull-up', muscleGroup: 'back', equipment: 'bodyweight', name: 'Pull-Up' },
  { id: 'back-barbell-row', muscleGroup: 'back', equipment: 'barbell', name: 'Barbell Row' },
  { id: 'back-lat-pulldown', muscleGroup: 'back', equipment: 'machine', name: 'Lat Pulldown' },
  { id: 'back-seated-cable-row', muscleGroup: 'back', equipment: 'cable', name: 'Seated Cable Row' },
  { id: 'traps-barbell-shrug', muscleGroup: 'traps', equipment: 'barbell', name: 'Barbell Shrug' },
  { id: 'traps-dumbbell-shrug', muscleGroup: 'traps', equipment: 'dumbbell', name: 'Dumbbell Shrug' },
  { id: 'traps-upright-row', muscleGroup: 'traps', equipment: 'barbell', name: 'Upright Row' },
  { id: 'traps-farmers-carry-traps', muscleGroup: 'traps', equipment: 'dumbbell', name: "Farmer's Carry (Trap Focus)" },
  { id: 'triceps-close-grip-bench-press', muscleGroup: 'triceps', equipment: 'barbell', name: 'Close-Grip Bench Press' },
  { id: 'triceps-pushdown', muscleGroup: 'triceps', equipment: 'cable', name: 'Triceps Pushdown' },
  { id: 'triceps-overhead-extension', muscleGroup: 'triceps', equipment: 'dumbbell', name: 'Overhead Triceps Extension' },
  { id: 'triceps-dip', muscleGroup: 'triceps', equipment: 'bodyweight', name: 'Dip' },
  { id: 'glutes-hip-thrust', muscleGroup: 'glutes', equipment: 'barbell', name: 'Hip Thrust' },
  { id: 'glutes-glute-bridge', muscleGroup: 'glutes', equipment: 'bodyweight', name: 'Glute Bridge' },
  { id: 'glutes-bulgarian-split-squat', muscleGroup: 'glutes', equipment: 'dumbbell', name: 'Bulgarian Split Squat' },
  { id: 'glutes-cable-kickback', muscleGroup: 'glutes', equipment: 'cable', name: 'Cable Kickback' },
  { id: 'hamstrings-romanian-deadlift', muscleGroup: 'hamstrings', equipment: 'barbell', name: 'Romanian Deadlift' },
  { id: 'hamstrings-leg-curl', muscleGroup: 'hamstrings', equipment: 'machine', name: 'Leg Curl' },
  { id: 'hamstrings-good-morning', muscleGroup: 'hamstrings', equipment: 'barbell', name: 'Good Morning' },
  { id: 'hamstrings-nordic-curl', muscleGroup: 'hamstrings', equipment: 'bodyweight', name: 'Nordic Hamstring Curl' },
];
const WORKOUT_EXERCISE_IDS = EXERCISE_CATALOG.map((e) => e.id);
const WORKOUT_CACHE_VERSION = 'v2'; // v2: schema exercises[] foloseste exerciseId (catalog) în loc de name liber
const WORKOUT_CACHE_POOL_SIZE = 5;
const WORKOUT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 zile

// Cele 6 lanțuri de magazine selectabile la generarea planului alimentar.
const STORES = [
  { id: 'lidl', name: 'Lidl' },
  { id: 'kaufland', name: 'Kaufland' },
  { id: 'profi', name: 'Profi' },
  { id: 'mega-image', name: 'Mega Image' },
  { id: 'carrefour', name: 'Carrefour' },
  { id: 'auchan', name: 'Auchan' },
];
const STORE_IDS = STORES.map((s) => s.id);

// Catalog fix de produse per magazin (valori nutriționale per 100g), curatat manual — nu
// date scrapuite/live de preț sau stoc. Ținut sincronizat manual, ca la EXERCISE_CATALOG mai
// jos: nu există build/import comun cu alt fișier. Folosit ca să limităm generarea planului
// alimentar doar la produse plauzibile pentru magazinele bifate de utilizator.
const STORE_PRODUCT_CATALOG = [
  // Lidl
  { store: 'lidl', name: 'Piept de pui (Lidl)', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { store: 'lidl', name: 'Somon la cuptor (Lidl)', kcal: 206, protein: 22.1, carbs: 0, fat: 12.35 },
  { store: 'lidl', name: 'Ouă clasa M (Lidl)', kcal: 143, protein: 12.6, carbs: 0.72, fat: 9.51 },
  { store: 'lidl', name: 'Carne tocată de vită, slabă (Lidl)', kcal: 155, protein: 21.7, carbs: 0, fat: 6.8 },
  { store: 'lidl', name: 'Iaurt natural stil grecesc 2% (Milbona)', kcal: 75, protein: 9, carbs: 4, fat: 2 },
  { store: 'lidl', name: 'Brânză cottage (Milbona)', kcal: 81, protein: 10.45, carbs: 4.76, fat: 2.3 },
  { store: 'lidl', name: 'Lapte 1.5% (Milbona)', kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 },
  { store: 'lidl', name: 'Orez brun (Vitasia)', kcal: 123, protein: 2.74, carbs: 25.6, fat: 0.97 },
  { store: 'lidl', name: 'Quinoa (Lidl)', kcal: 120, protein: 4.4, carbs: 21.3, fat: 1.9 },
  { store: 'lidl', name: 'Fulgi de ovăz (Lidl)', kcal: 379, protein: 13.15, carbs: 67.7, fat: 6.52 },
  { store: 'lidl', name: 'Pâine integrală (Lidl)', kcal: 252, protein: 12.45, carbs: 42.71, fat: 3.5 },
  { store: 'lidl', name: 'Mix legume congelate (Freshona)', kcal: 65, protein: 2.86, carbs: 13.09, fat: 0.15 },
  { store: 'lidl', name: 'Fructe de pădure congelate (Freshona)', kcal: 57, protein: 0.7, carbs: 13.5, fat: 0.3 },
  { store: 'lidl', name: 'Migdale crude (Alesto)', kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9 },
  { store: 'lidl', name: 'Ulei de măsline extravirgin (Lidl)', kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { store: 'lidl', name: 'Mușchiuleț de porc (Lidl)', kcal: 143, protein: 26, carbs: 0, fat: 3.5 },
  { store: 'lidl', name: 'Castraveți proaspeți (Lidl)', kcal: 15, protein: 0.65, carbs: 3.6, fat: 0.11 },
  { store: 'lidl', name: 'Roșii proaspete (Lidl)', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { store: 'lidl', name: 'Ardei gras (Lidl)', kcal: 20, protein: 0.86, carbs: 4.64, fat: 0.17 },
  { store: 'lidl', name: 'Portocale (Lidl)', kcal: 47, protein: 0.94, carbs: 11.75, fat: 0.12 },
  { store: 'lidl', name: 'Cuș-cuș fiert (Vitasia)', kcal: 112, protein: 3.79, carbs: 23.2, fat: 0.16 },
  // Kaufland
  { store: 'kaufland', name: 'Piept de pui (K-Classic)', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { store: 'kaufland', name: 'Piept de curcan (K-Classic)', kcal: 135, protein: 30, carbs: 0, fat: 1 },
  { store: 'kaufland', name: 'File de cod la cuptor (K-Favourites)', kcal: 105, protein: 23, carbs: 0, fat: 1 },
  { store: 'kaufland', name: 'Ouă (K-Bio)', kcal: 143, protein: 12.6, carbs: 0.72, fat: 9.51 },
  { store: 'kaufland', name: 'Iaurt natural stil grecesc 2% (K-Classic)', kcal: 75, protein: 9, carbs: 4, fat: 2 },
  { store: 'kaufland', name: 'Telemea (K-Classic)', kcal: 264, protein: 14, carbs: 4, fat: 21 },
  { store: 'kaufland', name: 'Lapte 1.5% (K-Classic)', kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 },
  { store: 'kaufland', name: 'Orez alb (K-Classic)', kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  { store: 'kaufland', name: 'Paste integrale (K-take it veggie)', kcal: 124, protein: 5, carbs: 25, fat: 1.1 },
  { store: 'kaufland', name: 'Cartofi dulci (Kaufland)', kcal: 90, protein: 2.01, carbs: 20.71, fat: 0.15 },
  { store: 'kaufland', name: 'Pâine integrală (K-Classic)', kcal: 252, protein: 12.45, carbs: 42.71, fat: 3.5 },
  { store: 'kaufland', name: 'Broccoli congelat (K-take it veggie)', kcal: 35, protein: 2.4, carbs: 7.2, fat: 0.4 },
  { store: 'kaufland', name: 'Năut fiert, conservă (K-Bio)', kcal: 164, protein: 8.9, carbs: 27.4, fat: 2.6 },
  { store: 'kaufland', name: 'Miez de nucă (K-Favourites)', kcal: 654, protein: 15.2, carbs: 13.7, fat: 65.2 },
  { store: 'kaufland', name: 'Miere (K-Bio)', kcal: 304, protein: 0.3, carbs: 82.4, fat: 0 },
  { store: 'kaufland', name: 'Mușchiuleț de porc (K-Classic)', kcal: 143, protein: 26, carbs: 0, fat: 3.5 },
  { store: 'kaufland', name: 'Castraveți proaspeți (Kaufland)', kcal: 15, protein: 0.65, carbs: 3.6, fat: 0.11 },
  { store: 'kaufland', name: 'Roșii proaspete (Kaufland)', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { store: 'kaufland', name: 'Ardei gras (Kaufland)', kcal: 20, protein: 0.86, carbs: 4.64, fat: 0.17 },
  { store: 'kaufland', name: 'Portocale (Kaufland)', kcal: 47, protein: 0.94, carbs: 11.75, fat: 0.12 },
  { store: 'kaufland', name: 'Cuș-cuș fiert (K-Classic)', kcal: 112, protein: 3.79, carbs: 23.2, fat: 0.16 },
  // Profi
  { store: 'profi', name: 'Piept de pui (Profi)', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { store: 'profi', name: 'Carne tocată de porc slabă (Profi)', kcal: 155, protein: 21.7, carbs: 0, fat: 6.8 },
  { store: 'profi', name: 'Somon afumat (Profi)', kcal: 117, protein: 18.3, carbs: 0, fat: 4.3 },
  { store: 'profi', name: 'Ouă clasa M (Profi)', kcal: 143, protein: 12.6, carbs: 0.72, fat: 9.51 },
  { store: 'profi', name: 'Iaurt natural stil grecesc 2% (Profi)', kcal: 75, protein: 9, carbs: 4, fat: 2 },
  { store: 'profi', name: 'Brânză cottage (Profi)', kcal: 81, protein: 10.45, carbs: 4.76, fat: 2.3 },
  { store: 'profi', name: 'Lapte 1.5% (Profi)', kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 },
  { store: 'profi', name: 'Orez alb (Profi)', kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  { store: 'profi', name: 'Fulgi de ovăz (Profi)', kcal: 379, protein: 13.15, carbs: 67.7, fat: 6.52 },
  { store: 'profi', name: 'Cartofi (Profi)', kcal: 93, protein: 2.5, carbs: 21.1, fat: 0.13 },
  { store: 'profi', name: 'Pâine integrală (Profi)', kcal: 252, protein: 12.45, carbs: 42.71, fat: 3.5 },
  { store: 'profi', name: 'Spanac congelat (Profi)', kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
  { store: 'profi', name: 'Mere (Profi)', kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
  { store: 'profi', name: 'Fasole neagră fiartă, conservă (Profi)', kcal: 132, protein: 8.86, carbs: 23.71, fat: 0.54 },
  { store: 'profi', name: 'Ulei de măsline (Profi)', kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { store: 'profi', name: 'Mușchiuleț de porc (Profi)', kcal: 143, protein: 26, carbs: 0, fat: 3.5 },
  { store: 'profi', name: 'Castraveți proaspeți (Profi)', kcal: 15, protein: 0.65, carbs: 3.6, fat: 0.11 },
  { store: 'profi', name: 'Roșii proaspete (Profi)', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { store: 'profi', name: 'Ardei gras (Profi)', kcal: 20, protein: 0.86, carbs: 4.64, fat: 0.17 },
  { store: 'profi', name: 'Portocale (Profi)', kcal: 47, protein: 0.94, carbs: 11.75, fat: 0.12 },
  { store: 'profi', name: 'Cuș-cuș fiert (Profi)', kcal: 112, protein: 3.79, carbs: 23.2, fat: 0.16 },
  // Mega Image
  { store: 'mega-image', name: 'Piept de pui (Mega Image)', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { store: 'mega-image', name: 'Piept de curcan (Mega Image)', kcal: 135, protein: 30, carbs: 0, fat: 1 },
  { store: 'mega-image', name: 'Somon la cuptor (Mega Image)', kcal: 206, protein: 22.1, carbs: 0, fat: 12.35 },
  { store: 'mega-image', name: 'Ouă clasa M (Mega Image)', kcal: 143, protein: 12.6, carbs: 0.72, fat: 9.51 },
  { store: 'mega-image', name: 'Iaurt natural stil grecesc 2% (Mega Image)', kcal: 75, protein: 9, carbs: 4, fat: 2 },
  { store: 'mega-image', name: 'Lapte 1.5% (Mega Image)', kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 },
  { store: 'mega-image', name: 'Orez brun (Mega Image)', kcal: 123, protein: 2.74, carbs: 25.6, fat: 0.97 },
  { store: 'mega-image', name: 'Paste integrale (Mega Image)', kcal: 124, protein: 5, carbs: 25, fat: 1.1 },
  { store: 'mega-image', name: 'Cartof dulce copt (Mega Image)', kcal: 90, protein: 2.01, carbs: 20.71, fat: 0.15 },
  { store: 'mega-image', name: 'Pâine integrală (Mega Image)', kcal: 252, protein: 12.45, carbs: 42.71, fat: 3.5 },
  { store: 'mega-image', name: 'Mix legume congelate (Mega Image)', kcal: 65, protein: 2.86, carbs: 13.09, fat: 0.15 },
  { store: 'mega-image', name: 'Banane (Mega Image)', kcal: 89, protein: 1.09, carbs: 22.8, fat: 0.33 },
  { store: 'mega-image', name: 'Linte fiartă, conservă (Mega Image)', kcal: 116, protein: 9.02, carbs: 20.13, fat: 0.38 },
  { store: 'mega-image', name: 'Migdale crude (Mega Image)', kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9 },
  { store: 'mega-image', name: 'Semințe de chia (Mega Image)', kcal: 486, protein: 16.5, carbs: 42.1, fat: 30.7 },
  { store: 'mega-image', name: 'Mușchiuleț de porc (Mega Image)', kcal: 143, protein: 26, carbs: 0, fat: 3.5 },
  { store: 'mega-image', name: 'Castraveți proaspeți (Mega Image)', kcal: 15, protein: 0.65, carbs: 3.6, fat: 0.11 },
  { store: 'mega-image', name: 'Roșii proaspete (Mega Image)', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { store: 'mega-image', name: 'Ardei gras (Mega Image)', kcal: 20, protein: 0.86, carbs: 4.64, fat: 0.17 },
  { store: 'mega-image', name: 'Portocale (Mega Image)', kcal: 47, protein: 0.94, carbs: 11.75, fat: 0.12 },
  { store: 'mega-image', name: 'Cuș-cuș fiert (Mega Image)', kcal: 112, protein: 3.79, carbs: 23.2, fat: 0.16 },
  // Carrefour
  { store: 'carrefour', name: "Piept de pui (Carrefour Classic')", kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { store: 'carrefour', name: 'File de cod la cuptor (Carrefour)', kcal: 105, protein: 23, carbs: 0, fat: 1 },
  { store: 'carrefour', name: 'Carne tocată de vită, slabă (Carrefour)', kcal: 155, protein: 21.7, carbs: 0, fat: 6.8 },
  { store: 'carrefour', name: 'Ouă (Carrefour Bio)', kcal: 143, protein: 12.6, carbs: 0.72, fat: 9.51 },
  { store: 'carrefour', name: 'Iaurt natural stil grecesc 2% (Carrefour)', kcal: 75, protein: 9, carbs: 4, fat: 2 },
  { store: 'carrefour', name: 'Brânză cottage (Carrefour)', kcal: 81, protein: 10.45, carbs: 4.76, fat: 2.3 },
  { store: 'carrefour', name: 'Lapte 1.5% (Carrefour Selection)', kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 },
  { store: 'carrefour', name: 'Quinoa (Carrefour Bio)', kcal: 120, protein: 4.4, carbs: 21.3, fat: 1.9 },
  { store: 'carrefour', name: 'Fulgi de ovăz (Carrefour Bio)', kcal: 379, protein: 13.15, carbs: 67.7, fat: 6.52 },
  { store: 'carrefour', name: 'Cartofi (Carrefour)', kcal: 93, protein: 2.5, carbs: 21.1, fat: 0.13 },
  { store: 'carrefour', name: 'Pâine integrală (Carrefour)', kcal: 252, protein: 12.45, carbs: 42.71, fat: 3.5 },
  { store: 'carrefour', name: 'Broccoli congelat (Carrefour)', kcal: 35, protein: 2.4, carbs: 7.2, fat: 0.4 },
  { store: 'carrefour', name: 'Mere (Carrefour)', kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
  { store: 'carrefour', name: 'Năut fiert, conservă (Carrefour Bio)', kcal: 164, protein: 8.9, carbs: 27.4, fat: 2.6 },
  { store: 'carrefour', name: 'Ulei de măsline (Carrefour Selection)', kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { store: 'carrefour', name: 'Mușchiuleț de porc (Carrefour)', kcal: 143, protein: 26, carbs: 0, fat: 3.5 },
  { store: 'carrefour', name: 'Castraveți proaspeți (Carrefour)', kcal: 15, protein: 0.65, carbs: 3.6, fat: 0.11 },
  { store: 'carrefour', name: 'Roșii proaspete (Carrefour)', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { store: 'carrefour', name: 'Ardei gras (Carrefour)', kcal: 20, protein: 0.86, carbs: 4.64, fat: 0.17 },
  { store: 'carrefour', name: 'Portocale (Carrefour)', kcal: 47, protein: 0.94, carbs: 11.75, fat: 0.12 },
  { store: 'carrefour', name: 'Cuș-cuș fiert (Carrefour)', kcal: 112, protein: 3.79, carbs: 23.2, fat: 0.16 },
  // Auchan
  { store: 'auchan', name: 'Piept de pui (Auchan)', kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { store: 'auchan', name: 'Piept de curcan (Auchan)', kcal: 135, protein: 30, carbs: 0, fat: 1 },
  { store: 'auchan', name: 'Somon la cuptor (Auchan)', kcal: 206, protein: 22.1, carbs: 0, fat: 12.35 },
  { store: 'auchan', name: 'Ouă clasa M (Auchan)', kcal: 143, protein: 12.6, carbs: 0.72, fat: 9.51 },
  { store: 'auchan', name: 'Carne tocată de vită, slabă (Auchan)', kcal: 155, protein: 21.7, carbs: 0, fat: 6.8 },
  { store: 'auchan', name: 'Iaurt natural stil grecesc 2% (Auchan)', kcal: 75, protein: 9, carbs: 4, fat: 2 },
  { store: 'auchan', name: 'Brânză cottage (Auchan)', kcal: 81, protein: 10.45, carbs: 4.76, fat: 2.3 },
  { store: 'auchan', name: 'Lapte 1.5% (Auchan)', kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 },
  { store: 'auchan', name: 'Orez alb (Auchan)', kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
  { store: 'auchan', name: 'Fulgi de ovăz (Auchan)', kcal: 379, protein: 13.15, carbs: 67.7, fat: 6.52 },
  { store: 'auchan', name: 'Cartofi dulci (Auchan)', kcal: 90, protein: 2.01, carbs: 20.71, fat: 0.15 },
  { store: 'auchan', name: 'Pâine integrală (Auchan)', kcal: 252, protein: 12.45, carbs: 42.71, fat: 3.5 },
  { store: 'auchan', name: 'Mix legume congelate (Auchan)', kcal: 65, protein: 2.86, carbs: 13.09, fat: 0.15 },
  { store: 'auchan', name: 'Năut fiert, conservă (Auchan)', kcal: 164, protein: 8.9, carbs: 27.4, fat: 2.6 },
  { store: 'auchan', name: 'Ulei de măsline (Auchan)', kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { store: 'auchan', name: 'Mușchiuleț de porc (Auchan)', kcal: 143, protein: 26, carbs: 0, fat: 3.5 },
  { store: 'auchan', name: 'Castraveți proaspeți (Auchan)', kcal: 15, protein: 0.65, carbs: 3.6, fat: 0.11 },
  { store: 'auchan', name: 'Roșii proaspete (Auchan)', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { store: 'auchan', name: 'Ardei gras (Auchan)', kcal: 20, protein: 0.86, carbs: 4.64, fat: 0.17 },
  { store: 'auchan', name: 'Portocale (Auchan)', kcal: 47, protein: 0.94, carbs: 11.75, fat: 0.12 },
  { store: 'auchan', name: 'Cuș-cuș fiert (Auchan)', kcal: 112, protein: 3.79, carbs: 23.2, fat: 0.16 },
];

function formatStoreProductTable(storeIds) {
  const ids = Array.isArray(storeIds) && storeIds.length ? storeIds : STORE_IDS;
  return STORE_PRODUCT_CATALOG
    .filter((p) => ids.includes(p.store))
    .map((p) => `${p.name}: ${p.kcal} kcal, ${p.protein}g protein, ${p.carbs}g carbs, ${p.fat}g fat / 100g`)
    .join('\n');
}

const SAMPLE_MEALS = [
  {
    ro: 'Ovăz cu iaurt și banană — 50g fulgi ovăz, 150g iaurt grecesc, banană, scorțișoară (370 kcal, 23g proteine, 62g carbo, 4g grăsimi)',
    en: 'Oats with yogurt and banana — 50g rolled oats, 150g Greek yogurt, banana, cinnamon (370 kcal, 23g protein, 62g carbs, 4g fat)',
  },
  {
    ro: 'Pui la grătar cu orez și legume — 150g piept de pui, 200g orez alb, 150g legume, ulei de măsline (645 kcal, 56g proteine, 76g carbo, 11g grăsimi)',
    en: 'Grilled chicken with rice and vegetables — 150g chicken breast, 200g white rice, 150g vegetables, olive oil (645 kcal, 56g protein, 76g carbs, 11g fat)',
  },
  {
    ro: 'Iaurt cu migdale — 150g iaurt grecesc, 10g migdale (149 kcal, 17g proteine, 8g carbo, 6g grăsimi)',
    en: 'Yogurt with almonds — 150g Greek yogurt, 10g almonds (149 kcal, 17g protein, 8g carbs, 6g fat)',
  },
];

const ALLERGEN_NAMES = {
  ro: { dairy: 'lactate', egg: 'ouă', fish: 'pește', shellfish: 'fructe de mare', treenut: 'nuci', peanut: 'arahide', gluten: 'gluten', soy: 'soia', sesame: 'susan' },
  en: { dairy: 'dairy', egg: 'eggs', fish: 'fish', shellfish: 'shellfish', treenut: 'tree nuts', peanut: 'peanuts', gluten: 'gluten', soy: 'soy', sesame: 'sesame' },
};

const GOAL_NAMES = {
  ro: { lose: 'slăbire', maintain: 'menținere', gain: 'masă musculară' },
  en: { lose: 'lose weight', maintain: 'maintain', gain: 'build muscle' },
};

const WORKOUT_GOAL_NAMES = {
  en: { lose_fat: 'lose fat', strength: 'build strength', build_muscle: 'build muscle', endurance: 'build endurance' },
};

const LANGUAGE_NAMES = { ro: 'Romanian', en: 'English' };

const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          meals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
                name: { type: 'string' },
                description: { type: 'string' },
                kcal: { type: 'number' },
                protein: { type: 'number' },
                carbs: { type: 'number' },
                fat: { type: 'number' },
              },
              required: ['slot', 'name', 'description', 'kcal', 'protein', 'carbs', 'fat'],
              additionalProperties: false,
            },
          },
          totalKcal: { type: 'number' },
          totalProtein: { type: 'number' },
          totalCarbs: { type: 'number' },
          totalFat: { type: 'number' },
        },
        required: ['day', 'meals', 'totalKcal', 'totalProtein', 'totalCarbs', 'totalFat'],
        additionalProperties: false,
      },
    },
  },
  required: ['days'],
  additionalProperties: false,
};

const RECIPE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    servings: { type: 'number' },
    prepMinutes: { type: 'number' },
    ingredients: {
      type: 'object',
      properties: {
        ro: { type: 'array', items: { type: 'string' } },
        en: { type: 'array', items: { type: 'string' } },
      },
      required: ['ro', 'en'],
      additionalProperties: false,
    },
    steps: {
      type: 'object',
      properties: {
        ro: { type: 'array', items: { type: 'string' } },
        en: { type: 'array', items: { type: 'string' } },
      },
      required: ['ro', 'en'],
      additionalProperties: false,
    },
  },
  required: ['servings', 'prepMinutes', 'ingredients', 'steps'],
  additionalProperties: false,
};

const TRANSLATE_MEALS_SCHEMA = {
  type: 'object',
  properties: {
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['meals'],
  additionalProperties: false,
};

const WORKOUT_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'integer' },
          focus: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                exerciseId: { type: 'string', enum: WORKOUT_EXERCISE_IDS },
                sets: { type: 'integer' },
                reps: { type: 'string' },
                restSeconds: { type: 'integer' },
                notes: { type: 'string' },
              },
              required: ['exerciseId', 'sets', 'reps', 'restSeconds', 'notes'],
              additionalProperties: false,
            },
          },
        },
        required: ['day', 'focus', 'exercises'],
        additionalProperties: false,
      },
    },
  },
  required: ['days'],
  additionalProperties: false,
};

const TRANSLATE_ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['items'],
  additionalProperties: false,
};

function buildSystemPrompt(lang, storeIds) {
  const languageName = LANGUAGE_NAMES[lang] || 'English';
  const sampleText = SAMPLE_MEALS.map((m) => `- ${m[lang] || m.en}`).join('\n');
  const productTable = formatStoreProductTable(storeIds);

  return `You are a nutrition assistant for FF Fitness. You compose realistic meal plans, based on home-cooked food (not restaurant dishes), for a user who gave you a daily calorie and macronutrient target.

STRICT RULES:
1. Calculate each meal's macros from the verified product table below (values per 100g) and the portions you choose — do not use memorized values for foods outside this table.
2. Every ingredient used in a meal must be one of the products listed in the table below — never invent or use a food that isn't in the table, since it only lists products available at the stores the user selected.
3. Each day's total must be close to the given target (within ±10%).
4. Vary the meals aggressively across the 7 days: never repeat the exact same meal (same name and same ingredient combination) twice in the plan, and avoid pairing the same two main ingredients together more than once — instead recombine the product table into different pairings, proportions, and preparation styles (e.g. grilled vs. baked, different vegetable/side pairings, different breakfast bases) each time, even though the product table itself is limited. Before finalizing, mentally scan the full list of meal names across all 7 days — if any two are identical or near-identical, replace one of them with a different combination.
5. For EVERY meal, write the name and description in ${languageName} only. Use realistic portions (don't invent absurd quantities).
6. STRICTLY respect the allergen exclusions given by the user — no meal may contain those ingredients.
7. Each day must include breakfast, lunch, and dinner (slot values 'breakfast'/'lunch'/'dinner'), plus 0-2 snacks ('snack') depending on how much extra the calorie target requires.
8. Number each day's "day" field sequentially from 1 to 7.

AVAILABLE PRODUCTS (per 100g) — from the stores the user selected:
${productTable}

STYLE/PORTION EXAMPLES (reference only, not mandatory to copy):
${sampleText}

Respond ONLY with the structured plan per the requested JSON schema.`;
}

function buildUserMessage(payload) {
  const allergenNames = (payload.excludedTags || []).map((tag) => (ALLERGEN_NAMES.en && ALLERGEN_NAMES.en[tag]) || tag);
  const goalName = (GOAL_NAMES.en && GOAL_NAMES.en[payload.goal]) || payload.goal;

  return [
    `Daily target: ${Math.round(payload.targetKcal)} kcal, ${Math.round(payload.targetProtein)}g protein, ${Math.round(payload.targetCarbs)}g carbs, ${Math.round(payload.targetFat)}g fat.`,
    `Goal: ${goalName}.`,
    allergenNames.length ? `STRICTLY EXCLUDE any meal containing: ${allergenNames.join(', ')}.` : 'No allergies to exclude.',
    payload.dislikeText ? `Avoid if possible: ${payload.dislikeText}.` : '',
    'Generate the 7-day plan.',
  ].filter(Boolean).join('\n');
}

function buildWorkoutSystemPrompt(lang) {
  const languageName = LANGUAGE_NAMES[lang] || 'English';
  const catalogText = EXERCISE_CATALOG.map((e) => `${e.id} | ${e.muscleGroup} | ${e.equipment} | ${e.name}`).join('\n');

  return `You are a strength & conditioning assistant for FF Fitness. You design realistic, structured workout plans for a user based on their goal, weekly availability, equipment access, and experience level, choosing exercises ONLY from the catalog below (each catalog exercise has a real demonstration video on the site — picking outside the catalog would leave the user without a video).

STRICT RULES:
1. Output exactly the requested number of "days" day objects, numbered sequentially starting at 1.
2. Choose a sensible weekly split for the "focus" field based on the number of training days: 2-3 days/week → full-body sessions; 4 days/week → an upper/lower split; 5-6 days/week → a push/pull/legs or body-part split.
3. Every exercise's "exerciseId" MUST be exactly one of the ids in the EXERCISE CATALOG below — never invent an id or describe an exercise that isn't in the catalog.
4. Respect the equipment tier strictly, using each catalog exercise's listed equipment column: "gym" allows any equipment; "home_basic" allows only bodyweight, dumbbell, or band exercises; "bodyweight" allows only bodyweight exercises.
5. Respect the experience level: beginners favor simpler, safer catalog exercises (machine/bodyweight-friendly) at moderate volume; intermediate/advanced can use the more demanding catalog exercises at higher volume/intensity.
6. Respect any injuries or limitations the user lists — avoid catalog exercises that would aggravate that body part, picking a suitable alternative from the catalog instead.
7. Pick realistic "sets" (2-5), "reps" (a range string like "8-12", or time/rep-based like "30s" or "AMRAP"), and "restSeconds" (30-180) matched to the goal: strength = lower reps, longer rest; endurance = higher reps, shorter rest; build_muscle = moderate reps/rest; lose_fat = moderate-to-high reps, shorter rest.
8. "notes" is a short, optional coaching cue — use an empty string "" if there is nothing useful to add, never invent filler text.
9. For EVERY exercise, write "notes" in ${languageName} only. Write "focus" in ${languageName} only.
10. Vary the exercises across days where the catalog offers alternatives for the same muscle group — don't default to the same single exercise every time a muscle group comes up.

EXERCISE CATALOG (id | muscle group | equipment | name):
${catalogText}

Respond ONLY with the structured plan per the requested JSON schema.`;
}

function buildWorkoutUserMessage(payload) {
  const goalName = (WORKOUT_GOAL_NAMES.en && WORKOUT_GOAL_NAMES.en[payload.goal]) || payload.goal;

  return [
    `Goal: ${goalName}.`,
    `Training days per week: ${payload.days}.`,
    `Equipment access: ${payload.equipment}.`,
    `Experience level: ${payload.experience}.`,
    payload.injuriesText ? `Injuries or limitations to work around: ${payload.injuriesText}.` : 'No injuries or limitations reported.',
    'Generate the workout plan.',
  ].filter(Boolean).join('\n');
}

function buildRecipeSystemPrompt() {
  return `You are a cooking assistant for FF Fitness. Given a meal's name, a short ingredient/portion description, and its fixed macros, produce a realistic, easy-to-follow home-cook recipe consistent with that exact description — do not invent a different dish or different ingredients than what the description implies, and do not contradict the given macros.

RULES:
1. Expand the given short description into a clean ingredient list with realistic quantities (grams/pieces), consistent with the description already provided.
2. Write 4-8 concise, numbered preparation steps, realistic for a home kitchen.
3. Provide BOTH Romanian and English versions of the ingredient list and steps (ingredients.ro/ingredients.en, steps.ro/steps.en) — describing the exact same recipe in each language.
4. Estimate realistic "servings" (usually 1) and "prepMinutes".

Respond ONLY with the structured recipe per the requested JSON schema.`;
}

function buildRecipeUserMessage(payload) {
  return [
    `Meal name (RO): ${payload.name.ro}`,
    `Meal name (EN): ${payload.name.en}`,
    `Description (RO): ${payload.description.ro}`,
    `Description (EN): ${payload.description.en}`,
    `Fixed macros: ${Math.round(payload.kcal)} kcal, ${Math.round(payload.protein)}g protein, ${Math.round(payload.carbs)}g carbs, ${Math.round(payload.fat)}g fat.`,
    'Generate the recipe.',
  ].join('\n');
}

function buildTranslateSystemPrompt(targetLang) {
  const languageName = LANGUAGE_NAMES[targetLang] || 'English';
  return `You are a translation assistant for FF Fitness. You translate meal names and short ingredient/portion descriptions from a nutrition plan into ${languageName}.

STRICT RULES:
1. Preserve the exact meaning, all food/ingredient terms, and all quantities/portions — do not invent, omit, or add ingredients or amounts.
2. Do not recalculate or mention macros/calories — you are only translating text, nothing else.
3. Return EXACTLY the same number of meals you were given, in the SAME order — meal N in your response must be the translation of meal N in the input.
4. Keep the tone concise and consistent with a nutrition plan (short dish names, brief comma-separated portion descriptions).

Respond ONLY with the structured translation per the requested JSON schema.`;
}

function buildTranslateUserMessage(meals) {
  const numbered = meals
    .map((m, i) => `${i + 1}. Name: ${m.name}\n   Description: ${m.description}`)
    .join('\n');
  return `Translate each of these ${meals.length} meals. Return them in the same order, one entry per input meal:\n\n${numbered}`;
}

function buildTranslateWorkoutSystemPrompt(targetLang) {
  const languageName = LANGUAGE_NAMES[targetLang] || 'English';
  return `You are a translation assistant for FF Fitness. You translate workout-plan text (day focus labels, exercise names, and short coaching notes) into ${languageName}.

STRICT RULES:
1. Preserve the exact meaning and all exercise/training terminology — do not invent, omit, or add information.
2. Return EXACTLY the same number of items you were given, in the SAME order — item N in your response must be the translation of item N in the input.
3. Some items may be an empty string — for those, return an empty string back, never invent content for an empty input.
4. Keep the tone concise and consistent with a workout plan (short labels/names, brief coaching cues).

Respond ONLY with the structured translation per the requested JSON schema.`;
}

function buildTranslateWorkoutUserMessage(items) {
  const numbered = items.map((item, i) => `${i + 1}. ${item === '' ? '(empty)' : item}`).join('\n');
  return `Translate each of these ${items.length} items. Return them in the same order, one entry per input item (return an empty string for any item marked "(empty)"):\n\n${numbered}`;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return false;
  const numFields = ['targetKcal', 'targetProtein', 'targetCarbs', 'targetFat'];
  if (!numFields.every((f) => typeof body[f] === 'number' && body[f] > 0 && body[f] < 10000)) return false;
  if (!['lose', 'maintain', 'gain'].includes(body.goal)) return false;
  if (!['ro', 'en'].includes(body.lang)) return false;
  if (!Array.isArray(body.excludedTags) || body.excludedTags.length > 9) return false;
  if (typeof body.dislikeText !== 'string' || body.dislikeText.length > 300) return false;
  if (body.stores !== undefined) {
    if (!Array.isArray(body.stores) || body.stores.length < 1 || body.stores.length > STORE_IDS.length) return false;
    if (!body.stores.every((s) => STORE_IDS.includes(s))) return false;
  }
  return true;
}

function validateCheckoutPayload(body) {
  return Boolean(body) && typeof body === 'object' && ['ro', 'en'].includes(body.lang);
}

function isNonEmptyBilingualString(value, maxLength) {
  return Boolean(value) && typeof value.ro === 'string' && typeof value.en === 'string'
    && value.ro.trim().length > 0 && value.en.trim().length > 0
    && value.ro.length <= maxLength && value.en.length <= maxLength;
}

function validateRecipePayload(body) {
  if (!body || typeof body !== 'object') return false;
  if (!isNonEmptyBilingualString(body.name, 200)) return false;
  if (!isNonEmptyBilingualString(body.description, 500)) return false;
  const numFields = ['kcal', 'protein', 'carbs', 'fat'];
  if (!numFields.every((f) => typeof body[f] === 'number' && body[f] >= 0 && body[f] < 10000)) return false;
  return true;
}

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validateTranslatePayload(body) {
  if (!body || typeof body !== 'object') return false;
  if (!['ro', 'en'].includes(body.targetLang)) return false;
  if (!Array.isArray(body.meals) || body.meals.length === 0 || body.meals.length > TRANSLATE_MEALS_MAX) return false;
  return body.meals.every((m) => m && isNonEmptyString(m.name, 200) && isNonEmptyString(m.description, 500));
}

function validateWorkoutPayload(body) {
  if (!body || typeof body !== 'object') return false;
  if (!['lose_fat', 'strength', 'build_muscle', 'endurance'].includes(body.goal)) return false;
  if (!Number.isInteger(body.days) || body.days < 2 || body.days > 6) return false;
  if (!['gym', 'home_basic', 'bodyweight'].includes(body.equipment)) return false;
  if (!['beginner', 'intermediate', 'advanced'].includes(body.experience)) return false;
  if (!['ro', 'en'].includes(body.lang)) return false;
  if (typeof body.injuriesText !== 'string' || body.injuriesText.length > 300) return false;
  return true;
}

function validateTranslateWorkoutPayload(body) {
  if (!body || typeof body !== 'object') return false;
  if (!['ro', 'en'].includes(body.targetLang)) return false;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > TRANSLATE_WORKOUT_ITEMS_MAX) return false;
  return body.items.every((item) => typeof item === 'string' && item.length <= 500);
}

async function checkRateLimit(env, ip, kind, limitPerHour) {
  if (!env.RATE_LIMIT_KV) return true; // KV nelegat încă -> fără limitare
  const hourBucket = Math.floor(Date.now() / 3600000);
  const key = `${kind}:${ip}:${hourBucket}`;
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || '0');
  if (current >= limitPerHour) return false;
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 3600 });
  return true;
}

function buildWorkoutCacheKey(body) {
  return `workout-cache:${WORKOUT_CACHE_VERSION}:${body.lang}:${body.goal}:${body.days}:${body.equipment}:${body.experience}`;
}

function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

// Bucket-uri lărgite deliberat (mai late decât marja ±10% cerută de regula 3 din
// buildSystemPrompt) ca mai multe cereri diferite să nimerească aceeași cheie de cache și
// pool-ul să se umple mai repede — prioritizăm rata de cache-hit (viteză + mai puține
// apeluri AI) în detrimentul preciziei fine a bucket-ului, acceptabil cât timp planul din
// cache tot respectă undeva-n jurul targetului (disclaimer-ul de pe pagină acoperă asta).
function buildPlanCacheKey(body) {
  const kcalBucket = roundToStep(body.targetKcal, 200);
  const proteinBucket = roundToStep(body.targetProtein, 20);
  const carbsBucket = roundToStep(body.targetCarbs, 20);
  const fatBucket = roundToStep(body.targetFat, 15);
  const tagsKey = [...body.excludedTags].sort().join(',') || 'none';
  const storesKey = (body.stores && body.stores.length ? [...body.stores].sort() : STORE_IDS.slice()).join(',');
  return `plan-cache:${PLAN_CACHE_VERSION}:${body.lang}:${body.goal}:${kcalBucket}:${proteinBucket}:${carbsBucket}:${fatBucket}:${tagsKey}:${storesKey}`;
}

// Semnătură compactă a conținutului unui plan (numele meselor, în engleză ca ancoră stabilă
// indiferent de `lang`), folosită doar ca să distingem variantele din pool între ele — nu ca
// hash criptografic.
function computePlanSignature(days) {
  return days.map((d) => d.meals.map((m) => (m.name && m.name.en) || '').join(',')).join('|');
}

// Niciodată nu aruncă excepție — orice eșec (KV nelegat, JSON corupt, pool gol,
// lungime nepotrivită) devine null = cache miss, se continuă cu generare live.
async function readWorkoutCachePool(env, cacheKey, expectedDayCount) {
  if (!env.RATE_LIMIT_KV) return null;
  try {
    const raw = await env.RATE_LIMIT_KV.get(cacheKey);
    if (!raw) return null;
    const pool = JSON.parse(raw);
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const entry = pool[Math.floor(Math.random() * pool.length)];
    if (!Array.isArray(entry) || entry.length !== expectedDayCount) return null;
    return entry;
  } catch (err) {
    return null;
  }
}

// Niciodată nu aruncă excepție — un eșec de scriere în cache nu trebuie să strice
// răspunsul deja livrat userului. Auto-recuperare la pool corupt (pornește de la []).
async function writeWorkoutCachePool(env, cacheKey, days) {
  if (!env.RATE_LIMIT_KV) return;
  let pool = [];
  try {
    const raw = await env.RATE_LIMIT_KV.get(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) pool = parsed;
    }
  } catch (err) {
    pool = [];
  }
  pool.push(days);
  if (pool.length > WORKOUT_CACHE_POOL_SIZE) pool = pool.slice(-WORKOUT_CACHE_POOL_SIZE);
  try {
    await env.RATE_LIMIT_KV.put(cacheKey, JSON.stringify(pool), { expirationTtl: WORKOUT_CACHE_TTL_SECONDS });
  } catch (err) {
    // eșec silențios — cache-ul e doar o optimizare, nu trebuie să strice generarea
  }
}

// Niciodată nu aruncă excepție — orice eșec (KV nelegat, JSON corupt, pool gol,
// lungime nepotrivită) devine null = cache miss, se continuă cu generare live.
// Dacă excludeSignature e dat (ex. userul a apăsat "Regenerează" și nu vrea planul pe care
// deja îl are pe ecran), preferăm o variantă din pool diferită de ea; dacă TOATE variantele
// din pool coincid cu excludeSignature (pool cu o singură variantă reală), întoarcem null
// ca să declanșăm o generare live nouă — mai bine un plan proaspăt decât unul identic.
async function readPlanCachePool(env, cacheKey, expectedDayCount, excludeSignature) {
  if (!env.RATE_LIMIT_KV) return null;
  try {
    const raw = await env.RATE_LIMIT_KV.get(cacheKey);
    if (!raw) return null;
    const pool = JSON.parse(raw);
    if (!Array.isArray(pool) || pool.length === 0) return null;
    let candidates = pool.filter((entry) => Array.isArray(entry) && entry.length === expectedDayCount);
    if (!candidates.length) return null;
    if (excludeSignature) {
      const distinct = candidates.filter((entry) => computePlanSignature(entry) !== excludeSignature);
      if (!distinct.length) return null;
      candidates = distinct;
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  } catch (err) {
    return null;
  }
}

// Niciodată nu aruncă excepție — un eșec de scriere în cache nu trebuie să strice
// răspunsul deja livrat userului. Auto-recuperare la pool corupt (pornește de la []).
// Nu adaugă o variantă al cărei conținut (nume mese) e identic cu una deja din pool — ținem
// pool-ul plin de variante cu adevărat diferite, nu de duplicate întâmplătoare.
async function writePlanCachePool(env, cacheKey, days) {
  if (!env.RATE_LIMIT_KV) return;
  let pool = [];
  try {
    const raw = await env.RATE_LIMIT_KV.get(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) pool = parsed;
    }
  } catch (err) {
    pool = [];
  }
  const newSignature = computePlanSignature(days);
  const isDuplicate = pool.some((entry) => Array.isArray(entry) && computePlanSignature(entry) === newSignature);
  if (!isDuplicate) {
    pool.push(days);
    if (pool.length > PLAN_CACHE_POOL_SIZE) pool = pool.slice(-PLAN_CACHE_POOL_SIZE);
  }
  try {
    await env.RATE_LIMIT_KV.put(cacheKey, JSON.stringify(pool), { expirationTtl: PLAN_CACHE_TTL_SECONDS });
  } catch (err) {
    // eșec silențios — cache-ul e doar o optimizare, nu trebuie să strice generarea
  }
}

function cachedDaysResponse(days, origin) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const day of days) {
        controller.enqueue(encoder.encode(JSON.stringify(day) + '\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson', ...corsHeaders(origin) },
  });
}

async function callClaude(env, { system, userMessage, schema, maxTokens, effort }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlock = data.content && data.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text block in Anthropic response');
  return JSON.parse(textBlock.text);
}

function toBilingualDay(day) {
  return {
    ...day,
    meals: day.meals.map((meal) => ({
      ...meal,
      name: { ro: meal.name, en: meal.name },
      description: { ro: meal.description, en: meal.description },
    })),
  };
}

function toBilingualWorkoutDay(day) {
  return {
    ...day,
    focus: { ro: day.focus, en: day.focus },
    exercises: day.exercises.map((ex) => ({
      ...ex,
      notes: { ro: ex.notes, en: ex.notes },
    })),
  };
}

// Emits each day of PLAN_JSON_SCHEMA the moment its object closes, by tracking JSON object
// depth over the raw text deltas: depth 2 is exactly a "days[i]" object (depth 1 is the root
// object, depth 3+ is nested "meals[i]" objects inside a day) — relies on that schema shape.
function makeDayExtractor(onDay) {
  let buffer = '';
  let scanPos = 0;
  let depth = 0;
  let inString = false;
  let escape = false;
  let dayStart = -1;

  return function feed(text) {
    buffer += text;
    for (; scanPos < buffer.length; scanPos++) {
      const ch = buffer[scanPos];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') {
        depth++;
        if (depth === 2) dayStart = scanPos;
        continue;
      }
      if (ch === '}') {
        if (depth === 2 && dayStart !== -1) {
          const raw = buffer.slice(dayStart, scanPos + 1);
          try { onDay(JSON.parse(raw)); } catch (e) { /* incomplete/malformed fragment, skip */ }
        }
        depth--;
      }
    }
  };
}

async function streamPlanDays(env, { system, userMessage, schema, maxTokens, effort, toBilingual }, controller) {
  const encoder = new TextEncoder();
  const emit = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: true,
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok || !res.body) {
    emit({ error: 'upstream_failed', message: res.body ? await res.text() : 'no response body' });
    return;
  }

  let dayCount = 0;
  const extract = makeDayExtractor((day) => {
    dayCount++;
    emit(toBilingual(day));
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      let evt;
      try { evt = JSON.parse(jsonStr); } catch (e) { continue; }
      if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
        extract(evt.delta.text);
      }
    }
  }

  if (dayCount === 0) {
    emit({ error: 'upstream_failed', message: 'No days parsed from stream' });
  }
}

// Aplatizează un obiect JS în perechi cheie/valoare în notația cu paranteze pătrate așteptată
// de API-ul Stripe (form-urlencoded), ex. { line_items: [{ quantity: 1 }] } devine
// "line_items[0][quantity]=1". Singurul loc din Worker care vorbește cu Stripe — la fel ca
// Anthropic (callClaude), fără SDK, printr-un fetch() brut.
function flattenStripeParams(obj, prefix, out) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const arrKey = `${paramKey}[${i}]`;
        if (item && typeof item === 'object') flattenStripeParams(item, arrKey, out);
        else out.push([arrKey, String(item)]);
      });
    } else if (typeof value === 'object') {
      flattenStripeParams(value, paramKey, out);
    } else {
      out.push([paramKey, String(value)]);
    }
  }
  return out;
}

async function stripeRequest(env, method, path, params) {
  const headers = { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  let body;
  if (method === 'POST') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(flattenStripeParams(params || {}, '', [])).toString();
  }
  const res = await fetch(`${STRIPE_API_BASE}${path}`, { method, headers, body });
  let data = null;
  try { data = await res.json(); } catch (err) { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// Verifică live la Stripe (nu are încredere într-un flag trimis de client) că sesiunea de
// checkout a fost plătită, apoi o leagă — la prima utilizare — de `signature` (semnătura
// bucket-ului de plan cerut, vezi buildPlanCacheKey), sau verifică la utilizările ulterioare
// că cererea curentă are aceeași semnătură. O plată deblochează o singură configurație de
// plan: regenerarea aceleiași configurații e gratuită, una diferită cere o plată nouă.
async function verifyPaidEntitlement(env, sessionId, signature) {
  if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return { ok: false, status: 402, error: 'payment_required' };
  }
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 503, error: 'not_configured' };
  }
  // Fail-closed deliberat, spre deosebire de checkRateLimit(): fără KV nu putem lega sau
  // verifica o plată de o configurație, deci refuzăm — niciodată acces gratuit din eroare.
  if (!env.RATE_LIMIT_KV) {
    return { ok: false, status: 503, error: 'not_configured' };
  }

  let session;
  try {
    const res = await stripeRequest(env, 'GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`, null);
    if (!res.ok) return { ok: false, status: 402, error: 'payment_required' };
    if (!res.data) return { ok: false, status: 502, error: 'upstream_failed' };
    session = res.data;
  } catch (err) {
    return { ok: false, status: 502, error: 'upstream_failed' };
  }

  if (session.payment_status !== 'paid') {
    return { ok: false, status: 402, error: 'payment_required' };
  }

  const kvKey = `${PAID_SESSION_KV_PREFIX}${sessionId}`;
  let record = null;
  try {
    const raw = await env.RATE_LIMIT_KV.get(kvKey);
    if (raw) record = JSON.parse(raw);
  } catch (err) {
    record = null;
  }

  if (record && record.signature) {
    if (record.signature === signature) return { ok: true };
    return { ok: false, status: 403, error: 'payment_mismatch' };
  }

  try {
    await env.RATE_LIMIT_KV.put(kvKey, JSON.stringify({ signature, boundAt: Date.now() }), {
      expirationTtl: PLAN_CACHE_TTL_SECONDS,
    });
  } catch (err) {
    return { ok: false, status: 502, error: 'upstream_failed' };
  }
  return { ok: true };
}

async function handleGeneratePlan(request, env, origin, ip) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  if (!validatePayload(body)) {
    return jsonResponse({ error: 'invalid_payload' }, 400, origin);
  }

  const cacheKey = buildPlanCacheKey(body);

  const entitlement = await verifyPaidEntitlement(env, body.paymentSessionId, cacheKey);
  if (!entitlement.ok) {
    return jsonResponse({ error: entitlement.error }, entitlement.status, origin);
  }

  // dislikeText nu intră în cheia de cache (e prea liber ca să bucketăm pe el), deci un plan
  // generat cu preferințe libere n-are ce căuta în pool-ul comun — mereu live pentru el.
  const bypassCache = body.dislikeText.trim().length > 0;
  const excludeSignature = typeof body.excludeSignature === 'string' && body.excludeSignature.length <= 8000
    ? body.excludeSignature
    : null;

  if (!bypassCache) {
    const cachedDays = await readPlanCachePool(env, cacheKey, PLAN_DAY_COUNT, excludeSignature);
    if (cachedDays) return cachedDaysResponse(cachedDays, origin);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'not_configured' }, 503, origin);
  }

  const allowed = await checkRateLimit(env, ip, 'plan', PLAN_RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  const encoder = new TextEncoder();
  const collectedDays = [];
  const collectingToBilingual = (day) => {
    const bilingual = toBilingualDay(day);
    collectedDays.push(bilingual);
    return bilingual;
  };
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamPlanDays(env, {
          system: buildSystemPrompt(body.lang, body.stores),
          userMessage: buildUserMessage(body),
          schema: PLAN_JSON_SCHEMA,
          maxTokens: PLAN_MAX_TOKENS,
          // 'medium' (nu 'low' ca la celelalte apeluri): acum că planurile generate live
          // ajung în pool-ul de cache și sunt reservite la mulți useri, merită mai multă
          // atenție la variație pe generarea inițială — costul suplimentar se amortizează.
          effort: 'medium',
          toBilingual: collectingToBilingual,
        }, controller);
        if (!bypassCache && collectedDays.length === PLAN_DAY_COUNT) {
          await writePlanCachePool(env, cacheKey, collectedDays);
        }
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: 'upstream_failed', message: String(err) }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson', ...corsHeaders(origin) },
  });
}

async function handleCreateCheckoutSession(request, env, origin, ip) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  if (!validateCheckoutPayload(body)) {
    return jsonResponse({ error: 'invalid_payload' }, 400, origin);
  }

  // return_url e construit exclusiv din Origin (aceeași sursă de încredere ca corsHeaders),
  // niciodată dintr-o valoare trimisă de client — altfel am deschide un open-redirect.
  if (!origin) {
    return jsonResponse({ error: 'invalid_origin' }, 400, origin);
  }

  const allowed = await checkRateLimit(env, ip, 'checkout', CHECKOUT_RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'not_configured' }, 503, origin);
  }

  const productName = body.lang === 'en' ? 'AI Nutrition Plan — FF Fitness' : 'Plan de nutriție AI — FF Fitness';

  try {
    const res = await stripeRequest(env, 'POST', '/checkout/sessions', {
      ui_mode: 'embedded_page',
      mode: 'payment',
      return_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      redirect_on_completion: 'always',
      locale: body.lang,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: CHECKOUT_PRICE_USD_CENTS,
            product_data: { name: productName },
          },
        },
      ],
      branding_settings: {
        background_color: '#17111F',
        button_color: '#C70E6E',
        border_style: 'rounded',
      },
    });
    if (!res.ok || !res.data) {
      return jsonResponse({ error: 'upstream_failed' }, 502, origin);
    }
    return jsonResponse({ clientSecret: res.data.client_secret, sessionId: res.data.id }, 200, origin);
  } catch (err) {
    return jsonResponse({ error: 'upstream_failed' }, 502, origin);
  }
}

async function handleGenerateRecipe(request, env, origin, ip) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  if (!validateRecipePayload(body)) {
    return jsonResponse({ error: 'invalid_payload' }, 400, origin);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'not_configured' }, 503, origin);
  }

  const allowed = await checkRateLimit(env, ip, 'recipe', RECIPE_RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  try {
    const recipe = await callClaude(env, {
      system: buildRecipeSystemPrompt(),
      userMessage: buildRecipeUserMessage(body),
      schema: RECIPE_JSON_SCHEMA,
      maxTokens: RECIPE_MAX_TOKENS,
      effort: 'low',
    });
    return jsonResponse(recipe, 200, origin);
  } catch (err) {
    return jsonResponse({ error: 'upstream_failed', message: String(err) }, 502, origin);
  }
}

async function handleTranslatePlan(request, env, origin, ip) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  if (!validateTranslatePayload(body)) {
    return jsonResponse({ error: 'invalid_payload' }, 400, origin);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'not_configured' }, 503, origin);
  }

  const allowed = await checkRateLimit(env, ip, 'translate', TRANSLATE_RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  try {
    const result = await callClaude(env, {
      system: buildTranslateSystemPrompt(body.targetLang),
      userMessage: buildTranslateUserMessage(body.meals),
      schema: TRANSLATE_MEALS_SCHEMA,
      maxTokens: TRANSLATE_MAX_TOKENS,
      effort: 'low',
    });

    if (!result || !Array.isArray(result.meals) || result.meals.length !== body.meals.length) {
      return jsonResponse({ error: 'upstream_failed', message: 'Translation count mismatch' }, 502, origin);
    }

    return jsonResponse(result, 200, origin);
  } catch (err) {
    return jsonResponse({ error: 'upstream_failed', message: String(err) }, 502, origin);
  }
}

async function handleGenerateWorkoutPlan(request, env, origin, ip) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  if (!validateWorkoutPayload(body)) {
    return jsonResponse({ error: 'invalid_payload' }, 400, origin);
  }

  const cacheKey = buildWorkoutCacheKey(body);
  const bypassCache = Boolean(body.skipCache) || body.injuriesText.trim().length > 0;

  if (!bypassCache) {
    const cachedDays = await readWorkoutCachePool(env, cacheKey, body.days);
    if (cachedDays) return cachedDaysResponse(cachedDays, origin);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'not_configured' }, 503, origin);
  }

  const allowed = await checkRateLimit(env, ip, 'workout', WORKOUT_RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  const encoder = new TextEncoder();
  const collectedDays = [];
  const collectingToBilingual = (day) => {
    const bilingual = toBilingualWorkoutDay(day);
    collectedDays.push(bilingual);
    return bilingual;
  };
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamPlanDays(env, {
          system: buildWorkoutSystemPrompt(body.lang),
          userMessage: buildWorkoutUserMessage(body),
          schema: WORKOUT_PLAN_JSON_SCHEMA,
          maxTokens: WORKOUT_PLAN_MAX_TOKENS,
          effort: 'low',
          toBilingual: collectingToBilingual,
        }, controller);
        if (!bypassCache && collectedDays.length === body.days) {
          await writeWorkoutCachePool(env, cacheKey, collectedDays);
        }
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: 'upstream_failed', message: String(err) }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson', ...corsHeaders(origin) },
  });
}

async function handleTranslateWorkoutPlan(request, env, origin, ip) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'invalid_json' }, 400, origin);
  }

  if (!validateTranslateWorkoutPayload(body)) {
    return jsonResponse({ error: 'invalid_payload' }, 400, origin);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'not_configured' }, 503, origin);
  }

  const allowed = await checkRateLimit(env, ip, 'translateWorkout', TRANSLATE_WORKOUT_RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  try {
    const result = await callClaude(env, {
      system: buildTranslateWorkoutSystemPrompt(body.targetLang),
      userMessage: buildTranslateWorkoutUserMessage(body.items),
      schema: TRANSLATE_ITEMS_SCHEMA,
      maxTokens: TRANSLATE_MAX_TOKENS,
      effort: 'low',
    });

    if (!result || !Array.isArray(result.items) || result.items.length !== body.items.length) {
      return jsonResponse({ error: 'upstream_failed', message: 'Translation count mismatch' }, 502, origin);
    }

    return jsonResponse(result, 200, origin);
  } catch (err) {
    return jsonResponse({ error: 'upstream_failed', message: String(err) }, 502, origin);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (url.pathname === '/api/generate-plan' && request.method === 'POST') {
      return handleGeneratePlan(request, env, origin, ip);
    }

    if (url.pathname === '/api/create-checkout-session' && request.method === 'POST') {
      return handleCreateCheckoutSession(request, env, origin, ip);
    }

    if (url.pathname === '/api/generate-recipe' && request.method === 'POST') {
      return handleGenerateRecipe(request, env, origin, ip);
    }

    if (url.pathname === '/api/translate-plan' && request.method === 'POST') {
      return handleTranslatePlan(request, env, origin, ip);
    }

    if (url.pathname === '/api/generate-workout-plan' && request.method === 'POST') {
      return handleGenerateWorkoutPlan(request, env, origin, ip);
    }

    if (url.pathname === '/api/translate-workout-plan' && request.method === 'POST') {
      return handleTranslateWorkoutPlan(request, env, origin, ip);
    }

    return jsonResponse({ error: 'not_found' }, 404, origin);
  },
};
