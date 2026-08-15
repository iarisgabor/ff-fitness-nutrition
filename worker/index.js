'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
const PLAN_MAX_TOKENS = 20000;
const RECIPE_MAX_TOKENS = 1500;
const PLAN_RATE_LIMIT_PER_HOUR = 8;
const RECIPE_RATE_LIMIT_PER_HOUR = 30;
const TRANSLATE_MAX_TOKENS = 4000;
const TRANSLATE_RATE_LIMIT_PER_HOUR = 20;
const TRANSLATE_MEALS_MAX = 40;
const WORKOUT_PLAN_MAX_TOKENS = 8000;
const WORKOUT_RATE_LIMIT_PER_HOUR = 8;
const TRANSLATE_WORKOUT_RATE_LIMIT_PER_HOUR = 20;
const TRANSLATE_WORKOUT_ITEMS_MAX = 150;
const WORKOUT_MUSCLE_GROUPS = ['chest', 'shoulders', 'biceps', 'forearms', 'abs', 'quads', 'calves', 'back', 'traps', 'triceps', 'glutes', 'hamstrings'];
const WORKOUT_CACHE_VERSION = 'v1';
const WORKOUT_CACHE_POOL_SIZE = 5;
const WORKOUT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 zile

const INGREDIENT_TABLE = `
Chicken breast (cooked): 165 kcal, 31g protein, 0g carbs, 3.6g fat / 100g
Salmon (cooked): 206 kcal, 22.1g protein, 0g carbs, 12.35g fat / 100g
Whole egg (raw, ~50g): 143 kcal, 12.6g protein, 0.72g carbs, 9.51g fat / 100g
Rolled oats (dry): 379 kcal, 13.15g protein, 67.7g carbs, 6.52g fat / 100g
White rice (cooked): 130 kcal, 2.7g protein, 28.2g carbs, 0.3g fat / 100g
Brown rice (cooked): 123 kcal, 2.74g protein, 25.6g carbs, 0.97g fat / 100g
Potato (baked): 93 kcal, 2.5g protein, 21.1g carbs, 0.13g fat / 100g
Sweet potato (baked): 90 kcal, 2.01g protein, 20.71g carbs, 0.15g fat / 100g
Mixed vegetables (boiled): 65 kcal, 2.86g protein, 13.09g carbs, 0.15g fat / 100g
Greek yogurt (0%): 61 kcal, 10g protein, 3.6g carbs, 0.37g fat / 100g
Black beans (cooked): 132 kcal, 8.86g protein, 23.71g carbs, 0.54g fat / 100g
Chickpeas (cooked): 164 kcal, 8.9g protein, 27.4g carbs, 2.6g fat / 100g
Almonds (raw): 579 kcal, 21.2g protein, 21.6g carbs, 49.9g fat / 100g
Olive oil: 884 kcal, 0g protein, 0g carbs, 100g fat / 100g
Lean ground beef (93/7, cooked): 155 kcal, 21.7g protein, 0g carbs, 6.8g fat / 100g
Cottage cheese (2%): 81 kcal, 10.45g protein, 4.76g carbs, 2.3g fat / 100g
Quinoa (cooked): 120 kcal, 4.4g protein, 21.3g carbs, 1.9g fat / 100g
Banana: 89 kcal, 1.09g protein, 22.8g carbs, 0.33g fat / 100g
Wholewheat bread (~32g/slice): 252 kcal, 12.45g protein, 42.71g carbs, 3.5g fat / 100g
Honey: 304 kcal, 0.3g protein, 82.4g carbs, 0g fat / 100g
Milk (1%): 42 kcal, 3.4g protein, 5.0g carbs, 1.0g fat / 100g
Shrimp (cooked): 99 kcal, 21g protein, 1g carbs, 1.2g fat / 100g
Firm tofu: 144 kcal, 17.3g protein, 2.8g carbs, 8.7g fat / 100g
Tahini: 595 kcal, 17g protein, 21.5g carbs, 53.01g fat / 100g
Peanut butter: 588 kcal, 21.93g protein, 23.98g carbs, 49.54g fat / 100g
`.trim();

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
                name: { type: 'string' },
                muscleGroup: { type: 'string', enum: WORKOUT_MUSCLE_GROUPS },
                sets: { type: 'integer' },
                reps: { type: 'string' },
                restSeconds: { type: 'integer' },
                notes: { type: 'string' },
              },
              required: ['name', 'muscleGroup', 'sets', 'reps', 'restSeconds', 'notes'],
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

