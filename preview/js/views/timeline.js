import { api } from '../api.js';
import { esc, sourceBadge, itemBadges, itemLink, EVENT_LABEL, downloadCSV, toast } from '../ui.js';

export default async function timeline(main, app) {
  const types = app.state.timelineTypes;
  const comps = app.competitorsSorted();
  const q = app.query();
  const sel = { types: new Set(q.types ? q.types.split(',') : types), competitor: q.competitor || '', from: q.from || '' };
  main.innerHTML = `
    <div class="page-head"><div><h1>Timeline</h1><p>Major events across competitors: approvals, launches, funding, M&amp;A, partnerships and recalls.
      Event types for news and intel are assigned by keyword rules; change any item's type with its menu.</p></div>
      <div class="actions"><button class="btn" type="button" id="tl-csv">Export CSV</button></div></div>
    <div class="filters">
      <div><label>Event types</label><div class="chips" id="tl-types">${types.map((t) => `<button type="button" class="chip" data-t="${t}" aria-pressed="${sel.types.has(t)}">${esc(EVENT_LABEL[t])}</button>`).join('')}</div></div>
      <div><label for="tl-comp">Competitor</label><select id="tl-comp"><option value="">All</option>${comps.map((c) => `<option value="${esc(c.id)}" ${c.id === sel.competitor ? 'selected' : ''}>${esc(c.shortName || c.name)}</option>`).join('')}</select></div>
      <div><label for="tl-from">From</label><input type="date" id="tl-from" value="${esc(sel.from)}"></div>
    </div>
    <div class="card"><div id="tl"></div></div>`;

  let shown = [];
  const load = async () => {
    const { items, total } = await api.items({ eventType: [...sel.types], competitor: sel.competitor, from: sel.from, limit: 1500 });
    shown = items.filter((i) => i.date);
    const el = main.querySelector('#tl');
    if (!shown.length) { el.innerHTML = '<p class="empty">No events match. Run Refresh all, or widen the filters.</p>'; return; }
    let html = '<div class="tl">';
    let lastMonth = '';
    for (const i of shown) {
      const m = i.date.slice(0, 7);
      if (m !== lastMonth) {
        html += `<h3>${esc(new Date(`${m}-01T00:00:00Z`).toLocaleString([], { month: 'long', year: 'numeric', timeZone: 'UTC' }))}</h3>`;
        lastMonth = m;
      }
      html += `<div class="ev ev-${esc(i.eventType)}">
        <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px">
          <span class="muted">${esc(i.date)}</span> <span class="badge event-b"><span aria-hidden="true">&#9679;</span> ${esc(EVENT_LABEL[i.eventType] || i.eventType)}${i.eventTypeAuto ? ' <small>(auto)</small>' : ''}</span>
          ${sourceBadge(i.source)} <a href="#/c/${encodeURIComponent(i.competitorId)}">${esc(i.competitorName)}</a> ${itemBadges(i, app.rulesById)}
          <label class="sr-only" for="et-${esc(i.id)}">Event type</label>
          <select class="no-print" id="et-${esc(i.id)}" data-et="${esc(i.id)}" style="min-height:24px;padding:0 4px;font-size:12px">
            ${['', ...app.state.eventTypes].map((t) => `<option value="${t}" ${t === (i.eventType || '') ? 'selected' : ''}>${t ? esc(EVENT_LABEL[t]) : 'Not an event'}</option>`).join('')}</select></div>
        <div><strong>${itemLink(i)}</strong></div></div>`;
    }
    html += `</div>${total > items.length ? `<p class="muted">Showing the newest ${items.length} of ${total}.</p>` : ''}`;
    el.innerHTML = html;
  };
  await load();

  main.querySelector('#tl-types').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (sel.types.has(b.dataset.t)) sel.types.delete(b.dataset.t); else sel.types.add(b.dataset.t);
    b.setAttribute('aria-pressed', String(sel.types.has(b.dataset.t)));
    load();
  });
  main.querySelector('#tl-comp').addEventListener('change', (e) => { sel.competitor = e.target.value; load(); });
  main.querySelector('#tl-from').addEventListener('change', (e) => { sel.from = e.target.value; load(); });
  main.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-et]');
    if (!s) return;
    try { await api.put(`/items/${encodeURIComponent(s.dataset.et)}/event-type`, { eventType: s.value }); toast('Event type saved'); load(); } catch (err) { toast(err.message, true); }
  });
  main.querySelector('#tl-csv').addEventListener('click', () => downloadCSV('timeline.csv', ['Date', 'Event type', 'Competitor', 'Source', 'Title', 'URL', 'Sample'],
    shown.map((i) => [i.date, EVENT_LABEL[i.eventType] || i.eventType, i.competitorName, i.source, i.title, i.url, i.sample ? 'SAMPLE' : ''])));
}
