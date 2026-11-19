require('dotenv').config();
const { Pool } = require('pg');

// SSL automatique : actif pour une base distante (adresse avec un point, comme celle d'un
// hébergeur), inactif pour une base locale ou l'adresse interne de Render (sans point).
// On peut forcer avec PGSSL=true ou PGSSL=false.
function useSsl(url) {
  if (process.env.PGSSL === 'true') return true;
  if (process.env.PGSSL === 'false') return false;
  try {
    const host = new URL(url).hostname;
    return host.includes('.') && !['localhost', '127.0.0.1'].includes(host);
  } catch (e) { return false; }
}

const url = process.env.DATABASE_URL;
module.exports = new Pool({
  connectionString: url,
  ssl: useSsl(url) ? { rejectUnauthorized: false } : undefined,
});
