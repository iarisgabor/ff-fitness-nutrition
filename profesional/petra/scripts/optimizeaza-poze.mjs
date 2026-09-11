import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SURSA = join(root, "poze-fotograf");
const TINTA = join(root, "assets", "foto");
const OG_TINTA = join(root, "assets", "og-cover.jpg");

// Poza sursa pentru Open Graph — singura orizontala din cele 8, se decupeaza cel mai curat la 1200x630.
const SURSA_OG = "splendor-silk-wear-01.jpeg";

// Latimile servite prin srcset. Nicio poza nu e marita peste dimensiunea ei nativa.
const LATIMI = [640, 1024, 1600];

// Calitate ridicata deliberat: originalele au trecut deja prin compresia WhatsApp,
// iar o a doua compresie agresiva ar acumula artefacte exact in textura pielii.
const CALITATE = 88;

const slug = (nume) =>
  nume
    .toLowerCase()
    .replace(extname(nume).toLowerCase(), "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const fisiere = (await readdir(SURSA)).filter((f) =>
  /\.(jpe?g|png|webp|tiff?)$/i.test(f),
);

if (fisiere.length === 0) {
  console.error(`Niciun fisier de imagine in ${SURSA}`);
  process.exit(1);
}

await mkdir(TINTA, { recursive: true });

const manifest = [];

for (const fisier of fisiere) {
  const intrare = join(SURSA, fisier);
  const baza = slug(fisier);
  const meta = await sharp(intrare).metadata();
  const latimi = LATIMI.filter((l) => l <= meta.width);
  if (latimi.length === 0) latimi.push(meta.width);

  const variante = [];
  for (const latime of latimi) {
    const iesire = `${baza}-${latime}.webp`;
    await sharp(intrare)
      .resize({ width: latime, withoutEnlargement: true })
      .webp({ quality: CALITATE })
      .toFile(join(TINTA, iesire));
    variante.push({ latime, fisier: iesire });
  }

  manifest.push({
    id: baza,
    latime: meta.width,
    inaltime: meta.height,
    orientare: meta.width >= meta.height ? "oriz" : "vert",
    variante,
  });

  console.log(
    `${fisier} -> ${baza} (${meta.width}x${meta.height}, ${variante.length} variante)`,
  );
}

await writeFile(
  join(TINTA, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log(`\n${manifest.length} imagini procesate in assets/foto/`);

// Coperta Open Graph — 1200x630, decupata din singura poza orizontala.
if (fisiere.includes(SURSA_OG)) {
  await sharp(join(SURSA, SURSA_OG))
    .resize({ width: 1200, height: 630, fit: "cover", position: "attention" })
    .jpeg({ quality: 85 })
    .toFile(OG_TINTA);
  console.log(`Coperta Open Graph generata din ${SURSA_OG} -> assets/og-cover.jpg`);
} else {
  console.warn(
    `Atentie: ${SURSA_OG} nu a fost gasita in ${SURSA} — nicio coperta Open Graph generata.`,
  );
}
