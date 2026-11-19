require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const pool = require('./lib/db');
const { seedIfEmpty, ensureAdmin } = require('./lib/seed');
const { notifyNewOrder } = require('./lib/notify');
const { checkPassword, signToken, requireAdmin } = require('./lib/auth');

const cfg = {
  name: process.env.RESTAURANT_NAME || 'The Burger Bar',
  phone: process.env.RESTAURANT_PHONE || '',
  address: process.env.RESTAURANT_ADDRESS || '',
  hours: { fr: process.env.RESTAURANT_HOURS_FR || '', en: process.env.RESTAURANT_HOURS_EN || '' },
  deliveryFee: Number(process.env.DELIVERY_FEE || 0),
  heroImage: process.env.HERO_IMAGE || '',
};

const app = express();
// Nombre de relais devant l'application : 1 = Render seul ; 2 = Netlify puis Render.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (res, error, status = 400) => res.status(status).json({ error });

// Limite simple en mémoire : max `n` appels par IP et par fenêtre de 10 minutes.
const hits = new Map();
function limited(key, n) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 600000);
  list.push(now);
  hits.set(key, list);
  return list.length > n;
}

// ---------- Public ----------
app.get('/api/config', (_req, res) => res.json(cfg));

app.get('/api/menu', ah(async (_req, res) => {
  const cats = await pool.query('SELECT id, nom, nom_en FROM categories ORDER BY ordre, id');
  const prods = await pool.query(
    `SELECT id, categorie_id, nom, nom_en, description, description_en, prix, image_url, vedette
       FROM produits WHERE disponible ORDER BY ordre, id`);
  res.json(cats.rows
    .map((c) => ({ ...c, produits: prods.rows.filter((p) => p.categorie_id === c.id) }))
    .filter((c) => c.produits.length));
}));

