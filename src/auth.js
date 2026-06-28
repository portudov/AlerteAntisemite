// ------------------------------------------------------------------
// Authentification admin : cookie de session signe (HMAC), sans dependance
// ------------------------------------------------------------------
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSetting } from './db.js';

const COOKIE_NAME = 'sig_session';
const MAX_AGE_S = 7 * 24 * 3600; // 7 jours

function secret() {
  return getSetting('session_secret') || 'fallback-secret-change-me';
}

function sign(data) {
  return createHmac('sha256', secret()).update(data).digest('base64url');
}

export function issueToken() {
  const payload = JSON.stringify({ role: 'admin', exp: Date.now() + MAX_AGE_S * 1000 });
  const b = Buffer.from(payload).toString('base64url');
  return `${b}.${sign(b)}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [b, sig] = token.split('.');
  const expected = sign(b);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return p.role === 'admin' && typeof p.exp === 'number' && p.exp > Date.now();
  } catch {
    return false;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      const k = part.slice(0, i).trim();
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return out;
}

export function isAuthed(req) {
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

export function setAuthCookie(res, req) {
  // Marque "Secure" uniquement si la requete arrive reellement en HTTPS
  // (derriere le proxy Coolify/Traefik : en-tete x-forwarded-proto).
  const proto = String(req?.headers?.['x-forwarded-proto'] || (req?.secure ? 'https' : 'http'))
    .split(',')[0].trim();
  const secure = proto === 'https';
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${issueToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}` +
      (secure ? '; Secure' : '')
  );
}

export function clearAuthCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Middleware : protege l'API admin (renvoie 401 JSON)
export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Non authentifie' });
}
