import { api } from '../api.js';
import { esc, dataTable, threatBadge, sampleBadge, relTime, toast, listText } from '../ui.js';
import { openCompetitorForm } from './competitor-form.js';

const THREAT_RANK = { High: 3, Medium: 2, Low: 1, '': 0 };

export default async function competitors(main, app) {
  const counts = {};
  const all = await api.items({ limit: 5000 });
  for (const i of all.items) counts[i.competitorId] = (counts[i.competitorId] || 0) + 1;
  const status = app.state.sourceStatus;
  const lastOf = (id) => Object.values(status[id] || {}).map((e) => e.lastSuccess).filter(Boolean).sort().pop() || '';
  const errorsOf = (id) => Object.values(status[id] || {}).filter((e) => e.status === 'error').length;
  const cats = app.state.competitors.categories || [];

  main.innerHTML = `
    <div class="page-head"><div><h1>Competitors</h1><p>Grouped by category. Click a name for the full profile. The list is stored in <code>data/competitors.json</code>.</p></div>
      <div class="actions"><button class="btn primary" id="add-comp" type="button">Add competitor</button></div></div>
    ${cats.map((cat) => `<section class="card"><h2>${esc(cat.label)}</h2><div data-cat="${esc(cat.id)}"></div></section>`).join('')}
    <section class="card" id="uncat-card" hidden><h2>Uncategorized</h2><div data-cat=""></div></section>`;

  const known = new Set(cats.map((c) => c.id));
  for (const el of main.querySelectorAll('[data-cat]')) {
    const id = el.dataset.cat;
    const rows = app.state.competitors.competitors.filter((c) => (id ? c.category === id : !known.has(c.category)));
    if (!id) main.querySelector('#uncat-card').hidden = !rows.length;
    dataTable(el, {
      exportName: `competitors-${id || 'uncategorized'}`,
      rows,
      sort: { key: 'name', dir: 'asc' },
      empty: id === 'emerging' ? 'No startups added yet. Use "Add competitor".' : 'No competitors in this category.',
      columns: [
        { key: 'name', label: 'Competitor', value: (c) => c.shortName || c.name,
          render: (c) => `<a href="#/c/${encodeURIComponent(c.id)}"><strong>${esc(c.shortName || c.name)}</strong></a> ${c.sample ? sampleBadge() : ''}<br><small>${esc(c.name !== c.shortName ? c.name : '')}</small>` },
        { key: 'threat', label: 'Threat', value: (c) => THREAT_RANK[c.threat || ''], csvValue: (c) => c.threat || 'Not rated', render: (c) => threatBadge(c.threat) },
        { key: 'keyProducts', label: 'Key products', value: (c) => listText(c.keyProducts), render: (c) => esc(listText(c.keyProducts)) },
        { key: 'hq', label: 'HQ' },
        { key: 'ticker', label: 'Ticker' },
        { key: 'items', label: 'Items', num: true, value: (c) => counts[c.id] || 0 },
        { key: 'updated', label: 'Last fetched', value: (c) => lastOf(c.id), csvValue: (c) => lastOf(c.id),
          render: (c) => (c.sample ? '<small>sample</small>' : `${esc(relTime(lastOf(c.id) || null))}${errorsOf(c.id) ? ` <span class="badge status-error" title="Sources with errors">&#9888; ${errorsOf(c.id)} error</span>` : ''}`) },
        { key: 'actions', label: 'Actions', sortable: false, csv: false,
          render: (c) => `<button class="btn small" data-edit="${esc(c.id)}" type="button">Edit</button> <button class="btn small danger" data-del="${esc(c.id)}" type="button">Delete</button>` },
      ],
    });
  }

  main.querySelector('#add-comp').addEventListener('click', () => openCompetitorForm(app, null, (c) => app.go(`#/c/${encodeURIComponent(c.id)}`)));
  main.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) openCompetitorForm(app, app.competitor(ed.dataset.edit), () => app.rerender());
    const del = e.target.closest('[data-del]');
    if (del) {
      const c = app.competitor(del.dataset.del);
      if (!confirm(`Delete ${c.shortName || c.name}? This also removes its cached items, intel, notes and SWOT. This cannot be undone.`)) return;
      try {
        await api.del(`/competitors/${encodeURIComponent(c.id)}`);
        toast(`Deleted ${c.shortName || c.name}`);
        await app.loadState();
        app.rerender();
      } catch (err) { toast(err.message, true); }
    }
  });
}
