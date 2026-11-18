import { api } from '../api.js';
import { esc, feedList, dataTable, relTime, fmtStamp, SOURCE_LABEL, motionOn, threatBadge, categoryLabel, sampleBadge } from '../ui.js';
import { startWave } from '../wave.js';

const MAX_SERIES = 7; // slots 1-7 for the most active competitors, gray for "Other"
let chart = null;

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default async function dashboard(main, app) {
  const s = await api.get('/summary');
  const c = s.counts;
  const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleString([], { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const comps = new Map(app.state.competitors.competitors.map((x) => [x.id, x]));
  const topTiles = s.activity.slice(0, 6).map((a, idx) => ({ ...a, idx, total: a.counts.reduce((x, y) => x + y, 0), c: comps.get(a.id) }));
  const totalItems = s.activity.reduce((n, a) => n + a.counts.reduce((x, y) => x + y, 0), 0);
  main.innerHTML = `
    <section class="cine-hero" aria-labelledby="dash-h">
      <canvas class="wave-canvas" aria-hidden="true"></canvas>
      <div class="cine-shade"></div>
      <div class="cine-content">
        <div class="kicker">NanoDx &middot; Competitive intelligence</div>
        <h1 class="cine-title" id="dash-h">Every move in<br><span class="grad-text">point-of-care</span> diagnostics.</h1>
        <p class="cine-sub">${c.competitors} competitors across TBI, infectious disease and biosensor platforms, tracked every ${esc(app.state.config.refreshHours)} hours from news, FDA, clinical trials, patents and SEC filings.</p>
        <div class="cine-ctas">
          <a class="btn primary lg" href="#/competitors">Explore competitors</a>
          <button class="btn ghost lg" type="button" data-scroll="latest">Latest activity</button>
        </div>
        <div class="cine-meta">Last fetched <strong title="${esc(fmtStamp(s.lastUpdated))}">${esc(relTime(s.lastUpdated))}</strong>
          &middot; ${totalItems.toLocaleString()} dated items in 12 months${s.lastUpdated ? '' : ' &middot; click Refresh all to fetch live sources'}</div>
      </div>
      <button class="scroll-cue" type="button" data-scroll="specs" style="background:none;border:0;cursor:pointer">Scroll</button>
    </section>

    <section class="specs" id="specs" aria-label="Key numbers">
      <a class="spec" href="#/competitors"><div class="value">${c.competitors}</div><div class="label">Competitors tracked</div>
        <div class="sub">${c.unrated} not yet threat-rated${c.sampleCompetitors ? ` &middot; +${c.sampleCompetitors} SAMPLE` : ''}</div></a>
      <a class="spec" href="#/search?from=${daysAgo(7)}"><div class="value">${c.itemsThisWeek}</div><div class="label">Items this week</div>
        <div class="sub">${c.newSinceLastWeek} first seen in 7 days</div></a>
      <a class="spec" href="#/search?source=fda&from=${daysAgo(30)}"><div class="value">${c.fdaThisMonth}</div><div class="label">FDA actions &middot; 30 days</div>
        <div class="sub">510(k), De Novo, PMA, recalls</div></a>
      <a class="spec" href="#/alerts"><div class="value">${c.alerts30d}</div><div class="label">Alert matches &middot; 30 days</div>
        <div class="sub">${c.highThreatCompetitors ? `${c.highThreatAlerts30d} from High-threat competitors` : 'No competitor rated High yet'}</div></a>
    </section>

    <div class="wrap">
      <section class="section" aria-labelledby="tiles-h">
        <div class="section-head"><div><div class="kicker">Last 12 months</div><h2 id="tiles-h">Most active competitors</h2>
          <p>Ranked by dated items across every source. Open any card for the full profile.</p></div>
          <a class="btn" href="#/competitors">All competitors</a></div>
        <div class="tiles">${topTiles.map((tile) => tileHtml(tile, app)).join('') || '<p class="empty">No dated items yet. Run Refresh all.</p>'}</div>
      </section>

      <section class="section" aria-labelledby="act-h">
        <div class="section-head"><div><div class="kicker">Signal volume</div><h2 id="act-h">Activity over time</h2>
          <p>Items per month by item date, all sources. Top ${MAX_SERIES} competitors by volume; the rest are grouped as Other.</p></div>
          <button class="btn" id="toggle-table" type="button" aria-pressed="false">View as table</button></div>
        <div class="card">
          <div class="chart-box" id="chart-box"><canvas id="act-chart" role="img" aria-label="Stacked bar chart of items per month for each competitor"></canvas></div>
          <div id="act-table" hidden></div>
        </div>
      </section>

      <section class="section" id="latest" aria-labelledby="feed-h">
        <div class="section-head"><div><div class="kicker">Live feed</div><h2 id="feed-h">Latest activity</h2></div>
          <div class="chips" id="feed-filter">${['all', 'news', 'fda', 'trials', 'patents', 'sec', 'intel'].map((k) =>
            `<button class="chip" type="button" data-src="${k}" aria-pressed="${k === 'all'}">${k === 'all' ? 'All' : SOURCE_LABEL[k]}</button>`).join('')}</div></div>
        <div class="card"><div id="feed"></div>
          <p style="margin:14px 0 0"><a class="btn" href="#/search">See everything in Search</a></p></div>
      </section>
    </div>`;

  main.addEventListener('click', (e) => {
    const t = e.target.closest('[data-scroll]');
    if (t) document.getElementById(t.dataset.scroll)?.scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
  });

  // living hero: the wave canvas and a gentle parallax on the headline
  startWave(main.querySelector('.wave-canvas'), { animate: motionOn() });
  const hero = main.querySelector('.cine-hero');
  const content = main.querySelector('.cine-content');
  if (motionOn()) {
    let pending = false;
    const onScroll = () => {
      if (!hero.isConnected) { window.removeEventListener('scroll', onScroll); return; }
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const y = Math.min(window.scrollY, hero.offsetHeight);
        content.style.transform = `translateY(calc(-55% + ${y * 0.35}px))`;
        content.style.opacity = String(Math.max(0, 1 - y / (hero.offsetHeight * 0.7)));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  // feed
  const renderFeed = (src) => {
    const items = src === 'all' ? s.recent : s.recent.filter((i) => i.source === src);
    main.querySelector('#feed').innerHTML = feedList(items.slice(0, 25), { rulesById: app.rulesById, empty: 'No items for this source yet.' });
  };
  renderFeed('all');
  main.querySelector('#feed-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-src]');
    if (!b) return;
    main.querySelectorAll('#feed-filter .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderFeed(b.dataset.src);
  });

  // chart data: fixed slots by volume rank at load time (colors follow the entity for this render)
  const top = s.activity.slice(0, MAX_SERIES);
  const rest = s.activity.slice(MAX_SERIES);
  const series = top.map((a, i) => ({ label: a.name, data: a.counts, slot: `--series-${i + 1}` }));
  if (rest.length) series.push({ label: `Other (${rest.length})`, data: s.months.map((_, k) => rest.reduce((n, a) => n + a.counts[k], 0)), slot: '--series-other' });

  // table view (always available; the accessible alternative to the chart)
  const tableRows = s.activity.map((a) => ({ name: a.name, total: a.counts.reduce((x, y) => x + y, 0), ...Object.fromEntries(s.months.map((m, k) => [m, a.counts[k]])) }));
  dataTable(main.querySelector('#act-table'), {
    columns: [{ key: 'name', label: 'Competitor' }, ...s.months.map((m) => ({ key: m, label: monthLabel(m), num: true })), { key: 'total', label: 'Total', num: true }],
    rows: tableRows, exportName: 'activity-by-month', sort: { key: 'total', dir: 'desc' }, empty: 'No dated items in the last 12 months.',
  });
  const btn = main.querySelector('#toggle-table');
  btn.addEventListener('click', () => {
    const show = main.querySelector('#act-table').hidden;
    main.querySelector('#act-table').hidden = !show;
    main.querySelector('#chart-box').hidden = show;
    btn.setAttribute('aria-pressed', String(show));
    btn.textContent = show ? 'View as chart' : 'View as table';
  });

  const draw = () => {
    if (chart) { chart.destroy(); chart = null; }
    const canvas = main.querySelector('#act-chart');
    if (!canvas) return;
    if (!window.Chart) {
      main.querySelector('#chart-box').innerHTML = '<p class="empty">Chart.js could not be loaded (offline?). The table view still works.</p>';
      return;
    }
    if (!series.length) {
      main.querySelector('#chart-box').innerHTML = '<p class="empty">No dated items in the last 12 months yet.</p>';
      return;
    }
    const ink2 = css('--ink-2');
    const grid = css('--grid');
    const surface = css('--surface');
    chart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: s.months.map(monthLabel),
        datasets: series.map((d) => ({
          label: d.label, data: d.data, backgroundColor: css(d.slot), borderColor: surface,
          borderWidth: { top: 2, bottom: 0, left: 0, right: 0 }, borderSkipped: false, borderRadius: 2, maxBarThickness: 28,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        // Bars grow up from the baseline, staggered by month, unless motion is off.
        animation: motionOn() ? { duration: 800, easing: 'easeOutQuart', delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * 35 + ctx.datasetIndex * 20 : 0) } : false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: ink2 }, border: { color: grid } },
          y: { stacked: true, beginAtZero: true, ticks: { color: ink2, precision: 0 }, grid: { color: grid }, border: { display: false },
            title: { display: true, text: 'Items', color: ink2 } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: ink2, boxWidth: 12, boxHeight: 12, usePointStyle: false } },
          tooltip: { filter: (ctx) => ctx.raw > 0, itemSort: (a, b) => b.raw - a.raw },
        },
      },
    });
  };
  redraw = draw;
  const box = main.querySelector('#chart-box');
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    if (window.Chart) draw(); else window.addEventListener('load', draw, { once: true });
  }, { rootMargin: '0px 0px -15% 0px' });
  io.observe(box);
}

