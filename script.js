(() => {
  const canvas = document.getElementById('lineCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  const dpr = () => Math.max(1, window.devicePixelRatio || 1);
  const motionFactor = 0.3;
  const lines = Array.from({ length: 26 }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    speed: (0.00018 + Math.random() * 0.00045) * motionFactor,
    drift: ((Math.random() * 2 - 1) * 0.00014) * motionFactor,
    length: 0.2 + Math.random() * 0.32,
    alpha: 0.08 + Math.random() * 0.18,
    width: 1 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
    tilt: Math.random() * 0.7 + 0.16
  }));

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr());
    canvas.height = Math.round(height * dpr());
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  }

  function draw(ts) {
    ctx.clearRect(0, 0, width, height);

    lines.forEach((line, idx) => {
      const y = (line.y + ts * line.speed + idx * 0.027) % 1;
      const offset = Math.sin(ts * 0.00045 * motionFactor + line.phase) * 0.06;
      const startX = (line.x + offset) * width;
      const startY = y * height - height * 0.2;
      const len = height * line.length;
      const endX = startX + (len * line.tilt);
      const endY = startY + len;

      ctx.beginPath();
      ctx.lineWidth = line.width;
      ctx.strokeStyle = `rgba(${idx % 2 ? '107, 209, 255' : '52, 164, 255'}, ${line.alpha})`;
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = `rgba(150, 232, 255, ${line.alpha * 1.2})`;
      ctx.arc(startX + Math.sin(ts * 0.0007 * motionFactor + idx) * 14, startY + len * 0.45, 1.6 + (idx % 3), 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
})();

(() => {
  const slider = document.querySelector('[data-hero-slider]');
  if (!slider) return;
  const slides = Array.from(slider.querySelectorAll('.hero-banner-slide'));
  const dots = Array.from(slider.querySelectorAll('.hero-banner-dots button'));
  if (!slides.length) return;
  let current = 0;

  const activate = (index) => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === current));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
  };

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => activate(index));
  });

  setInterval(() => activate(current + 1), 3500);
})();

(() => {
  const slider = document.querySelector('[data-logo-slider]');
  if (!slider) return;
  const track = slider.querySelector('.client-logo-track');
  if (!track) return;

  track.innerHTML += track.innerHTML;
  let offset = 0;
  const speed = 0.45;
  let frame = null;

  const halfWidth = () => track.scrollWidth / 2;

  const step = () => {
    offset += speed;
    if (offset >= halfWidth()) offset = 0;
    track.style.transform = `translate3d(${-offset}px,0,0)`;
    frame = requestAnimationFrame(step);
  };

  slider.addEventListener('mouseenter', () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  });

  slider.addEventListener('mouseleave', () => {
    if (!frame) frame = requestAnimationFrame(step);
  });

  frame = requestAnimationFrame(step);
})();


(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const status = document.getElementById('formStatus');
  const submitButton = form.querySelector('button[type="submit"]');

  const setStatus = (message, type = '') => {
    if (!status) return;
    status.textContent = message || '';
    status.className = `form-status${type ? ` is-${type}` : ''}`;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const payload = {
      empresa: String(formData.get('empresa') || '').trim(),
      nombre: String(formData.get('nombre') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      telefono: String(formData.get('telefono') || '').trim(),
      servicio: String(formData.get('servicio') || '').trim(),
      mensaje: String(formData.get('mensaje') || '').trim(),
      origen: 'hashinmy_web'
    };

    if (!payload.empresa || !payload.nombre || !payload.email || !payload.telefono || !payload.servicio || !payload.mensaje) {
      setStatus('Por favor completa todos los campos del formulario.', 'error');
      return;
    }

    const outbound = {
      ...payload,
      text: `Nueva solicitud desde Hashinmy\nEmpresa: ${payload.empresa}\nNombre: ${payload.nombre}\nEmail: ${payload.email}\nTeléfono: ${payload.telefono}\nServicio: ${payload.servicio}\nMensaje: ${payload.mensaje}`
    };

    try {
      if (submitButton) submitButton.disabled = true;
      setStatus('Enviando solicitud...', '');

	const dominio = window.location.hostname;
	const response = await fetch("https://mapsx.app/enviar-formX", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-mapsx-token": `"${dominio}"`
            },
            body: JSON.stringify(outbound)
          });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus('Solicitud enviada correctamente. Te contactaremos pronto.', 'success');
      form.reset();
    } catch (error) {
      console.error('No se pudo enviar la solicitud:', error);
      setStatus('No se pudo enviar la solicitud en este momento. Intenta nuevamente.', 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
