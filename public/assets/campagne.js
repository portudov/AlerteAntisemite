// Page publique : annuaire des cas vérifiés + génération volontaire d'un message
(function () {
  const $ = (id) => document.getElementById(id);
  const RTYPE = { pharos: 'PHAROS', prefecture: 'Préfecture', employeur: 'Employeur' };
  const RICON = { pharos: '🔗', prefecture: '🏛️', employeur: '🏢' };
  let all = [];
  let filterR = '';
  let q = '';
  let cur = { ref: null, mode: null, email: null, pharos: null };

  function toast(msg, type) {
    const w = $('toasts'); if (!w) return;
    const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg;
    w.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  }
  function fmtDate(s) {
    const d = new Date(String(s || '').replace(' ', 'T') + 'Z');
    return isNaN(d) ? '' : d.toLocaleDateString('fr-FR');
  }

  (async function init() {
    try {
      const cfg = await fetch('/api/config').then((r) => r.json());
      if (cfg.org_name) $('brandName').textContent = cfg.org_name;
      if (cfg.campaign_intro) $('intro').textContent = cfg.campaign_intro;
      if (cfg.calomnie_warning) { $('warn').textContent = 'ℹ️ ' + cfg.calomnie_warning; $('warn').style.display = 'block'; }
    } catch { /* ignore */ }
    await loadCases();
  })();

  async function loadCases() {
    try {
      const data = await fetch('/api/cases').then((r) => r.json());
      all = data.cases || [];
    } catch { all = []; }
    // N'afficher dans les filtres que les destinataires réellement présents
    const present = new Set(all.map((c) => c.recipient_type));
    [...$('tabs').children].forEach((b) => {
      const r = b.dataset.r;
      b.style.display = (!r || present.has(r)) ? '' : 'none';
    });
    render();
  }

  function render() {
    const grid = $('grid');
    grid.innerHTML = '';
    const ql = q.toLowerCase();
    const shown = all.filter((c) => {
      if (filterR && c.recipient_type !== filterR) return false;
      if (!ql) return true;
      return [c.title, c.description, c.subject_concerned, c.category]
        .some((v) => (v || '').toLowerCase().includes(ql));
    });

    $('countline').innerHTML = '';
    const total = all.length;
    const cl = document.createElement('span');
    cl.innerHTML = `<strong>${total}</strong> cas vérifié${total > 1 ? 's' : ''}` +
      (shown.length !== total ? ` · ${shown.length} affiché${shown.length > 1 ? 's' : ''}` : '');
    $('countline').appendChild(cl);

    $('empty').style.display = shown.length ? 'none' : 'block';
    $('emptyMsg').textContent = total === 0
      ? 'Aucun cas vérifié pour le moment.'
      : 'Aucun cas ne correspond à votre recherche.';

    for (const c of shown) grid.appendChild(card(c));
  }

  function card(c) {
    const el = document.createElement('article');
    el.className = 'case-card';

    const top = document.createElement('div'); top.className = 'cc-top';
    const cat = document.createElement('span'); cat.className = 'chip chip-cat';
    cat.textContent = c.category || 'Acte antisémite';
    const verified = document.createElement('span'); verified.className = 'badge badge-verifie'; verified.textContent = 'Vérifié';
    top.append(cat, verified);

    const h = document.createElement('h3'); h.textContent = c.title;

    const meta = document.createElement('div'); meta.className = 'cc-meta';
    const d = document.createElement('span'); d.textContent = '📅 ' + fmtDate(c.created_at); meta.appendChild(d);
    if (c.subject_concerned) { const s = document.createElement('span'); s.textContent = '🎯 ' + c.subject_concerned; meta.appendChild(s); }

    const desc = document.createElement('p'); desc.className = 'cc-desc clamp-3'; desc.textContent = c.description;

    const foot = document.createElement('div'); foot.className = 'cc-foot';
    const dest = document.createElement('span'); dest.className = 'chip chip-dest';
    dest.textContent = (RICON[c.recipient_type] || '→') + ' ' + (c.recipient_label || RTYPE[c.recipient_type] || 'Destinataire');
    const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-sm'; btn.textContent = '✍️ Écrire';
    btn.addEventListener('click', () => openModal(c));
    foot.append(dest, btn);

    el.append(top, h, meta, desc, foot);
    return el;
  }

  // --- Filtres / recherche ---
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    [...$('tabs').children].forEach((x) => x.classList.toggle('active', x === b));
    filterR = b.dataset.r; render();
  });
  let timer = null;
  $('search').addEventListener('input', (e) => {
    q = e.target.value.trim(); clearTimeout(timer); timer = setTimeout(render, 180);
  });

  // --- Modale ---
  function openModal(c) {
    cur = { ref: c.reference, mode: null, email: null, pharos: null };
    $('mTitle').textContent = 'Écrire au sujet de : ' + c.title;
    $('overlay').style.display = 'flex';
    derive();
  }
  async function derive() {
    $('mError').style.display = 'none'; $('mContent').style.display = 'none'; $('mLoading').style.display = 'block';
    try {
      const data = await fetch('/api/cases/' + encodeURIComponent(cur.ref) + '/derive', { method: 'POST' })
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erreur'); return d; });
      cur.mode = data.mode; cur.email = data.recipient_email || null; cur.pharos = data.pharos_url || null;
      $('mSubject').value = data.subject || ''; $('mBody').value = data.body || '';
      $('mLoading').style.display = 'none'; $('mContent').style.display = 'block';
      setupTargets();
    } catch (err) {
      $('mLoading').style.display = 'none'; $('mError').textContent = err.message; $('mError').style.display = 'block';
    }
  }
  function setupTargets() {
    const gmail = $('mGmail'), pharos = $('mPharos');
    if (cur.mode === 'pharos') {
      gmail.style.display = 'none'; pharos.style.display = 'inline-flex'; pharos.href = cur.pharos;
      $('mHint').textContent = 'PHAROS est un formulaire officiel : copiez votre texte, cliquez sur « Signaler sur PHAROS » et collez-le dans le formulaire.';
    } else {
      pharos.style.display = 'none'; gmail.style.display = 'inline-flex'; updateGmail();
      $('mHint').textContent = 'Le bouton ouvre Gmail avec le message pré-rempli. Relisez-le avant d\'envoyer.';
    }
  }
  function updateGmail() {
    if (cur.mode === 'pharos') return;
    const p = new URLSearchParams({ view: 'cm', fs: '1', to: cur.email || '', su: $('mSubject').value, body: $('mBody').value });
    $('mGmail').href = 'https://mail.google.com/mail/?' + p.toString();
  }
  $('mSubject').addEventListener('input', updateGmail);
  $('mBody').addEventListener('input', updateGmail);
  $('mRegen').addEventListener('click', derive);
  $('mClose').addEventListener('click', () => { $('overlay').style.display = 'none'; });
  $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) $('overlay').style.display = 'none'; });
  $('mCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('mBody').value); toast('Message copié', 'success'); }
    catch { $('mBody').select(); document.execCommand('copy'); toast('Message copié', 'success'); }
  });
})();