let redraw = null;
window.addEventListener('themechange', () => { if (redraw && document.getElementById('act-chart')) redraw(); });

function daysAgo(n) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

// A dark gradient card for one competitor with a 12-month sparkline.
function tileHtml(tile, app) {
  const max = Math.max(1, ...tile.counts);
  const pts = tile.counts.map((v, i) => `${(i / (tile.counts.length - 1)) * 100},${48 - (v / max) * 44}`).join(' ');
  const gid = `sg-${tile.idx}`;
  const c = tile.c || {};
  return `<a class="tile" href="#/c/${encodeURIComponent(tile.id)}" aria-label="${esc(tile.name)}: ${tile.total} items in 12 months">
    <div class="tile-top"><div><div class="name">${esc(tile.name)}</div><div class="cat">${esc(categoryLabel(app.state, c.category))}</div></div>
      <div>${c.sample ? sampleBadge() : threatBadge(c.threat)}</div></div>
    <div class="bottom">
      <div><div class="num">${tile.total}</div><div class="num-label">Items &middot; 12 months</div></div>
      <svg class="spark" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="#8b9be8"/><stop offset="0.52" stop-color="#5fc4c8"/><stop offset="1" stop-color="#a5f2cc"/></linearGradient></defs>
        <polyline points="${pts}" fill="none" stroke="url(#${gid})" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    </div>
    <span class="go">Open profile &rarr;</span>
  </a>`;
}