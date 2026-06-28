// ------------------------------------------------------------------
// Integration Google Gemini (API generativelanguage, niveau gratuit)
// Deux usages : rediger le "mail de base" (admin) et en deriver des
// variantes uniques (chaque personne envoie la sienne, volontairement).
// Regle absolue : contenu strictement factuel, jamais d'insulte/menace.
// ------------------------------------------------------------------
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const RECIPIENT_CONTEXT = {
  pharos:
    "la plateforme officielle PHAROS (signalement de contenus illicites en ligne aux autorites). " +
    "Le message decrit le contenu illicite constate et demande son examen.",
  prefecture:
    "une prefecture (autorite administrative / ordre public). " +
    "Le message alerte l'autorite et demande l'examen de la situation.",
  employeur:
    "l'employeur de la personne mise en cause. Le message expose des faits documentes " +
    "et demande, avec mesure, un examen interne ; il ne reclame aucune sanction precise.",
};

function buildSystem({ orgName, signature, instructions, recipientType, recipientLabel }) {
  const ctx = RECIPIENT_CONTEXT[recipientType] || 'le destinataire indique.';
  return (
`Tu rediges, en francais, un courrier formel et COMPLET de signalement d'un acte a caractere antisemite.
Destinataire : ${recipientLabel ? recipientLabel + ' — ' : ''}${ctx}
Auteur du courrier : une personne agissant a titre individuel${orgName ? ` (en lien avec « ${orgName} »)` : ''}.

STRUCTURE OBLIGATOIRE (un vrai courrier, plusieurs paragraphes aeres, pret a envoyer) :
1. Formule d'appel (« Madame, Monsieur, »).
2. Introduction : l'auteur ecrit a titre personnel et indique clairement l'objet de son alerte.
3. Expose detaille et chronologique des faits : date, lieu, support/plateforme, contexte, et reprise PRECISE du contenu ou des propos en cause (en les citant ou les decrivant fidelement).
4. Elements de preuve : mentionner les preuves disponibles (liens, captures, temoignages dates) et preciser qu'elles sont tenues a la disposition du destinataire.
5. Cadre et demande : rappeler sobrement que de tels faits sont susceptibles de tomber sous le coup de la loi (sans prononcer de verdict de culpabilite), puis formuler une demande CLAIRE et precise adaptee au destinataire (examen de la situation, suite appropriee relevant de sa competence).
6. Formule de politesse de cloture.
7. Signature.

REGLES IMPERATIVES (non negociables) :
- Le courrier doit etre COMPLET et bien structure : ni tronque, ni telegraphique. Vise un courrier consistant (environ 4 a 6 paragraphes).
- Strictement FACTUEL : appuie-toi UNIQUEMENT sur les faits et preuves fournis. N'invente, n'exagere et ne suppose rien.
- Ton mesure, courtois, vouvoiement.
- INTERDIT : insultes, menaces, appels au harcelement ou a la violence, verdict penal peremptoire (« untel est coupable de... »), accusations non etayees, et toute donnee personnelle non necessaire (adresse personnelle, telephone...).
- Reste sobre et credible : un courrier honnete et professionnel, pas un brulot.
- L'objet (subject) doit etre explicite et professionnel.${
  instructions ? `\n- Consignes de l'administrateur : ${instructions}` : ''
}${signature ? `\n- Termine le corps par cette signature : ${signature}` : ''}`
  );
}

const GEN_CONFIG = (temperature) => ({
  temperature: clampTemp(temperature),
  maxOutputTokens: 4096, // laisse la place a un courrier complet
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'object',
    properties: { subject: { type: 'string' }, body: { type: 'string' } },
    required: ['subject', 'body'],
  },
});

async function call(apiKey, model, system, userText, temperature, refForFallback) {
  if (!apiKey) throw new Error('Aucune cle API Gemini configuree (Parametres).');
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: GEN_CONFIG(temperature),
  };
  const url = `${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(humanizeError(data?.error?.message || `Erreur HTTP ${resp.status}`, resp.status));
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(
      candidate?.finishReason === 'SAFETY'
        ? "Reponse bloquee par les filtres de securite de Gemini."
        : "Reponse vide de Gemini (verifiez le nom du modele dans Parametres)."
    );
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { parsed = { subject: `Signalement ${refForFallback || ''}`.trim(), body: text }; }
  return { subject: String(parsed.subject || '').trim(), body: String(parsed.body || '').trim() };
}

function caseBlock(c) {
  return (
`FAITS SIGNALES :
- Reference du cas : ${c.reference}
- Categorie : ${c.category || 'non precisee'}
- Resume : ${c.title}
- Description des faits : ${c.description}
- Personne ou entite concernee : ${c.subject_concerned || 'non precisee'}
- Elements de preuve fournis : ${c.evidence || 'non precises'}`
  );
}

/** L'admin : rediger un premier "mail de base" a partir des faits du cas. */
export async function generateBaseEmail({
  apiKey, model, temperature, orgName, signature, instructions,
  recipientType, recipientLabel, caseData,
}) {
  const system = buildSystem({ orgName, signature, instructions, recipientType, recipientLabel });
  const user =
`${caseBlock(caseData)}

Redige un courrier COMPLET et bien structure (respecte la structure obligatoire en sections), en exploitant tous les elements ci-dessus de maniere detaillee. Donne l'objet (subject) et le corps (body).`;
  return call(apiKey, model, system, user, temperature, caseData.reference);
}

/** Variante UNIQUE derivee du mail de base (chaque soutien envoie la sienne). */
export async function deriveEmail({
  apiKey, model, temperature, orgName, signature, instructions,
  recipientType, recipientLabel, caseData, baseSubject, baseBody,
}) {
  const system = buildSystem({ orgName, signature, instructions, recipientType, recipientLabel });
  const user =
`MODELE DE REFERENCE redige par l'organisation (a reformuler avec tes propres mots, sans en changer le sens ni les faits) :
"""
Objet : ${baseSubject || ''}
${baseBody || ''}
"""

${caseBlock(caseData)}

Produis UNE variante naturelle et unique de ce courrier, comme si elle etait ecrite par une personne differente exprimant sincerement son indignation, tout en restant strictement factuelle et courtoise. CONSERVE la structure complete (formule d'appel, introduction, expose detaille et chronologique des faits, mention des preuves, cadre et demande, formule de politesse, signature) et le meme niveau de detail : le courrier doit rester COMPLET, ne le raccourcis pas. Ne change aucun fait. Donne l'objet (subject) et le corps (body).`;
  return call(apiKey, model, system, user, temperature, caseData.reference);
}

/** Liste les modeles disponibles (sert de test de cle). */
export async function listModels(apiKey) {
  if (!apiKey) throw new Error('Aucune cle API Gemini fournie.');
  const resp = await fetch(`${BASE}/models?key=${encodeURIComponent(apiKey)}`);
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(humanizeError(data?.error?.message || `Erreur HTTP ${resp.status}`, resp.status));
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace('models/', ''))
    .filter((n) => n.startsWith('gemini'));
}

function clampTemp(t) {
  const n = Number(t);
  if (Number.isNaN(n)) return 0.85;
  return Math.min(2, Math.max(0, n));
}

function humanizeError(msg, status) {
  if (status === 400 && /API key not valid/i.test(msg)) return 'Cle API Gemini invalide.';
  if (status === 403) return 'Acces refuse : cle API invalide ou API non activee.';
  if (status === 429) return 'Quota Gemini depasse (trop de requetes). Reessayez plus tard.';
  if (status === 404) return 'Modele introuvable. Verifiez le nom du modele dans Parametres.';
  return 'Gemini : ' + msg;
}
