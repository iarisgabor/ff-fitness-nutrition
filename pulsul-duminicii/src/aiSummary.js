// Rezumat AI opțional per duminică — activ doar dacă ANTHROPIC_API_KEY e setat ca
// secret. Cache permanent în KV, cheie = hash SHA-256 al textelor libere ale zilei,
// deci se recalculează automat doar când vine un răspuns nou/întârziat pentru acea
// zi (hash-ul se schimbă), nu la fiecare randare a paginii.
//
// IMPORTANT — non-blocant: apelul către Claude durează câteva secunde. Pagina nu
// trebuie să aștepte după el. Fluxul e: (1) verifică rapid cache-ul KV (sincron,
// în render), (2) dacă lipsește, randează pagina FĂRĂ rezumat și pornește
// generarea în fundal cu `ctx.waitUntil()` — la vizita următoare pe aceeași zi,
// rezumatul e deja gata în KV.

import { DIMENSIONS } from './config.js';

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function collectOpenTextByCategory(items) {
  const byCategory = {};
  for (const dim of DIMENSIONS) {
    const texts = items.map((r) => r[dim.key]?.t).filter((t) => t && t.trim());
    if (texts.length) byCategory[dim.label] = texts;
  }
  return byCategory;
}

async function summarizeWithClaude(env, byCategory) {
  const prompt = Object.entries(byCategory)
    .map(([label, texts]) => `## ${label}\n${texts.map((t) => `- ${t}`).join('\n')}`)
    .join('\n\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: 'Ești un asistent care rezumă feedback-ul unei biserici după întâlnirea de duminică, pentru echipa de conducere. Scrie în română, 3-5 puncte scurte (max o propoziție fiecare), concrete, fără introduceri sau concluzii. Răspunde DOAR cu punctele, câte unul pe linie, fără marcaje de listă (fără "-" sau numere).',
      messages: [{ role: 'user', content: `Răspunsurile deschise ale acestei duminici, grupate pe categorie:\n\n${prompt}` }],
    }),
  });
  if (!resp.ok) {
    throw new Error(`Anthropic API error (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const text = (data.content || []).map((b) => b.text || '').join('\n');
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

async function keyFor(date, items) {
  const byCategory = collectOpenTextByCategory(items);
  if (!Object.keys(byCategory).length) return null;
  const hash = await sha256Hex(JSON.stringify(byCategory));
  return { kvKey: `ai_summary:${date}:${hash}`, byCategory };
}

// Rapid — un singur KV.get, niciun apel către Claude. Sigur de folosit sincron
// în calea de randare a paginii.
export async function getCachedAiSummary(env, date, items) {
  if (!env.ANTHROPIC_API_KEY || !env.PULSUL_KV) return null;
  const k = await keyFor(date, items);
  if (!k) return null;
  return env.PULSUL_KV.get(k.kvKey, 'json');
}

// Lent (apel real către Claude) — NU se așteaptă în calea de randare. Se pornește
// prin `ctx.waitUntil(generateAndCacheAiSummary(...))` după ce pagina a fost deja
// trimisă, ca următoarea vizită să găsească rezumatul deja în cache.
export async function generateAndCacheAiSummary(env, date, items) {
  if (!env.ANTHROPIC_API_KEY || !env.PULSUL_KV) return;
  const k = await keyFor(date, items);
  if (!k) return;
  const existing = await env.PULSUL_KV.get(k.kvKey);
  if (existing) return; // altă cerere concurentă a apucat deja să-l genereze
  try {
    const points = await summarizeWithClaude(env, k.byCategory);
    if (points.length) await env.PULSUL_KV.put(k.kvKey, JSON.stringify(points));
  } catch (err) {
    console.error('Rezumat AI eșuat pentru', date, err);
    // fail-open: pagina funcționează normal, doar fără rezumat pentru acea zi
  }
}
