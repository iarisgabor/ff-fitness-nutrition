import { CATALOG } from './catalog.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
const MAX_HISTORY_MESSAGES = 20;

const VALID_IDS = CATALOG.map((b) => b.id);

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: {
      type: 'string',
      description: 'Răspunsul conversațional către client, în română, cald și scurt (2-4 propoziții).',
    },
    recommended_ids: {
      type: 'array',
      description: 'Id-urile cărților recomandate acum din catalog (cel mult 3). Gol dacă mai pui întrebări înainte să recomanzi.',
      items: { type: 'string', enum: VALID_IDS },
    },
  },
  required: ['reply', 'recommended_ids'],
};

function systemPrompt() {
  const catalogText = CATALOG.map(
    (b) => `- id: ${b.id} | "${b.title}" de ${b.author} (${b.genre}, ${b.price})\n  stare potrivită: ${b.mood}\n  descriere: ${b.description}`
  ).join('\n');

  return `Ești asistentul de recomandări al librăriei "Filă cu Filă". Un client îți scrie ce îl frământă, ce caută sau cum se simte, iar tu trebuie să-i recomanzi cărți DOAR din catalogul de mai jos — niciodată cărți din afara lui.

Catalog:
${catalogText}

Reguli:
- Vorbește română, cald și pe scurt (2-4 propoziții), ca un librar atent, nu ca un chatbot corporate.
- Dacă mesajul clientului e prea vag ca să recomanzi ceva relevant, pune UNA singură întrebare de clarificare și lasă recommended_ids gol.
- Când recomanzi, alege 1-3 cărți din catalog ale căror "stare potrivită" se potrivesc cu ce a spus clientul, și explică pe scurt DE CE se potrivesc, menționând titlul.
- Nu inventa cărți, autori sau prețuri care nu sunt în catalog.
- Nu da sfaturi medicale sau terapeutice — dacă simți că e nevoie de așa ceva, recomandă cu blândețe și o carte relevantă, dar sugerează și sprijin de specialitate.`;
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/chat' || request.method !== 'POST') {
      return jsonResponse({ error: 'not_found' }, 404, origin);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: 'missing_api_key' }, 500, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400, origin);
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 1000) {
      return jsonResponse({ error: 'invalid_message' }, 400, origin);
    }

    const history = Array.isArray(body.history) ? body.history : [];
    const trimmedHistory = history
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));

    const messages = [...trimmedHistory, { role: 'user', content: message }];

    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 500,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
          system: systemPrompt(),
          messages,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Anthropic API error', res.status, errText);
        return jsonResponse({ error: 'upstream_failed' }, 502, origin);
      }

      const data = await res.json();
      const textBlock = data.content && data.content.find((b) => b.type === 'text');
      if (!textBlock) return jsonResponse({ error: 'empty_response' }, 502, origin);

      const parsed = JSON.parse(textBlock.text);
      const recommended_ids = Array.isArray(parsed.recommended_ids)
        ? parsed.recommended_ids.filter((id) => VALID_IDS.includes(id))
        : [];

      return jsonResponse({ reply: parsed.reply, recommended_ids }, 200, origin);
    } catch (err) {
      console.error('Chat error', err);
      return jsonResponse({ error: 'internal_error' }, 500, origin);
    }
  },
};
