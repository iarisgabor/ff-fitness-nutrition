// Autentificare Google via service account (JWT semnat RS256, fără OAuth
// interactiv) + citire Google Sheets API v4. Doar fetch() nativ + crypto.subtle
// (WebCrypto din workerd) — fără SDK-uri, la fel ca restul API-urilor externe din
// acest repo (vezi worker/index.js — Stripe/Gmail/Anthropic prin fetch() direct).

import { SHEET_RANGE } from './config.js';

const TOKEN_KV_KEY = 'sheets_access_token';
const TOKEN_TTL_SECONDS = 50 * 60; // sub cele 3600s de valabilitate reală

function base64UrlEncode(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str) {
  return base64UrlEncode(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace(/\\n/g, '\n') // secretul poate fi lipit cu \n literali
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function getAccessToken(env) {
  if (env.PULSUL_KV) {
    const cached = await env.PULSUL_KV.get(TOKEN_KV_KEY);
    if (cached) return cached;
  }

  const assertion = await signJwt(env);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Google token exchange failed (${resp.status}): ${JSON.stringify(data)}`);
  }

  if (env.PULSUL_KV) {
    await env.PULSUL_KV.put(TOKEN_KV_KEY, data.access_token, { expirationTtl: TOKEN_TTL_SECONDS });
  }
  return data.access_token;
}

export async function fetchSheetValues(env, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/values/${encodeURIComponent(SHEET_RANGE)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Google Sheets API error (${resp.status}): ${body}`);
  }
  const data = await resp.json();
  return data.values || [];
}
