// stripe-webhook — singurul loc care are dreptul să spună că o ie s-a vândut.
// Semnătura Stripe se verifică înainte de orice; fără ea nu se atinge baza.
// Aici JWT-ul e oprit intenționat: semnătura ține locul autentificării.
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Metodă greșită.', { status: 405 });

  const cheieSecreta = Deno.env.get('STRIPE_SECRET_KEY');
  const secretWebhook = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!cheieSecreta || !secretWebhook) return new Response('Neconfigurat.', { status: 503 });

  const semnatura = req.headers.get('stripe-signature');
  if (!semnatura) return new Response('Lipsește semnătura.', { status: 400 });

  const brut = await req.text();
  const stripe = new Stripe(cheieSecreta, { httpClient: Stripe.createFetchHttpClient() });

  let eveniment: Stripe.Event;
  try {
    eveniment = await stripe.webhooks.constructEventAsync(
      brut, semnatura, secretWebhook, undefined, cryptoProvider,
    );
  } catch (e) {
    console.error('semnatura invalida', e);
    return new Response('Semnătură invalidă.', { status: 400 });
  }

  if (eveniment.type === 'checkout.session.completed') {
    const sesiune = eveniment.data.object as Stripe.Checkout.Session;
    if (sesiune.payment_status === 'paid') {
      const ids = String(sesiune.metadata?.product_ids ?? '')
        .split(',')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n > 0);

      if (ids.length) {
        const db = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { error } = await db.from('products').update({ status: 'vanduta' }).in('id', ids);
        if (error) {
          // 500 ca Stripe să reîncerce — altfel ia ar rămâne la vânzare după ce a fost plătită
          console.error('nu am putut marca iile vandute', error);
          return new Response('Eroare la bază.', { status: 500 });
        }
      }
    }
  }

  return new Response(JSON.stringify({ primit: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
