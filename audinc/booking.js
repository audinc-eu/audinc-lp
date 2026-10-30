/* Audinc native booking wizard.
   Replaces the old Trafft iframe embed. Talks ONLY to our same-origin
   /api/trafft/* proxy (no credentials client-side). Builds the dataLayer
   itself so Google Ads Enhanced Conversions work with real user_data. */
(function () {
  'use strict';

  var API = '/api/trafft';
  var CFG = window.AUDINC_BOOKING || {}; // optional per-page overrides (e.g. defaultServiceId)
  // De tekst over vooruitbetalen hoort bij de betaalde behandeling, niet bij de
  // pagina. Op de oorcheck-quiz kan de bezoeker ook de gratis aanmeting kiezen,
  // en dan moet die melding weg. We onthouden hem daarom apart.
  var PREPAY_BRON = CFG.prepayNote || null;

  var state = {
    step: 'service',
    categories: [],
    service: null,        // {id,name,duration,categoryId}
    location: null,       // {id,name,address}
    locations: [],
    slots: {},            // { 'YYYY-MM-DD': { 'HH:MM': slotObj } }
    date: null,
    time: null,
    slot: null,
    formStarted: false,
    submitting: false,
  };

  // ---------- helpers ----------
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === 'class') e.className = props[k];
      else if (k === 'html') e.innerHTML = props[k];
      else if (k === 'text') e.textContent = props[k];
      else if (k.slice(0, 2) === 'on' && typeof props[k] === 'function') e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function tracking() { return window.__lpTracking || {}; }
  // Locatie uit ?location= param (bv. groningen, den-haag) matchen op een Trafft-locatie.
  // Alleen voorselecteren als het ondubbelzinnig één locatie is (Amsterdam heeft er 2 -> niet skippen).
  // Sommige steden hebben twee schrijfwijzen in advertenties. De Trafft-naam is leidend,
  // dus we vertalen de alias eerst naar de naam die Trafft gebruikt.
  var LOCATION_ALIAS = {
    's hertogenbosch': 'den bosch',
    'shertogenbosch': 'den bosch',
    'hertogenbosch': 'den bosch',
  };
  function paramLocation() {
    try {
      var p = new URLSearchParams(location.search).get('location');
      if (!p) return null;
      p = p.toLowerCase().replace(/-/g, ' ').replace(/'/g, '').trim();
      return LOCATION_ALIAS[p] || p;
    }
    catch (e) { return null; }
  }
  // Alle Trafft-locaties die bij de ?location= param horen (exact eerst, anders prefix).
  // "groningen" -> [Groningen]; "amsterdam" -> [Amsterdam Rokin, Amsterdam Sloterdijk].
  function paramLocationMatches(locs) {
    var p = paramLocation();
    if (!p || !locs) return [];
    var norm = function (s) { return String(s || '').toLowerCase().trim(); };
    var exact = locs.filter(function (l) { return norm(l.name) === p; });
    if (exact.length) return exact;
    return locs.filter(function (l) { return norm(l.name).indexOf(p) === 0; });
  }
  // Foto van de vestiging. De officiele site toont die in zijn eigen boekingsmodule
  // en dat maakt de keuze herkenbaar: je ziet het pand waar je straks naar binnen loopt.
  // De bestanden staan zelf gehost in /audinc/locaties/ (300x225 webp, ~8 kB per stuk).
  // NIET hotlinken naar audinc.nl/_astro/: dat is een Astro-build en elke naam heeft een
  // contenthash, dus na hun eerstvolgende deploy geeft elke URL stil een 404.
  //
  // Sleutel is het Trafft-locatie-id, met de geslugde naam als terugval zodat een
  // hernoemde vestiging zijn foto houdt. Locaties zonder foto (Den Bosch is sep 2026
  // nieuw) krijgen een neutraal vlak, precies zoals audinc.nl zelf doet.
  var LOCATION_PHOTO = {
    4: 'amsterdam-rokin', 8: 'amsterdam-sloterdijk', 21: 'apeldoorn', 5: 'breda',
    15: 'den-haag', 7: 'eindhoven', 6: 'groningen', 10: 'maastricht', 16: 'nijmegen',
    11: 'rotterdam', 12: 'utrecht', 14: 'zwolle',
    17: 'antwerpen', 18: 'brussel', 19: 'essen', 35: 'gent', 27: 'kortrijk', 20: 'roeselare',
  };
  var PHOTO_SLUGS = (function () {
    var set = {};
    for (var k in LOCATION_PHOTO) { if (Object.prototype.hasOwnProperty.call(LOCATION_PHOTO, k)) set[LOCATION_PHOTO[k]] = 1; }
    return set;
  })();
  function slugify(s) {
    var t = String(s || '').toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function locationPhoto(loc) {
    if (!loc) return null;
    var slug = LOCATION_PHOTO[Number(loc.id)];
    if (!slug) { var s = slugify(loc.name); if (PHOTO_SLUGS[s]) slug = s; }
    return slug ? '/audinc/locaties/' + slug + '.webp' : null;
  }
  // extra = modifier-class voor het formaat (ab-thumbS in de lijst, ab-thumbM daarbuiten).
  function locThumb(loc, extra) {
    var src = locationPhoto(loc);
    var cls = 'ab-locThumb' + (extra ? ' ' + extra : '');
    if (!src) return el('span', { class: cls + ' ab-locThumb--leeg', html: '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' });
    return el('img', {
      class: cls, src: src, alt: 'Audinc ' + (loc.name || ''),
      width: '300', height: '225', loading: 'lazy', decoding: 'async',
    });
  }

  function dl(obj) { window.dataLayer = window.dataLayer || []; window.dataLayer.push(obj); }
  // Push waarbij we wachten tot GTM zijn tags heeft afgevuurd. Nodig als we direct
  // daarna wegnavigeren: een gewone push is asynchroon, dus de Ads-conversie haalt
  // het dan niet en de boeking valt stil uit de meting. eventCallback vuurt zodra
  // alle tags klaar zijn; de timers zijn het vangnet als GTM geblokkeerd is of
  // traag reageert.
  function dlDan(obj, klaar) {
    window.dataLayer = window.dataLayer || [];
    var gedaan = false;
    var af = function () { if (!gedaan) { gedaan = true; klaar(); } };
    if (typeof window.google_tag_manager !== 'object' || window.google_tag_manager === null) {
      window.dataLayer.push(obj); af(); return;
    }
    var kopie = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) kopie[k] = obj[k]; }
    kopie.eventCallback = af;
    kopie.eventTimeout = 1500;
    window.dataLayer.push(kopie);
    window.setTimeout(af, 1800);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  }
  function stripHtml(s) { var t = document.createElement('div'); t.innerHTML = s || ''; return (t.textContent || '').trim(); }

  async function api(path) {
    if (SITE) return siteApi(path);
    var r = await fetch(API + path, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('api ' + r.status);
    return r.json();
  }

  // ---------- backend van audinc.nl zelf ----------
  // CFG.backend === 'audinc-site': de pagina staat op audinc.nl/lp/ en niet op het
  // subdomein. Daar is /api/trafft/* van de site zelf (Cloudflare Pages Functions),
  // met andere endpoints dan onze proxy: bootstrap, available-times en book. Deze
  // laag vertaalt die naar de vorm die de rest van de wizard al kent, zodat de
  // stappen zelf niets hoeven te weten. Zonder CFG.backend verandert er niets.
  var SITE = CFG.backend === 'audinc-site';
  var bootstrapP = null;
  function bootstrap() {
    if (!bootstrapP) {
      bootstrapP = fetch('/api/trafft/bootstrap', { headers: { accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d || !d.ok) throw new Error('bootstrap'); return d; });
      bootstrapP.catch(function () { bootstrapP = null; });
    }
    return bootstrapP;
  }
  // Alleen de Nederlandse hoofddiensten; de Belgische twin-ids wisselt hun server zelf.
  var SITE_SERVICES = [4, 5, 6, 7, 14, 15];
  // Hun backend geeft 502 op een bereik langer dan ongeveer een week.
  var SITE_MAX_DAGEN = 7;

  async function siteApi(path) {
    var q = new URLSearchParams(path.split('?')[1] || '');
    if (path.indexOf('/services') === 0) {
      var b = await bootstrap();
      var svcs = (b.services || []).filter(function (s) { return SITE_SERVICES.indexOf(Number(s.id)) !== -1; });
      return [{ id: 0, name: 'Afspraken', services: svcs.map(function (s) {
        return { id: s.id, name: s.name, duration: (s.durationMin || 0) * 60, price: s.price || 0, type: 'service', description: '' };
      }) }];
    }
    if (path.indexOf('/locations') === 0) {
      var b2 = await bootstrap();
      var ids = (b2.serviceLocations || {})[q.get('service')];
      var locs = b2.locations || [];
      // Microsuctie (14) is verborgen voor het publieke Trafft-formulier en heeft
      // daarom een lege lijst. Die dienst is alleen in Nederland, dus dan de NL-vestigingen.
      if (Array.isArray(ids) && ids.length) locs = locs.filter(function (l) { return ids.indexOf(Number(l.id)) !== -1; });
      // Zonder lijst vallen we terug op alle NL-vestigingen, maar Breda (id 5) doet
      // geen oorreiniging. Gaat de bootstrap wel een lijst geven, dan wint die.
      else if (Number(q.get('service')) === 14) locs = locs.filter(function (l) { return Number(l.id) !== 5 && !/breda/i.test(l.name || ''); });
      // De advertentiepagina's zijn alleen voor Nederland: Belgische vestigingen nooit tonen.
      locs = locs.filter(function (l) { return l.country === 'netherlands'; });
      return locs.map(function (l) { return { id: l.id, name: l.name, address: l.address, country: l.country }; });
    }
    if (path.indexOf('/slots') === 0) {
      var service = q.get('service'), loc = q.get('location');
      var reeksen = [];
      var cursor = new Date(q.get('start') + 'T00:00:00Z'), laatste = new Date(q.get('end') + 'T00:00:00Z');
      while (cursor <= laatste) {
        var tot = new Date(cursor); tot.setUTCDate(tot.getUTCDate() + SITE_MAX_DAGEN - 1);
        if (tot > laatste) tot = laatste;
        reeksen.push([cursor.toISOString().slice(0, 10), tot.toISOString().slice(0, 10)]);
        cursor = new Date(tot); cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      // Drie tegelijk: snel genoeg, en Trafft krijgt geen negen verzoeken in één klap.
      var perDag = {};
      var fresh = state._freshSlots ? '&fresh=1' : '';
      state._freshSlots = false;
      for (var i = 0; i < reeksen.length; i += 3) {
        var batch = await Promise.all(reeksen.slice(i, i + 3).map(function (r) {
          return fetch('/api/trafft/available-times?service=' + encodeURIComponent(service) +
            '&location=' + encodeURIComponent(loc) + '&from=' + r[0] + '&to=' + r[1] + fresh,
            { headers: { accept: 'application/json' } })
            .then(function (x) { return x.json(); }).catch(function () { return null; });
        }));
        batch.forEach(function (d) {
          if (!d || !d.ok || !Array.isArray(d.days)) return;
          d.days.forEach(function (dag) {
            if (!dag || !Array.isArray(dag.slots) || !dag.slots.length) return;
            var tijden = perDag[dag.date] || (perDag[dag.date] = {});
            dag.slots.forEach(function (s) {
              tijden[String(s.time).slice(0, 5)] = {
                s: [Number(service)], b: 1,
                e: [Number(s.employee) || 0],
                l: [Number(s.location != null ? s.location : loc)],
              };
            });
          });
        });
      }
      return perDag;
    }
    throw new Error('api onbekend pad');
  }

  // Hun boekings-endpoint wil E.164, net als hun eigen wizard stuurt. Onze
  // formulieren vragen gewoon om 06..., dus hier omzetten. De landcode volgt de
  // gekozen vestiging, zoals src/lib/phone.ts op de site: een Belg die bij
  // Antwerpen 0470... intypt is +32470..., niet +31470... (dan komt de
  // sms-herinnering van Trafft nooit aan). Een volledig nummer met + of 00 wint.
  function nieuwTxId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'tx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function landcode(loc) {
    if (!loc) return '31';
    if (loc.country === 'belgium' || /belgium|belgi[eë]/i.test(loc.address || '')) return '32';
    return '31';
  }
  function naarE164(invoer, code) {
    code = code || '31';
    var ruw = String(invoer || '').trim();
    if (!ruw) return '';
    var e164;
    if (ruw.charAt(0) === '+') e164 = '+' + ruw.slice(1).replace(/\D/g, '');
    else {
      var cijfers = ruw.replace(/\D/g, '');
      if (!cijfers) return '';
      if (cijfers.indexOf('00') === 0) e164 = '+' + cijfers.slice(2);
      else if (cijfers.indexOf(code) === 0 && cijfers.length > 10) e164 = '+' + cijfers;
      else e164 = '+' + code + cijfers.replace(/^0+/, '');
    }
    // "+32 0470..." -> "+32470...": de nationale nul hoort niet achter de landcode.
    return e164.replace(/^\+(31|32)0/, '+$1');
  }

  // Boeken via hun book.js. Daarmee erven we hun no-show-blokkade, de verse
  // slotcontrole en de Belgische service-vertaling. Antwoord in onze vorm:
  // { bookingId } of { paymentUrl }, en bij een weigering een Error met reason.
  async function siteBook(p) {
    var t = tracking();
    var attributie = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign']
      .filter(function (k) { return t[k]; })
      .map(function (k) { return k + '=' + t[k]; }).join(' | ');
    var r = await fetch('/api/trafft/book', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service: Number(p.service), location: Number(p.location),
        employee: Number(p.selectedSlot && p.selectedSlot.e && p.selectedSlot.e[0]) || 0,
        date: p.selectedDate, time: p.selectedTime,
        firstName: p.firstName, lastName: p.lastName, email: p.email,
        phone: naarE164(p.phone, landcode(state.location)), message: p.note || '', productOptions: '',
        attribution: attributie, language: 'nl',
      }),
    });
    var data = null; try { data = await r.json(); } catch (e) {}
    if (data && data.ok) return data;
    var err = new Error((data && data.reason) || ('http ' + r.status));
    err.reason = data && data.reason;
    err.redirect = data && data.redirect;
    throw err;
  }

  // ---------- DOM shell ----------
  var overlay, bodyEl, dotsEl;

  // CFG.paid: betaalde behandeling (microsuctie). Dan geen "gratis"/"Geen kosten"
  // in de modal, want dat spreekt de prijs op de pagina tegen. Beide worden bij
  // elke opening opnieuw gezet, zodat een pagina met twee diensten (bv. een quiz
  // die zowel de behandeling als de gratis aanmeting aanbiedt) de juiste tekst toont.
  // CFG.title: optionele kop per pagina, voor diensten die geen aanmeting zijn.
  // De in-ear-pagina boekt service 7 (beluisteren), en dan klopt "Plan je gratis
  // afspraak" wel maar zegt het niets over wat je gaat doen. Zonder CFG.title
  // blijft de tekst zoals hij was, dus alle andere pagina's veranderen niet.
  function headerHtml() {
    if (CFG.title) return CFG.title + ' <span>&bull; vrijblijvend</span>';
    return CFG.paid
      ? 'Maak een afspraak <span>&bull; online plannen</span>'
      : 'Plan je gratis afspraak <span>&bull; vrijblijvend</span>';
  }
  function trustList() {
    return CFG.paid
      ? ['\u2713 Geen verwijzing nodig', '\u2713 Vaak deze week terecht', '\u2713 Bevestiging per e-mail']
      : ['\u2713 Vrijblijvend', '\u2713 Geen kosten', '\u2713 Bevestiging per e-mail'];
  }
  function refreshChrome() {
    if (!overlay) return;
    var h = overlay.querySelector('.ab-header h3');
    if (h) h.innerHTML = headerHtml();
    var t = overlay.querySelector('.ab-trust');
    if (t) {
      t.innerHTML = '';
      trustList().forEach(function (x) { t.appendChild(el('span', { text: x })); });
    }
  }

  function buildShell() {
    if (overlay) { refreshChrome(); return; }
    bodyEl = el('div', { class: 'ab-body' });
    dotsEl = el('div', { class: 'ab-steps' });
    var header = el('div', { class: 'ab-header' }, [
      el('h3', { html: headerHtml() }),
      el('button', { class: 'ab-close', 'aria-label': 'Sluiten', onclick: closeBooking,
        html: '<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' }),
    ]);
    var trust = el('div', { class: 'ab-trust' }, trustList().map(function (t) {
      return el('span', { text: t });
    }));
    var modal = el('div', { class: 'ab-modal' }, [header, dotsEl, bodyEl, trust]);
    overlay = el('div', { class: 'ab-overlay', id: 'abBookingModal', onclick: function (e) { if (e.target === overlay) closeBooking(); } });
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('ab-active')) closeBooking(); });
  }

  function stepOrder() {
    var o = [];
    if (!CFG.defaultServiceId) o.push('service');
    if (!state._skippedLocation) o.push('location');
    o.push('datetime', 'details');
    return o;
  }
  function setDots() {
    var order = stepOrder();
    var idx = order.indexOf(state.step);
    dotsEl.innerHTML = '';
    order.forEach(function (_, i) { dotsEl.appendChild(el('div', { class: 'ab-dot' + (i <= idx ? ' on' : '') })); });
    dotsEl.style.display = state.step === 'success' ? 'none' : 'flex';
  }
  function loading(msg) { bodyEl.innerHTML = ''; bodyEl.appendChild(el('div', { class: 'ab-loadRow' }, [el('span', { class: 'ab-spin' }), msg || 'Laden...'])); }

  // ---------- Step 1: service ----------
  async function renderService() {
    state.step = 'service'; setDots(); loading('Beschikbare afspraken laden...');
    try {
      if (!state.categories.length) state.categories = await api('/services');
    } catch (e) { return renderError('Kon de afspraken niet laden. Probeer het later opnieuw.'); }

    // Optional per-page shortcut: jump straight to location for a fixed service.
    if (CFG.defaultServiceId && !state._skippedService) {
      state._skippedService = true;
      var found = pickService(CFG.defaultServiceId);
      if (found) { state.service = found; return renderLocation(); }
    }

    bodyEl.innerHTML = '';
    bodyEl.appendChild(el('div', { class: 'ab-stepTitle', text: 'Kies een afspraak' }));
    state.categories.forEach(function (cat) {
      var svcs = (cat.services || []).filter(function (s) { return s.type === 'service'; });
      if (!svcs.length) return;
      bodyEl.appendChild(el('div', { class: 'ab-catLabel', text: cat.name }));
      svcs.forEach(function (s) {
        bodyEl.appendChild(el('button', { class: 'ab-card', type: 'button', onclick: function () { chooseService(s, cat); } }, [
          el('div', { class: 'ab-cardMain' }, [
            el('div', { class: 'ab-cardName', text: s.name }),
            el('div', { class: 'ab-cardMeta', text: Math.round((s.duration || 0) / 60) + ' minuten' + (s.description ? ' · ' + truncate(stripHtml(s.description), 60) : '') }),
          ]),
          el('span', { class: 'ab-chev', html: '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' }),
        ]));
      });
    });
  }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function pickService(id) {
    for (var i = 0; i < state.categories.length; i++) {
      var cat = state.categories[i];
      var m = (cat.services || []).filter(function (s) { return String(s.id) === String(id); })[0];
      if (m) return { id: m.id, name: m.name, duration: m.duration, categoryId: cat.id };
    }
    return null;
  }
  function chooseService(s, cat) {
    state.service = { id: s.id, name: s.name, duration: s.duration, categoryId: cat.id };
    state.location = null; state.date = null; state.time = null; state.slot = null;
    dl({ event: 'booking_service_selected', service_id: s.id, service_name: s.name });
    renderLocation();
  }

  // ---------- Step 2: location ----------
  async function renderLocation() {
    state.step = 'location'; setDots(); loading('Locaties laden...');
    try { state.locations = await api('/locations?service=' + encodeURIComponent(state.service.id)); }
    catch (e) { return renderError('Kon de locaties niet laden.'); }

    // ?location= param: 1 match → direct selecteren en stap overslaan;
    // meerdere (bv. Amsterdam) → alleen die locaties tonen; geen match → volledige lijst.
    var list = state.locations;
    if (!state._skippedLocation) {
      var matches = paramLocationMatches(state.locations);
      if (matches.length === 1) {
        var pl = matches[0];
        state._skippedLocation = true; state._locationLocked = true;
        state.location = { id: pl.id, name: pl.name, address: pl.address };
        dl({ event: 'booking_location_selected', location_id: pl.id, location_name: pl.name, preselected: true });
        return renderDateTime();
      }
      if (matches.length > 1) list = matches;
    }

    bodyEl.innerHTML = '';
    if (!CFG.defaultServiceId) bodyEl.appendChild(backBtn(renderService));
    bodyEl.appendChild(el('div', { class: 'ab-stepTitle', text: 'Kies een locatie' }));
    if (!list.length) { bodyEl.appendChild(el('p', { text: 'Geen locaties beschikbaar voor deze afspraak.' })); return; }
    list.forEach(function (loc) {
      bodyEl.appendChild(el('button', { class: 'ab-card ab-card--loc', type: 'button', onclick: function () { chooseLocation(loc); } }, [
        locThumb(loc, 'ab-thumbS'),
        el('div', { class: 'ab-cardMain' }, [
          el('div', { class: 'ab-cardName', text: loc.name }),
          loc.address ? el('div', { class: 'ab-cardMeta', text: loc.address }) : null,
        ]),
        el('span', { class: 'ab-chev', html: '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' }),
      ]));
    });
  }
  function chooseLocation(loc) {
    state.location = { id: loc.id, name: loc.name, address: loc.address };
    state.date = null; state.time = null; state.slot = null;
    dl({ event: 'booking_location_selected', location_id: loc.id, location_name: loc.name });
    renderDateTime();
  }

  // ---------- Step 3: date + time ----------
  async function renderDateTime() {
    state.step = 'datetime'; setDots(); loading('Beschikbare tijden laden...');
    var start = new Date(); var end = new Date(); end.setDate(end.getDate() + 60);
    try {
      state.slots = await api('/slots?service=' + encodeURIComponent(state.service.id) +
        '&location=' + encodeURIComponent(state.location.id) +
        '&start=' + ymd(start) + '&end=' + ymd(end));
    } catch (e) { return renderError('Kon de beschikbare tijden niet laden.'); }

    var dates = Object.keys(state.slots || {}).filter(function (d) { return state.slots[d] && Object.keys(state.slots[d]).length; }).sort();
    bodyEl.innerHTML = '';
    if (!state._locationLocked) bodyEl.appendChild(backBtn(renderLocation));
    bodyEl.appendChild(el('div', { class: 'ab-stepTitle', text: 'Kies datum en tijd' }));
    // Toon wáár de afspraak is (naam + adres), want de locatie-stap is vaak al overgeslagen.
    if (state.location) {
      var addr = (state.location.address || '').replace(/,\s*(Netherlands|Nederland|Belgium|België)\s*$/i, '');
      bodyEl.appendChild(el('div', { class: 'ab-locNote' }, [
        locThumb(state.location, 'ab-thumbM'),
        el('div', {}, [el('strong', { text: state.location.name }), addr ? el('span', { text: addr }) : null]),
      ]));
    }
    if (!dates.length) { bodyEl.appendChild(el('p', { text: 'Geen beschikbare tijden gevonden. Kies een andere locatie.' })); return; }
    if (!state.date || dates.indexOf(state.date) === -1) state.date = dates[0];

    var dateWrap = el('div', { class: 'ab-daterow' }, [el('div', { class: 'ab-lbl', text: 'Datum' })]);
    var dateChips = el('div', { class: 'ab-chips' });
    dates.forEach(function (d) {
      dateChips.appendChild(el('button', { class: 'ab-chip' + (d === state.date ? ' on' : ''), type: 'button', text: fmtDate(d), onclick: function () { state.date = d; state.time = null; renderDateTime(); } }));
    });
    dateWrap.appendChild(dateChips);
    bodyEl.appendChild(dateWrap);

    var timeWrap = el('div', { class: 'ab-daterow' }, [el('div', { class: 'ab-lbl', text: 'Tijd' })]);
    var timeChips = el('div', { class: 'ab-chips' });
    Object.keys(state.slots[state.date]).sort().forEach(function (t) {
      timeChips.appendChild(el('button', { class: 'ab-chip', type: 'button', text: t, onclick: function () { chooseTime(t); } }));
    });
    timeWrap.appendChild(timeChips);
    bodyEl.appendChild(timeWrap);
  }
  function chooseTime(t) {
    state.time = t; state.slot = state.slots[state.date][t];
    dl({ event: 'booking_time_selected', appointment_date: state.date, appointment_time: t });
    renderDetails();
  }

  // ---------- Step 4: details ----------
  function renderDetails() {
    state.step = 'details'; setDots();
    bodyEl.innerHTML = '';
    bodyEl.appendChild(backBtn(renderDateTime));
    bodyEl.appendChild(el('div', { class: 'ab-stepTitle', text: 'Je gegevens' }));

    bodyEl.appendChild(el('div', { class: 'ab-summary' }, [
      srow('Afspraak', state.service.name),
      srow('Locatie', state.location.name),
      srow('Wanneer', fmtDate(state.date) + ' · ' + state.time),
    ]));

    var f = el('div');
    f.appendChild(el('div', { class: 'ab-field ab-half' }, [el('label', { text: 'Voornaam' }), inp('firstName', 'text', 'Voornaam')]));
    f.appendChild(el('div', { class: 'ab-field ab-half' }, [el('label', { text: 'Achternaam' }), inp('lastName', 'text', 'Achternaam')]));
    f.appendChild(el('div', { class: 'ab-field' }, [el('label', { text: 'E-mailadres' }), inp('email', 'email', 'jouw@email.nl')]));
    f.appendChild(el('div', { class: 'ab-field' }, [el('label', { text: 'Telefoonnummer' }), inp('phone', 'tel', landcode(state.location) === '32' ? '0470 12 34 56' : '06 12345678')]));
    f.appendChild(el('div', { class: 'ab-field' }, [el('label', { text: 'Opmerking (optioneel)' }), el('textarea', { id: 'ab_note', rows: '2', placeholder: 'Bijv. je verzendadres of vraag' })]));
    var errBox = el('div', { class: 'ab-err', id: 'ab_err', style: 'display:none' });
    f.appendChild(errBox);
    // Betaalde dienst: zeg vooraf wat er gebeurt. De knop leidt naar een
    // betaalpagina, en daar mag de bezoeker niet door verrast worden.
    var vooruit = CFG.prepayNote;
    var btn = el('button', {
      class: 'ab-submit', id: 'ab_submit', type: 'button',
      text: vooruit ? 'Naar betaling' : 'Bevestig afspraak', onclick: submit,
    });
    f.appendChild(btn);
    // Onder de knop, niet erboven: de bezoeker leest hier de voorwaarde bij de
    // stap die hij op het punt staat te zetten, in plaats van een drempel vlak
    // voor de knop.
    if (vooruit) f.appendChild(el('p', { class: 'ab-prepay', text: vooruit }));
    bodyEl.appendChild(f);
  }
  function srow(a, b) { return el('div', { class: 'ab-srow' }, [el('span', { text: a }), el('span', { text: b })]); }
  function inp(id, type, ph) {
    return el('input', { id: 'ab_' + id, type: type, placeholder: ph, autocomplete: id === 'firstName' ? 'given-name' : id === 'lastName' ? 'family-name' : id,
      onfocus: function () { if (!state.formStarted) { state.formStarted = true; dl({ event: 'form_start', form_name: 'audinc_booking' }); } } });
  }

  function val(id) { var e = document.getElementById('ab_' + id); return e ? e.value.trim() : ''; }

  async function submit() {
    if (state.submitting) return;
    var firstName = val('firstName'), lastName = val('lastName'), email = val('email'), phone = val('phone'), note = val('note');
    var errEl = document.getElementById('ab_err');
    function fail(m) { errEl.textContent = m; errEl.style.display = 'block'; }
    if (!firstName || !lastName) return fail('Vul je voor- en achternaam in.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Vul een geldig e-mailadres in.');
    if (phone.replace(/\D/g, '').length < 8) return fail('Vul een geldig telefoonnummer in.');
    errEl.style.display = 'none';

    state.submitting = true;
    var btn = document.getElementById('ab_submit');
    btn.disabled = true; btn.innerHTML = '<span class="ab-spin"></span>';
    var t = tracking();
    var payload = {
      service: state.service.id, serviceCategory: state.service.categoryId,
      location: state.location.id,
      selectedDate: state.date, selectedTime: state.time, selectedSlot: state.slot,
      firstName: firstName, lastName: lastName, email: email, phone: phone,
      phoneCountryCode: 'NL', note: note, address: '',
      gclid: t.gclid || '', gbraid: t.gbraid || '', wbraid: t.wbraid || '',
    };
    try {
      var data = null;
      if (SITE) {
        data = await siteBook(payload);
      } else {
        var r = await fetch(API + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        try { data = await r.json(); } catch (e) {}
        if (!r.ok || (data && data.error)) { throw new Error((data && (data.error || data.message)) || ('http ' + r.status)); }
      }
      // Betaalde dienst: de afspraak staat, maar moet nog afgerekend worden. We
      // meten de boeking hier, op ons eigen domein, en sturen daarna door naar de
      // betaalpagina. Dat is hetzelfde moment waarop we elke andere afspraak meten.
      if (data && data.paymentUrl) {
        btn.innerHTML = '<span class="ab-spin"></span> Doorsturen naar betaling...';
        onSuccess(email, phone, firstName, lastName, data, function () {
          window.location.assign(data.paymentUrl);
        });
        return;
      }
      onSuccess(email, phone, firstName, lastName, data);
    } catch (e) {
      // audinc.nl: no-show-blokkade van hun server. Die klant boekt telefonisch,
      // de uitlegpagina staat op hun site.
      if (SITE && e.reason === 'blocked' && e.redirect) { window.location.assign(e.redirect); return; }
      state.submitting = false; btn.disabled = false; btn.textContent = CFG.prepayNote ? 'Naar betaling' : 'Bevestig afspraak';
      // Tijdstip net vergeven: terug naar de tijden, met een verse lijst.
      if (SITE && e.reason === 'slot_taken') {
        state._freshSlots = true; state.time = null; state.slot = null;
        renderDateTime();
        return;
      }
      fail('Er ging iets mis bij het boeken. Controleer je gegevens of probeer een ander tijdstip.');
    }
  }

  function onSuccess(email, phone, firstName, lastName, data, naMeting) {
    var t = tracking();
    var appointmentId = data && (data.appointmentId || data.id || data.bookingId);
    var txId = appointmentId ? String(appointmentId) : '';
    var ics = data && typeof data.ics === 'string' ? data.ics : '';
    var userData = { email: email, phone_number: phone, first_name: firstName, last_name: lastName };

    // Eén conversie-event voor élke boeking (Ads-conversie + GA4 + Enhanced Conversions via user_data).
    // Het afspraaktype gaat als parameter mee, niet als aparte event-naam.
    var TYPE = {
      4: 'aanmeting', 8: 'aanmeting', 17: 'aanmeting', 19: 'aanmeting', 25: 'aanmeting',
      5: 'controle', 10: 'controle', 18: 'controle', 22: 'controle',
      7: 'in_ears', 11: 'in_ears', 20: 'in_ears',
      6: 'ophalen', 9: 'ophalen', 21: 'ophalen',
      14: 'oorreiniging',
      15: 'filterwissel', 16: 'filterwissel', 24: 'filterwissel',
    };
    var conversie = {
      event: 'appointment_made',
      appointment_type: TYPE[state.service.id] || 'aanmeting',
      trafft_service_id: state.service.id,
      trafft_location_id: state.location.id,
      service_name: state.service.name,
      location_name: state.location.name,
      appointment_date: state.date,
      appointment_time: state.time,
      transaction_id: txId,
      user_data: userData,
      booking_source: location.hostname,
      gclid: t.gclid || '', gbraid: t.gbraid || '', wbraid: t.wbraid || '',
      value: 0, currency: 'EUR',
    };

    // audinc.nl: dezelfde eventnamen en dezelfde user_data als de wizard van de
    // site zelf (src/scripts/conversionTracking.ts, BOOKING_EVENT_BY_SERVICE).
    // Dan hangen de bestaande tags in GTM-KVKKTQK er zonder wijziging aan: een
    // in-ear-boeking vuurt de in-ears-actie en niet de aanmeting van 115 euro.
    // De velden van het subdomein (appointment_type enzovoort) gaan gewoon mee.
    if (SITE) {
      var SITE_EVENT = { 4: 'appointment_made', 5: 'controle_afspraak', 7: 'extra_afspraak', 6: 'ophaal_afspraak', 14: 'reiniging_afspraak', 15: 'filterwissel_afspraak' };
      conversie.event = SITE_EVENT[state.service.id] || 'appointment_made';
      conversie.language = 'nl';
      conversie.transaction_id = txId || nieuwTxId();
      var e164 = naarE164(phone, landcode(state.location));
      conversie.user_data = {
        email: String(email).trim().toLowerCase(),
        phone_number: e164,
        address: { first_name: firstName, last_name: lastName },
        first_name: firstName, last_name: lastName,
      };
      // Betaalde dienst: de afspraak bestaat pas na de betaling. Net als hun eigen
      // wizard parkeren we de conversie in sessionStorage; hun bedankpagina
      // (/afspraak-gemaakt-oor-reiniging/) pusht hem pas als de betaling gelukt
      // is. Een afgebroken betaling telt dus niet meer mee. Zelfde sleutel en
      // vorm als stashBookingConversion, anders vindt hun pagina hem niet.
      if (naMeting) {
        try {
          sessionStorage.setItem('audinc:uitgestelde-boekingsconversie', JSON.stringify({
            serviceId: state.service.id, locationId: state.location.id, language: 'nl',
            transactionId: conversie.transaction_id,
            userData: { email: conversie.user_data.email, phone_number: e164, address: conversie.user_data.address },
            ts: Date.now(),
          }));
        } catch (e) { /* privémodus: liever geen meting dan een foute */ }
        // En het slot zelf, net als stashBookingCheck in hun wizard: hun
        // bedankpagina vraagt /api/trafft/verify-booking of Trafft de afspraak na
        // de betaling echt heeft aangemaakt, en mailt anders een alarm.
        try {
          sessionStorage.setItem('audinc:booking-check', JSON.stringify({
            service: state.service.id, location: state.location.id,
            employee: Number(data && data.employee) || Number(state.slot && state.slot.e && state.slot.e[0]) || 0,
            date: state.date, time: state.time,
            firstName: firstName, lastName: lastName, email: String(email).trim(), phone: e164,
            ts: Date.now(),
          }));
        } catch (e) { /* privémodus: dan slaat hun pagina de controle over */ }
        dl({ event: 'booking_payment_redirect', appointment_type: conversie.appointment_type, trafft_service_id: state.service.id });
        naMeting();
        return;
      }
    }

    // Bij een betaalde dienst neemt de betaalpagina het over. Eerst de meting
    // laten landen, dan pas doorsturen; een bevestigingsscherm opbouwen dat de
    // bezoeker toch niet ziet heeft geen zin.
    if (naMeting) { dlDan(conversie, naMeting); return; }
    dl(conversie);

    // Rich bevestiging: details + vervolgstappen + terug naar de website.
    var addr = state.location.address || '';
    var isBE = /belgium|belgi[eë]/i.test(addr);
    var cleanAddr = addr.replace(/,\s*(Netherlands|Nederland|Belgium|België)\s*$/i, '');
    var mapsUrl = 'https://maps.google.com/?q=' + encodeURIComponent(state.location.name + ' ' + addr);
    var siteUrl = isBE ? 'https://audinc.be/' : 'https://audinc.nl/';
    var dateLong = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(state.date + 'T00:00:00'));
    var dur = Math.round((state.service.duration || 0) / 60);
    var ic = function (path) { return '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">' + path + '</svg>'; };

    state.step = 'success'; setDots();
    bodyEl.innerHTML = '';
    var wrap = el('div', { class: 'ab-confirm' });
    wrap.appendChild(el('div', { class: 'ab-checkC', html: '<svg width="30" height="30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>' }));
    wrap.appendChild(el('h4', { text: 'Je afspraak is bevestigd' }));
    wrap.appendChild(el('p', { class: 'ab-sub', text: 'Top ' + firstName + ', je plek staat gereserveerd. Tot snel!' }));

    // Details
    var details = el('div', { class: 'ab-cDetails' });
    details.appendChild(el('div', { class: 'ab-cRow' }, [
      el('span', { html: ic('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z"/>') }),
      el('div', { class: 'ab-cMain' }, [el('strong', { text: state.service.name }), el('span', { text: CFG.paid ? (dur ? dur + ' minuten' : 'Behandeling') : (dur ? dur + ' minuten · gratis & vrijblijvend' : 'gratis & vrijblijvend') })]),
    ]));
    details.appendChild(el('div', { class: 'ab-cRow' }, [
      el('span', { html: ic('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>') }),
      el('div', { class: 'ab-cMain' }, [el('strong', { text: dateLong }), el('span', { text: 'om ' + state.time + ' uur' })]),
    ]));
    details.appendChild(el('div', { class: 'ab-cRow' }, [
      locThumb(state.location, 'ab-thumbM'),
      el('div', { class: 'ab-cMain' }, [el('strong', { text: 'Audinc ' + state.location.name }), el('span', { text: cleanAddr }), el('br'), el('a', { href: mapsUrl, target: '_blank', rel: 'noopener', text: 'Bekijk op de kaart →' })]),
    ]));
    wrap.appendChild(details);

    // Vervolgstappen
    var next = el('div', { class: 'ab-cNext' });
    var checkIc = ic('<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>');
    next.appendChild(el('div', { class: 'ab-cStep' }, [el('span', { html: checkIc }), el('div', { html: 'Je ontvangt nu een bevestiging per e-mail op <strong>' + email + '</strong>.' })]));
    if (ics) {
      next.appendChild(el('div', { class: 'ab-cStep' }, [el('span', { html: checkIc }), el('div', { html: 'Zet de afspraak vast in je agenda: <a href="' + ics + '" target="_blank" rel="noopener" style="color:var(--orange-dark,#d4551a);font-weight:600;text-decoration:none">toevoegen aan agenda →</a>' })]));
    }
    next.appendChild(el('div', { class: 'ab-cStep' }, [el('span', { html: checkIc }), el('div', { text: 'Kom op je gemak langs, je hoeft niets voor te bereiden.' })]));
    wrap.appendChild(next);

    wrap.appendChild(el('a', { class: 'ab-cBtn', href: siteUrl, text: 'Terug naar audinc' + (isBE ? '.be' : '.nl') }));
    bodyEl.appendChild(wrap);
  }

  function renderError(msg) {
    bodyEl.innerHTML = '';
    bodyEl.appendChild(el('div', { class: 'ab-center' }, [
      el('h4', { text: 'Oeps' }),
      el('p', { text: msg }),
      el('button', { class: 'ab-submit', style: 'margin-top:16px', text: 'Opnieuw proberen', onclick: renderService }),
    ]));
  }
  function backBtn(fn) { return el('button', { class: 'ab-back', type: 'button', onclick: fn, html: '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg> Terug' }); }

  // ---------- open / close ----------
  function openBooking() {
    buildShell();
    // Reset transient state (keep loaded categories cache)
    state.step = 'service'; state.service = null; state.location = null;
    state.date = null; state.time = null; state.slot = null; state.formStarted = false;
    state.submitting = false; state._skippedService = false;
    state._skippedLocation = false; state._locationLocked = false;
    overlay.classList.add('ab-active');
    requestAnimationFrame(function () { requestAnimationFrame(function () { overlay.classList.add('ab-visible'); }); });
    document.body.style.overflow = 'hidden';
    dl({ event: 'modal_open', page_location: location.href });
    renderService();
  }
  function closeBooking() {
    if (!overlay) return;
    overlay.classList.remove('ab-visible');
    setTimeout(function () { overlay.classList.remove('ab-active'); document.body.style.overflow = ''; }, 250);
  }

  // Override the landing page's CTA handlers (buttons use onclick="openModal()").
  window.openModal = openBooking;
  window.closeModal = closeBooking;
  window.openAudincBooking = openBooking;

  // Open de wizard voor een specifieke dienst. Nodig op pagina's die meer dan een
  // afspraaktype aanbieden; CFG is hetzelfde object als window.AUDINC_BOOKING, dus
  // de wizard leest de nieuwe waarden meteen.
  window.openAudincBookingFor = function (serviceId, paid) {
    if (!window.AUDINC_BOOKING) { window.AUDINC_BOOKING = CFG; }
    CFG.defaultServiceId = serviceId;
    CFG.paid = !!paid;
    CFG.prepayNote = paid ? PREPAY_BRON : null;
    openBooking();
  };

  // Neutralise the old iframe modal markup if present, so it never shows.
  document.addEventListener('DOMContentLoaded', function () {
    var old = document.getElementById('bookingModal');
    if (old) old.style.display = 'none';
  });
})();
