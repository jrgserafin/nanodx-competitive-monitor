import { api } from '../api.js';
import { esc, dataTable, toast, itemLink, itemBadges, EVENT_LABEL, sampleBadge } from '../ui.js';

export default async function intel(main, app) {
  const q = app.query();
  const comps = app.competitorsSorted();
  const { items } = await api.items({ source: 'intel', limit: 5000 });
  main.innerHTML = `
    <div class="page-head"><div><h1>Add intel</h1><p>Record what you learn at conferences, on sales calls, or from customers. New intel is <strong>unverified</strong> until you tick "Confirmed".</p></div></div>
    <form class="card" id="intel-form">
      <input type="hidden" id="i-id" value="">
      <div class="form-grid">
        <div class="field"><label for="i-comp">Competitor *</label><select id="i-comp" required>${comps.map((c) => `<option value="${esc(c.id)}" ${c.id === q.competitor ? 'selected' : ''}>${esc(c.shortName || c.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="i-date">Date</label><input id="i-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field full"><label for="i-title">What happened *</label><input id="i-title" type="text" required placeholder="e.g. Rep said a CLIA-waived version is planned for next year"></div>
        <div class="field full"><label for="i-sum">Details</label><textarea id="i-sum"></textarea></div>
        <div class="field"><label for="i-where">Where you learned it</label><input id="i-where" type="text" list="where-list" placeholder="Conference, sales call, customer, analyst...">
          <datalist id="where-list"><option value="Conference"><option value="Sales call"><option value="Customer"><option value="Analyst"><option value="Investor"><option value="Website"></datalist></div>
        <div class="field"><label for="i-ev">Event type</label><select id="i-ev"><option value="">Detect from text</option>${app.state.eventTypes.map((t) => `<option value="${t}">${esc(EVENT_LABEL[t])}</option>`).join('')}</select></div>
        <div class="field"><label for="i-url">Link (optional)</label><input id="i-url" type="url"></div>
        <div class="field"><label><input type="checkbox" id="i-ver"> Confirmed (I have checked this)</label></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn" id="i-reset">Clear</button><button class="btn primary" type="submit" id="i-submit">Save intel</button></div>
    </form>
    <section class="card"><h2>All intel</h2><div id="intel-table"></div></section>`;

  const form = main.querySelector('#intel-form');
  const $f = (s) => main.querySelector(s);
  const reset = () => { form.reset(); $f('#i-id').value = ''; $f('#i-date').value = new Date().toISOString().slice(0, 10); $f('#i-submit').textContent = 'Save intel'; };
  $f('#i-reset').addEventListener('click', reset);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      competitorId: $f('#i-comp').value, date: $f('#i-date').value, title: $f('#i-title').value, summary: $f('#i-sum').value,
      subtype: $f('#i-where').value || 'Manual intel', eventType: $f('#i-ev').value, url: $f('#i-url').value, verified: $f('#i-ver').checked,
    };
    const id = $f('#i-id').value;
    try {
      if (id) await api.put(`/intel/${encodeURIComponent(id)}`, body); else await api.post('/intel', body);
      toast('Intel saved');
      app.rerender();
    } catch (err) { toast(err.message, true); }
  });

  dataTable(main.querySelector('#intel-table'), {
    exportName: 'intel', rows: items, sort: { key: 'date', dir: 'desc' }, empty: 'No intel yet.',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'competitorName', label: 'Competitor', render: (i) => `<a href="#/c/${encodeURIComponent(i.competitorId)}">${esc(i.competitorName)}</a>` },
      { key: 'title', label: 'Intel', render: (i) => `${itemLink(i)} ${itemBadges(i, app.rulesById)}${i.summary ? `<br><small>${esc(i.summary)}</small>` : ''}` },
      { key: 'subtype', label: 'Where' },
      { key: 'eventType', label: 'Event', value: (i) => EVENT_LABEL[i.eventType] || '' },
      { key: 'verified', label: 'Status', value: (i) => (i.sample ? 'SAMPLE' : i.verified ? 'Confirmed' : 'Unverified'), render: (i) => (i.sample ? sampleBadge() : i.verified ? '<span class="badge confirmed">&#10003; confirmed</span>' : '<span class="badge unverified">unverified</span>') },
      { key: 'actions', label: 'Actions', sortable: false, csv: false, render: (i) => `${i.verified ? '' : `<button class="btn small" type="button" data-confirm="${esc(i.id)}">Confirm</button>`}
        <button class="btn small" type="button" data-edit="${esc(i.id)}">Edit</button> <button class="btn small danger" type="button" data-del="${esc(i.id)}">Delete</button>` },
    ],
  });

  main.querySelector('#intel-table').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-confirm],[data-edit],[data-del]');
    if (!b) return;
    const it = items.find((x) => x.id === (b.dataset.confirm || b.dataset.edit || b.dataset.del));
    try {
      if (b.dataset.confirm) { await api.put(`/intel/${encodeURIComponent(it.id)}`, { verified: true }); app.rerender(); }
      if (b.dataset.del) { if (!confirm('Delete this intel item?')) return; await api.del(`/intel/${encodeURIComponent(it.id)}`); app.rerender(); }
      if (b.dataset.edit) {
        $f('#i-id').value = it.id; $f('#i-comp').value = it.competitorId; $f('#i-date').value = /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : '';
        $f('#i-title').value = it.title; $f('#i-sum').value = it.summary || ''; $f('#i-where').value = it.subtype || '';
        $f('#i-ev').value = it.eventTypeAuto ? '' : it.eventType || ''; $f('#i-url').value = it.url || ''; $f('#i-ver').checked = Boolean(it.verified);
        $f('#i-submit').textContent = 'Update intel';
        form.scrollIntoView({ behavior: 'smooth' });
        $f('#i-title').focus();
      }
    } catch (err) { toast(err.message, true); }
  });
}
