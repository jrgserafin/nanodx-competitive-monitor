// Animated brand wave for the overview hero: layered sine lines in the violet -> teal -> mint gradient.
// Performance: capped at 30 fps, drawn at reduced resolution, paused when off-screen, when the tab is
// hidden, or when the canvas leaves the page; a single still frame when motion is off.
const COLORS = ['#8b9be8', '#5fc4c8', '#a5f2cc'];
const LINES = 11;

export function startWave(canvas, { animate = true } = {}) {
  const ctx = canvas.getContext('2d');
  const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
  let w = 1;
  let h = 1;
  let t = 7;
  let last = 0;
  let raf = 0;
  let onScreen = true;

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * scale));
    h = Math.max(1, Math.round(r.height * scale));
    canvas.width = w;
    canvas.height = h;
    draw();
  }

  function line(i, grad, widthMul, alphaMul) {
    const k = i / (LINES - 1);
    const center = 1 - Math.abs(k - 0.5) * 2; // 1 in the middle of the bundle, 0 at the edges
    const base = h * 0.64 + (i - (LINES - 1) / 2) * h * 0.011;
    const amp = h * (0.07 + 0.05 * center);
    const freq = (Math.PI * 2) / (w * (0.62 + k * 0.22));
    const phase = t * (0.32 + k * 0.07) + i * 0.5;
    const step = Math.max(2, w / 220);
    ctx.beginPath();
    for (let x = 0; x <= w + step; x += step) {
      const env = 0.35 + 0.65 * Math.sin((Math.PI * Math.min(x, w)) / w); // calmer at the edges
      const y = base
        + Math.sin(x * freq + phase) * amp * env
        + Math.sin(x * freq * 2.4 - phase * 0.8) * amp * 0.16
        + Math.sin(t * 0.25 + i) * h * 0.006;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = grad;
    ctx.globalAlpha = Math.min(1, (0.22 + 0.78 * center * center) * alphaMul);
    ctx.lineWidth = (0.9 + 1.4 * center * center) * scale * 1.4 * widthMul;
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, COLORS[0]);
    grad.addColorStop(0.52, COLORS[1]);
    grad.addColorStop(1, COLORS[2]);
    ctx.lineCap = 'round';
    // soft glow pass on the three central lines, then the crisp bundle
    const mid = Math.floor(LINES / 2);
    for (let i = mid - 2; i <= mid + 2; i++) line(i, grad, 9, 0.16);
    for (let i = 0; i < LINES; i++) line(i, grad, 1, 1);
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (!canvas.isConnected) { stop(); return; }
    if (!last) last = now;
    if (now - last >= 33) { // ~30 fps
      t += Math.min(0.1, (now - last) / 1000);
      last = now;
      draw();
    }
    schedule();
  }
  function schedule() {
    if (animate && onScreen && !document.hidden && !raf) raf = requestAnimationFrame(frame);
  }
  const onVisibility = () => { last = 0; schedule(); };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; last = 0; schedule(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  }

  resize();
  schedule();
  return { stop };
}
