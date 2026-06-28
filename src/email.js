// ------------------------------------------------------------------
// Liens d'envoi : Gmail / mailto pour prefecture & employeur,
// lien officiel pour PHAROS (formulaire, pas d'email).
// ------------------------------------------------------------------
import { PHAROS_URL } from './db.js';

export function gmailComposeUrl(to, subject, body) {
  const params = new URLSearchParams({
    view: 'cm', fs: '1', to: to || '', su: subject || '', body: body || '',
  });
  return 'https://mail.google.com/mail/?' + params.toString();
}

export function mailtoUrl(to, subject, body) {
  const qs = new URLSearchParams({ subject: subject || '', body: body || '' });
  return `mailto:${encodeURIComponent(to || '')}?` + qs.toString();
}

/** Construit les liens d'envoi adaptes au type de destinataire. */
export function sendTargets(recipientType, recipientEmail, subject, body) {
  if (recipientType === 'pharos') {
    return { mode: 'pharos', pharos_url: PHAROS_URL, gmail_url: null, mailto_url: null };
  }
  return {
    mode: 'email',
    pharos_url: null,
    gmail_url: gmailComposeUrl(recipientEmail, subject, body),
    mailto_url: mailtoUrl(recipientEmail, subject, body),
  };
}
