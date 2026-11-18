// Add / edit competitor modal (also used for the NanoDx reference row).
import { api } from '../api.js';
import { esc, openModal, closeModal, toast } from '../ui.js';

const QUERY_FIELDS = [
  ['news', 'News queries (Google News)', 'One query per line. Blank = name + category topic.'],
  ['fdaApplicants', 'FDA applicant / firm names', 'Phrases matched in the openFDA applicant field.'],
  ['fdaKeywords', 'FDA device-name keywords (scope)', 'Optional. Limits large companies to relevant devices.'],
  ['fdaProductCodes', 'FDA product codes (scope)', 'Optional, e.g. QAT.'],
  ['trialSponsors', 'Trial sponsor names', 'ClinicalTrials.gov sponsor or collaborator.'],
  ['trialKeywords', 'Trial keywords (scope)', 'Optional.'],
  ['patentAssignees', 'Patent assignees / applicants', 'Used once a USPTO key is set.'],
  ['patentKeywords', 'Patent title keywords (scope)', 'Optional.'],
  ['secForms', 'SEC forms', 'Blank = 8-K, 10-K, 10-Q, D, S-1, 20-F, 6-K.'],
];

function field(name, label, value, { type = 'text', hint = '', full = false, area = false } = {}) {
  const v = esc(Array.isArray(value) ? value.join('\n') : value || '');
  return `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${esc(label)}</label>
    ${area ? `<textarea id="f-${name}" name="${name}" rows="3">${v}</textarea>` : `<input id="f-${name}" name="${name}" type="${type}" value="${v}">`}
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
}

export function openCompetitorForm(app, c, onSaved) {
  const isNew = !c;
  const isRef = c && c.id === 'nanodx';
  c = c || { queries: {} };
  const cats = app.state.competitors.categories || [];
  const html = `
    <form id="comp-form">
      <p class="muted">Values you type or change here are marked <strong>confirmed</strong> (you are the source). Imported values stay <strong>unverified</strong> until you confirm them.</p>
      <div class="form-grid">
        ${field('name', 'Name *', c.name)}
        ${field('shortName', 'Short name', c.shortName, { hint: 'Used in tables and as the default search term.' })}
        ${isRef ? '' : `<div class="field"><label for="f-category">Category</label><select id="f-category" name="category">
          ${cats.map((x) => `<option value="${esc(x.id)}" ${x.id === c.category ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="f-threat">Threat level</label><select id="f-threat" name="threat">
          ${['', 'Low', 'Medium', 'High'].map((t) => `<option value="${t}" ${t === (c.threat || '') ? 'selected' : ''}>${t || 'Not rated'}</option>`).join('')}</select></div>`}
        ${field('website', 'Website', c.website, { type: 'url' })}
        ${field('hq', 'HQ', c.hq)}
        ${isRef ? '' : field('ticker', 'Ticker (if public)', c.ticker)}
        ${isRef ? '' : field('cik', 'SEC CIK', c.cik, { hint: '10-digit EDGAR id; enables SEC filings.' })}
        ${field('keyProducts', 'Key products', c.keyProducts, { area: true, hint: 'One per line.' })}
        ${field('indications', 'Target indications', c.indications, { area: true, hint: 'One per line.' })}
        ${field('technology', 'Technology platform', c.technology, { full: true, area: true })}
        ${field('biomarkers', 'Biomarkers', c.biomarkers, { area: true, hint: 'One per line.' })}
        ${field('regulatoryStatus', 'Regulatory status', c.regulatoryStatus, { area: true })}
        ${field('timeToResult', 'Time to result', c.timeToResult)}
        ${field('sampleType', 'Sample type', c.sampleType)}
        ${field('cliaWaiver', 'CLIA waiver status', c.cliaWaiver)}
        ${field('price', 'Price (where known)', c.price)}
        ${isRef ? '' : field('fundingNotes', 'Funding / revenue notes', c.fundingNotes, { full: true, area: true })}
        ${isRef ? '' : field('notes', 'Notes', c.notes, { full: true, area: true })}
      </div>
      ${isRef ? '' : `<details class="box" style="margin-top:12px"><summary>Data source settings (search terms)</summary>
        <div class="form-grid" style="margin-top:10px">
          ${QUERY_FIELDS.map(([k, label, hint]) => field(`q.${k}`, label, (c.queries || {})[k], { area: true, hint })).join('')}
        </div></details>`}
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${isNew ? 'Add competitor' : 'Save'}</button></div>
    </form>`;
  openModal(isNew ? 'Add competitor' : `Edit ${c.shortName || c.name}`, html, (root) => {
    root.querySelector('#comp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { queries: {} };
      for (const [k, v] of fd.entries()) {
        if (k.startsWith('q.')) body.queries[k.slice(2)] = v;
        else body[k] = v;
      }
      if (!String(body.name || '').trim()) { toast('Name is required', true); return; }
      // Only send fields that changed so untouched imported values stay unverified.
      const norm = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/)).map((s) => String(s).trim()).filter(Boolean).join('\n');
      const changed = { queries: body.queries };
      for (const [k, v] of Object.entries(body)) {
        if (k !== 'queries' && norm(v) !== norm(c[k])) changed[k] = v;
      }
      try {
        const saved = isNew ? await api.post('/competitors', body) : await api.put(`/competitors/${encodeURIComponent(c.id)}`, changed);
        closeModal();
        toast(isNew ? `Added ${saved.shortName || saved.name}` : 'Saved');
        await app.loadState();
        if (onSaved) onSaved(saved);
      } catch (err) { toast(err.message, true); }
    });
  });
}
