(function () {
  const input = document.getElementById('vu-input');
  const submitBtn = document.getElementById('vu-submit');
  const visionBody = document.getElementById('vu-vision-body');
  const ultronBody = document.getElementById('vu-ultron-body');
  const conclusionBody = document.getElementById('vu-conclusion-body');
  const divider = document.getElementById('vu-divider');
  const errorBox = document.getElementById('vu-error');

  const API_URL = '/api/generate';

  const PLACEHOLDER_PANEL = '<span class="vu-placeholder">Su respuesta aparecerá aquí.</span>';
  const PLACEHOLDER_CONCLUSION = '<span class="vu-placeholder-dark">La síntesis de ambos puntos de vista aparecerá aquí.</span>';
  const LOADING = '<span class="vu-dots"><span></span><span></span><span></span></span>';

  // Las personalidades viven en el servidor (api/generate.js).
  // Aquí solo se pide el rol; así los prompts no se pueden manipular desde el navegador.
  async function generate(payload) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'La solicitud no se completó.');
    }

    return data.text;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function resetPending() {
    if (visionBody.querySelector('.vu-dots')) visionBody.innerHTML = PLACEHOLDER_PANEL;
    if (ultronBody.querySelector('.vu-dots')) ultronBody.innerHTML = PLACEHOLDER_PANEL;
    if (conclusionBody.querySelector('.vu-dots')) conclusionBody.innerHTML = PLACEHOLDER_CONCLUSION;
  }

  async function handleSubmit() {
    const dilemma = input.value.trim();

    if (!dilemma) {
      input.focus();
      return;
    }

    submitBtn.disabled = true;
    errorBox.hidden = true;
    divider.classList.add('pulsing');
    visionBody.innerHTML = LOADING;
    ultronBody.innerHTML = LOADING;
    conclusionBody.innerHTML = '<span class="vu-placeholder-dark">Esperando ambas perspectivas...</span>';

    try {
      const [visionText, ultronText] = await Promise.all([
        generate({ role: 'vision', dilemma }),
        generate({ role: 'ultron', dilemma })
      ]);

      visionBody.textContent = visionText;
      ultronBody.textContent = ultronText;
      conclusionBody.innerHTML = LOADING;

      const conclusionText = await generate({
        role: 'conclusion',
        dilemma,
        vision: visionText,
        ultron: ultronText
      });

      conclusionBody.textContent = conclusionText;

    } catch (err) {
      resetPending();
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      divider.classList.remove('pulsing');
    }
  }

  submitBtn.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleSubmit();
  });
})();
