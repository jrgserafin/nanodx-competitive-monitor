import { api } from '../api.js';
import { esc, dataTable, relTime, fmtStamp, toast, SOURCE_LABEL } from '../ui.js';
import { statusText } from './profile.js';

const SOURCE_INFO = {
  news: ['Google News RSS', 'No key', 'Unofficial feed for personal readers; spaced 2.5 s apart; up to ~100 items per query.'],
  fda: ['openFDA device API (510(k) incl. De Novo, PMA originals, recalls)', 'No key (optional OPENFDA_API_KEY)', '240 requests/min and 1,000/day per IP without a key; 120,000/day with a key.'],
  trials: ['ClinicalTrials.gov API v2', 'No key', 'About 50 requests/min per IP; spaced 1.3 s apart.'],
  patents: ['USPTO Open Data Portal (PatentsView is retired)', 'Needs USPTO_API_KEY (free)', 'Returns HTTP 401 without a key. Not yet tested with a live key.'],
  sec: ['SEC EDGAR submissions', 'No key; set CONTACT_EMAIL', 'Max 10 requests/s; SEC requires a User-Agent with contact details.'],
};

export default async function settings(main, app) {
  const s = app.state;
  const comps = s.competitors.competitors.filter((c) => !c.sample);
  const rows = comps.map((c) => ({ c, ...Object.fromEntries(s.sources.map((src) => [src.key, (s.sourceStatus[c.id] || {})[src.key] || null])) }));
  const counts = {};
  for (const r of rows) for (const src of s.sources) { const st = r[src.key] ? r[src.key].status : 'never'; counts[src.key] = counts[src.key] || {}; counts[src.key][st] = (counts[src.key][st] || 0) + 1; }

  main.innerHTML = `
    <div class="page-head"><div><h1>Sources &amp; settings</h1><p>Fetch status for every competitor and source, API keys, and data management.</p></div>
      <div class="actions"><button class="btn primary" type="button" id="refresh-all-2">Refresh all</button></div></div>
    <div class="grid halves">
      <section class="card"><h2>Data sources</h2>
        <div class="table-wrap"><table><thead><tr><th>Source</th><th>Access</th><th>Rate limit</th><th>Status across competitors</th></tr></thead><tbody>
        ${s.sources.map((src) => `<tr><td><strong>${esc(SOURCE_LABEL[src.key])}</strong><br><small>${esc(SOURCE_INFO[src.key][0])}</small></td>
          <td>${esc(SOURCE_INFO[src.key][1])}</td><td><small>${esc(SOURCE_INFO[src.key][2])}</small></td>
          <td><small>${Object.entries(counts[src.key] || {}).map(([k, n]) => `${esc(k.replace('_', ' '))}: ${n}`).join('<br>')}</small></td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="card"><h2>Configuration</h2>
        <dl class="fields">
          <dt>Auto-refresh</dt><dd>Every ${esc(s.config.refreshHours)} h while the server runs. Next: ${esc(fmtStamp(s.refresh.nextScheduled))} (${esc(relTime(s.refresh.nextScheduled))})</dd>
          <dt>Last full refresh</dt><dd>${s.lastFullRefresh ? `${esc(fmtStamp(s.lastFullRefresh.finishedAt))}, ${s.lastFullRefresh.tasks} checks, ${s.lastFullRefresh.errors} errors` : 'never'}</dd>
          <dt>openFDA key</dt><dd>${s.config.openfdaKey ? '&#10003; set' : 'not set (optional)'}</dd>
          <dt>USPTO key</dt><dd>${s.config.usptoKey ? '&#10003; set' : '<span class="status-needs_key">not set: patents are off</span>'}</dd>
          <dt>Contact email</dt><dd>${s.config.contactEmail ? '&#10003; set' : '<span class="status-needs_key">not set: add CONTACT_EMAIL to .env for SEC</span>'}</dd>
          <dt>User-Agent</dt><dd><code style="font-size:11px">${esc(s.config.userAgent)}</code></dd>
        </dl>
        <p class="muted">Keys go in <code>.env</code> next to <code>package.json</code> (copy <code>.env.example</code>); restart the server after editing.</p>
        <h3 style="margin-top:14px">Data management</h3>
        <div class="actions">
          <button class="btn" type="button" id="clear-sample">Clear sample data</button>
          <button class="btn" type="button" id="load-sample">Reload sample data</button>
          <button class="btn danger" type="button" id="clear-cache">Clear fetched cache</button>
        </div>
        <p class="muted">Clearing the cache deletes fetched items only; competitors, intel, notes, SWOTs and alert rules stay.</p>
      </section>
    </div>
    <section class="card"><h2>Fetch status by competitor</h2><div id="status-table"></div></section>
    <section class="card"><h2>Categories</h2><p class="muted">The news topic is appended to the competitor name when it has no custom news query.</p><div id="cats"></div></section>
    <section class="card"><h2>Recent refresh runs</h2><div id="runs"></div></section>`;

  const cell = (e) => `${statusText(e)}<br><small title="${esc(e ? e.message : '')}">${esc(e && e.lastSuccess ? relTime(e.lastSuccess) : '')}${e && e.count ? ` &middot; ${e.count} items` : ''}</small>`;
  dataTable(main.querySelector('#status-table'), {
    exportName: 'source-status', rows, sort: { key: 'name', dir: 'asc' },
    caption: 'Hover a cell for the full message.',
    columns: [
      { key: 'name', label: 'Competitor', value: (r) => r.c.shortName || r.c.name, render: (r) => `<a href="#/c/${encodeURIComponent(r.c.id)}">${esc(r.c.shortName || r.c.name)}</a>` },
      ...s.sources.map((src) => ({ key: src.key, label: SOURCE_LABEL[src.key], value: (r) => (r[src.key] ? r[src.key].status : 'not fetched'),
        csvValue: (r) => (r[src.key] ? `${r[src.key].status}: ${r[src.key].message || ''}` : 'not fetched'), render: (r) => cell(r[src.key]) })),
      { key: 'go', label: '', sortable: false, csv: false, render: (r) => `<button class="btn small" type="button" data-refresh="${esc(r.c.id)}">Refresh</button>` },
    ],
  });
  dataTable(main.querySelector('#runs'), {
    exportName: 'refresh-runs', rows: s.runs, empty: 'No refresh has run yet.',
    columns: [
      { key: 'startedAt', label: 'Started', render: (r) => esc(fmtStamp(r.startedAt)) }, { key: 'finishedAt', label: 'Finished', render: (r) => esc(fmtStamp(r.finishedAt)) },
      { key: 'trigger', label: 'Trigger' }, { key: 'tasks', label: 'Checks', num: true }, { key: 'errors', label: 'Errors', num: true },
    ],
  });

  // categories editor
  const catsEl = main.querySelector('#cats');
  const renderCats = (cats) => {
    catsEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Label</th><th>News topic</th><th></th></tr></thead><tbody>
      ${cats.map((c, i) => `<tr data-i="${i}" data-id="${esc(c.id)}"><td><input type="text" aria-label="Category label" value="${esc(c.label)}" style="width:100%"></td>
        <td><input type="text" aria-label="News topic" value="${esc(c.newsTopic || '')}" style="width:100%"></td>
        <td><button class="btn small danger" type="button" data-rmcat="${i}">Remove</button></td></tr>`).join('')}</tbody></table></div>
      <div class="actions" style="margin-top:8px"><button class="btn small" type="button" id="addcat">+ Add category</button><button class="btn primary small" type="button" id="savecats">Save categories</button></div>`;
  };
  let cats = [...(s.competitors.categories || [])];
  renderCats(cats);
  const readCats = () => [...catsEl.querySelectorAll('tbody tr')].map((tr) => ({ id: tr.dataset.id, label: tr.querySelector('td input').value, newsTopic: tr.querySelectorAll('td input')[1].value }));
  catsEl.addEventListener('click', async (e) => {
    if (e.target.id === 'addcat') { cats = [...readCats(), { id: '', label: 'New category', newsTopic: '' }]; renderCats(cats); }
    if (e.target.dataset.rmcat) { cats = readCats().filter((_, i) => String(i) !== e.target.dataset.rmcat); renderCats(cats); }
    if (e.target.id === 'savecats') {
      try { await api.put('/categories', { categories: readCats() }); toast('Categories saved'); await app.loadState(); app.rerender(); } catch (err) { toast(err.message, true); }
    }
  });

  main.querySelector('#refresh-all-2').addEventListener('click', () => app.refresh());
  main.querySelector('#status-table').addEventListener('click', (e) => {
    const b = e.target.closest('[data-refresh]');
    if (b) app.refresh({ competitorIds: [b.dataset.refresh] });
  });
  const act = async (url, msg, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    try { const r = await api.post(url); toast(msg(r)); await app.loadState(); app.rerender(); } catch (err) { toast(err.message, true); }
  };
  main.querySelector('#clear-sample').addEventListener('click', () => act('/sample/clear', (r) => `Removed ${r.competitors} sample competitors and ${r.items + r.intel} sample items`));
  main.querySelector('#load-sample').addEventListener('click', () => act('/sample/load', (r) => `Loaded ${r.competitors} sample competitors and ${r.items} items`));
  main.querySelector('#clear-cache').addEventListener('click', () => act('/cache/clear', () => 'Fetched cache cleared', 'Delete all fetched items and source status? Your competitors, intel, notes, SWOTs and alert rules are kept.'));
}
