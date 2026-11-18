import { api } from '../api.js';
import { esc, dataTable, feedList, toast, openModal, closeModal } from '../ui.js';

export default async function alerts(main, app) {
  const rules = await api.get('/alerts');
  const q = app.query();
  const days = q.days || '90';
  const from = days === 'all' ? '' : new Date(Date.now() - Number(days) * 864e5).toISOString().slice(0, 10);
  const { items, total } = await api.items({ alertsOnly: true, from, alert: q.rule || '', limit: 300 });
  const allMatches = await api.items({ alertsOnly: true, from, limit: 5000 });
  const perRule = {};
  for (const i of allMatches.items) for (const a of i.alerts) perRule[a] = (perRule[a] || 0) + 1;

  main.innerHTML = `
    <div class="page-head"><div><h1>Alerts</h1><p>Keyword rules flag matching items everywhere with a &#9873; badge. Matching is case-insensitive on whole words, against titles and summaries.</p></div>
      <div class="actions"><button class="btn primary" type="button" id="add-rule">Add rule</button></div></div>
    <section class="card"><h2>Rules</h2><div id="rules"></div></section>
    <section class="card">
      <div class="table-tools"><h2>Matching items</h2>
        <div class="actions">
          <label for="al-rule">Rule</label><select id="al-rule"><option value="">All rules</option>${rules.map((r) => `<option value="${esc(r.id)}" ${r.id === q.rule ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
          <label for="al-days">Dated within</label><select id="al-days">${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['all', 'Any time']]
            .map(([v, l]) => `<option value="${v}" ${v === days ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      ${feedList(items, { rulesById: app.rulesById, empty: 'No items match the alert rules in this period.' })}
      ${total > items.length ? `<p class="muted">Showing ${items.length} of ${total}. <a href="#/search?alertsOnly=true">Open in Search</a> for paging and export.</p>` : ''}
    </section>`;

  dataTable(main.querySelector('#rules'), {
    exportName: 'alert-rules', rows: rules, sort: { key: 'name', dir: 'asc' }, empty: 'No rules yet.',
    columns: [
      { key: 'name', label: 'Rule' },
      { key: 'keywords', label: 'Keywords (any)', value: (r) => r.keywords.join(', ') },
      { key: 'enabled', label: 'Status', value: (r) => (r.enabled ? 'On' : 'Off'), render: (r) => (r.enabled ? '<span class="status-ok">&#10003; On</span>' : '<span class="status-skipped">&#8212; Off</span>') },
      { key: 'matches', label: `Matches (${days === 'all' ? 'all time' : `${days} d`})`, num: true, value: (r) => perRule[r.id] || 0 },
      { key: 'actions', label: 'Actions', sortable: false, csv: false, render: (r) => `<button class="btn small" type="button" data-edit="${esc(r.id)}">Edit</button>
        <button class="btn small" type="button" data-toggle="${esc(r.id)}">${r.enabled ? 'Turn off' : 'Turn on'}</button>
        <button class="btn small danger" type="button" data-del="${esc(r.id)}">Delete</button>` },
    ],
  });

  const setQ = (k, v) => { const p = { ...app.query(), [k]: v }; app.go(`#/alerts?${new URLSearchParams(Object.entries(p).filter(([, x]) => x))}`); };
  main.querySelector('#al-rule').addEventListener('change', (e) => setQ('rule', e.target.value));
  main.querySelector('#al-days').addEventListener('change', (e) => setQ('days', e.target.value));
  main.querySelector('#add-rule').addEventListener('click', () => ruleForm(app));
  main.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-edit],[data-toggle],[data-del]');
    if (!t) return;
    const id = t.dataset.edit || t.dataset.toggle || t.dataset.del;
    const rule = rules.find((r) => r.id === id);
    try {
      if (t.dataset.edit) return ruleForm(app, rule);
      if (t.dataset.toggle) await api.put(`/alerts/${id}`, { enabled: !rule.enabled });
      if (t.dataset.del) { if (!confirm(`Delete rule "${rule.name}"?`)) return; await api.del(`/alerts/${id}`); }
      await app.loadState();
      app.rerender();
    } catch (err) { toast(err.message, true); }
  });
}

function ruleForm(app, rule) {
  openModal(rule ? 'Edit alert rule' : 'Add alert rule', `
    <form id="rule-form"><div class="form-grid">
      <div class="field"><label for="r-name">Rule name</label><input id="r-name" name="name" type="text" value="${esc(rule ? rule.name : '')}"></div>
      <div class="field"><label for="r-kw">Keywords (comma separated, any match)</label><input id="r-kw" name="keywords" type="text" value="${esc(rule ? rule.keywords.join(', ') : '')}" placeholder="concussion, GFAP, CLIA waived"></div>
    </div><div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save rule</button></div></form>`, (root) => {
    root.querySelector('#rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { name: root.querySelector('#r-name').value, keywords: root.querySelector('#r-kw').value };
      try {
        if (rule) await api.put(`/alerts/${rule.id}`, body); else await api.post('/alerts', body);
        closeModal();
        await app.loadState();
        app.rerender();
      } catch (err) { toast(err.message, true); }
    });
  });
}
