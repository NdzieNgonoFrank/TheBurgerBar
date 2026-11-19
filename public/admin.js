(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
  const icon = (n) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#i-${n}"/></svg>`;
  const STATUS = { recue: 'Reçue', en_preparation: 'En préparation', prete: 'Prête', terminee: 'Terminée', annulee: 'Annulée' };
  const NEXT = { recue: ['en_preparation', 'Lancer la préparation'], en_preparation: ['prete', 'Marquer prête'], prete: ['terminee', 'Marquer terminée'] };
  const ACTIVE = ['recue', 'en_preparation', 'prete'];

  let orders = [], products = [], view = 'actives', lastMax = null, soundOn = false, audio = null, timer = null, fresh = new Set();

  async function api(path, opts = {}) {
    const r = await fetch('/api/admin' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('auth'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'error');
    return j;
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.id); toast.id = setTimeout(() => { t.hidden = true; }, 1800);
  }

  function beep() {
    if (!soundOn) return;
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 660].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.2;
      o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      o.start(t0); o.stop(t0 + 0.19);
    });
  }

  // ---------- Connexion ----------
  function showLogin() { clearInterval(timer); $('#app').hidden = true; $('#login').hidden = false; }
  function showApp() {
    $('#login').hidden = true; $('#app').hidden = false;
    loadOrders(); clearInterval(timer); timer = setInterval(loadOrders, 8000);
  }

  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), err = $('#login-err');
    err.hidden = true;
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
      e.target.reset(); showApp();
    } catch (x) {
      err.textContent = x.message === 'too_many' ? 'Trop de tentatives. Réessayez dans quelques minutes.' : 'Email ou mot de passe incorrect.';
      err.hidden = false;
    }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  $('#sound').addEventListener('click', (e) => {
    soundOn = !soundOn;
    const b = e.currentTarget;
    b.setAttribute('aria-pressed', soundOn);
    b.innerHTML = `${icon(soundOn ? 'sound' : 'mute')}<span>${soundOn ? 'Son activé' : 'Son désactivé'}</span>`;
    if (soundOn) beep();
  });

  // ---------- Commandes ----------
  async function loadOrders() {
    try { orders = await api('/orders'); } catch (e) { return; }
    const max = orders.reduce((m, o) => Math.max(m, o.id), 0);
    if (lastMax !== null && max > lastMax) {
      orders.filter((o) => o.id > lastMax).forEach((o) => fresh.add(o.id));
      beep();
    }
    lastMax = max;
    $('#n-actives').textContent = `(${orders.filter((o) => ACTIVE.includes(o.statut)).length})`;
    if (view !== 'menu') renderOrders();
  }

  function renderOrders() {
    const list = orders.filter((o) => (view === 'actives') === ACTIVE.includes(o.statut));
    if (!list.length) { $('#orders').innerHTML = `<p class="empty">${view === 'actives' ? 'Aucune commande en cours.' : 'Aucune commande terminée récemment.'}</p>`; return; }
    $('#orders').innerHTML = list.map((o) => {
      const time = new Date(o.cree_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const next = NEXT[o.statut];
      return `<article class="ord st-${o.statut}${fresh.has(o.id) ? ' fresh' : ''}">
        <header><strong>#${o.id}</strong><time>${time}</time><span class="badge">${STATUS[o.statut]}</span></header>
        <p><b>${esc(o.client_nom)}</b> <a href="tel:${esc(o.client_tel)}">${esc(o.client_tel)}</a></p>
        <p>${icon(o.mode === 'livraison' ? 'bike' : 'store')}<span>${o.mode === 'livraison' ? 'Livraison : ' + esc(o.adresse) : 'Retrait sur place'}</span></p>
        <ul>${o.lignes.map((l) => `<li>${l.qty} x ${esc(l.nom)}</li>`).join('')}</ul>
        ${o.note ? `<p class="note">Remarque : ${esc(o.note)}</p>` : ''}
        <footer><span>${o.frais_livraison ? 'dont livraison ' + fmt(o.frais_livraison) : 'Paiement à la réception'}</span><strong>${fmt(o.total)}</strong></footer>
        ${ACTIVE.includes(o.statut) ? `<div class="acts">${next ? `<button class="btn" data-id="${o.id}" data-st="${next[0]}" type="button">${next[1]}</button>` : ''}
          <button class="ghost" data-id="${o.id}" data-st="annulee" type="button">Annuler</button></div>` : ''}
      </article>`;
    }).join('');
  }

  $('#orders').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-st]');
    if (!b) return;
    if (b.dataset.st === 'annulee' && !confirm('Annuler cette commande ?')) return;
    fresh.delete(Number(b.dataset.id));
    try { await api('/orders/' + b.dataset.id, { method: 'PATCH', body: JSON.stringify({ statut: b.dataset.st }) }); await loadOrders(); }
    catch (x) { if (x.message !== 'auth') toast('Action impossible, réessayez.'); }
  });

  // ---------- Menu et prix ----------
  async function loadProducts() {
    try { products = await api('/products'); } catch (e) { return; }
    let cat = null;
    $('#products').innerHTML = products.map((p) => {
      const head = p.categorie !== cat ? `<h2 style="margin:26px 0 4px;font-size:1.2rem">${esc((cat = p.categorie) || 'Sans catégorie')}</h2>` : '';
      return `${head}<div class="prod" data-id="${p.id}"><div>${esc(p.nom)}</div>
        <label><span class="sr" hidden>Prix</span><input type="number" min="0" step="50" value="${p.prix}" data-f="prix" aria-label="Prix de ${esc(p.nom)} en FCFA"></label>
        <label class="sw"><input type="checkbox" data-f="disponible" ${p.disponible ? 'checked' : ''}>Disponible</label>
        <label class="img"><input type="text" value="${esc(p.image_url || '')}" placeholder="Photo : /img/mon-burger.jpg" data-f="image_url" aria-label="Photo de ${esc(p.nom)}"></label>
        <label class="sw"><input type="checkbox" data-f="vedette" ${p.vedette ? 'checked' : ''}>À la une</label></div>`;
    }).join('');
  }

  $('#products').addEventListener('change', async (e) => {
    const row = e.target.closest('.prod'), f = e.target.dataset.f;
    if (!row || !f) return;
    const body = f === 'prix' ? { prix: Number(e.target.value) } : f === 'image_url' ? { image_url: e.target.value } : { [f]: e.target.checked };
    try { await api('/products/' + row.dataset.id, { method: 'PATCH', body: JSON.stringify(body) }); toast('Enregistré'); }
    catch (x) { if (x.message !== 'auth') toast('Échec de l’enregistrement.'); loadProducts(); }
  });

  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-selected', x === b));
    $('#orders').hidden = view === 'menu';
    $('#products').hidden = view !== 'menu';
    view === 'menu' ? loadProducts() : renderOrders();
  }));

  // Démarrage : si la session est valide on affiche l'app, sinon la connexion.
  api('/orders').then(() => showApp()).catch(() => showLogin());
})();
