(() => {
  const root = document.documentElement;
  const stage = document.querySelector('[data-not-found-stage]');
  const backButton = document.querySelector('[data-go-back]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(hover: none), (pointer: coarse)');

  root.classList.add('nf-motion');

  backButton?.addEventListener('click', () => {
    let sameOriginReferrer = false;
    try {
      sameOriginReferrer = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
    } catch (_) {
      sameOriginReferrer = false;
    }
    if (sameOriginReferrer && window.history.length > 1) window.history.back();
    else window.location.assign('/');
  });

  if (!stage || reducedMotion.matches || coarsePointer.matches) return;

  const layers = Array.from(stage.querySelectorAll('[data-nf-layer]')).map((element) => ({
    element,
    depth: Number(element.dataset.depth || 0),
  }));
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frame = 0;

  const render = () => {
    currentX += (targetX - currentX) * 0.085;
    currentY += (targetY - currentY) * 0.085;
    layers.forEach(({ element, depth }) => {
      const x = currentX * depth * 25;
      const y = currentY * depth * 19;
      const rotateY = currentX * depth * 1.9;
      const rotateX = currentY * depth * -1.35;
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
    });
    if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) frame = requestAnimationFrame(render);
    else frame = 0;
  };

  const queueRender = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  stage.addEventListener('pointermove', (event) => {
    const bounds = stage.getBoundingClientRect();
    targetX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    targetY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    stage.style.setProperty('--pointer-x', `${((targetX + 1) * 50).toFixed(1)}%`);
    stage.style.setProperty('--pointer-y', `${((targetY + 1) * 50).toFixed(1)}%`);
    queueRender();
  }, { passive: true });

  stage.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
    stage.style.setProperty('--pointer-x', '72%');
    stage.style.setProperty('--pointer-y', '28%');
    queueRender();
  }, { passive: true });
})();
