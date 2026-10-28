# Audinc-landingspagina's (audinc.nl/lp/)

De advertentiepagina's van Audinc. Alles wat op `main` staat, gaat automatisch live
op **audinc.nl/lp/&lt;naam&gt;/**.

## Hoe het werkt

1. Je pusht naar `main`.
2. De workflow *Live zetten op audinc.nl* controleert de bestanden
   (`scripts/controleer.mjs`) en start een nieuwe build van audinc.nl.
3. Die build haalt deze repo op en zet hem op de site. Na ongeveer 6 tot 20 minuten
   staat het live. Builds van audinc.nl lopen één voor één, dus soms duurt het
   langer.

Faalt de controle, dan gaat er niets live en blijft de vorige versie staan.

## Mappen

| In deze repo | Op audinc.nl |
|---|---|
| `lp/<naam>/index.html` | `audinc.nl/lp/<naam>/` |
| `audinc/…` | `audinc.nl/audinc/…` (beeld, scripts, css) |

Afbeeldingen die op meerdere pagina's voorkomen staan in `audinc/gedeeld/`.
Verwijs altijd met een absoluut pad (`/audinc/...`).

## Regels

- **Elke pagina houdt `<meta name="robots" content="noindex, nofollow">`.** Zonder die
  tag faalt de controle. De site zet daarnaast zelf een `X-Robots-Tag`-header op
  `/lp/` en `/audinc/`.
- Alleen `lp/` en `audinc/` worden overgenomen. Andere mappen of bestanden in deze
  repo komen niet op de site.
- Toegestane bestandstypen: html, css, js, webp, avif, png, jpg, svg, ico, gif,
  woff/woff2, json, mp4, webm, txt. Maximaal 20 MB per bestand.
- `?location=<stad>` wordt door audinc.nl ingevuld in `{{LOCATION}}` en
  `{{LOCATION_FAQ}}`. De stedenlijst staat in `functions/_lp-locatie.js` van
  audinc-web; een nieuwe stad daar laten toevoegen.
- Boeken gaat via `/api/trafft/*` van audinc.nl (bootstrap, available-times, book),
  met `window.AUDINC_BOOKING.backend = 'audinc-site'`.
- Teksten volgen audinc.nl: 4,7/5 op basis van 317 reviews, 13 vestigingen in
  Nederland (19 in NL en BE), oorsmeer op 12 locaties (niet in Breda), productie
  15 werkdagen, spoed 5 werkdagen plus verzendtijd.

## Testen voor het live gaat

De pagina's boeken via audinc.nl zelf, dus lokaal openen werkt alleen voor de opmaak.
Voor een volledige test (boeken, cookiebanner, `?location=`): vraag Steven om een
preview van audinc-web.
