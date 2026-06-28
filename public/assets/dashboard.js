// Tableau de bord admin : liste, filtres, recherche, compteurs
(function () {
  const { api, fmtDate, statusBadge, toast, logout } = window.Admin;
  const $ = (id) => document.getElementById(id);
  let status = '';
  let q = '';
  let timer = null;

  $('logout').addEventListener('click', (e) => { e.preventDefault(); logout(); });

  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    [...$('tabs').children].forEach((b) => b.classList.toggle('active', b === btn));
    status = btn.dataset.status;
    load();
  });

  $('search').addEventListener('input', (e) => {
    q = e.target.value.trim();
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  });

  async function load() {
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      const data = await api('GET', '/admin/signalements?' + params.toString());
      render(data);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function render(data) {
    const c = data.counts || {};
    $('cTotal').textContent = c.total || 0;
    $('cAttente').textContent = c.en_attente || 0;
    $('cVerifie').textContent = c.verifie || 0;
    $('cRefuse').textContent = c.refuse || 0;

    const list = $('list');
    list.innerHTML = '';
    const rows = data.signalements || [];
    $('empty').style.display = rows.length ? 'none' : 'block';

    for (const r of rows) {
      const a = document.createElement('a');
      a.className = 'item';
      a.href = '/admin/signalement?id=' + r.id;

      const head = document.createElement('div');
      head.className = 'item-head';
      const title = document.createElement('span');
      title.className = 'item-title';
      title.textContent = r.title;
      head.append(title, statusBadge(r.status));

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const ref = document.createElement('span');
      ref.className = 'ref';
      ref.textContent = r.reference;
      const who = document.createElement('span');
      who.textContent = '👤 ' + r.reporter_name;
      const when = document.createElement('span');
      when.textContent = '🕑 ' + fmtDate(r.created_at);
      meta.append(ref, who, when);
      if (r.subject_concerned) { const s = document.createElement('span'); s.textContent = '🎯 ' + r.subject_concerned; meta.appendChild(s); }
      if (r.category) { const cat = document.createElement('span'); cat.textContent = '🏷️ ' + r.category; meta.appendChild(cat); }
      if (r.status === 'verifie') { const e = document.createElement('span'); e.textContent = '📣 publié'; meta.appendChild(e); }

      a.append(head, meta);
      list.appendChild(a);
    }
  }

  load();
})();
