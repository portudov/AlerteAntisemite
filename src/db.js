// ------------------------------------------------------------------
// Base de donnees (SQLite integre a Node, aucune dependance native)
// ------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = process.env.DB_PATH || resolve('data', 'app.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Un "cas" = un signalement d'acte antisemite a traiter
CREATE TABLE IF NOT EXISTS signalements (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  reference          TEXT UNIQUE NOT NULL,
  -- Signalant (identite OBLIGATOIRE pour la responsabilite)
  reporter_name      TEXT NOT NULL,
  reporter_email     TEXT NOT NULL,
  -- Le cas
  category           TEXT,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  evidence           TEXT NOT NULL,        -- preuves (liens, captures hebergees, temoignages dates)
  subject_concerned  TEXT,                 -- personne/entite mise en cause + contexte identifiant
  -- Destinataire du courrier
  recipient_type     TEXT,                 -- pharos | prefecture | employeur
  recipient_label    TEXT,                 -- ex. "Prefecture de Paris", "Societe X - RH"
  recipient_email    TEXT,                 -- pour prefecture / employeur
  -- Traitement
  status             TEXT NOT NULL DEFAULT 'en_attente',  -- en_attente | verifie | refuse
  admin_note         TEXT,
  base_email_subject TEXT,                 -- "mail de base" redige par l'admin
  base_email_body    TEXT,
  participation_count INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sig_status  ON signalements(status);
CREATE INDEX IF NOT EXISTS idx_sig_created ON signalements(created_at);
`);

// -------------------------- Parametres ----------------------------
const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare(
  'INSERT INTO settings(key, value) VALUES(?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function getSetting(key, fallback = null) {
  const row = getStmt.get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  setStmt.run(key, value == null ? null : String(value));
}

// -------------------------- Mots de passe -------------------------
export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashBuf = Buffer.from(hash, 'hex');
  const calc = scryptSync(pw, salt, 64);
  return hashBuf.length === calc.length && timingSafeEqual(hashBuf, calc);
}

// -------------------------- Reference unique ----------------------
const refExists = db.prepare('SELECT 1 FROM signalements WHERE reference = ?');
export function generateReference() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 12; attempt++) {
    let s = 'SIG-';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) s += chars[bytes[i] % chars.length];
    if (!refExists.get(s)) return s;
  }
  return 'SIG-' + Date.now().toString(36).toUpperCase();
}

// -------------------------- Valeurs par defaut --------------------
export const PHAROS_URL = 'https://www.internet-signalement.gouv.fr/';

const DEFAULT_BASE_EMAIL = `Madame, Monsieur,

Je me permets de vous alerter, a titre personnel, au sujet de faits a caractere antisemite qui me paraissent devoir etre portes a votre connaissance.

Les faits sont les suivants : {{faits}}
Ils se sont produits dans le contexte suivant (date, lieu, support) : {{contexte}}
La personne ou l'entite concernee est : {{mis_en_cause}}

Le contenu en cause est explicitement de nature antisemite et porte atteinte a la dignite des personnes visees. Ces faits sont documentes par des elements (liens, captures, temoignages) que je tiens a votre entiere disposition.

De tels faits sont susceptibles de tomber sous le coup de la loi. Aussi, je vous remercie de bien vouloir examiner attentivement cette situation et d'y donner la suite appropriee relevant de votre competence.

Je reste a votre disposition pour tout element complementaire et vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.`;

const DEFAULT_AI_INSTRUCTIONS =
  "Le courrier doit rester STRICTEMENT FACTUEL, mesure et courtois (vouvoiement). " +
  "S'appuyer UNIQUEMENT sur les faits et preuves fournis, sans rien inventer ni exagerer. " +
  "Demander un examen de la situation et la suite appropriee. " +
  "INTERDICTION ABSOLUE : insultes, menaces, appels au harcelement ou a la violence, " +
  "qualifications penales peremptoires, propos diffamatoires non etayes, et divulgation de " +
  "donnees personnelles non necessaires (adresse personnelle, telephone, etc.).";

const DEFAULT_CALOMNIE =
  "N'envoyez que des faits reels et verifiables. Une accusation fausse (denonciation calomnieuse, " +
  "art. 226-10 du Code penal) ou diffamatoire est punie par la loi. Restez factuel et courtois.";

const DEFAULTS = {
  org_name: 'Collectif de signalement',
  // Page de depot
  public_intro:
    "Signalez un acte antisemite avec des preuves. Chaque signalement est verifie " +
    "par notre equipe avant toute diffusion. Restez factuel : seuls les faits prouves sont retenus.",
  // Page campagne
  campaign_intro:
    "Cas verifies par notre equipe. Si vous etes indigne(e), vous etes libre d'envoyer " +
    "votre propre message au destinataire concerne. Chaque envoi est volontaire et individuel.",
  categories: JSON.stringify([
    'Propos / publication en ligne',
    'Injure / menace',
    'Acte / degradation',
    'Discrimination',
    'Autre',
  ]),
  recipients_enabled: JSON.stringify(['pharos', 'prefecture', 'employeur']),
  gemini_api_key: process.env.GEMINI_API_KEY || '',
  gemini_model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ai_temperature: '0.85',
  ai_instructions: DEFAULT_AI_INSTRUCTIONS,
  email_signature: '',
  base_email_template: DEFAULT_BASE_EMAIL,
  calomnie_warning: DEFAULT_CALOMNIE,
};

for (const [k, v] of Object.entries(DEFAULTS)) {
  if (getSetting(k) === null) setSetting(k, v);
}

// Secret de signature des cookies (genere une seule fois)
if (getSetting('session_secret') === null) {
  setSetting('session_secret', randomBytes(32).toString('hex'));
}

// Mot de passe admin : initialise a la premiere execution.
// Securite : pas de mot de passe par defaut devinable. Si ADMIN_PASSWORD
// n'est pas fourni, on genere un mot de passe aleatoire fort, affiche UNE fois.
if (getSetting('admin_password_hash') === null) {
  let pw = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!pw) {
    pw = randomBytes(9).toString('base64url'); // ~12 caracteres aleatoires
    generated = true;
  }
  setSetting('admin_password_hash', hashPassword(pw));
  setSetting('admin_password_is_default', '0');
  if (generated) {
    console.log(
      '\n  ====================================================\n' +
      '   COMPTE ADMIN CREE\n' +
      `   Mot de passe (genere, notez-le) : ${pw}\n` +
      '   (definissez ADMIN_PASSWORD pour choisir le votre)\n' +
      '  ====================================================\n'
    );
  } else {
    console.log('[init] Compte admin cree avec ADMIN_PASSWORD.');
  }
}
