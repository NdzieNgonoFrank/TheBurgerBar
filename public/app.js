(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  let lang = I18N.pick();
  let cfg = { name: '', deliveryFee: 0, hours: {} };
  let menu = [];
  let byId = {};
  let cart = {};
  try { cart = JSON.parse(store.get('cart') || '{}'); } catch (e) { cart = {}; }

  const t = (k) => I18N.dict[lang][k] ?? k;
  const L = (o, k) => (lang === 'en' && o[k + '_en']) || o[k] || '';
  const fmt = (n) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR').format(n) + ' FCFA';
  const icon = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#i-${n}"/></svg>`;
  const lines = () => Object.entries(cart).map(([id, q]) => ({ p: byId[id], q })).filter((x) => x.p);
  const count = () => lines().reduce((s, x) => s + x.q, 0);
  const subtotal = () => lines().reduce((s, { p, q }) => s + p.prix * q, 0);
  const mode = () => document.querySelector('input[name=mode]:checked').value;
  const fee = () => (mode() === 'livraison' ? cfg.deliveryFee : 0);
  const plural = (n) => `${n} ${t(n > 1 ? 'item.many' : 'item.one')}`;

  // ---------- Textes statiques ----------
  function applyStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-aria]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nAria)); });
    $('#lang').textContent = t('lang.other');
    $('#lang').setAttribute('aria-label', t('lang.aria'));
    $('#bag').setAttribute('aria-label', t('bag.aria'));
    $('#tabs').setAttribute('aria-label', t('tabs.aria'));
    $('#mode-liv').textContent = t('mode.livraison') + (cfg.deliveryFee ? ` (+${fmt(cfg.deliveryFee)})` : '');
    $('#submit').textContent = t('submit');
  }

  function renderFacts() {
    const f = [];
    if (cfg.hours && cfg.hours[lang]) f.push(['clock', esc(cfg.hours[lang])]);
    if (cfg.address) f.push(['pin', esc(cfg.address)]);
    if (cfg.phone) f.push(['phone', `<a href="tel:${esc(cfg.phone.replace(/[^\d+]/g, ''))}">${esc(cfg.phone)}</a>`]);
    const html = f.map(([i, txt]) => `<li>${icon(i)}<span>${txt}</span></li>`).join('');
    $('#facts').innerHTML = html;
    $('#foot-facts').innerHTML = html;
  }

  // ---------- Menu ----------
  const thumb = (p) => (p.image_url
    ? `<img class="thumb" src="${esc(p.image_url)}" alt="" loading="lazy" width="96" height="96">`
    : '');

  function ctl(id) {
    const q = cart[id] || 0;
    if (!q) return `<button class="add" type="button" data-act="inc" data-id="${id}">${icon('plus')}<span>${t('add')}</span></button>`;
    return `<div class="step"><button type="button" data-act="dec" data-id="${id}" aria-label="${t('less')}">${icon('minus')}</button>` +
      `<span aria-live="polite">${q}</span><button type="button" data-act="inc" data-id="${id}" aria-label="${t('more')}">${icon('plus')}</button></div>`;
  }

  function row(p) {
    return `<article class="item${p.image_url ? ' has-img' : ''}" data-id="${p.id}">${thumb(p)}` +
      `<div class="body"><div class="head"><h3>${esc(L(p, 'nom'))}</h3><span class="leader" aria-hidden="true"></span>` +
      `<span class="price">${fmt(p.prix)}</span></div><p>${esc(L(p, 'description'))}</p></div><div class="ctl">${ctl(p.id)}</div></article>`;
  }

  function renderFeatured() {
    const f = menu.flatMap((c) => c.produits).filter((p) => p.vedette).slice(0, 4);
    $('#feat').hidden = !f.length;
    $('#feat-row').innerHTML = f.map((p) =>
      `<article class="feat-card" data-id="${p.id}"><div class="ph-img">${p.image_url
        ? `<img src="${esc(p.image_url)}" alt="${esc(L(p, 'nom'))}" loading="lazy">` : icon('burger')}</div>` +
      `<div class="feat-info"><h3>${esc(L(p, 'nom'))}</h3><span class="price">${fmt(p.prix)}</span></div>` +
      `<p>${esc(L(p, 'description'))}</p><div class="ctl">${ctl(p.id)}</div></article>`).join('');
  }

  function renderHero() {
    const art = $('.hero-art');
    if (cfg.heroImage && !art.classList.contains('photo')) {
      art.classList.add('photo');
      art.innerHTML = `<img src="${esc(cfg.heroImage)}" alt="${esc(cfg.name)}" width="420" height="525">`;
    }
  }

  let spy;
  function renderMenu() {
    $('#tabs').innerHTML = menu.map((c) => `<a href="#cat-${c.id}" data-cat="${c.id}">${esc(L(c, 'nom'))}</a>`).join('');
    $('#list').innerHTML = menu.map((c) =>
      `<section class="cat" id="cat-${c.id}"><h2>${esc(L(c, 'nom'))}</h2>${c.produits.map(row).join('')}</section>`).join('');
    if (spy) spy.disconnect();
    if ('IntersectionObserver' in window) {
      spy = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.cat === e.target.id.slice(4)));
      }), { rootMargin: '-140px 0px -70% 0px' });
      document.querySelectorAll('.cat').forEach((s) => spy.observe(s));
    }
  }

  // ---------- Panier ----------
  function save() { store.set('cart', JSON.stringify(cart)); }

  function change(id, d) {
    const q = Math.max(0, Math.min(20, (cart[id] || 0) + d));
    if (q) cart[id] = q; else delete cart[id];
    save();
    document.querySelectorAll(`[data-id="${id}"] .ctl`).forEach((c) => { c.innerHTML = ctl(id); });
    const first = document.querySelector(`[data-id="${id}"] .ctl`);
    const b = first && (first.querySelector(`[data-act="${d > 0 ? 'inc' : 'dec'}"]`) || first.querySelector('button'));
    if (b && !isOpen()) b.focus();
    renderBar();
    if (isOpen()) renderCart();
  }

  function renderBar() {
    const n = count();
    $('#bag-n').hidden = !n;
    $('#bag-n').textContent = n;
    const bar = $('#cartbar');
    bar.hidden = !n || isOpen();
    $('#cartbar-n').textContent = plural(n);
    $('#cartbar-t').textContent = fmt(subtotal());
  }

  function renderCart() {
    const ls = lines();
    $('#cart-lines').innerHTML = ls.length
      ? ls.map(({ p, q }) => `<div class="line"><div><strong>${esc(L(p, 'nom'))}</strong><span>${fmt(p.prix)}</span></div>` +
        `<div class="step"><button type="button" data-act="dec" data-id="${p.id}" aria-label="${t('less')}">${icon('minus')}</button><span>${q}</span>` +
        `<button type="button" data-act="inc" data-id="${p.id}" aria-label="${t('more')}">${icon('plus')}</button></div>` +
        `<b>${fmt(p.prix * q)}</b></div>`).join('')
      : `<p class="empty">${t('cart.empty')}</p>`;
    const liv = mode() === 'livraison';
    $('#sum').innerHTML = `<div><dt>${t('sum.sub')}</dt><dd>${fmt(subtotal())}</dd></div>` +
      (liv && cfg.deliveryFee ? `<div><dt>${t('sum.fee')}</dt><dd>${fmt(cfg.deliveryFee)}</dd></div>` : '') +
      `<div class="tot"><dt>${t('sum.total')}</dt><dd>${fmt(subtotal() + fee())}</dd></div>`;
    $('#addr-wrap').hidden = !liv;
    $('#addr-wrap input').required = liv;
    $('#submit').disabled = !ls.length;
  }

  // ---------- Panneau de commande ----------
  const isOpen = () => $('#drawer').classList.contains('open');
  function openDrawer() {
    renderCart();
    $('#drawer').classList.add('open');
    $('#drawer').removeAttribute('inert');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
    document.body.classList.add('lock');
    renderBar();
    $('#d-close').focus();
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('inert', '');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true;
    document.body.classList.remove('lock');
    $('#form').hidden = false;
    $('#done').hidden = true;
    renderBar();
  }

  function showError(msg) { const e = $('#err'); e.textContent = msg; e.hidden = !msg; }

  $('#form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showError('');
    const f = new FormData(ev.target);
    const btn = $('#submit');
    btn.disabled = true;
    btn.textContent = t('sending');
    try {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: f.get('nom'), tel: f.get('tel'), mode: f.get('mode'), adresse: f.get('adresse'), note: f.get('note'), lang,
          items: Object.entries(cart).map(([id, qty]) => ({ id: Number(id), qty })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'generic');
      cart = {}; save();
      $('#done-num').textContent = '#' + j.id;
      $('#form').hidden = true;
      $('#done').hidden = false;
      document.querySelectorAll('.ctl').forEach((c) => { c.innerHTML = ctl(c.closest('[data-id]').dataset.id); });
      renderBar();
      $('#done h2').focus();
    } catch (err) {
      showError(I18N.dict[lang]['err.' + err.message] || t('err.generic'));
    } finally {
      btn.textContent = t('submit');
      renderCart();
    }
  });

  // ---------- Événements ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) change(b.dataset.id, b.dataset.act === 'inc' ? 1 : -1);
  });
  $('#bag').addEventListener('click', openDrawer);
  $('#cartbar').addEventListener('click', openDrawer);
  $('#d-close').addEventListener('click', closeDrawer);
  $('#done-back').addEventListener('click', () => { closeDrawer(); location.hash = '#menu'; });
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) closeDrawer(); });
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', renderCart));
  $('#lang').addEventListener('click', () => {
    lang = lang === 'fr' ? 'en' : 'fr';
    store.set('lang', lang);
    applyStatic(); renderFacts(); renderFeatured(); renderMenu(); renderBar(); renderCart();
  });

  // ---------- Démarrage ----------
  (async () => {
    applyStatic();
    try {
      const [c, m] = await Promise.all([fetch('/api/config').then((r) => r.json()), fetch('/api/menu').then((r) => r.json())]);
      cfg = c; menu = m;
      menu.forEach((cat) => cat.produits.forEach((p) => { byId[p.id] = p; }));
      Object.keys(cart).forEach((id) => { if (!byId[id]) delete cart[id]; });
      document.querySelectorAll('[data-brand]').forEach((e) => { e.textContent = cfg.name; });
      document.title = cfg.name;
      applyStatic(); renderFacts(); renderHero(); renderFeatured(); renderMenu(); renderBar(); renderCart();
    } catch (e) {
      $('#list').innerHTML = `<p class="empty">${t('menu.error')}</p>`;
    }
  })();
})();
