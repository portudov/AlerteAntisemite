# 🕎 Plateforme de signalement d'actes antisémites

Application web pour **documenter des actes antisémites avec preuves**, les faire **vérifier par un administrateur**, puis permettre une **interpellation citoyenne** des autorités ou destinataires compétents — chaque personne envoyant **librement** son propre message, rédigé avec l'aide de l'IA (Google Gemini).

Conçue pour rester du côté de l'action **légitime** : verification systématique, preuves obligatoires, signalant identifié, contenu **strictement factuel**, et **aucune tromperie** (chaque email envoyé = une personne réelle, volontaire).

## Comment ça marche

1. **Signalement (public)** — Une personne identifiée décrit un acte antisémite **avec des preuves** (lien, capture hébergée, témoignage daté) et atteste sur l'honneur de sa sincérité.
2. **Vérification (admin)** — L'administrateur examine le dossier. S'il est fondé, il choisit le **destinataire** (PHAROS / Préfecture / Employeur), rédige le **mail de base** (aidé par l'IA si besoin), puis **vérifie et publie** le cas.
3. **Interpellation (public)** — Sur la page **« Cas vérifiés »**, toute personne indignée peut générer **sa propre variante** du courrier (l'IA reformule le mail de base) et l'envoyer elle-même via **Gmail** (Préfecture/Employeur) ou le **formulaire officiel PHAROS**. Libre d'envoyer ou non.

### Garde-fous intégrés

- **Preuves + identité du signalant obligatoires** (responsabilité, lutte contre les fausses accusations).
- **Vérification admin** avant toute publication.
- **Contenu IA strictement factuel** : rappel des faits + demande d'examen ; insultes, menaces, appels au harcèlement et accusations non étayées **interdits** au niveau du prompt.
- **Anti-doxxing** : ni l'identité du signalant ni le dossier brut de preuves ne sont publiés.
- **Avertissement légal** (dénonciation calomnieuse, art. 226-10 du Code pénal) affiché aux utilisateurs.
- Aucune fonction de « multiplication » destinée à simuler de fausses plaintes indépendantes.

---

## 🚀 Démarrage rapide (en local)

Prérequis : **Node.js ≥ 22.5** (testé sur Node 24).

```bash
npm install
npm start
```

- Site public : <http://localhost:3000/>
- Espace admin : <http://localhost:3000/admin>

**Mot de passe admin** : au tout premier démarrage, si `ADMIN_PASSWORD` n'est pas défini, un mot de passe aléatoire est **généré et affiché une seule fois dans la console**. Notez-le (ou définissez `ADMIN_PASSWORD` dans `.env`). Modifiable ensuite dans **Paramètres**.

### Configuration (`.env`)

| Variable | Rôle |
|----------|------|
| `PORT` | Port d'écoute (défaut 3000) |
| `ADMIN_PASSWORD` | Mot de passe admin **initial** (vide = généré aléatoirement) |
| `GEMINI_API_KEY` | Clé Google Gemini (ou à coller dans Paramètres) |
| `GEMINI_MODEL` | **`gemini-2.5-flash`** (seul modèle gratuit fonctionnel) |
| `NODE_ENV` | `production` une fois en ligne (cookies sécurisés HTTPS) |

---

## 🔑 Clé Google Gemini (gratuite)

1. <https://aistudio.google.com/apikey> → **Créer une clé API** (ou copier l'existante).
2. La coller dans **Paramètres → Clé API Gemini**, puis **« Tester la clé »**.

> Sur le niveau **gratuit**, utilisez **`gemini-2.5-flash`**. Les modèles `gemini-2.0-*` ont un quota gratuit nul.

---

## 🌐 Mettre en ligne

`Dockerfile` fourni → fonctionne sur tout hébergeur Node/Docker.

**Railway (recommandé, persistant, gratuit)** :
1. Pousser ce projet sur un dépôt Git, puis Railway → *Deploy from GitHub repo*.
2. Variables : `NODE_ENV=production`, `ADMIN_PASSWORD=…`, `GEMINI_API_KEY=…`, `GEMINI_MODEL=gemini-2.5-flash`.
3. **Settings → Volumes** : monter un volume sur **`/app/data`** (conserve la base SQLite).

**Render** : `render.yaml` fourni (⚠️ disque non persistant en gratuit — voir le fichier).

**Docker** :
```bash
docker build -t signalements .
docker run -d -p 3000:3000 -e ADMIN_PASSWORD="…" -e GEMINI_API_KEY="…" \
  -e NODE_ENV=production -v signalements_data:/app/data signalements
```

---

## 🔒 Sécurité

- Mot de passe admin haché (scrypt), session par cookie signé (HMAC), `HttpOnly`/`SameSite=Lax`, `Secure` en production.
- Limitation de débit sur la connexion, le dépôt et la génération IA (anti-abus / anti-bruteforce).
- Clé Gemini gardée **côté serveur** uniquement. Export CSV protégé contre l'injection de formule.
- `.env` et `data/` exclus de Git — **ne committez jamais votre clé**.

## 🗂️ Structure

```
server.js            Point d'entrée Express
src/db.js            SQLite + paramètres + mots de passe
src/auth.js          Sessions admin (cookie signé)
src/gemini.js        Mail de base + variantes (factuel)
src/email.js         Liens Gmail / PHAROS
src/api.js           API JSON (public + admin)
src/pages.js         Pages admin protégées
public/              Pages publiques : signalement, campagne, suivi + assets
views/               Pages admin (HTML)
Dockerfile           Déploiement conteneurisé
```

> ⚖️ Outil destiné au signalement de faits **réels et documentés** aux destinataires légitimes. Son usage relève de la responsabilité de l'administrateur et des utilisateurs, dans le respect de la loi (ne pas diffamer, ne pas harceler, ne signaler que des faits prouvés).
