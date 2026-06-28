// Détail admin : vérifier, choisir le destinataire, rédiger le mail de base
(function () {
  const { api, fmtDate, statusBadge, toast, logout } = window.Admin;
  const $ = (id) => document.getElementById(id);
  const PHAROS_URL = 'https://www.internet-signalement.gouv.fr/';
  const id = new URLSearchParams(location.search).get('id');
  let current = null;

  $('logout').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  if (!id) { location.href = '/admin'; return; }

  const setText = (elId, val, fb) => { $(elId).textContent = (val == null || val === '') ? (fb || '—') : val; };

  function render(s) {
    current = s;
    $('loading').style.display = 'none';
    $('content').style.display = 'block';
    document.title = s.title + ' — Admin';

    setText('title', s.title);
    $('ref').textContent = s.reference;
    $('badge').innerHTML = ''; $('badge').appendChild(statusBadge(s.status));

    $('reporter').innerHTML = '';
    const who = document.createTextNode(s.reporter_name + '  ');
    const mail = document.createElement('a'); mail.href = 'mailto:' + s.reporter_email; mail.textContent = s.reporter_email;
    $('reporter').append(who, mail);

    setText('category', s.category);
    setText('subject', s.subject_concerned);
    setText('created', fmtDate(s.created_at));
    setText('description', s.description);
    setText('evidence', s.evidence);

    if (s.status === 'refuse' && s.admin_note) {
      $('adminNoteBox').style.display = 'block';
      $('adminNoteBox').textContent = '📝 Motif : ' + s.admin_note;
    } else $('adminNoteBox').style.display = 'none';

    // Champs éditables
    $('recipient_type').value = s.recipient_type || '';
    $('recipient_label').value = s.recipient_label || '';
    $('recipient_email').value = s.recipient_email || '';
    $('base_email_subject').value = s.base_email_subject || '';
    $('base_email_body').value = s.base_email_body || '';
    onRecipientChange();

    // Boutons d'état
    $('btnVerify').style.display = s.status === 'verifie' ? 'none' : '';
    $('btnReject').style.display = s.status === 'refuse' ? 'none' : '';
    $('btnReopen').style.display = s.status === 'en_attente' ? 'none' : '';
    $('verifyHint').textContent = s.status === 'verifie'
      ? '✅ Ce cas est publié sur la page campagne.'
      : 'Pour publier : choisir un destinataire, renseigner l\'email (sauf PHAROS), rédiger le mail de base, enregistrer, puis vérifier.';
  }

  function onRecipientChange() {
    const t = $('recipient_type').value;
    const isPharos = t === 'pharos';
    $('emailField').style.display = isPharos ? 'none' : 'block';
    $('pharosHint').style.display = isPharos ? 'block' : 'none';
    updateSend();
  }
  function updateSend() {
    const t = $('recipient_type').value;
    const su = $('base_email_subject').value, body = $('base_email_body').value;
    if (t === 'pharos') {
      $('btnGmail').style.display = 'none';
      $('btnPharos').style.display = 'inline-flex';
      $('btnPharos').href = PHAROS_URL;
    } else if (t) {
      $('btnPharos').style.display = 'none';
      $('btnGmail').style.display = 'inline-flex';
      const p = new URLSearchParams({ view: 'cm', fs: '1', to: $('recipient_email').value, su, body });
      $('btnGmail').href = 'https://mail.google.com/mail/?' + p.toString();
    } else {
      $('btnGmail').style.display = 'none'; $('btnPharos').style.display = 'none';
    }
  }
  ['recipient_type', 'recipient_email', 'base_email_subject', 'base_email_body'].forEach((f) =>
    $(f).addEventListener('input', f === 'recipient_type' ? onRecipientChange : updateSend));

  function editablePayload() {
    return {
      category: current.category, title: current.title,
      description: current.description, evidence: current.evidence,
      subject_concerned: current.subject_concerned,
      recipient_type: $('recipient_type').value,
      recipient_label: $('recipient_label').value.trim(),
      recipient_email: $('recipient_email').value.trim(),
      base_email_subject: $('base_email_subject').value,
      base_email_body: $('base_email_body').value,
    };
  }
  async function save(silent) {
    const res = await api('PUT', '/admin/signalements/' + id, editablePayload());
    current = res.signalement;
    if (!silent) toast('Enregistré', 'success');
    return res.signalement;
  }

  async function load() {
    try { render(await api('GET', '/admin/signalements/' + id)); }
    catch (err) {
      $('loading').innerHTML = '';
      const d = document.createElement('div'); d.className = 'alert alert-error'; d.textContent = err.message;
      $('loading').appendChild(d);
    }
  }

  // --- Actions ---
  $('btnSave').addEventListener('click', () => save(false).catch((e) => toast(e.message, 'error')));

  $('btnGenBase').addEventListener('click', async () => {
    const btn = $('btnGenBase'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rédaction…';
    try {
      await save(true); // s'assure que destinataire/contexte sont à jour côté serveur
      const r = await api('POST', '/admin/signalements/' + id + '/generate-base');
      $('base_email_subject').value = r.subject || '';
      $('base_email_body').value = r.body || '';
      updateSend();
      toast('Mail de base rédigé — relisez avant d\'enregistrer', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '✨ Rédiger avec l\'IA'; }
  });

  $('btnPreview').addEventListener('click', async () => {
    const btn = $('btnPreview'); btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-dark"></span> Aperçu…';
    try {
      await save(true);
      const r = await api('POST', '/admin/signalements/' + id + '/preview-derive');
      $('previewBox').style.display = 'block';
      $('previewBox').textContent = 'APERÇU D\'UNE VARIANTE (exemple)\n\nObjet : ' + r.subject + '\n\n' + r.body;
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '👁 Aperçu d\'une variante'; }
  });

  $('btnVerify').addEventListener('click', async () => {
    try {
      await save(true);
      const res = await api('POST', '/admin/signalements/' + id + '/verify');
      render(res.signalement);
      toast('Cas vérifié et publié ✓', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  $('btnReject').addEventListener('click', async () => {
    const note = prompt('Motif du refus (facultatif) :', '');
    if (note === null) return;
    try { render((await api('POST', '/admin/signalements/' + id + '/reject', { note })).signalement); toast('Refusé', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  });

  $('btnReopen').addEventListener('click', async () => {
    try { render((await api('POST', '/admin/signalements/' + id + '/reopen')).signalement); toast('Remis à l\'examen', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  });

  $('btnDelete').addEventListener('click', async () => {
    if (!confirm('Supprimer définitivement ce cas ?')) return;
    try { await api('DELETE', '/admin/signalements/' + id); toast('Supprimé', 'success'); setTimeout(() => location.href = '/admin', 500); }
    catch (err) { toast(err.message, 'error'); }
  });

  $('btnCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('base_email_body').value); toast('Copié', 'success'); }
    catch { $('base_email_body').select(); document.execCommand('copy'); toast('Copié', 'success'); }
  });

  load();
})();
