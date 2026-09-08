// checkout — deschide o plată Stripe pentru iile din coș.
// Prețurile se citesc din baza de date, niciodată din ce trimite browserul,
// iar cheia secretă Stripe nu iese niciodată de aici.
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const ORIGINI = [
  'https://ia-bunicii-mele.vercel.app',
  'http://localhost:4174',
];
const PREVIEW = /^https:\/\/ia-bunicii-mele-[a-z0-9-]+\.vercel\.app$/;
const MAX_II = 10;

function cors(origin: string) {
  const permis = ORIGINI.includes(origin) || PREVIEW.test(origin);
  return {
    // dacă originea nu e cunoscută, cade pe producție — niciodată pe localhost
    'Access-Control-Allow-Origin': permis ? origin : ORIGINI[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function raspuns(corp: unknown, status: number, h: Record<string, string>) {
  return new Response(JSON.stringify(corp), {
    status,
    headers: { ...h, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin') ?? '');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return raspuns({ error: 'Metodă greșită.' }, 405, h);

  // intrarea se verifică prima: o cerere stricată e greșeala clientului,
  // indiferent dacă Stripe e configurat sau nu
  let corp: { ids?: unknown };
  try {
    corp = await req.json();
  } catch {
    return raspuns({ error: 'Cerere invalidă.' }, 400, h);
  }

  const ids = Array.isArray(corp.ids)
    ? [...new Set(corp.ids.filter((n): n is number => Number.isInteger(n) && n > 0))].slice(0, MAX_II)
    : [];
  if (!ids.length) return raspuns({ error: 'Coșul e gol.' }, 400, h);

  const cheieSecreta = Deno.env.get('STRIPE_SECRET_KEY');
  const cheiePublica = Deno.env.get('STRIPE_PUBLISHABLE_KEY');
  if (!cheieSecreta || !cheiePublica) {
    return raspuns({ error: 'Plata nu e configurată încă. Scrie-mi și rezolvăm comanda pe email.' }, 503, h);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await db
    .from('products')
    .select('id,name,description,price_cents,currency,status,active')
    .in('id', ids);

  if (error) return raspuns({ error: 'Nu am putut citi iile.' }, 500, h);

  const deVanzare = (data ?? []).filter((p) => p.active && p.status !== 'vanduta');
  if (deVanzare.length !== ids.length) {
    return raspuns({ error: 'O ie din coș nu mai e liberă. Reîncarcă pagina.' }, 409, h);
  }

  const stripe = new Stripe(cheieSecreta, { httpClient: Stripe.createFetchHttpClient() });

  try {
    const sesiune = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      redirect_on_completion: 'never',
      line_items: deVanzare.map((p) => ({
        quantity: 1,
        price_data: {
          currency: (p.currency ?? 'RON').toLowerCase(),
          unit_amount: p.price_cents,
          product_data: {
            name: p.name,
            ...(p.description ? { description: String(p.description).slice(0, 300) } : {}),
          },
        },
      })),
      shipping_address_collection: { allowed_countries: ['RO'] },
      phone_number_collection: { enabled: true },
      metadata: { product_ids: deVanzare.map((p) => p.id).join(',') },
    });

    return raspuns({ clientSecret: sesiune.client_secret, publishableKey: cheiePublica }, 200, h);
  } catch (e) {
    console.error('stripe', e);
    return raspuns({ error: 'Stripe nu a pornit plata. Încearcă din nou.' }, 502, h);
  }
});
