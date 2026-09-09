# Filă cu Filă — site de test pentru o librărie

Site static (fără build step) cu un catalog de cărți și un chat cu AI în colțul din
dreapta jos: vizitatorul spune ce îl frământă, iar Claude recomandă 1-3 cărți din
catalogul afișat pe pagină.

## Structură

- `index.html`, `styles.css`, `script.js` — frontend-ul (catalog + widget de chat)
- `worker/` — Worker Cloudflare cu singurul endpoint `POST /api/chat`, care apelează
  Claude cu catalogul complet în system prompt și un `json_schema` de output, ca
  recomandările să vină mereu ca id-uri valide din catalog
- `worker/catalog.js` — catalogul folosit de AI (trebuie sincronizat manual cu
  `CATALOG` din `script.js` — id-urile trebuie să fie identice, altfel widget-ul nu
  poate evidenția cartea recomandată)

## Rulare locală

```bash
cd worker
npm install
wrangler secret put ANTHROPIC_API_KEY   # o singură dată, sau pune-o în .dev.vars local
npm run dev                              # pornește pe http://localhost:8787
```

Apoi deschide `index.html` direct în browser (sau printr-un server static simplu) —
`script.js` detectează `localhost` și trimite cererile de chat la
`http://localhost:8787/api/chat`.

## Deploy

- Frontend: orice hosting static (Vercel etc.) — sunt doar 3 fișiere.
- Worker: `cd worker && wrangler deploy`, apoi `wrangler secret put ANTHROPIC_API_KEY`.
  Dacă numele contului Cloudflare (subdomeniul `*.workers.dev`) diferă de
  `iarisgabor`, actualizează `CHAT_API_URL` din `script.js` cu URL-ul real afișat de
  `wrangler deploy`.

Secretul `ANTHROPIC_API_KEY` nu trebuie pus niciodată în cod — doar prin
`wrangler secret put` sau `worker/.dev.vars` (gitignored).