function buildSystemPrompt(lang) {
  const languageName = LANGUAGE_NAMES[lang] || 'English';
  const sampleText = SAMPLE_MEALS.map((m) => `- ${m[lang] || m.en}`).join('\n');

  return `You are a nutrition assistant for FF Fitness. You compose realistic meal plans, based on home-cooked food (not restaurant dishes), for a user who gave you a daily calorie and macronutrient target.

STRICT RULES:
1. Calculate each meal's macros from the verified nutrition table below (values per 100g) and the portions you choose — do not use memorized values for foods outside this table.
2. Each day's total must be close to the given target (within ±10%).
3. Vary the meals — don't repeat the same meal across the 7 days if possible.
4. For EVERY meal, write the name and description in ${languageName} only. Use realistic portions (don't invent absurd quantities).
5. STRICTLY respect the allergen exclusions given by the user — no meal may contain those ingredients.
6. Each day must include breakfast, lunch, and dinner (slot values 'breakfast'/'lunch'/'dinner'), plus 0-2 snacks ('snack') depending on how much extra the calorie target requires.
7. Number each day's "day" field sequentially from 1 to 7.

VERIFIED NUTRITION TABLE (per 100g):
${INGREDIENT_TABLE}

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

  return `You are a strength & conditioning assistant for FF Fitness. You design realistic, structured workout plans for a user based on their goal, weekly availability, equipment access, and experience level.

STRICT RULES:
1. Output exactly the requested number of "days" day objects, numbered sequentially starting at 1.
2. Choose a sensible weekly split for the "focus" field based on the number of training days: 2-3 days/week → full-body sessions; 4 days/week → an upper/lower split; 5-6 days/week → a push/pull/legs or body-part split.
3. Every exercise's "muscleGroup" must be exactly one of: ${WORKOUT_MUSCLE_GROUPS.join(', ')}.
4. Respect the equipment tier strictly: "gym" allows any equipment; "home_basic" allows only bodyweight, dumbbell, or resistance-band exercises; "bodyweight" allows only bodyweight exercises, zero equipment.
5. Respect the experience level: beginners get simpler, safer movements (machines/bodyweight-friendly) at moderate volume; intermediate/advanced can include free weights and higher volume/intensity.
6. Respect any injuries or limitations the user lists — avoid or substitute movements that would aggravate that body part.
7. Pick realistic "sets" (2-5), "reps" (a range string like "8-12", or time/rep-based like "30s" or "AMRAP"), and "restSeconds" (30-180) matched to the goal: strength = lower reps, longer rest; endurance = higher reps, shorter rest; build_muscle = moderate reps/rest; lose_fat = moderate-to-high reps, shorter rest.
8. "notes" is a short, optional coaching cue — use an empty string "" if there is nothing useful to add, never invent filler text.
9. For EVERY exercise, write "name" and "notes" in ${languageName} only. Write "focus" in ${languageName} only.

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
  return true;
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

function cachedWorkoutPlanResponse(days, origin) {
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
      name: { ro: ex.name, en: ex.name },
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

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'not_configured' }, 503, origin);
  }

  const allowed = await checkRateLimit(env, ip, 'plan', PLAN_RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return jsonResponse({ error: 'rate_limited' }, 429, origin);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamPlanDays(env, {
          system: buildSystemPrompt(body.lang),
          userMessage: buildUserMessage(body),
          schema: PLAN_JSON_SCHEMA,
          maxTokens: PLAN_MAX_TOKENS,
          effort: 'low',
          toBilingual: toBilingualDay,
        }, controller);
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
    if (cachedDays) return cachedWorkoutPlanResponse(cachedDays, origin);
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
