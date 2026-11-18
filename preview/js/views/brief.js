// Printable one-page competitive brief. Unverified values carry a visible "(unverified)" tag.
import { api } from '../api.js';
import { esc, verifyState, categoryLabel, listText, EVENT_LABEL, SOURCE_LABEL, FIELD_LABEL } from '../ui.js';

export default async function brief(main, app, id) {
  const c = app.competitor(id);
  if (!c) { main.innerHTML = `<div class="card"><h2>No competitor "${esc(id)}"</h2></div>`; return; }
  const ref = app.state.competitors.nanodx;
  const [{ items }, swotAll] = await Promise.all([api.items({ competitor: id, limit: 5000 }), api.get('/swot')]);
  const sw = swotAll[id];
  const events = items.filter((i) => app.state.timelineTypes.includes(i.eventType) && i.date).slice(0, 8);
  const recent = items.filter((i) => i.date).slice(0, 6);
  const alerts = items.filter((i) => i.alerts.length).slice(0, 4);
  const tag = (x, f) => {
    const st = verifyState(x, f).state;
    return st === 'unverified' ? ' <span class="u">(unverified)</span>' : st === 'sourced' ? ` <span class="u" style="color:#1c5cab">(${esc(x.fieldSources[f].source)})</span>` : '';
  };
  const val = (x, f) => (listText(x[f]) ? `${esc(listText(x[f]))}${tag(x, f)}` : '<span style="color:#999">&ndash;</span>');
  const today = new Date().toISOString().slice(0, 10);
  const counts = Object.fromEntries(['news', 'fda', 'trials', 'patents', 'sec', 'intel'].map((s) => [s, items.filter((i) => i.source === s).length]));
  const cmp = ['technology', 'timeToResult', 'sampleType', 'cliaWaiver', 'indications', 'regulatoryStatus', 'price'];

  main.innerHTML = `
    <div class="actions no-print" style="margin-bottom:12px"><a class="btn" href="#/c/${encodeURIComponent(id)}">Back to profile</a>
      <button class="btn primary" type="button" onclick="window.print()">Print / save as PDF</button>
      <span class="muted">Fits one page in most browsers at default margins.</span></div>
    <article class="brief">
      <div class="brief-band">
        <div><span class="brand-word grad-text">NanoDx</span></div>
        <div class="meta">Competitive brief<br>Prepared ${today}<br>Confidential</div></div>
      <div class="brief-rule"></div>
      <div class="brief-body">
      <div><h1>${esc(c.name)}</h1><div>${esc(categoryLabel(app.state, c.category))} &middot; Threat: <strong>${esc(c.threat || 'Not rated')}</strong>${c.sample ? ' &middot; <strong>SAMPLE (fictional)</strong>' : ''}</div></div>
      <h2>Profile</h2>
      <div class="cols">
        ${['hq', 'website', 'ticker', 'keyProducts', 'technology', 'indications', 'regulatoryStatus', 'fundingNotes'].map((f) => `<div><strong>${esc(FIELD_LABEL[f])}:</strong> ${val(c, f)}</div>`).join('')}
      </div>
      <h2>Compared with NanoDx</h2>
      <table><thead><tr><th></th><th>${esc(c.shortName || c.name)}</th><th>NanoDx</th></tr></thead><tbody>
        ${cmp.map((f) => `<tr><th scope="row" style="text-align:left">${esc(FIELD_LABEL[f])}</th><td>${val(c, f)}</td><td>${val(ref, f)}</td></tr>`).join('')}
      </tbody></table>
      ${sw ? `<h2>SWOT relative to NanoDx</h2><div class="cols">
        ${[['strengths', 'Strengths'], ['weaknesses', 'Weaknesses'], ['opportunities', 'Opportunities'], ['threats', 'Threats']].map(([k, l]) =>
          `<div><strong>${l}</strong><ul>${(sw[k] || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li style="color:#999">none recorded</li>'}</ul></div>`).join('')}</div>` : ''}
      <h2>Key events</h2>
      ${events.length ? `<ul>${events.map((i) => `<li>${esc(i.date)}: ${esc(EVENT_LABEL[i.eventType])}. ${esc(i.title)} <span style="color:#666">(${esc(SOURCE_LABEL[i.source])}${i.source === 'intel' && !i.verified ? ', unverified' : ''})</span></li>`).join('')}</ul>` : '<p style="color:#999">No dated events recorded.</p>'}
      <h2>Recent activity</h2>
      ${recent.length ? `<ul>${recent.map((i) => `<li>${esc(i.date)} [${esc(SOURCE_LABEL[i.source])}] ${esc(i.title)}</li>`).join('')}</ul>` : '<p style="color:#999">No items fetched yet.</p>'}
      ${alerts.length ? `<h2>Alert matches</h2><ul>${alerts.map((i) => `<li>${esc(i.date)}: ${esc(i.title)} (${esc(i.alerts.map((a) => (app.rulesById[a] || {}).name || a).join(', '))})</li>`).join('')}</ul>` : ''}
      ${c.notes ? `<h2>Notes</h2><p style="white-space:pre-wrap">${esc(c.notes)}</p>` : ''}
      </div>
      <div class="foot"><div class="tagline">Semiconductor-grade precision. Point of care. In minutes.</div>Items on file: ${Object.entries(counts).map(([k, n]) => `${SOURCE_LABEL[k]} ${n}`).join(', ')}.
        "(unverified)" marks values not fetched from a source and not yet confirmed. Fetched items come from Google News, openFDA, ClinicalTrials.gov, USPTO and SEC EDGAR.</div>
    </article>`;
}
