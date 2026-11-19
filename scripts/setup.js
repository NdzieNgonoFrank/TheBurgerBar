// Prépare la base à la main (le serveur le fait aussi tout seul au démarrage).
const fs = require('fs');
const path = require('path');
const pool = require('../lib/db');
const { seedIfEmpty, ensureAdmin } = require('../lib/seed');

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  if (!(await seedIfEmpty(pool))) console.log('La base contient déjà des produits : menu d\'exemple non ajouté.');
  await ensureAdmin(pool);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
