import { api } from '../api.js';
import {
  esc, feedList, threatBadge, sampleBadge, verifyBadge, verifyState, relTime, fmtStamp, categoryLabel, toast, FIELD_LABEL, SOURCE_LABEL,
} from '../ui.js';
import { openCompetitorForm } from './competitor-form.js';
import { swotEditor } from './swot.js';

const TABS = ['overview', 'news', 'fda', 'trials', 'patents', 'sec', 'intel', 'notes', 'swot'];
const TAB_LABEL = { overview: 'Overview', news: 'News', fda: 'FDA', trials: 'Clinical trials', patents: 'Patents', sec: 'SEC filings', intel: 'Intel', notes: 'My notes', swot: 'SWOT' };
const STATUS_TEXT = { ok: 'OK', no_records: 'No records found', error: 'Error', needs_key: 'Needs API key', skipped: 'Skipped', partial: 'Partly failed' };

export function statusText(e) {
  if (!e) return '<span class="status-skipped">Not fetched yet</span>';
  const icon = { ok: '&#10003;', error: '&#9888;', needs_key: '&#128273;', partial: '&#9888;', no_records: '&#8709;', skipped: '&#8212;' }[e.status] || '';
  return `<span class="status-${esc(e.status)}"><span aria-hidden="true">${icon}</span> ${esc(STATUS_TEXT[e.status] || e.status)}</span>`;
}

function fieldValue(c, f) {
  const v = c[f];
  if (Array.isArray(v)) return v.length ? `<ul style="margin:0;padding-left:16px">${v.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">not set</span>';
  if (!v) return '<span class="muted">not set</span>';
  if (f === 'website') return `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`;
  return esc(v);
}

export function fieldsList(c, fields) {
  return `<dl class="fields">${fields.map((f) => {
    const st = verifyState(c, f).state;
    return `<dt>${esc(FIELD_LABEL[f] || f)}</dt><dd><div class="vrow"><div>${fieldValue(c, f)}</div> ${verifyBadge(c, f)}
      ${st === 'unverified' ? `<button class="btn small" type="button" data-verify="${esc(f)}">Confirm</button>` : ''}
      ${st === 'confirmed' ? `<button class="btn small" type="button" data-unverify="${esc(f)}" title="Mark as unverified again">Undo</button>` : ''}</div></dd>`;
  }).join('')}</dl>`;
}

export default async function profile(main, app, id) {
  const c = app.competitor(id);
  if (!c) { main.innerHTML = `<div class="card"><h2>No competitor "${esc(id)}"</h2><p><a href="#/competitors">Back to competitors</a></p></div>`; return; }
  const tab = TABS.includes(app.query().tab) ? app.query().tab : 'overview';
  const { items } = await api.items({ competitor: id, limit: 5000 });
  const bySource = Object.fromEntries(TABS.map((t) => [t, items.filter((i) => i.source === t)]));
  const status = app.state.sourceStatus[id] || {};

  main.innerHTML = `
    <div class="profile-head">
      <div><h1>${esc(c.name)} ${c.sample ? sampleBadge() : ''}</h1>
        <div class="sub">${threatBadge(c.threat)} <span>${esc(categoryLabel(app.state, c.category))}</span>
          ${c.ticker ? `<span>&middot; ${esc(c.ticker)}</span>` : ''} ${c.website ? `<span>&middot; <a href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">website</a></span>` : ''}
          <span class="muted">&middot; origin: ${esc(c.origin || 'n/a')}</span></div></div>
      <div class="actions no-print">
        <button class="btn" type="button" id="edit">Edit</button>
        ${c.sample ? '' : '<button class="btn" type="button" id="refresh-one">Refresh this competitor</button>'}
        <a class="btn" href="#/brief/${encodeURIComponent(id)}">One-page brief</a>
      </div>
    </div>
    <div class="tabs" role="tablist">${TABS.map((t) => `<button role="tab" type="button" data-tab="${t}" aria-selected="${t === tab}">${esc(TAB_LABEL[t])}${
      bySource[t] && bySource[t].length ? ` <small>(${bySource[t].length})</small>` : ''}${t !== 'overview' && t !== 'notes' && t !== 'swot' && t !== 'intel' && status[t] && status[t].status === 'error' ? ' <span aria-label="error">&#9888;</span>' : ''}</button>`).join('')}</div>
    <div id="tab-body" role="tabpanel"></div>`;

  const body = main.querySelector('#tab-body');
  const show = async (t) => {
    main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    history.replaceState(null, '', `#/c/${encodeURIComponent(id)}${t === 'overview' ? '' : `?tab=${t}`}`);
    if (t === 'overview') body.innerHTML = overview(c, app, bySource, status);
    else if (t === 'notes') await notesTab(body, c);
    else if (t === 'swot') await swotEditor(body, app, id);
    else if (t === 'intel') {
      body.innerHTML = `<div class="status-line">Manual intel and key events from the CI report. <a class="btn small" href="#/intel?competitor=${encodeURIComponent(id)}">Add intel</a></div>
        ${feedList(bySource.intel, { rulesById: app.rulesById, showCompetitor: false, empty: 'No intel yet.' })}`;
    } else {
      const e = status[t];
      body.innerHTML = `<div class="status-line">${statusText(e)}
        <span>Last updated: <span title="${esc(fmtStamp(e && e.lastSuccess))}">${esc(e && e.lastSuccess ? relTime(e.lastSuccess) : 'never')}</span></span>
        ${e && e.lastAttempt && e.lastAttempt !== e.lastSuccess ? `<span>Last attempt ${esc(relTime(e.lastAttempt))}</span>` : ''}
        ${c.sample ? '' : `<button class="btn small" type="button" data-refresh-src="${t}">Refresh ${esc(SOURCE_LABEL[t])}</button>`}</div>
        ${e && e.message ? `<p class="muted" style="margin-top:-4px">${esc(e.message)}</p>` : ''}
        ${feedList(bySource[t], { rulesById: app.rulesById, showCompetitor: false, empty: e && e.status === 'needs_key' ? 'This source needs an API key; see Sources & settings.' : 'No items cached for this source.' })}`;
    }
  };
  await show(tab);

  main.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) show(tb.dataset.tab);
    const v = e.target.closest('[data-verify],[data-unverify]');
    if (v) {
      const field = v.dataset.verify || v.dataset.unverify;
      try {
        await api.post(`/competitors/${encodeURIComponent(id)}/verify`, { field, verified: Boolean(v.dataset.verify) });
        await app.loadState();
        app.rerender();
      } catch (err) { toast(err.message, true); }
    }
    const rs = e.target.closest('[data-refresh-src]');
    if (rs) app.refresh({ competitorIds: [id], sources: [rs.dataset.refreshSrc] });
  });
  main.querySelector('#edit').addEventListener('click', () => openCompetitorForm(app, c, () => app.rerender()));
  main.querySelector('#refresh-one')?.addEventListener('click', () => app.refresh({ competitorIds: [id] }));
}

