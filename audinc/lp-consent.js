/* Cookiebanner voor de landingspagina's op audinc.nl/lp/.
   Alleen in gebruik op audinc.nl, niet op het subdomein.

   Waarom een eigen bestand en niet src/components/consent/ConsentBanner.astro:
   de LP's zijn losse HTML-pagina's buiten de Astro-layout, en die banner hangt
   aan Tailwind en de preflight-reset uit global.css. Die reset zou de opmaak
   van de LP's raken. Dit is dezelfde banner in gewone CSS.

   Wat hetzelfde MOET blijven als src/lib/consent.ts en ConsentBanner.astro,
   anders kiest de bezoeker op de LP iets anders dan op de rest van de site:
     cookie   audinc_consent, host-only, path=/, 180 dagen, samesite=lax
     inhoud   { v: 1, analytics, marketing, ts, id }
     signaal  gtag consent update + dataLayer-event audinc_consent_update
     logboek  POST /api/consent { action: 'log', ..., locale: 'nl', source: 'banner' }
   De opgeslagen keuze wordt al in de <head> toegepast, vóór GTM. Dit script
   toont alleen de banner als er nog geen geldige keuze is. */
(function () {
  'use strict';

  var COOKIE = 'audinc_consent';
  var COOKIEYES = 'cookieyes-consent';
  var VERSION = 1;
  var MAX_AGE = 180 * 24 * 60 * 60;
  var EVENT = 'audinc_consent_update';
  var ENDPOINT = '/api/consent';
  var PRIVACY = 'https://audinc.nl/privacyverklaring/';

  function gtag() {
    if (typeof window.gtag === 'function') window.gtag.apply(null, arguments);
    else (window.dataLayer = window.dataLayer || []).push(arguments);
  }
  function lees(naam) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + naam + '=([^;]*)'));
    return m ? m[1] : null;
  }
  function stored() {
    try {
      var raw = lees(COOKIE);
      if (!raw) return null;
      var c = JSON.parse(decodeURIComponent(raw));
      return c && c.v === VERSION ? c : null;
    } catch (e) { return null; }
  }
  function fromCookieYes() {
    var raw = lees(COOKIEYES);
    if (!raw) return null;
    var velden = {};
    decodeURIComponent(raw).split(',').forEach(function (deel) {
      var kv = deel.split(':');
      velden[(kv[0] || '').trim()] = (kv[1] || '').trim();
    });
    if (velden.action !== 'yes') return null;
    return { analytics: velden.analytics === 'yes', marketing: velden.advertisement === 'yes' };
  }
  function apply(c) {
    var ads = c.marketing ? 'granted' : 'denied';
    gtag('consent', 'update', {
      ad_storage: ads, ad_user_data: ads, ad_personalization: ads,
      analytics_storage: c.analytics ? 'granted' : 'denied',
    });
    (window.dataLayer = window.dataLayer || []).push({
      event: EVENT, consentAnalytics: c.analytics, consentMarketing: c.marketing,
    });
  }
  function logChoice(c, source) {
    try {
      var body = JSON.stringify({ action: 'log', id: c.id, analytics: c.analytics, marketing: c.marketing, version: c.v, locale: 'nl', source: source });
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } catch (e) { /* logboek is bijzaak */ }
  }
  function nieuwId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function save(analytics, marketing, source) {
    source = source || 'banner';
    var c = { v: VERSION, analytics: analytics, marketing: marketing, ts: new Date().toISOString(), id: nieuwId() };
    var secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = COOKIE + '=' + encodeURIComponent(JSON.stringify(c)) + '; path=/; max-age=' + MAX_AGE + '; samesite=lax' + secure;
    apply(c);
    logChoice(c, source);
    if (source === 'banner') close();
  }

  var CSS =
    '.lpc,.lpc *{box-sizing:border-box}' +
    '.lpc{font-family:"Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;color:#1a1a1a;line-height:1.5}' +
    '.lpc[hidden],.lpc [hidden]{display:none!important}' +
    '.lpc-bar:focus,.lpc-pan:focus{outline:none}' +
    '.lpc-ov{position:fixed;inset:0;background:rgba(10,10,10,.4);z-index:2147483000}' +
    '.lpc-bar{position:fixed;left:0;right:0;bottom:0;margin:0 auto;max-width:1120px;background:#fff;border-radius:20px 20px 0 0;' +
      'padding:20px 22px;box-shadow:0 -8px 40px rgba(10,10,10,.18);z-index:2147483001;display:flex;flex-direction:column;gap:14px}' +
    '.lpc-t{margin:0;font-size:17px;font-weight:700}' +
    '.lpc-p{margin:6px 0 0;font-size:14px;color:#444}' +
    '.lpc-p a{color:#1a1a1a;text-decoration:underline}' +
    '.lpc-btns{display:flex;flex-direction:column;gap:8px}' +
    '.lpc-b{height:46px;border-radius:999px;padding:0 20px;font:600 15px/1 inherit;font-family:inherit;cursor:pointer;border:0;white-space:nowrap}' +
    '.lpc-acc{background:#1a1a1a;color:#fff}.lpc-rej{background:#f1efea;color:#1a1a1a}' +
    '.lpc-gh{background:none;color:#1a1a1a;text-decoration:underline}' +
    '.lpc-pan{position:fixed;left:0;right:0;bottom:0;margin:0 auto;max-width:560px;max-height:85vh;overflow:auto;background:#fff;' +
      'border-radius:20px 20px 0 0;padding:22px;z-index:2147483002}' +
    '.lpc-row{background:#f7f6f2;border-radius:14px;padding:14px;margin-top:10px}' +
    '.lpc-row label,.lpc-rh{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:600;font-size:15px;cursor:pointer}' +
    '.lpc-row p{margin:4px 0 0;font-size:13px;color:#555}' +
    '.lpc-row input{width:20px;height:20px;accent-color:#e8611a;cursor:pointer}' +
    '.lpc-x{position:absolute;right:16px;top:12px;background:none;border:0;font-size:26px;cursor:pointer;color:#666}' +
    '@media(min-width:900px){.lpc-bar{bottom:24px;border-radius:20px;flex-direction:row;align-items:center;gap:28px}' +
      '.lpc-bar>div:first-child{flex:1}.lpc-btns{flex-direction:row}' +
      '.lpc-pan{top:50%;bottom:auto;transform:translateY(-50%);border-radius:20px}}' +
    '@media(min-width:560px) and (max-width:899px){.lpc-btns{flex-direction:row}}';

  var root, bar, panel, ov, boxA, boxM, lastFocus = null;

  function build() {
    if (root) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div');
    root.className = 'lpc'; root.hidden = true;
    root.innerHTML =
      '<div class="lpc-ov" hidden></div>' +
      '<div class="lpc-bar" role="dialog" tabindex="-1" aria-labelledby="lpc-t" aria-describedby="lpc-p">' +
        '<div><p class="lpc-t" id="lpc-t">Cookies op deze site</p>' +
        '<p class="lpc-p" id="lpc-p">Noodzakelijke cookies zorgen dat de site werkt. Met je toestemming meten we ook hoe de site gebruikt wordt en hoe onze campagnes presteren. Je kunt je keuze altijd wijzigen. <a href="' + PRIVACY + '">Lees onze privacyverklaring</a></p></div>' +
        '<div class="lpc-btns"><button type="button" class="lpc-b lpc-gh" data-a="prefs">Voorkeuren</button>' +
        '<button type="button" class="lpc-b lpc-rej" data-a="reject">Alleen noodzakelijk</button>' +
        '<button type="button" class="lpc-b lpc-acc" data-a="accept">Alles accepteren</button></div>' +
      '</div>' +
      '<div class="lpc-pan" role="dialog" aria-modal="true" aria-labelledby="lpc-pt" hidden>' +
        '<button type="button" class="lpc-x" data-a="dismiss" aria-label="Sluiten">&times;</button>' +
        '<p class="lpc-t" id="lpc-pt">Cookievoorkeuren</p>' +
        '<p class="lpc-p">Kies welke cookies we mogen plaatsen. Noodzakelijke cookies blijven altijd aan, zonder die werken de site en het maken van een afspraak niet.</p>' +
        '<div class="lpc-row"><div class="lpc-rh"><span>Noodzakelijk</span><span style="font-weight:400;color:#777;font-size:13px">Altijd aan</span></div><p>Nodig voor de site zelf en de beveiliging van formulieren. Geen tracking.</p></div>' +
        '<div class="lpc-row"><label><span>Statistieken</span><input type="checkbox" data-c="analytics"></label><p>Anonieme cijfers over pagina&#39;s, apparaten en bezoekersaantallen, zodat we de site kunnen verbeteren.</p></div>' +
        '<div class="lpc-row"><label><span>Marketing</span><input type="checkbox" data-c="marketing"></label><p>Meet welke advertentie tot een afspraak leidde, en maakt relevante advertenties mogelijk.</p></div>' +
        '<div class="lpc-btns" style="margin-top:16px"><button type="button" class="lpc-b lpc-rej" data-a="reject" style="flex:1">Alleen noodzakelijk</button>' +
        '<button type="button" class="lpc-b lpc-acc" data-a="save" style="flex:1">Keuze opslaan</button></div>' +
      '</div>';
    document.body.appendChild(root);
    ov = root.querySelector('.lpc-ov'); bar = root.querySelector('.lpc-bar'); panel = root.querySelector('.lpc-pan');
    boxA = root.querySelector('[data-c="analytics"]'); boxM = root.querySelector('[data-c="marketing"]');
    root.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('[data-a]') : null;
      if (e.target === ov) return dismiss();
      if (!a) return;
      var actie = a.getAttribute('data-a');
      if (actie === 'accept') save(true, true);
      else if (actie === 'reject') save(false, false);
      else if (actie === 'save') save(boxA.checked, boxM.checked);
      else if (actie === 'prefs') showPanel(true);
      else if (actie === 'dismiss') dismiss();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden && !panel.hidden) dismiss();
    });
  }
  function showPanel(show) {
    panel.hidden = !show; ov.hidden = !show; bar.hidden = show;
    if (show) { var i = panel.querySelector('input'); if (i) i.focus(); }
  }
  function close() {
    if (!root) return;
    root.hidden = true; showPanel(false);
    if (lastFocus) { lastFocus.focus(); lastFocus = null; }
  }
  function dismiss() { if (stored()) close(); else showPanel(false); }
  function openBanner() { build(); root.hidden = false; showPanel(false); bar.focus(); }

  window.audincConsent = {
    open: function () {
      build();
      lastFocus = document.activeElement;
      var c = stored();
      boxA.checked = !!(c && c.analytics); boxM.checked = !!(c && c.marketing);
      root.hidden = false; showPanel(true);
    },
  };
  // Elke [data-consent-open] (de link "Cookievoorkeuren" in de footer) opent het paneel.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-consent-open]') : null;
    if (!t) return;
    e.preventDefault();
    window.audincConsent.open();
  });

  function start() {
    if (stored()) return;
    var oud = fromCookieYes();
    if (oud) save(oud.analytics, oud.marketing, 'cookieyes-migratie');
    else openBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
