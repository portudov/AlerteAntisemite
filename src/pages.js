// ------------------------------------------------------------------
// Service des pages HTML admin (protegees par cookie de session)
// ------------------------------------------------------------------
import express from 'express';
import { resolve } from 'node:path';
import { isAuthed } from './auth.js';

export const pages = express.Router();
const VIEWS = resolve('views');

function send(res, file) {
  res.sendFile(resolve(VIEWS, file));
}

// Page de connexion (publique). Si deja connecte -> tableau de bord.
pages.get('/admin/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin');
  send(res, 'login.html');
});

// Pages protegees
function gate(req, res, next) {
  if (isAuthed(req)) return next();
  res.redirect('/admin/login');
}

pages.get('/admin', gate, (req, res) => send(res, 'dashboard.html'));
pages.get('/admin/signalement', gate, (req, res) => send(res, 'detail.html'));
pages.get('/admin/parametres', gate, (req, res) => send(res, 'settings.html'));

// Tout autre /admin/... -> tableau de bord
pages.get('/admin/*', (req, res) => res.redirect('/admin'));
