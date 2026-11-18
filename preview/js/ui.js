// Shared rendering helpers: escaping, badges, tables with sort + CSV export, item feed, modal, toast.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const SOURCE_LABEL = { news: 'News', fda: 'FDA', trials: 'Trial', patents: 'Patent', sec: 'SEC', intel: 'Intel' };
export const EVENT_LABEL = {
  approval: 'Approval / clearance', launch: 'Launch', funding: 'Funding', ma: 'M&A', partnership: 'Partnership',
  recall: 'Recall', trial: 'Trial', patent: 'Patent', filing: 'Filing', earnings: 'Financial report', leadership: 'Leadership',
};
export const FIELD_LABEL = {
  website: 'Website', hq: 'HQ', ticker: 'Ticker', cik: 'SEC CIK', keyProducts: 'Key products', technology: 'Technology platform',
  indications: 'Target indications', biomarkers: 'Biomarkers', regulatoryStatus: 'Regulatory status', fundingNotes: 'Funding / revenue notes',
  timeToResult: 'Time to result', sampleType: 'Sample type', cliaWaiver: 'CLIA waiver status', price: 'Price',
};

export function fmtDate(d) {
  if (!d) return '';
  return String(d).slice(0, 10);
}
export function relTime(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 0) { const m = Math.round(-s / 60); return m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)} h`; }
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
export const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

// ---- badges (every color is paired with text or a symbol) ----
export function threatBadge(t) {
  if (!t) return '<span class="badge threat-none" title="Threat level not rated yet">Not rated</span>';
  const icon = { High: '&#9650;', Medium: '&#9670;', Low: '&#9660;' }[t] || '';
  return `<span class="badge threat-${esc(t)}" title="Threat level: ${esc(t)}"><span aria-hidden="true">${icon}</span> ${esc(t)}</span>`;
}
export const sourceBadge = (s) => `<span class="badge src src-${esc(s)}">${esc(SOURCE_LABEL[s] || s)}</span>`;
export const sampleBadge = () => '<span class="badge sample" title="Placeholder data, not real. Clear it on the Sources & settings page.">SAMPLE</span>';
export const eventBadge = (e) => (e ? `<span class="badge event-b">${esc(EVENT_LABEL[e] || e)}</span>` : '');

// Verification state of one profile field.
export function verifyState(c, field) {
  const v = c[field];
  const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  if (empty) return { state: 'empty' };
  if (c.fieldSources && c.fieldSources[field]) return { state: 'sourced', info: c.fieldSources[field] };
  if (c.verified && c.verified[field]) return { state: 'confirmed', info: c.verified[field] };
  return { state: 'unverified' };
}
export function verifyBadge(c, field) {
  const s = verifyState(c, field);
  if (s.state === 'sourced') return `<span class="badge sourced" title="Filled from ${esc(s.info.source)} on ${esc(s.info.at)}">source: ${esc(s.info.source)}</span>`;
  if (s.state === 'confirmed') return `<span class="badge confirmed" title="Confirmed by you on ${esc(s.info.at)}">&#10003; confirmed</span>`;
  if (s.state === 'unverified') return '<span class="badge unverified" title="Not fetched from a source. Confirm it or edit it.">unverified</span>';
  return '';
}

export function itemBadges(i, rulesById = {}) {
  const out = [];
  if (i.sample) out.push(sampleBadge());
  if (!i.baseline && i.firstSeen && Date.now() - Date.parse(i.firstSeen) < 7 * 864e5 && !i.sample) out.push('<span class="badge new-b" title="First seen in the last 7 days">NEW</span>');
  for (const a of i.alerts || []) out.push(`<span class="badge alert-b" title="Matches alert rule">&#9873; ${esc((rulesById[a] && rulesById[a].name) || a)}</span>`);
  if (i.source === 'intel' && !i.sample) out.push(i.verified ? '<span class="badge confirmed">&#10003; confirmed</span>' : '<span class="badge unverified">unverified</span>');
  return out.join(' ');
}

