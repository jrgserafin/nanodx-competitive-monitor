// App shell: hash router, shared state, refresh progress, theme, header, menu drawer.
import { api } from './api.js';
import { $, $$, esc, relTime, fmtStamp, toast, animateIn, countUp, skeleton, motionOn } from './ui.js';
import dashboard from './views/dashboard.js';
import competitors from './views/competitors.js';
import profile from './views/profile.js';
import matrix from './views/matrix.js';
import swot from './views/swot.js';
import timeline from './views/timeline.js';
import alerts from './views/alerts.js';
import search from './views/search.js';
import intel from './views/intel.js';
import settings from './views/settings.js';
import brief from './views/brief.js';

const ROUTES = [
  [/^\/?$/, dashboard, 'dashboard'],
  [/^\/competitors$/, competitors, 'competitors'],
  [/^\/c\/([^/]+)$/, profile, 'competitors'],
  [/^\/matrix$/, matrix, 'matrix'],
  [/^\/swot(?:\/([^/]+))?$/, swot, 'swot'],
  [/^\/timeline$/, timeline, 'timeline'],
  [/^\/alerts$/, alerts, 'alerts'],
  [/^\/search$/, search, 'search'],
  [/^\/intel$/, intel, 'intel'],
  [/^\/settings$/, settings, 'settings'],
  [/^\/brief\/([^/]+)$/, brief, 'competitors'],
];

export const app = {
  state: null,
  async loadState() {
    this.state = await api.get('/state');
    this.rules = await api.get('/alerts');
    this.rulesById = Object.fromEntries(this.rules.map((r) => [r.id, r]));
    const week = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    this.alertCount = (await api.items({ alertsOnly: true, from: week, limit: 1 })).total;
    renderChrome();
    return this.state;
  },
  competitor(id) {
    if (id === 'nanodx') return this.state.competitors.nanodx;
    return this.state.competitors.competitors.find((c) => c.id === id);
  },
  competitorsSorted() {
    return [...this.state.competitors.competitors].sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name));
  },
  go(hash) { location.hash = hash; },
  rerender() { route(); },
  query() {
    const q = location.hash.split('?')[1] || '';
    return Object.fromEntries(new URLSearchParams(q));
  },
  async refresh(body = {}) {
    try {
      const r = await api.post('/refresh', body);
      if (!r.started) toast(r.message);
      else toast(`Refresh started: ${r.total} source checks`);
      pollRefresh();
    } catch (e) { toast(`Refresh failed to start: ${e.message}`, true); }
  },
};

