// Controle vóór het live zetten (draait in .github/workflows/live.yml).
// Faalt deze, dan wordt audinc.nl niet opnieuw gebouwd en blijft de vorige
// versie van de pagina's staan.
//
// Dezelfde regels gelden nog een keer bij de build van audinc.nl zelf
// (scripts/lp/haal-landingspaginas.mjs in audinc-eu/audinc-web): wat hier
// doorheen glipt, wordt daar alsnog tegengehouden of gerepareerd.
import fs from 'node:fs';
import path from 'node:path';

const TOEGESTAAN = /\.(html|css|js|webp|avif|png|jpe?g|svg|ico|gif|woff2?|json|mp4|webm|txt)$/i;
const MAX_BYTES = 20 * 1024 * 1024; // Cloudflare Pages weigert bestanden boven 25 MiB
const NOINDEX = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i;

const fouten = [];
const bestanden = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      fouten.push(`${p}: symbolische links zijn niet toegestaan`);
      return [];
    }
    return e.isDirectory() ? bestanden(p) : [p];
  });

for (const map of ['lp', 'audinc']) {
  if (!fs.existsSync(map)) {
    fouten.push(`map ${map}/ ontbreekt`);
    continue;
  }
  for (const f of bestanden(map)) {
    if (!TOEGESTAAN.test(f)) fouten.push(`${f}: bestandstype niet toegestaan`);
    if (fs.statSync(f).size > MAX_BYTES) fouten.push(`${f}: groter dan 20 MB`);
    if (map === 'lp' && f.endsWith('.html') && !NOINDEX.test(fs.readFileSync(f, 'utf8'))) {
      fouten.push(`${f}: <meta name="robots" content="noindex, nofollow"> ontbreekt`);
    }
  }
}

const pagina = (f) => /^lp\/[a-z0-9-]+\/index\.html$/.test(f);
const paginas = fs.existsSync('lp') ? bestanden('lp').filter(pagina) : [];

if (fouten.length) {
  console.error(`Niet live gezet, ${fouten.length} probleem/problemen:\n- ${fouten.join('\n- ')}`);
  process.exit(1);
}
console.log(`In orde: ${paginas.length} pagina's.`);
