// Formulaire public de signalement d'un acte antisémite
(async function () {
  const $ = (id) => document.getElementById(id);

  try {
    const cfg = await fetch('/api/config').then((r) => r.json());
    if (cfg.org_name) {
      $('brandName').textContent = cfg.org_name;
      $('footName').textContent = cfg.org_name;
    }
    if (cfg.public_intro) $('heroIntro').textContent = cfg.public_intro;
    if (cfg.calomnie_warning) {
      $('calomnie').textContent = '⚠️ ' + cfg.calomnie_warning;
      $('calomnie').style.display = 'block';
    }
    const cat = $('category');
    cat.innerHTML = '<option value="">— Choisir —</option>';
    (cfg.categories || []).forEach((c) => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c; cat.appendChild(o);
    });
  } catch {
    $('heroIntro').textContent = 'Signalez un acte antisémite avec des preuves.';
  }

  const form = $('form');
  const errBox = $('formError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';

    const payload = {
      reporter_name: $('reporter_name').value.trim(),
      reporter_email: $('reporter_email').value.trim(),
      category: $('category').value,
      subject_concerned: $('subject_concerned').value.trim(),
      title: $('title').value.trim(),
      description: $('description').value.trim(),
      evidence: $('evidence').value.trim(),
      attestation: $('attestation').checked,
    };

    if (!payload.reporter_name || !payload.reporter_email) return showError('Vos coordonnées (nom et email) sont obligatoires.');
    if (!payload.title || !payload.description) return showError('Renseignez l\'objet et la description des faits.');
    if (!payload.evidence) return showError('Au moins une preuve est obligatoire.');
    if (!payload.attestation) return showError('Vous devez cocher l\'attestation sur l\'honneur.');

    const btn = $('submitBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Envoi…';
    try {
      const resp = await fetch('/api/signalements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erreur lors de l\'envoi.');
      $('refOut').textContent = data.reference;
      $('trackLink').href = '/suivi?ref=' + encodeURIComponent(data.reference);
      form.style.display = 'none';
      $('success').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Envoyer le signalement';
    }
  });

  $('againBtn').addEventListener('click', () => {
    form.reset(); form.style.display = 'block'; $('success').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function showError(msg) {
    errBox.textContent = msg; errBox.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
})();