function overview(c, app, bySource, status) {
  const d = c.deck;
  const srcRows = ['news', 'fda', 'trials', 'patents', 'sec'].map((s) => {
    const e = status[s];
    return `<tr><td>${esc(SOURCE_LABEL[s])}</td><td>${statusText(e)}</td><td class="num">${bySource[s].length}</td>
      <td title="${esc(fmtStamp(e && e.lastSuccess))}">${esc(e && e.lastSuccess ? relTime(e.lastSuccess) : 'never')}</td></tr>`;
  }).join('');
  return `<div class="grid two">
    <section class="card"><h2>Profile</h2>
      ${fieldsList(c, ['website', 'hq', 'ticker', 'cik', 'keyProducts', 'technology', 'indications', 'biomarkers', 'regulatoryStatus', 'fundingNotes'])}
      <h3 style="margin-top:14px">Comparison fields</h3>
      ${fieldsList(c, ['timeToResult', 'sampleType', 'cliaWaiver', 'price'])}
      ${c.notes ? `<h3 style="margin-top:14px">Notes</h3><p style="white-space:pre-wrap">${esc(c.notes)}</p>` : ''}
    </section>
    <div>
      <section class="card"><h2>Sources</h2>
        <div class="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Items</th><th>Last updated</th></tr></thead><tbody>${srcRows}</tbody></table></div>
      </section>
      ${d ? `<section class="card"><h2>From the ${esc(d.source)} <span class="badge unverified">unverified</span></h2>
        <dl class="fields">
          ${[['Tier in deck', d.tier], ['Founded', d.founded], ['Stage', d.stage], ['Employees', d.employees], ['Focus', d.focus],
            ['Go to market', d.goToMarket], ['Customers', d.customers], ['Focus areas', (d.focusAreas || []).join('; ')],
            ['Partnerships', (d.partnerships || []).join('; ')], ['Programs', (d.programs || []).join('; ')]]
            .filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
        </dl><p class="muted">Imported from the earlier monitor's competitors.json. Copy anything you confirm into the profile with Edit.</p></section>` : ''}
    </div></div>`;
}

async function notesTab(body, c) {
  const render = async () => {
    const notes = await api.get(`/notes/${encodeURIComponent(c.id)}`);
    body.innerHTML = `<section class="card"><h2>My notes</h2>
      <form id="note-form"><label class="sr-only" for="note-text">New note</label>
        <textarea id="note-text" placeholder="Add a dated note (sales call, conference, analyst comment)"></textarea>
        <div class="modal-foot" style="margin-top:6px"><button class="btn primary" type="submit">Add note</button></div></form>
      <ul class="notes-list">${notes.map((n) => `<li><small>${esc(fmtStamp(n.createdAt))}</small> ${n.sample ? '<span class="badge sample">SAMPLE</span>' : ''}
        <button class="btn small danger" style="float:right" type="button" data-del-note="${esc(n.id)}">Delete</button><br>${esc(n.text)}</li>`).join('') || '<li class="muted">No notes yet.</li>'}</ul></section>`;
    body.querySelector('#note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = body.querySelector('#note-text').value.trim();
      if (!text) return;
      try { await api.post(`/notes/${encodeURIComponent(c.id)}`, { text }); await render(); } catch (err) { toast(err.message, true); }
    });
    body.querySelectorAll('[data-del-note]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Delete this note?')) return;
      await api.del(`/notes/${encodeURIComponent(c.id)}/${encodeURIComponent(b.dataset.delNote)}`);
      await render();
    }));
  };
  await render();
}
