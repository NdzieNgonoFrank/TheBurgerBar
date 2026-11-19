// Usage : npm run create-admin -- email@exemple.com MotDePasse
const pool = require('../lib/db');
const { hashPassword } = require('../lib/auth');

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage : npm run create-admin -- email@exemple.com MotDePasse (8 caractères minimum)');
  process.exit(1);
}
pool.query(
  `INSERT INTO admins (email, mot_de_passe_hash) VALUES ($1,$2)
   ON CONFLICT (email) DO UPDATE SET mot_de_passe_hash = EXCLUDED.mot_de_passe_hash`,
  [email.trim().toLowerCase(), hashPassword(password)]
).then(() => { console.log('Compte admin enregistré :', email); return pool.end(); })
 .catch((e) => { console.error(e.message); process.exit(1); });
