// ------------------------------------------------------------------
// API JSON : depot de cas (preuves + identite), validation admin,
// mail de base + variantes IA, campagne publique. Avec garde-fous.
// ------------------------------------------------------------------
import express from 'express';
import {
  db, getSetting, setSetting, generateReference,
  hashPassword, verifyPassword, PHAROS_URL,
} from './db.js';
import { setAuthCookie, clearAuthCookie, requireAuth, isAuthed } from './auth.js';
import { generateBaseEmail, deriveEmail, listModels } from './gemini.js';
import { sendTargets } from './email.js';

export const api = express.Router();

const STATUSES = ['en_attente', 'verifie', 'refuse'];
const RECIPIENTS = ['pharos', 'prefecture', 'employeur'];

// ----------------------------- Helpers ----------------------------
function str(v, max) {
  if (v == null) return '';
  let s = String(v).trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function jsonSetting(key) {
  try { return JSON.parse(getSetting(key) || '[]'); } catch { return []; }
}

function publicSettings() {
  return {
    org_name: getSetting('org_name'),
    public_intro: getSetting('public_intro'),
    campaign_intro: getSetting('campaign_intro'),
    categories: jsonSetting('categories'),
    recipients_enabled: jsonSetting('recipients_enabled'),
    calomnie_warning: getSetting('calomnie_warning'),
    pharos_url: PHAROS_URL,
  };
}

// Champs exposes publiquement pour un cas verifie (anti-doxxing :
// ni identite du signalant, ni dossier brut de preuves).
function publicCase(row) {
  return {
    reference: row.reference,
    category: row.category,
    title: row.title,
    description: row.description,
    subject_concerned: row.subject_concerned,
    recipient_type: row.recipient_type,
    recipient_label: row.recipient_label,
    created_at: row.created_at,
  };
}

function aiParams() {
  return {
    apiKey: getSetting('gemini_api_key'),
    model: getSetting('gemini_model') || 'gemini-2.5-flash',
    temperature: getSetting('ai_temperature'),
    orgName: getSetting('org_name') || '',
    signature: getSetting('email_signature') || '',
    instructions: getSetting('ai_instructions') || '',
  };
}

// ------------------------- Limitation de debit --------------------
function makeRateLimit({ windowMs, max, message }) {
  const hits = new Map();
  // Nettoyage periodique pour eviter une fuite memoire
  const iv = setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const keep = arr.filter((t) => now - t < windowMs);
      if (keep.length) hits.set(k, keep); else hits.delete(k);
    }
  }, windowMs);
  if (iv.unref) iv.unref();

  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: message });
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
}

const limitSubmit = makeRateLimit({ windowMs: 10 * 60e3, max: 5, message: 'Trop de signalements envoyes. Reessayez dans quelques minutes.' });
const limitLogin = makeRateLimit({ windowMs: 10 * 60e3, max: 10, message: 'Trop de tentatives de connexion. Reessayez plus tard.' });
const limitDerive = makeRateLimit({ windowMs: 15 * 60e3, max: 10, message: 'Trop de generations. Reessayez dans quelques minutes.' });

// =================================================================
//  PUBLIC
// =================================================================
api.get('/config', (req, res) => res.json(publicSettings()));