export function itemLink(i) {
  const t = esc(i.title || '(untitled)');
  return i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${t}</a>` : t;
}

export function feedList(items, { rulesById = {}, showCompetitor = true, empty = 'No items yet.' } = {}) {
  if (!items.length) return `<p class="empty">${esc(empty)}</p>`;
  return `<ul class="feed">${items.map((i) => `
    <li>
      <span class="date">${esc(fmtDate(i.date) || 'no date')}</span>
      <div>
        <div class="meta">${sourceBadge(i.source)} ${i.subtype && i.subtype !== 'news' ? `<span>${esc(i.subtype)}</span>` : ''}
          ${showCompetitor ? `<a href="#/c/${encodeURIComponent(i.competitorId)}">${esc(i.competitorName || i.competitorId)}</a>` : ''}
          ${i.publisher && i.source === 'news' ? `<span>&middot; ${esc(i.publisher)}</span>` : ''}
          ${eventBadge(i.eventType)} ${itemBadges(i, rulesById)}</div>
        <div class="title">${itemLink(i)}</div>
        ${i.summary ? `<div class="summary">${esc(i.summary.length > 260 ? i.summary.slice(0, 260) + '...' : i.summary)}</div>` : ''}
      </div>
    </li>`).join('')}</ul>`;
}

// ---- CSV ----
function csvCell(v) {
  const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadCSV(filename, headers, rows) {
  const text = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^\w.-]+/g, '_');
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---- sortable table with CSV export ----
// columns: [{ key, label, render(row) -> html, value(row) -> sort/CSV value, num, sortable, csv, csvOnly }]
export function dataTable(container, { columns, rows, exportName, caption = '', empty = 'Nothing to show.', sort, rowClass, pinned = [], toolbar = '' }) {
  const allColumns = columns;
  columns = allColumns.filter((c) => !c.csvOnly);
  let sortKey = sort ? sort.key : null;
  let dir = sort ? sort.dir : 'asc';
  const val = (col, r) => (col.value ? col.value(r) : r[col.key]);
  function sorted() {
    if (!sortKey) return rows;
    const col = allColumns.find((c) => c.key === sortKey);
    return [...rows].sort((a, b) => {
      const x = val(col, a); const y = val(col, b);
      const ex = x === '' || x == null || (Array.isArray(x) && !x.length);
      const ey = y === '' || y == null || (Array.isArray(y) && !y.length);
      if (ex !== ey) return ex ? 1 : -1; // blanks last either way
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
      return dir === 'asc' ? r : -r;
    });
  }
  function render() {
    const body = [...pinned, ...sorted()];
    container.innerHTML = `
      <div class="table-tools"><div class="muted">${esc(caption)}${caption ? ' &middot; ' : ''}${rows.length} row${rows.length === 1 ? '' : 's'}</div>
        <div class="actions">${toolbar}<button class="btn small" data-export type="button">Export CSV</button></div></div>
      <div class="table-wrap"><table>
        <thead><tr>${columns.map((c) => `<th scope="col" ${c.sortable === false ? '' : `aria-sort="${sortKey === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}"`}>
          ${c.sortable === false ? esc(c.label) : `<button type="button" data-sort="${esc(c.key)}">${esc(c.label)}</button>`}</th>`).join('')}</tr></thead>
        <tbody>${body.length ? body.map((r) => `<tr class="${rowClass ? esc(rowClass(r)) : ''}">${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(val(c, r))}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${columns.length}" class="empty">${esc(empty)}</td></tr>`}</tbody>
      </table></div>`;
  }
  container.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s && container.contains(s)) {
      const k = s.dataset.sort;
      if (sortKey === k) dir = dir === 'asc' ? 'desc' : 'asc'; else { sortKey = k; dir = 'asc'; }
      render();
      container.querySelector(`[data-sort="${CSS.escape(k)}"]`)?.focus();
    }
    if (e.target.closest('[data-export]')) {
      const all = [...pinned, ...sorted()];
      downloadCSV(`${exportName || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`,
        allColumns.filter((c) => c.csv !== false).map((c) => c.label),
        all.map((r) => allColumns.filter((c) => c.csv !== false).map((c) => (c.csvValue ? c.csvValue(r) : val(c, r)))));
    }
  });
  render();
  return { update(newRows) { rows = newRows; render(); } };
}

// ---- modal & toast ----
let lastFocus = null;
export function openModal(title, html, onMount) {
  const m = $('#modal');
  lastFocus = document.activeElement;
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  m.hidden = false;
  const first = $('#modal-body').querySelector('input, select, textarea, button');
  (first || $('[data-close]', m)).focus();
  if (onMount) onMount($('#modal-body'));
}
export function closeModal() {
  $('#modal').hidden = true;
  $('#modal-body').innerHTML = '';
  if (lastFocus) lastFocus.focus();
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target.id === 'modal') closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

let toastTimer = null;
export function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast${isError ? ' error' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 7000 : 3500);
}

export function categoryLabel(state, id) {
  const c = (state.competitors.categories || []).find((x) => x.id === id);
  return c ? c.label : id || 'Uncategorized';
}

export const listText = (v) => (Array.isArray(v) ? v.join('; ') : v || '');

// ---- motion ----
// Animations run only when the user has not asked for reduced motion (OS setting or the Motion toggle).
export function motionOn() {
  return document.documentElement.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const REVEAL = '.page-head, .stats .stat, .spec, .tile, .section-head, .card, .feed li, .tl .ev, .tl h3, tbody tr, .swot section, .notes-list li, .profile-head, .tabs';

// Stagger elements in as they scroll into view. Each element animates once, then its animation
// class is removed so nothing lingers. Elements below the fold wait until they are scrolled to.
export function animateIn(root) {
  if (!motionOn()) return;
  const els = [...root.querySelectorAll(REVEAL)].filter((el) => !el.closest('.brief')).slice(0, 350);
  if (!els.length) return;
  const done = (el) => { el.classList.remove('rise', 'pre'); el.style.removeProperty('--i'); };
  const io = new IntersectionObserver((entries) => {
    let k = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      el.style.setProperty('--i', String(Math.min(k++, 14)));
      el.classList.remove('pre');
      el.classList.add('rise');
      el.addEventListener('animationend', function end(ev) {
        if (ev.target !== el) return;
        el.removeEventListener('animationend', end);
        done(el);
      });
    }
  }, { rootMargin: '0px 0px -4% 0px' });
  els.forEach((el) => { el.classList.add('pre'); io.observe(el); });
  // Safety net: never leave content invisible (e.g. a print or an element that never intersects).
  setTimeout(() => { els.forEach((el) => { if (el.classList.contains('pre') && el.getBoundingClientRect().top < innerHeight) done(el); }); }, 2500);
}

// Count numeric stat values up from zero.
export function countUp(root) {
  if (!motionOn()) return;
  root.querySelectorAll('.stat .value, .spec .value, .tile .num').forEach((el, idx) => {
    const target = Number(el.textContent.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(target) || target <= 0) return;
    const dur = 900;
    const delay = 150 + idx * 80;
    const t0 = performance.now() + delay;
    el.textContent = '0';
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      const eased = 1 - (1 - p) ** 3;
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export function skeleton() {
  return `<div class="skeleton" aria-busy="true" aria-label="Loading">
    <div class="sk sk-hero"></div>
    <div class="sk-row"><div class="sk sk-stat"></div><div class="sk sk-stat"></div><div class="sk sk-stat"></div><div class="sk sk-stat"></div></div>
    <div class="sk sk-block"></div></div>`;
}