'use strict';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
const PLAN_MAX_TOKENS = 20000;
const RECIPE_MAX_TOKENS = 1500;
const PLAN_RATE_LIMIT_PER_HOUR = 8;
const RECIPE_RATE_LIMIT_PER_HOUR = 30;

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

const BILINGUAL_TEXT_SCHEMA = {
  type: 'object',
  properties: { ro: { type: 'string' }, en: { type: 'string' } },
  required: ['ro', 'en'],
  additionalProperties: false,
};

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
                name: BILINGUAL_TEXT_SCHEMA,
                description: BILINGUAL_TEXT_SCHEMA,
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

function buildSystemPrompt() {
  const sampleText = SAMPLE_MEALS.map((m) => `- ${m.en} (RO: ${m.ro})`).join('\n');

  return `You are a nutrition assistant for FF Fitness. You compose realistic meal plans, based on home-cooked food (not restaurant dishes), for a user who gave you a daily calorie and macronutrient target.

STRICT RULES:
1. Calculate each meal's macros from the verified nutrition table below (values per 100g) and the portions you choose — do not use memorized values for foods outside this table.
2. Each day's total must be close to the given target (within ±10%).
3. Vary the meals — don't repeat the same meal across the 7 days if possible.
4. For EVERY meal, write the name and description in BOTH Romanian and English (name.ro/name.en, description.ro/description.en) — describing the exact same dish and portions in each language, not a machine translation of one into the other. Use realistic portions (don't invent absurd quantities).
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

async function checkRateLimit(env, ip, kind, limitPerHour) {
  if (!env.RATE_LIMIT_KV) return true; // KV nelegat încă -> fără limitare
  const hourBucket = Math.floor(Date.now() / 3600000);
  const key = `${kind}:${ip}:${hourBucket}`;
  const current = Number((await env.RATE_LIMIT_KV.get(key)) || '0');
  if (current >= limitPerHour) return false;
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 3600 });
  return true;
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

  try {
    const plan = await callClaude(env, {
      system: buildSystemPrompt(),
      userMessage: buildUserMessage(body),
      schema: PLAN_JSON_SCHEMA,
      maxTokens: PLAN_MAX_TOKENS,
      effort: 'medium',
    });
    return jsonResponse(plan, 200, origin);
  } catch (err) {
    return jsonResponse({ error: 'upstream_failed', message: String(err) }, 502, origin);
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

    return jsonResponse({ error: 'not_found' }, 404, origin);
  },
};
