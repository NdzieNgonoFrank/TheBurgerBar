const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET absent : les sessions admin seront perdues à chaque redémarrage.');
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}

function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const mac = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

function signToken(adminId) {
  const payload = `${adminId}.${Date.now() + 12 * 3600 * 1000}`;
  return `${payload}.${mac(payload)}`;
}

function verifyToken(token) {
  const [id, exp, sig] = String(token || '').split('.');
  if (!id || !exp || !sig) return null;
  const good = mac(`${id}.${exp}`);
  if (sig.length !== good.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return Date.now() < Number(exp) ? Number(id) : null;
}

function requireAdmin(req, res, next) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)adm=([^;]+)/);
  const id = verifyToken(m && m[1]);
  if (!id) return res.status(401).json({ error: 'auth' });
  req.adminId = id;
  next();
}

module.exports = { hashPassword, checkPassword, signToken, requireAdmin };
