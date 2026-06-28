// Helpers partagés par les pages admin
window.Admin = (function () {
  async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch('/api' + path, opts);
    if (resp.status === 401) {
      location.href = '/admin/login';
      throw new Error('Session expirée');
    }
    let data = null;
    try { data = await resp.json(); } catch { /* pas de corps JSON */ }
    if (!resp.ok) throw new Error((data && data.error) || 'Erreur (' + resp.status + ')');
    return data;
  }

  function toast(msg, type) {
    const wrap = document.getElementById('toasts');
    if (!wrap) return alert(msg);
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    if (isNaN(d)) return s;
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  const STATUS = {
    en_attente: 'En attente',
    verifie: 'Vérifié',
    refuse: 'Refusé',
  };

  function statusBadge(status) {
    const span = document.createElement('span');
    span.className = 'badge badge-' + status;
    span.textContent = STATUS[status] || status;
    return span;
  }

  async function logout() {
    try { await api('POST', '/logout'); } catch { /* ignore */ }
    location.href = '/admin/login';
  }

  return { api, toast, fmtDate, statusBadge, STATUS, logout };
})();
