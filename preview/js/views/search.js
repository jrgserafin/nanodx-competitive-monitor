import { api } from '../api.js';
import { esc, dataTable, sourceBadge, itemBadges, itemLink, eventBadge, SOURCE_LABEL, EVENT_LABEL } from '../ui.js';

const PAGE = 200;

export default async function search(main, app) {
  const q = app.query();
  const f = {
    q: q.q || '', competitor: q.competitor || '', source: q.source ? q.source.split(',') : [], eventType: q.eventType || '',
    from: q.from || '', to: q.to || '', alertsOnly: q.alertsOnly === 'true', sample: q.sample || '', offset: Number(q.offset) || 0,
  };
  const comps = app.competitorsSorted();
  main.innerHTML = `
    <div class="page-head"><div><h1>Search &amp; filter</h1><p>Every cached item from every source, plus your intel.</p></div></div>
    <form class="filters card" id="sf">
      <div style="flex:1;min-width:200px"><label for="s-q">Keyword</label><input id="s-q" type="search" value="${esc(f.q)}" style="width:100%" placeholder="All words must match"></div>
      <div><label for="s-comp">Competitor</label><select id="s-comp"><option value="">All</option>${comps.map((c) => `<option value="${esc(c.id)}" ${c.id === f.competitor ? 'selected' : ''}>${esc(c.shortName || c.name)}</option>`).join('')}</select></div>
      <div><label for="s-ev">Event type</label><select id="s-ev"><option value="">Any</option>${app.state.eventTypes.map((t) => `<option value="${t}" ${t === f.eventType ? 'selected' : ''}>${esc(EVENT_LABEL[t])}</option>`).join('')}</select></div>
      <div><label for="s-from">From</label><input id="s-from" type="date" value="${esc(f.from)}"></div>
      <div><label for="s-to">To</label><input id="s-to" type="date" value="${esc(f.to)}"></div>
      <div><label for="s-sample">Sample data</label><select id="s-sample"><option value="">Include</option><option value="exclude" ${f.sample === 'exclude' ? 'selected' : ''}>Exclude</option><option value="only" ${f.sample === 'only' ? 'selected' : ''}>Only</option></select></div>
      <div style="width:100%"><label>Source types</label><div class="chips" id="s-src">${app.state.itemSources.map((s) => `<button type="button" class="chip" data-s="${s}" aria-pressed="${f.source.includes(s)}">${esc(SOURCE_LABEL[s])}</button>`).join('')}
        <label style="display:inline-flex;gap:4px;align-items:center;margin-left:12px"><input type="checkbox" id="s-alerts" ${f.alertsOnly ? 'checked' : ''}> Alert matches only</label></div></div>
      <div class="actions"><button class="btn primary" type="submit">Apply</button><a class="btn" href="#/search">Reset</a></div>
    </form>
    <div class="card"><div id="results"></div><div class="actions" id="pager" style="margin-top:8px"></div></div>`;

  const res = await api.items({ ...f, source: f.source, alertsOnly: f.alertsOnly ? 'true' : '', limit: PAGE });
  dataTable(main.querySelector('#results'), {
    exportName: 'items', rows: res.items, sort: { key: 'date', dir: 'desc' }, empty: 'No items match these filters.',
    caption: `${res.total} matching item${res.total === 1 ? '' : 's'}${res.total > PAGE ? `, showing ${res.offset + 1}-${Math.min(res.total, res.offset + PAGE)}` : ''}`,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'competitorName', label: 'Competitor', render: (i) => `<a href="#/c/${encodeURIComponent(i.competitorId)}">${esc(i.competitorName)}</a>` },
      { key: 'source', label: 'Source', render: (i) => sourceBadge(i.source), csvValue: (i) => SOURCE_LABEL[i.source] },
      { key: 'subtype', label: 'Type' },
      { key: 'title', label: 'Title', render: (i) => `${itemLink(i)}<div>${itemBadges(i, app.rulesById)}</div>` },
      { key: 'eventType', label: 'Event', render: (i) => eventBadge(i.eventType), csvValue: (i) => EVENT_LABEL[i.eventType] || '' },
      { key: 'url', label: 'URL', csvOnly: true },
      { key: 'summary', label: 'Summary', render: (i) => `<small>${esc((i.summary || '').slice(0, 160))}</small>` },
      { key: 'alerts', label: 'Alerts', csvOnly: true, value: (i) => i.alerts.map((a) => (app.rulesById[a] || {}).name || a).join('; ') },
      { key: 'sample', label: 'Sample', value: (i) => (i.sample ? 'SAMPLE' : ''), render: (i) => (i.sample ? 'yes' : '') },
    ],
  });
  const pager = main.querySelector('#pager');
  if (res.total > PAGE) {
    const go = (off) => app.go(`#/search?${new URLSearchParams({ ...app.query(), offset: String(off) })}`);
    pager.innerHTML = `<button class="btn" type="button" id="prev" ${res.offset ? '' : 'disabled'}>Previous</button>
      <button class="btn" type="button" id="next" ${res.offset + PAGE < res.total ? '' : 'disabled'}>Next</button>
      <span class="muted">CSV export covers the current page; narrow the filters to export a specific set.</span>`;
    pager.querySelector('#prev').addEventListener('click', () => go(Math.max(0, res.offset - PAGE)));
    pager.querySelector('#next').addEventListener('click', () => go(res.offset + PAGE));
  }

  main.querySelector('#s-src').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (b) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
  });
  main.querySelector('#sf').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = {
      q: main.querySelector('#s-q').value.trim(), competitor: main.querySelector('#s-comp').value, eventType: main.querySelector('#s-ev').value,
      from: main.querySelector('#s-from').value, to: main.querySelector('#s-to').value, sample: main.querySelector('#s-sample').value,
      source: [...main.querySelectorAll('#s-src [aria-pressed="true"]')].map((b) => b.dataset.s).join(','),
      alertsOnly: main.querySelector('#s-alerts').checked ? 'true' : '',
    };
    app.go(`#/search?${new URLSearchParams(Object.entries(p).filter(([, v]) => v))}`);
  });
}