app.post('/api/orders', ah(async (req, res) => {
  if (limited('order:' + req.ip, 10)) return bad(res, 'too_many', 429);
  const { nom, tel, mode, adresse, note, lang, items } = req.body || {};

  const cleanTel = String(tel || '').replace(/[^\d+]/g, '');
  if (!String(nom || '').trim() || String(nom).length > 80 ||
      cleanTel.replace(/\D/g, '').length < 8 || cleanTel.length > 16) return bad(res, 'invalid_contact');
  if (!['retrait', 'livraison'].includes(mode)) return bad(res, 'invalid_mode');
  if (mode === 'livraison' && !String(adresse || '').trim()) return bad(res, 'address_required');
  if (!Array.isArray(items) || !items.length || items.length > 30) return bad(res, 'empty_cart');

  const qty = new Map();
  for (const it of items) {
    const id = Number(it.id), q = Number(it.qty);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1 || q > 20) return bad(res, 'invalid_item');
    qty.set(id, (qty.get(id) || 0) + q);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Les prix viennent TOUJOURS de la base, jamais du navigateur.
    const { rows: prods } = await client.query(
      'SELECT id, nom, prix FROM produits WHERE id = ANY($1) AND disponible', [[...qty.keys()]]);
    if (prods.length !== qty.size) { await client.query('ROLLBACK'); return bad(res, 'unavailable'); }

    const fee = mode === 'livraison' ? cfg.deliveryFee : 0;
    const total = prods.reduce((s, p) => s + p.prix * qty.get(p.id), 0) + fee;
    const { rows: [order] } = await client.query(
      `INSERT INTO commandes (client_nom, client_tel, mode, adresse, note, frais_livraison, total, langue)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [String(nom).trim(), cleanTel, mode, mode === 'livraison' ? String(adresse).trim().slice(0, 300) : null,
       String(note || '').trim().slice(0, 300) || null, fee, total, lang === 'en' ? 'en' : 'fr']);
    for (const p of prods) {
      await client.query(
        'INSERT INTO lignes_commande (commande_id, produit_id, nom, quantite, prix_unitaire) VALUES ($1,$2,$3,$4,$5)',
        [order.id, p.id, p.nom, qty.get(p.id), p.prix]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: order.id, total });

    notifyNewOrder({
      id: order.id, nom: String(nom).trim(), tel: cleanTel, mode, adresse: adresse && String(adresse).trim(),
      note: note && String(note).trim(), total, lines: prods.map((p) => ({ nom: p.nom, qty: qty.get(p.id) })),
    }).catch((e) => console.error('[notify]', e.message));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

// ---------- Admin ----------
app.post('/api/admin/login', ah(async (req, res) => {
  if (limited('login:' + req.ip, 10)) return bad(res, 'too_many', 429);
  const { email, password } = req.body || {};
  const { rows } = await pool.query('SELECT id, mot_de_passe_hash FROM admins WHERE email = $1',
    [String(email || '').trim().toLowerCase()]);
  if (!rows[0] || !checkPassword(String(password || ''), rows[0].mot_de_passe_hash)) return bad(res, 'invalid_login', 401);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `adm=${signToken(rows[0].id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
  res.json({ ok: true });
}));

app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'adm=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAdmin, ah(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, COALESCE(json_agg(json_build_object('nom', l.nom, 'qty', l.quantite, 'prix', l.prix_unitaire)
              ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS lignes
       FROM commandes c LEFT JOIN lignes_commande l ON l.commande_id = c.id
      WHERE c.cree_le > NOW() - INTERVAL '2 days'
      GROUP BY c.id ORDER BY c.id DESC LIMIT 200`);
  res.json(rows);
}));

app.patch('/api/admin/orders/:id', requireAdmin, ah(async (req, res) => {
  const { statut } = req.body || {};
  if (!['recue', 'en_preparation', 'prete', 'terminee', 'annulee'].includes(statut)) return bad(res, 'invalid_status');
  const r = await pool.query('UPDATE commandes SET statut = $1 WHERE id = $2', [statut, Number(req.params.id)]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'not_found', 404);
}));

app.get('/api/admin/products', requireAdmin, ah(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.nom, p.prix, p.disponible, p.vedette, p.image_url, c.nom AS categorie
       FROM produits p LEFT JOIN categories c ON c.id = p.categorie_id
      ORDER BY c.ordre, c.id, p.ordre, p.id`);
  res.json(rows);
}));

app.patch('/api/admin/products/:id', requireAdmin, ah(async (req, res) => {
  const { prix, disponible, vedette, image_url } = req.body || {};
  if (prix !== undefined && (!Number.isInteger(prix) || prix < 0)) return bad(res, 'invalid_price');
  const img = image_url === undefined ? undefined : String(image_url || '').trim().slice(0, 300);
  if (img && !/^(\/|https?:\/\/)/.test(img)) return bad(res, 'invalid_image');
  const flag = (v) => (typeof v === 'boolean' ? v : null);
  const r = await pool.query(
    `UPDATE produits SET prix = COALESCE($1, prix), disponible = COALESCE($2, disponible),
            vedette = COALESCE($3, vedette), image_url = CASE WHEN $4::boolean THEN $5 ELSE image_url END
      WHERE id = $6`,
    [prix ?? null, flag(disponible), flag(vedette), img !== undefined, img || null, Number(req.params.id)]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'not_found', 404);
}));

// ---------- Erreurs et démarrage ----------
app.use('/api', (_req, res) => bad(res, 'not_found', 404));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server' });
});

async function start() {
  // Crée les tables si elles n'existent pas encore (sans effet sinon).
  await pool.query(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));
  // Préparation automatique (désactivable avec AUTO_SETUP=false) : menu d'exemple et compte admin.
  if (process.env.AUTO_SETUP !== 'false') {
    await seedIfEmpty(pool);
    await ensureAdmin(pool);
  }
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`Serveur prêt : http://localhost:${port}`));
}

if (require.main === module) start().catch((e) => { console.error(e); process.exit(1); });
module.exports = { app, start };
