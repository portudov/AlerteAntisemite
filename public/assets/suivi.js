// Suivi public d'un signalement par référence
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const input = $('ref');
  const result = $('result');

  const LABELS = {
    en_attente: { txt: 'En attente d\'examen', cls: 'badge-en_attente' },
    verifie: { txt: 'Vérifié', cls: 'badge-verifie' },
    refuse: { txt: 'Non retenu', cls: 'badge-refuse' },
  };

  // Pré-remplissage depuis l'URL (?ref=...)
  const fromUrl = new URLSearchParams(location.search).get('ref');
  if (fromUrl) { input.value = fromUrl.toUpperCase(); check(); }

  form.addEventListener('submit', (e) => { e.preventDefault(); check(); });

  async function check() {
    const ref = input.value.trim().toUpperCase();
    if (!ref) return;
    result.innerHTML = '<p class="muted">Recherche…</p>';
    try {
      const resp = await fetch('/api/signalements/' + encodeURIComponent(ref) + '/status');
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Introuvable.');
      const lbl = LABELS[data.status] || { txt: data.status, cls: '' };
      const created = new Date((data.created_at || '').replace(' ', 'T') + 'Z');
      result.innerHTML = '';
      const card = document.createElement('div');
      card.className = 'card';
      const h = document.createElement('div');
      h.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap';
      const title = document.createElement('strong');
      title.textContent = data.title;
      const badge = document.createElement('span');
      badge.className = 'badge ' + lbl.cls;
      badge.textContent = lbl.txt;
      h.append(title, badge);
      const meta = document.createElement('p');
      meta.className = 'muted mt';
      meta.textContent = 'Référence ' + data.reference +
        (isNaN(created) ? '' : ' · déposée le ' + created.toLocaleDateString('fr-FR'));
      card.append(h, meta);
      result.appendChild(card);
    } catch (err) {
      result.innerHTML = '<div class="alert alert-error"></div>';
      result.firstChild.textContent = err.message;
    }
  }
})();