// Depot d'un cas (identite + preuves OBLIGATOIRES)
api.post('/signalements', limitSubmit, (req, res) => {
  const b = req.body || {};
  const reporter_name = str(b.reporter_name, 120);
  const reporter_email = str(b.reporter_email, 200);
  const title = str(b.title, 200);
  const description = str(b.description, 5000);
  const evidence = str(b.evidence, 5000);
  const category = str(b.category, 120);
  const subject_concerned = str(b.subject_concerned, 300);

  if (!reporter_name) return res.status(400).json({ error: 'Votre nom est obligatoire.' });
  if (!reporter_email || !isEmail(reporter_email)) return res.status(400).json({ error: 'Une adresse email valide est obligatoire.' });
  if (!title) return res.status(400).json({ error: "L'objet du signalement est obligatoire." });
  if (!description) return res.status(400).json({ error: 'La description des faits est obligatoire.' });
  if (!evidence) return res.status(400).json({ error: 'Au moins une preuve (lien, description) est obligatoire.' });
  if (!b.attestation) return res.status(400).json({ error: 'Vous devez attester de la sincerite de votre signalement.' });

  const reference = generateReference();
  db.prepare(
    `INSERT INTO signalements
       (reference, reporter_name, reporter_email, category, title, description, evidence, subject_concerned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(reference, reporter_name, reporter_email, category || null, title, description, evidence, subject_concerned || null);

  res.status(201).json({ reference });
});

// Suivi public par reference
api.get('/signalements/:reference/status', (req, res) => {
  const ref = str(req.params.reference, 40).toUpperCase();
  const row = db.prepare(
    'SELECT reference, title, status, created_at, updated_at FROM signalements WHERE reference = ?'
  ).get(ref);
  if (!row) return res.status(404).json({ error: 'Aucun cas trouve pour cette reference.' });
  res.json(row);
});

// Liste publique des cas VERIFIES (page campagne)
api.get('/cases', (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM signalements WHERE status='verifie' AND base_email_body IS NOT NULL AND base_email_body <> '' ORDER BY datetime(created_at) DESC LIMIT 200"
  ).all();
  res.json({ cases: rows.map(publicCase) });
});

// Generer une variante a envoyer (public, volontaire) — limite
api.post('/cases/:reference/derive', limitDerive, async (req, res) => {
  const ref = str(req.params.reference, 40).toUpperCase();
  const row = db.prepare("SELECT * FROM signalements WHERE reference=? AND status='verifie'").get(ref);
  if (!row) return res.status(404).json({ error: 'Cas introuvable ou non verifie.' });
  if (!row.base_email_body) return res.status(409).json({ error: "Le courrier de ce cas n'est pas encore pret." });
  try {
    const variant = await deriveEmail({
      ...aiParams(),
      recipientType: row.recipient_type, recipientLabel: row.recipient_label,
      caseData: row, baseSubject: row.base_email_subject, baseBody: row.base_email_body,
    });
    const targets = sendTargets(row.recipient_type, row.recipient_email, variant.subject, variant.body);
    res.json({
      ...variant,
      recipient_type: row.recipient_type,
      recipient_label: row.recipient_label,
      recipient_email: row.recipient_type === 'pharos' ? null : row.recipient_email,
      ...targets,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Signalement self-report d'envoi (compteur honnete, facultatif)
api.post('/cases/:reference/participated', limitDerive, (req, res) => {
  const ref = str(req.params.reference, 40).toUpperCase();
  const info = db.prepare(
    "UPDATE signalements SET participation_count = participation_count + 1 WHERE reference=? AND status='verifie'"
  ).run(ref);
  res.json({ ok: info.changes > 0 });
});

// =================================================================
//  AUTH
// =================================================================
api.post('/login', limitLogin, (req, res) => {
  const pw = str(req.body?.password, 200);
  if (!pw) return res.status(400).json({ error: 'Mot de passe requis.' });
  if (!verifyPassword(pw, getSetting('admin_password_hash'))) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  setAuthCookie(res);
  res.json({ ok: true });
});

api.post('/logout', (req, res) => { clearAuthCookie(res); res.json({ ok: true }); });
api.get('/me', (req, res) => res.json({ authed: isAuthed(req) }));

// =================================================================
//  ADMIN (protege)
// =================================================================
const admin = express.Router();
admin.use(requireAuth);
api.use('/admin', admin);

admin.get('/signalements', (req, res) => {
  const status = str(req.query.status, 20);
  const q = str(req.query.q, 120);
  let sql = 'SELECT * FROM signalements';
  const where = [], params = [];
  if (STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
  if (q) {
    where.push('(reporter_name LIKE ? OR title LIKE ? OR description LIKE ? OR reference LIKE ? OR subject_concerned LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY datetime(created_at) DESC LIMIT 500';
  const rows = db.prepare(sql).all(...params);

  const counts = { en_attente: 0, verifie: 0, refuse: 0, total: 0 };
  for (const r of db.prepare('SELECT status, COUNT(*) c FROM signalements GROUP BY status').all()) {
    if (counts[r.status] != null) counts[r.status] = r.c;
    counts.total += r.c;
  }
  res.json({ signalements: rows, counts });
});

admin.get('/signalements/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM signalements WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Cas introuvable.' });
  res.json(row);
});

// Mise a jour des champs editables par l'admin
admin.put('/signalements/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM signalements WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Cas introuvable.' });
  const b = req.body || {};
  let recipient_type = str(b.recipient_type, 20);
  if (recipient_type && !RECIPIENTS.includes(recipient_type)) recipient_type = '';
  const recipient_email = str(b.recipient_email, 200);
  if (recipient_email && !isEmail(recipient_email)) return res.status(400).json({ error: 'Email du destinataire invalide.' });

  db.prepare(
    `UPDATE signalements SET
       category=?, title=?, description=?, subject_concerned=?, evidence=?,
       recipient_type=?, recipient_label=?, recipient_email=?,
       base_email_subject=?, base_email_body=?, updated_at=datetime('now')
     WHERE id=?`
  ).run(
    str(b.category, 120) || null,
    str(b.title, 200) || row.title,
    str(b.description, 5000),
    str(b.subject_concerned, 300) || null,
    str(b.evidence, 5000),
    recipient_type || null,
    str(b.recipient_label, 200) || null,
    recipient_email || null,
    str(b.base_email_subject, 300) || null,
    str(b.base_email_body, 20000) || null,
    id
  );
  res.json({ signalement: db.prepare('SELECT * FROM signalements WHERE id=?').get(id) });
});

// Verifier (publier le cas dans la campagne)
admin.post('/signalements/:id/verify', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM signalements WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Cas introuvable.' });
  if (!RECIPIENTS.includes(row.recipient_type)) return res.status(400).json({ error: 'Choisissez d\'abord un destinataire.' });
  if (row.recipient_type !== 'pharos' && (!row.recipient_email || !isEmail(row.recipient_email)))
    return res.status(400).json({ error: 'Renseignez un email de destinataire valide avant de verifier.' });
  if (!row.base_email_body) return res.status(400).json({ error: 'Redigez le mail de base avant de verifier.' });
  db.prepare("UPDATE signalements SET status='verifie', updated_at=datetime('now') WHERE id=?").run(id);
  res.json({ signalement: db.prepare('SELECT * FROM signalements WHERE id=?').get(id) });
});

admin.post('/signalements/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM signalements WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Cas introuvable.' });
  db.prepare("UPDATE signalements SET status='refuse', admin_note=?, updated_at=datetime('now') WHERE id=?")
    .run(str(req.body?.note, 2000) || null, id);
  res.json({ signalement: db.prepare('SELECT * FROM signalements WHERE id=?').get(id) });
});

admin.post('/signalements/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM signalements WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Cas introuvable.' });
  db.prepare("UPDATE signalements SET status='en_attente', updated_at=datetime('now') WHERE id=?").run(id);
  res.json({ signalement: db.prepare('SELECT * FROM signalements WHERE id=?').get(id) });
});

// Aide IA : rediger le mail de base
admin.post('/signalements/:id/generate-base', async (req, res) => {
  const row = db.prepare('SELECT * FROM signalements WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Cas introuvable.' });
  if (!RECIPIENTS.includes(row.recipient_type)) return res.status(400).json({ error: 'Choisissez d\'abord un destinataire.' });
  try {
    const r = await generateBaseEmail({
      ...aiParams(), recipientType: row.recipient_type, recipientLabel: row.recipient_label, caseData: row,
    });
    res.json(r);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Apercu d'une variante derivee (admin)
admin.post('/signalements/:id/preview-derive', async (req, res) => {
  const row = db.prepare('SELECT * FROM signalements WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Cas introuvable.' });
  if (!row.base_email_body) return res.status(400).json({ error: 'Redigez d\'abord le mail de base.' });
  try {
    const r = await deriveEmail({
      ...aiParams(), recipientType: row.recipient_type, recipientLabel: row.recipient_label,
      caseData: row, baseSubject: row.base_email_subject, baseBody: row.base_email_body,
    });
    res.json(r);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

admin.delete('/signalements/:id', (req, res) => {
  const info = db.prepare('DELETE FROM signalements WHERE id = ?').run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'Cas introuvable.' });
  res.json({ ok: true });
});

// Export CSV (protege contre l'injection de formule)
admin.get('/export.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM signalements ORDER BY datetime(created_at) DESC').all();
  const cols = ['reference', 'created_at', 'status', 'category', 'reporter_name', 'reporter_email',
    'subject_concerned', 'title', 'description', 'evidence', 'recipient_type', 'recipient_label', 'recipient_email'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;        // neutralise les formules Excel/Sheets
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="signalements.csv"');
  res.send('﻿' + lines.join('\r\n'));
});

// ------------------------- Parametres -----------------------------
const SETTING_KEYS = [
  'org_name', 'public_intro', 'campaign_intro', 'categories', 'recipients_enabled',
  'gemini_api_key', 'gemini_model', 'ai_temperature', 'ai_instructions',
  'email_signature', 'base_email_template', 'calomnie_warning',
];

admin.get('/settings', (req, res) => {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = getSetting(k);
  out.has_api_key = !!getSetting('gemini_api_key');
  res.json(out);
});

admin.put('/settings', (req, res) => {
  const b = req.body || {};
  for (const k of SETTING_KEYS) {
    if (!(k in b)) continue;
    let v = b[k];
    if ((k === 'categories' || k === 'recipients_enabled') && Array.isArray(v)) {
      v = JSON.stringify(v.map((x) => str(x, 120)).filter(Boolean));
    }
    if (k === 'gemini_api_key') v = str(v, 200);
    setSetting(k, v == null ? '' : String(v));
  }
  res.json({ ok: true });
});

admin.post('/change-password', (req, res) => {
  const current = str(req.body?.current, 200);
  const next = str(req.body?.next, 200);
  if (!verifyPassword(current, getSetting('admin_password_hash'))) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }
  if (next.length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caracteres.' });
  setSetting('admin_password_hash', hashPassword(next));
  res.json({ ok: true });
});

admin.post('/test-ai', async (req, res) => {
  const key = str(req.body?.api_key, 200) || getSetting('gemini_api_key');
  try { res.json({ ok: true, models: await listModels(key) }); }
  catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
