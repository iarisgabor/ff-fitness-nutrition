const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 8;

async function callAnthropic(env, { system, messages, tools }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': (env.ANTHROPIC_API_KEY || '').trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // cache_control pe blocul de system prinde AUTOMAT și tools (se randează înaintea system-ului,
      // breakpoint-ul caută înapoi) — system trebuie să rămână byte-identic între cereri ca să
      // cache-uiască (de-aia data/ora curentă NU mai e interpolată aici, vezi prompt.js).
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
      tools,
      tool_choice: { type: 'auto' },
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (err) { /* ignore */ }
    // DEBUG temporar — de scos după ce diagnosticăm eroarea raportată de utilizator.
    console.error('ANTHROPIC_API_ERROR', res.status, detail);
    const apiErr = new Error(`Anthropic API failed (${res.status}): ${detail}`);
    apiErr.code = 'ANTHROPIC_API_ERROR';
    throw apiErr;
  }

  return res.json();
}

// Buclă manuală de tool-use (nu tool runner-ul SDK-ului, ca să nu adăugăm @anthropic-ai/sdk
// ca dependență — acest Worker rămâne fetch-only, la fel ca worker/index.js din site-ul de fitness).
// `executeTool(name, input)` execută o singură unealtă și întoarce rezultatul (poate arunca eroare).
export async function runToolLoop(env, { system, messages, tools, executeTool }) {
  const conversation = [...messages];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await callAnthropic(env, { system, messages: conversation, tools });

    const u = response.usage || {};
    console.log(
      'ANTHROPIC_USAGE',
      `input=${u.input_tokens}`,
      `cache_read=${u.cache_read_input_tokens}`,
      `cache_write=${u.cache_creation_input_tokens}`,
      `output=${u.output_tokens}`
    );

    if (response.stop_reason === 'tool_use') {
      conversation.push({ role: 'assistant', content: response.content });

      // Claude poate cere mai multe unelte în același răspuns (tool-use paralel) — le execută pe
      // toate și trimite toate rezultatele înapoi într-un singur mesaj user, niciodată separat.
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          try {
            const result = await executeTool(block.name, block.input);
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: err.message || 'Eroare necunoscută',
              is_error: true,
            };
          }
        })
      );

      conversation.push({ role: 'user', content: toolResults });
      continue;
    }

    if (response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter((block) => block.type === 'text');
      return textBlocks.map((block) => block.text).join('\n').trim();
    }

    // DEBUG temporar — de scos după ce diagnosticăm eroarea raportată de utilizator.
    console.error('ANTHROPIC_UNEXPECTED_STOP', JSON.stringify(response));

    const err = new Error(`Anthropic stop_reason neașteptat: ${response.stop_reason}`);
    err.code = 'ANTHROPIC_UNEXPECTED_STOP';
    throw err;
  }

  // DEBUG temporar — de scos după ce diagnosticăm eroarea raportată de utilizator.
  console.error('ANTHROPIC_TOO_MANY_ITERATIONS', JSON.stringify(conversation));

  const err = new Error('Prea multe iterații de tool-use fără răspuns final.');
  err.code = 'ANTHROPIC_TOO_MANY_ITERATIONS';
  throw err;
}
