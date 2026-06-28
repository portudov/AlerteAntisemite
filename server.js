// ------------------------------------------------------------------
// Plateforme de signalements - serveur principal
// ------------------------------------------------------------------
import express from 'express';
import { resolve } from 'node:path';
import { api } from './src/api.js';
import { pages } from './src/pages.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // pour recuperer l'IP reelle derriere un proxy/hebergeur

// Securite : en-tetes de base
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Pages admin (avant les fichiers statiques)
app.use(pages);

// API JSON
app.use('/api', api);

// Fichiers statiques (formulaire public, CSS, JS)
app.use(express.static(resolve('public'), { extensions: ['html'] }));

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route introuvable.' });
  res.status(404).sendFile(resolve('public', '404.html'), (err) => {
    if (err) res.status(404).send('Page introuvable');
  });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error('[erreur]', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Erreur serveur.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Plateforme de signalements demarree`);
  console.log(`  -> Public  : http://localhost:${PORT}/`);
  console.log(`  -> Admin   : http://localhost:${PORT}/admin\n`);
});
