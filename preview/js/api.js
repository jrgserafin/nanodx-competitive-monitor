// Thin wrapper over the server's JSON API.
// Static preview mode (window.CI_STATIC, set by scripts/build-preview.js): reads come from one snapshot.json
// file and are computed in the browser; every write is refused.
const STATIC = Boolean(window.CI_STATIC);
let snapP = null;
const snapshot = () => (snapP ||= fetch('snapshot.json').then((r) => r.json()));
const isoDaysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function staticItems(snap, q = {}) {
  let items = [...snap.items];
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => x.trim()).filter(Boolean);
  const comps = list(q.competitor);
  const sources = list(q.source);
  const events = list(q.eventType);
  const alerts = list(q.alert);
  if (comps.length) items = items.filter((i) => comps.includes(i.competitorId));
  if (sources.length) items = items.filter((i) => sources.includes(i.source));
  if (events.length) items = items.filter((i) => events.includes(i.eventType || 'none'));
  if (q.from) items = items.filter((i) => i.date && i.date >= q.from);
  if (q.to) items = items.filter((i) => i.date && i.date.slice(0, q.to.length) <= q.to);
  if (q.alertsOnly === 'true' || q.alertsOnly === true) items = items.filter((i) => i.alerts.length);
  if (alerts.length) items = items.filter((i) => i.alerts.some((a) => alerts.includes(a)));
  if (q.newOnly === 'true') items = [];
  if (q.q) {
    const terms = String(q.q).toLowerCase().split(/\s+/).filter(Boolean);
    items = items.filter((i) => {
      const hay = `${i.title} ${i.summary} ${i.subtype} ${i.publisher} ${i.competitorName}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.firstSeen || '').localeCompare(a.firstSeen || ''));
  const offset = Math.max(0, Number(q.offset) || 0);
  const limit = Math.min(5000, Math.max(1, Number(q.limit) || 200));
  return { total: items.length, offset, limit, items: items.slice(offset, offset + limit) };
}

function staticSummary(snap) {
  const doc = snap.state.competitors;
  const items = snap.items;
  const today = isoDaysAgo(0);
  const week = isoDaysAgo(7);
  const month = isoDaysAgo(30);
  const recentAlerts = items.filter((i) => i.alerts.length && i.date >= month);
  const d = new Date();
  const months = [];
  for (let k = 11; k >= 0; k--) months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1)).toISOString().slice(0, 7));
  const per = {};
  for (const i of items) {
    const m = (i.date || '').slice(0, 7);
    if (!months.includes(m)) continue;
    per[i.competitorId] = per[i.competitorId] || Object.fromEntries(months.map((x) => [x, 0]));
    per[i.competitorId][m]++;
  }
  return {
    counts: {
      competitors: doc.competitors.length, sampleCompetitors: 0,
      itemsThisWeek: items.filter((i) => i.date >= week && i.date <= today).length, newSinceLastWeek: 0,
      fdaThisMonth: items.filter((i) => i.source === 'fda' && i.date >= month).length,
      alerts30d: recentAlerts.length, highThreatAlerts30d: 0, highThreatCompetitors: 0,
      unrated: doc.competitors.length,
    },
    months,
    activity: Object.entries(per).map(([id, byMonth]) => {
      const c = doc.competitors.find((x) => x.id === id);
      return { id, name: c ? c.shortName || c.name : id, sample: false, counts: months.map((m) => byMonth[m]) };
    }).sort((a, b) => b.counts.reduce((x, y) => x + y, 0) - a.counts.reduce((x, y) => x + y, 0)),
    recent: [...items].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 60),
    lastUpdated: snap.state.lastFullRefresh ? snap.state.lastFullRefresh.finishedAt : null,
  };
}

async function staticCall(method, url) {
  if (method !== 'GET') throw new Error('This preview is read-only. Run the full app to make changes.');
  const snap = await snapshot();
  const path = url.split('?')[0];
  if (path === '/state') return snap.state;
  if (path === '/summary') return staticSummary(snap);
  if (path === '/alerts') return snap.alerts;
  if (path === '/swot') return {};
  if (path === '/refresh') return snap.state.refresh;
  if (path.startsWith('/notes/')) return [];
  if (path.startsWith('/items')) return staticItems(snap, Object.fromEntries(new URLSearchParams(url.split('?')[1] || '')));
  throw new Error(`Not available in the preview: ${path}`);
}

async function call(method, url, body) {
  if (STATIC) return staticCall(method, url);
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get: (u) => call('GET', u),
  post: (u, b = {}) => call('POST', u, b),
  put: (u, b = {}) => call('PUT', u, b),
  del: (u) => call('DELETE', u),
  items: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]));
    return call('GET', `/items?${qs}`);
  },
};
