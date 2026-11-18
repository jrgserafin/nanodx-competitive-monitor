import { api } from '../api.js';
import { esc, toast, fmtStamp, downloadCSV, sampleBadge } from '../ui.js';

const Q = [
  ['strengths', 'Strengths', 's', 'What this competitor does better than NanoDx'],
  ['weaknesses', 'Weaknesses', 'w', 'Where it falls short of NanoDx'],
  ['opportunities', 'Opportunities', 'o', 'Openings for NanoDx created by this competitor'],
  ['threats', 'Threats', 't', 'Ways this competitor could hurt NanoDx'],
];

// Editable SWOT for one competitor, relative to NanoDx. Used on the SWOT page and the profile tab.
export async function swotEditor(root, app, id) {
  const all = await api.get('/swot');
  const s = all[id] || { strengths: [], weaknesses: [], opportunities: [], threats: [] };
  const c = app.competitor(id);
  const name = c ? c.shortName || c.name : id;
  const list = (key) => `${(s[key] || []).map((v) => row(v)).join('')}`;
  const row = (v = '') => `<li><input type="text" value="${esc(v)}" aria-label="SWOT entry"><button type="button" class="btn small" data-rm aria-label="Remove entry">&times;</button></li>`;
  root.innerHTML = `
    <div class="table-tools"><div class="muted">${esc(name)} relative to NanoDx. ${s.updatedAt ? `Saved ${esc(fmtStamp(s.updatedAt))}.` : 'Not saved yet.'} ${s.sample ? sampleBadge() : ''}</div>
      <div class="actions"><button class="btn small" type="button" id="swot-csv">Export CSV</button><button class="btn primary" type="button" id="swot-save">Save SWOT</button></div></div>
    <div class="swot">${Q.map(([key, label, cls, hint]) => `<section class="${cls}" data-q="${key}"><h3>${label}</h3><small>${esc(hint)}</small>
      <ul>${list(key)}</ul><button type="button" class="btn small" data-add>+ Add</button></section>`).join('')}</div>`;
  const collect = () => Object.fromEntries(Q.map(([key]) => [key, [...root.querySelectorAll(`[data-q="${key}"] input`)].map((i) => i.value.trim()).filter(Boolean)]));
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) {
      const ul = e.target.closest('section').querySelector('ul');
      ul.insertAdjacentHTML('beforeend', row());
      ul.lastElementChild.querySelector('input').focus();
    }
    if (e.target.closest('[data-rm]')) e.target.closest('li').remove();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.swot input')) {
      e.preventDefault();
      e.target.closest('section').querySelector('[data-add]').click();
    }
  });
  root.querySelector('#swot-save').addEventListener('click', async () => {
    try { await api.put(`/swot/${encodeURIComponent(id)}`, collect()); toast('SWOT saved'); } catch (err) { toast(err.message, true); }
  });
  root.querySelector('#swot-csv').addEventListener('click', () => {
    const d = collect();
    downloadCSV(`swot-${id}.csv`, ['Competitor', 'Quadrant', 'Entry'], Q.flatMap(([key, label]) => d[key].map((v) => [name, label, v])));
  });
}

export default async function swotPage(main, app, id) {
  const comps = app.competitorsSorted();
  const all = await api.get('/swot');
  id = id || (comps[0] && comps[0].id);
  main.innerHTML = `
    <div class="page-head"><div><h1>SWOT builder</h1><p>An editable SWOT for each competitor, relative to NanoDx. Press Enter in an entry to add another.</p></div>
      <div class="actions"><label for="swot-pick" class="sr-only">Competitor</label>
        <select id="swot-pick">${comps.map((c) => `<option value="${esc(c.id)}" ${c.id === id ? 'selected' : ''}>${esc(c.shortName || c.name)}${all[c.id] ? ' (has SWOT)' : ''}</option>`).join('')}</select></div></div>
    <div class="card" id="swot-root"></div>`;
  main.querySelector('#swot-pick').addEventListener('change', (e) => app.go(`#/swot/${encodeURIComponent(e.target.value)}`));
  if (id) await swotEditor(main.querySelector('#swot-root'), app, id);
}
