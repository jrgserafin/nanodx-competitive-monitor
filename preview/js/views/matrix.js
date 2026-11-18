import { esc, dataTable, threatBadge, sampleBadge, verifyState, categoryLabel, listText } from '../ui.js';
import { openCompetitorForm } from './competitor-form.js';

const THREAT_RANK = { High: 3, Medium: 2, Low: 1, '': 0 };

// Cell with an "unverified" marker (dashed underline + ?) so state never depends on color alone.
function cell(c, f) {
  const v = listText(c[f]);
  if (!v) return '<span class="muted">&ndash;</span>';
  const st = verifyState(c, f).state;
  const title = st === 'unverified' ? 'Unverified: not fetched from a source' : st === 'sourced' ? `Source: ${c.fieldSources[f].source}` : 'Confirmed by you';
  return `<span class="${st === 'unverified' ? 'cell-u' : ''}" title="${esc(title)}">${esc(v)}</span>`;
}

export default async function matrix(main, app) {
  const ref = { ...app.state.competitors.nanodx, id: 'nanodx', isRef: true };
  const rows = app.state.competitors.competitors;
  const cats = app.state.competitors.categories || [];
  main.innerHTML = `
    <div class="page-head"><div><h1>Comparison matrix</h1>
      <p>Click a column to sort; NanoDx stays pinned on top. <span class="cell-u">Underlined values</span> are unverified (not fetched from a source); confirm them on each profile.</p></div>
      <div class="actions"><label for="mx-cat">Category</label><select id="mx-cat"><option value="">All categories</option>
        ${cats.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select>
        <button class="btn" type="button" id="edit-ref">Edit NanoDx row</button></div></div>
    <div id="mx"></div>`;
  const cols = [
    { key: 'name', label: 'Company', value: (c) => c.shortName || c.name,
      render: (c) => (c.isRef ? `<strong>${esc(c.shortName)}</strong> <small>(reference)</small>` : `<a href="#/c/${encodeURIComponent(c.id)}">${esc(c.shortName || c.name)}</a> ${c.sample ? sampleBadge() : ''}`) },
    { key: 'category', label: 'Category', value: (c) => (c.isRef ? '' : categoryLabel(app.state, c.category)) },
    { key: 'technology', label: 'Technology', render: (c) => cell(c, 'technology'), value: (c) => c.technology },
    { key: 'timeToResult', label: 'Time to result', render: (c) => cell(c, 'timeToResult'), value: (c) => c.timeToResult },
    { key: 'sampleType', label: 'Sample type', render: (c) => cell(c, 'sampleType'), value: (c) => c.sampleType },
    { key: 'cliaWaiver', label: 'CLIA waiver', render: (c) => cell(c, 'cliaWaiver'), value: (c) => c.cliaWaiver },
    { key: 'indications', label: 'Indications', render: (c) => cell(c, 'indications'), value: (c) => listText(c.indications) },
    { key: 'regulatoryStatus', label: 'Regulatory status', render: (c) => cell(c, 'regulatoryStatus'), value: (c) => c.regulatoryStatus },
    { key: 'price', label: 'Price', render: (c) => cell(c, 'price'), value: (c) => c.price },
    { key: 'threat', label: 'Threat', value: (c) => (c.isRef ? -1 : THREAT_RANK[c.threat || '']), csvValue: (c) => (c.isRef ? 'reference' : c.threat || 'Not rated'),
      render: (c) => (c.isRef ? '<small>reference</small>' : threatBadge(c.threat)) },
    { key: 'verified', label: 'Unverified fields', num: true, csv: true,
      value: (c) => ['technology', 'timeToResult', 'sampleType', 'cliaWaiver', 'indications', 'regulatoryStatus', 'price'].filter((f) => verifyState(c, f).state === 'unverified').length },
  ];
  const table = dataTable(main.querySelector('#mx'), {
    columns: cols, rows, pinned: [ref], exportName: 'comparison-matrix', sort: { key: 'threat', dir: 'desc' },
    rowClass: (r) => (r.isRef ? 'ref-row' : ''),
  });
  main.querySelector('#mx-cat').addEventListener('change', (e) => {
    table.update(e.target.value ? rows.filter((c) => c.category === e.target.value) : rows);
  });
  main.querySelector('#edit-ref').addEventListener('click', () => openCompetitorForm(app, app.state.competitors.nanodx, () => app.rerender()));
}
