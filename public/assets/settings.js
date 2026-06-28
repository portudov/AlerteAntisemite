// Paramètres admin : organisation, modèle d'email, IA Gemini, mot de passe
(function () {
  const { api, toast, logout } = window.Admin;
  const $ = (id) => document.getElementById(id);
  $('logout').addEventListener('click', (e) => { e.preventDefault(); logout(); });

  async function load() {
    try {
      const s = await api('GET', '/admin/settings');
      $('gemini_api_key').value = s.gemini_api_key || '';
      $('gemini_model').value = s.gemini_model || '';
      $('ai_temperature').value = s.ai_temperature || '0.85';
      $('ai_instructions').value = s.ai_instructions || '';
      $('base_email_template').value = s.base_email_template || '';
      $('email_signature').value = s.email_signature || '';
      $('calomnie_warning').value = s.calomnie_warning || '';
      $('org_name').value = s.org_name || '';
      $('public_intro').value = s.public_intro || '';
      $('campaign_intro').value = s.campaign_intro || '';
      try { $('categories').value = JSON.parse(s.categories || '[]').join('\n'); }
      catch { $('categories').value = ''; }
      let rcpt = [];
      try { rcpt = JSON.parse(s.recipients_enabled || '[]'); } catch { /* ignore */ }
      $('rcpt_pharos').checked = rcpt.includes('pharos');
      $('rcpt_prefecture').checked = rcpt.includes('prefecture');
      $('rcpt_employeur').checked = rcpt.includes('employeur');

      $('loading').style.display = 'none';
      $('content').style.display = 'block';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  $('btnSave').addEventListener('click', async () => {
    const btn = $('btnSave');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Enregistrement…';
    const rcpt = [];
    if ($('rcpt_pharos').checked) rcpt.push('pharos');
    if ($('rcpt_prefecture').checked) rcpt.push('prefecture');
    if ($('rcpt_employeur').checked) rcpt.push('employeur');
    const payload = {
      gemini_api_key: $('gemini_api_key').value.trim(),
      gemini_model: $('gemini_model').value.trim() || 'gemini-2.5-flash',
      ai_temperature: $('ai_temperature').value || '0.85',
      ai_instructions: $('ai_instructions').value,
      base_email_template: $('base_email_template').value,
      email_signature: $('email_signature').value,
      calomnie_warning: $('calomnie_warning').value,
      org_name: $('org_name').value.trim(),
      public_intro: $('public_intro').value,
      campaign_intro: $('campaign_intro').value,
      categories: $('categories').value.split('\n').map((x) => x.trim()).filter(Boolean),
      recipients_enabled: rcpt,
    };
    try {
      await api('PUT', '/admin/settings', payload);
      toast('Paramètres enregistrés ✓', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '💾 Enregistrer tous les paramètres';
    }
  });

  $('btnTestAi').addEventListener('click', async () => {
    const btn = $('btnTestAi');
    const res = $('aiTestResult');
    btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Test…';
    res.textContent = '';
    try {
      const data = await api('POST', '/admin/test-ai', { api_key: $('gemini_api_key').value.trim() });
      const models = data.models || [];
      const dl = $('modelList');
      dl.innerHTML = '';
      models.forEach((m) => { const o = document.createElement('option'); o.value = m; dl.appendChild(o); });
      res.style.color = 'var(--success)';
      res.textContent = '✓ Clé valide — ' + models.length + ' modèle(s) disponible(s).';
    } catch (err) {
      res.style.color = 'var(--danger)';
      res.textContent = '✕ ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = '🔌 Tester la clé';
    }
  });

  $('btnPw').addEventListener('click', async () => {
    const current = $('pwCurrent').value;
    const next = $('pwNext').value;
    if (!current || !next) return toast('Renseignez les deux champs.', 'error');
    try {
      await api('POST', '/admin/change-password', { current, next });
      $('pwCurrent').value = ''; $('pwNext').value = '';
      toast('Mot de passe modifié ✓', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  load();
})();