async function route() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const main = $('#main');
  for (const [re, view, nav] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    setDrawer(false);
    const changedPage = document.body.dataset.path !== path;
    document.body.dataset.route = path === '/' ? 'dashboard' : nav;
    document.body.dataset.path = path;
    if (changedPage) window.scrollTo({ top: 0, behavior: 'instant' });
    updateHeader();
    try {
      // Fresh root per render so view event listeners never accumulate on <main>.
      const root = document.createElement('div');
      root.className = path === '/' ? 'view-enter bleed' : 'view-enter';
      root.innerHTML = skeleton();
      main.replaceChildren(root);
      if (!app.state) await app.loadState();
      await view(root, app, ...m.slice(1).map((x) => (x ? decodeURIComponent(x) : x)));
      animateIn(root);
      countUp(root);
      updateHeader();
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="card"><h2>Something went wrong</h2><p>${esc(e.message)}</p><p class="muted">Is the server still running? Check the terminal where you ran <code>npm start</code>.</p></div>`;
    }
    return;
  }
  main.innerHTML = '<div class="card"><h2>Page not found</h2><p><a href="#/">Back to the dashboard</a></p></div>';
}

function renderChrome() {
  const s = app.state;
  const last = s.lastFullRefresh ? s.lastFullRefresh.finishedAt : null;
  const refreshed = `Last full refresh <span title="${esc(fmtStamp(last))}">${esc(relTime(last))}</span>`
    + (s.refresh.nextScheduled ? ` &middot; next ${esc(relTime(s.refresh.nextScheduled))}` : '');
  $('#last-updated').innerHTML = refreshed;
  $('#foot-info').innerHTML = refreshed;
  $('#nav-alerts').textContent = app.alertCount ? String(app.alertCount) : '';
  $('#nav-alerts').title = app.alertCount ? `${app.alertCount} alert matches dated in the last 7 days` : '';
  $('#sidebar-foot').innerHTML = `Auto-refresh every ${esc(s.config.refreshHours)} h while the server runs.`;
  const banner = $('#sample-banner');
  const nSample = s.competitors.competitors.filter((c) => c.sample).length;
  if (window.CI_STATIC) {
    banner.hidden = false;
    banner.innerHTML = '<strong>Design preview</strong>: a read-only snapshot of public news, FDA, trial and SEC data. Competitor profiles are intentionally sparse.';
  } else if (nSample) {
    banner.hidden = false;
    banner.innerHTML = `<strong>SAMPLE data is loaded</strong>: ${nSample} fictional "Example" competitors and their placeholder items. <a href="#/settings">Clear sample data</a> when you no longer need it.`;
  } else banner.hidden = true;
}

let pollTimer = null;
async function pollRefresh() {
  clearTimeout(pollTimer);
  let st;
  try { st = await api.get('/refresh'); } catch { return; }
  const bar = $('#refresh-bar');
  const btn = $('#refresh-all');
  if (lastFinished === undefined) lastFinished = st.running ? null : st.finishedAt;
  if (st.running) {
    bar.hidden = false;
    if (!bar.querySelector('.progress')) bar.innerHTML = '<span class="rb-text"></span><div class="progress" aria-hidden="true"><span></span></div>';
    bar.querySelector('.rb-text').innerHTML = `Refreshing: ${st.done} of ${st.total} source checks done${st.errors ? `, ${st.errors} errors` : ''}. ${st.current.length ? `Now: ${esc(st.current.join(', '))}` : ''}`;
    bar.querySelector('.progress span').style.transform = `scaleX(${st.total ? st.done / st.total : 0})`;
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
    pollTimer = setTimeout(pollRefresh, 2000);
  } else {
    btn.disabled = false;
    btn.textContent = 'Refresh all';
    bar.hidden = true;
    bar.innerHTML = '';
    // A refresh finished since we last looked (started here, by the scheduler, or in another tab).
    if (st.finishedAt && st.finishedAt !== lastFinished) {
      toast(`Refresh finished${st.errors ? ` with ${st.errors} errors (see Sources & settings)` : ''}`, Boolean(st.errors));
      await app.loadState();
      route();
    }
    lastFinished = st.finishedAt;
    pollTimer = setTimeout(pollRefresh, 30000);
  }
}
let lastFinished;

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ci.theme', t); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('themechange'));
}

function setMotion(on) {
  document.documentElement.dataset.motion = on ? 'on' : 'off';
  try { localStorage.setItem('ci.motion', on ? 'on' : 'off'); } catch { /* storage blocked */ }
  const b = $('#motion-btn');
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'Animations on (click to turn off)' : 'Animations off (click to turn on)';
}
setMotion(document.documentElement.dataset.motion !== 'off');
$('#motion-btn').addEventListener('click', () => {
  setMotion(document.documentElement.dataset.motion === 'off');
  toast(motionOn() ? 'Animations on' : 'Animations off');
  route();
});

$('#theme-btn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(cur === 'dark' ? 'light' : 'dark');
});
$('#refresh-all').addEventListener('click', () => app.refresh());
// ---- menu drawer ----
function setDrawer(open) {
  const d = $('#drawer');
  if (d.classList.contains('open') === open) return;
  d.classList.toggle('open', open);
  $('#drawer-backdrop').classList.toggle('open', open);
  d.inert = !open;
  $('#menu-btn').setAttribute('aria-expanded', String(open));
  if (open) setTimeout(() => $('#ds-input').focus(), 60);
  else if (d.contains(document.activeElement)) $('#menu-btn').focus();
}
$('#menu-btn').addEventListener('click', () => setDrawer(!$('#drawer').classList.contains('open')));
$('#drawer-close').addEventListener('click', () => setDrawer(false));
$('#drawer-backdrop').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#drawer').classList.contains('open')) setDrawer(false); });

const runSearch = (q) => app.go(`#/search?q=${encodeURIComponent(q.trim())}`);
$('#global-search').addEventListener('submit', (e) => { e.preventDefault(); runSearch($('#gs-input').value); });
$('#drawer-search').addEventListener('submit', (e) => { e.preventDefault(); runSearch($('#ds-input').value); });

// ---- header: transparent over the overview hero, hides on scroll down, returns on scroll up ----
let lastY = 0;
let ticking = false;
function updateHeader() {
  const h = $('#site-header');
  const y = window.scrollY;
  const hero = document.querySelector('.cine-hero');
  h.classList.toggle('over-hero', Boolean(hero) && y < hero.offsetHeight - 64);
  const goingDown = y > lastY + 4;
  const goingUp = y < lastY - 4;
  if (goingDown && y > 240 && !$('#drawer').classList.contains('open')) h.classList.add('hide');
  else if (goingUp || y < 240) h.classList.remove('hide');
  lastY = y;
}
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; updateHeader(); });
}, { passive: true });
window.addEventListener('hashchange', route);
setInterval(() => { if (app.state) renderChrome(); }, 60000);

route().then(pollRefresh);
export default app;
