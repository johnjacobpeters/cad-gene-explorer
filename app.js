(function () {
  'use strict';
  const ROOT = window.CAD;
  if (!ROOT || !ROOT.datasets || !ROOT.datasets.length) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">data.js is missing. Run build_explorer_data.py first.</p>'; return; }

  // ── shared helpers ─────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const mean = a => (a && a.length) ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const variance = a => { if (!a || a.length < 2) return NaN; const m = mean(a); return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1); };
  const lfc = (a, b) => Math.log2((a + 1) / (b + 1));
  const fold = l => Math.pow(2, Math.abs(l));
  const fmtP = p => p < 1e-3 ? p.toExponential(1) : p.toFixed(3);
  const fmtX = l => { const f = fold(l); return f >= 10 ? f.toFixed(0) + '×' : f.toFixed(1) + '×'; };
  const fmtN = v => isNaN(v) ? '-' : v.toFixed(1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Chart colours come from the CSS variables, so restyling the site only means editing style.css.
  const CSSV = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const GRID = CSSV('--grid'), ZERO = CSSV('--zero'), ACCENT = CSSV('--gold'), DIM = CSSV('--dim');
  const PLOT = { paper_bgcolor: CSSV('--s1'), plot_bgcolor: CSSV('--s1'), font: { color: CSSV('--text'), family: 'Inter,sans-serif' } };
  const CFG = { responsive: true, displayModeBar: false };
  let EXPL_CUT = 1.5;     // |log2FC| threshold when there are no statistics (per-dataset)
  const UNIT = () => (DS && DS.unit) || 'CPM';        // expression unit label (per-dataset)
  const NOREP = () => !!(DS && DS.noReplicateData);   // true when only group summaries are available
  const SINGLE = () => !!(DS && DS.singleGroup);      // one condition only: nothing to compare against

  const DATASETS = ROOT.datasets.slice();
  let DS = null, CONDS = [], CMAP = {}, GENES = {}, NAMES = [], LOWER = [];
  let current = null, logScale = false, PRIM = null, SEC = null, handlersAttached = false;

  // ── dataset activation ─────────────────────────────────────────────────────
  function activate(ds, gene) {
    DS = ds; EXPL_CUT = (ds.primary && ds.primary.cut) || 1.5; CONDS = ds.conditions; CMAP = {}; CONDS.forEach(c => CMAP[c.id] = c);
    GENES = ds.genes; NAMES = Object.keys(GENES).sort((a, b) => a.localeCompare(b)); LOWER = NAMES.map(n => n.toLowerCase());
    current = null; inp.value = '';
    renderDsChips(); renderIntro(); renderQuick(); renderThemeChips(); renderPathways();
    $('gene-panel').classList.add('hidden'); $('gene-empty').classList.remove('hidden');
    $('gene-empty').innerHTML = 'Search for a gene above, click a chip, or pick a random one to get started.';
    $('theme-panel').classList.add('hidden');
    const navBig = document.querySelector('nav a[href="#primary-sec"], nav a[href="#big"]');
    if (SINGLE()) {
      $('primary-sec').hidden = true; $('compare').classList.add('hidden');
      if (navBig) navBig.hidden = true;
    } else {
      $('primary-sec').hidden = false; if (navBig) navBig.hidden = false;
      buildPrimary(); buildSecondary();
    }
    renderCrossCheck();
    updateHash();
    if (gene) showGene(gene, false);
  }
  function updateHash() { history.replaceState(null, '', '#ds=' + DS.id + (current ? '&gene=' + encodeURIComponent(current) : '')); }

  // Tab order is fixed: the published study, then the student's own file, then the
  // single-dish backup data. The upload slot holds a placeholder until a file is loaded.
  const CHIP_ORDER = ['cevallos', 'upload', 'lab'];
  function renderDsChips() {
    const box = $('ds-chips'); box.querySelectorAll('.chip').forEach(x => x.remove());
    const add = (label, active, onClick) => {
      const b = document.createElement('button');
      b.className = 'chip theme' + (active ? ' active' : ''); b.textContent = label;
      b.addEventListener('click', onClick); box.appendChild(b);
    };
    const pick = d => add(d.chipLabel || d.title, d === DS, () => { if (d !== DS) activate(d); $('datasets').scrollIntoView({ behavior: 'smooth' }); });
    const seen = new Set();
    CHIP_ORDER.forEach(id => {
      const d = DATASETS.find(x => x.id === id);
      if (d) { seen.add(d); pick(d); }
      else if (id === 'upload') add('② ＋ your own file', false, () => $('upload').scrollIntoView({ behavior: 'smooth' }));
    });
    DATASETS.forEach(d => { if (!seen.has(d)) pick(d); });   // anything new still gets a chip
  }
  function renderIntro() {
    $('ds-title').textContent = DS.title; $('ds-tagline').textContent = DS.tagline || '';
    $('cond-legend').innerHTML = CONDS.map(c => `<span title="${esc(c.desc || '')}"><i style="background:${c.color}"></i>${esc(c.label)} <span class="hint">(n=${c.n})</span></span>`).join('');
    $('s-genes').textContent = DS.summary.nGenes.toLocaleString();
    const upTile = $('s-up').closest('.stat'), dnTile = $('s-dn').closest('.stat');
    if (upTile) upTile.hidden = SINGLE(); if (dnTile) dnTile.hidden = SINGLE();
    $('s-up').textContent = DS.summary.nUp.toLocaleString(); $('s-dn').textContent = DS.summary.nDn.toLocaleString();
    $('s-up-l').textContent = DS.summary.upLabel; $('s-dn-l').textContent = DS.summary.dnLabel;
  }
  function renderQuick() {
    const box = $('quick-chips'); box.querySelectorAll('.chip').forEach(x => x.remove());
    (DS.quick || []).filter(g => GENES[g]).forEach(g => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = g; b.dataset.g = g; b.addEventListener('click', () => pick(g)); box.appendChild(b); });
  }

  // ── gene stats ─────────────────────────────────────────────────────────────
  function geneStats(name) {
    const g = GENES[name], m = {}; CONDS.forEach(c => m[c.id] = mean(g.cpm[c.id] || []));
    const P = DS.primary, S = DS.secondary, de = g.de || null;
    return { name, g, m, de, lfcP: (P.hasStats && de) ? de.lfc : lfc(m[P.num], m[P.den]), lfcS: S ? lfc(m[S.num], m[S.den]) : NaN };
  }
  function sigClass(s) {
    if (DS.primary.hasStats) { if (!s.de) return 'ns'; return (s.de.padj < 0.05 && Math.abs(s.de.lfc) > 1) ? (s.de.lfc > 0 ? 'up' : 'dn') : 'ns'; }
    return Math.abs(s.lfcP) > EXPL_CUT ? (s.lfcP > 0 ? 'up' : 'dn') : 'ns';
  }
  function resolveName(q) { if (GENES[q]) return q; const i = LOWER.indexOf(String(q).toLowerCase()); return i >= 0 ? NAMES[i] : null; }

  // ── search ─────────────────────────────────────────────────────────────────
  const inp = $('gene-search'), sugg = $('sugg');
  let matches = [], hl = -1;
  function findMatches(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    const starts = [], contains = [];
    for (let i = 0; i < LOWER.length; i++) { const n = LOWER[i]; if (n.startsWith(q)) starts.push(NAMES[i]); else if (contains.length < 8 && n.includes(q)) contains.push(NAMES[i]); if (starts.length >= 8) break; }
    return starts.concat(contains).slice(0, 8);
  }
  function renderSugg() {
    if (!matches.length) { sugg.style.display = 'none'; return; }
    const P = DS.primary;
    sugg.innerHTML = matches.map((n, i) => {
      const s = geneStats(n), sc = sigClass(s);
      const tag = sc === 'up' ? `<span class="pill pill-up">↑ ${P.numShort}</span>` : sc === 'dn' ? `<span class="pill pill-dn">↓ ${P.numShort}</span>` : '<span class="pill pill-ns">little change</span>';
      return `<div class="${i === hl ? 'hl' : ''}" data-g="${esc(n)}"><span>${esc(n)}</span>${tag}</div>`;
    }).join('');
    sugg.style.display = 'block';
    sugg.querySelectorAll('div').forEach(d => d.addEventListener('mousedown', e => { e.preventDefault(); pick(d.dataset.g); }));
  }
  function pick(n) { sugg.style.display = 'none'; inp.value = n; showGene(n, true); }
  inp.addEventListener('input', () => { matches = findMatches(inp.value); hl = -1; renderSugg(); });
  inp.addEventListener('focus', () => { if (inp.value) { matches = findMatches(inp.value); renderSugg(); } });
  inp.addEventListener('blur', () => setTimeout(() => sugg.style.display = 'none', 150));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, matches.length - 1); renderSugg(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, -1); renderSugg(); e.preventDefault(); }
    else if (e.key === 'Enter') { const n = hl >= 0 ? matches[hl] : (resolveName(inp.value) || matches[0]); if (n) pick(n); else showNotFound(inp.value); e.preventDefault(); }
    else if (e.key === 'Escape') { sugg.style.display = 'none'; }
  });
  $('btn-random').addEventListener('click', () => {
    const pool = Array.from(new Set([].concat(DS.top.up, DS.top.down, ...DS.sets.map(s => s.genes)))).filter(g => GENES[g]);
    if (pool.length) pick(pool[Math.floor(Math.random() * pool.length)]);
  });
  $('log-toggle').addEventListener('change', e => { logScale = e.target.checked; if (current) renderGeneChart(geneStats(current)); });

  // ── gene panel ─────────────────────────────────────────────────────────────
  function showNotFound(q) {
    $('gene-panel').classList.add('hidden'); const el = $('gene-empty'); el.classList.remove('hidden');
    el.innerHTML = `<strong>"${esc(q)}"</strong> isn't in this dataset. It may not be a gene symbol, or it wasn't expressed in these cells (only genes with at least 1 CPM somewhere are included). Mouse symbols look like <span class="mono">Cdk1</span>, not <span class="mono">CDK1</span>.`;
  }
  function showGene(name, scroll) {
    const n = resolveName(name); if (!n) { showNotFound(name); return; }
    current = n; const s = geneStats(n), P = DS.primary, S = DS.secondary; updateHash();
    $('gene-empty').classList.add('hidden'); $('gene-panel').classList.remove('hidden');
    $('g-name').textContent = n;
    const sc = sigClass(s), badges = [];
    if (SINGLE()) {
      const v = s.m[P.num];
      badges.push(`<span class="pill ${v >= 100 ? 'pill-up' : v >= 10 ? 'pill-purple' : 'pill-ns'}">${fmtN(v)} ${esc(UNIT())}</span>`);
    } else if (P.hasStats) {
      if (sc === 'up') badges.push(`<span class="pill pill-up">↑ ${fmtX(s.de.lfc)} up in ${esc(P.numShort)}</span>`);
      if (sc === 'dn') badges.push(`<span class="pill pill-dn">↓ ${fmtX(s.de.lfc)} down in ${esc(P.numShort)}</span>`);
      if (sc === 'ns' && s.de) badges.push(`<span class="pill pill-ns">not significantly changed</span>`);
      if (!s.de) badges.push('<span class="pill pill-ns">too few reads to test</span>');
    } else {
      if (sc === 'up') badges.push(`<span class="pill pill-up">↑ ${fmtX(s.lfcP)} higher in ${esc(P.numShort)} (no stats)</span>`);
      if (sc === 'dn') badges.push(`<span class="pill pill-dn">↓ ${fmtX(s.lfcP)} lower in ${esc(P.numShort)} (no stats)</span>`);
      if (sc === 'ns') badges.push('<span class="pill pill-ns">little change</span>');
    }
    if (S && Math.abs(s.lfcS) > EXPL_CUT) badges.push(`<span class="pill pill-new">${s.lfcS > 0 ? '↑' : '↓'} ${fmtX(s.lfcS)} in ${esc(S.numShort)} (1 sample)</span>`);
    DS.sets.forEach(st => { if (st.genes.includes(n)) badges.push(`<span class="pill pill-purple">${esc(st.title.split(': ')[0])}</span>`); });
    $('g-badges').innerHTML = badges.join(' ');
    $('g-sub').textContent = SINGLE()
      ? `${esc(P.numShort)}: ${fmtN(s.m[P.num])} ${UNIT()} across ${(s.g.cpm[P.num] || []).length} sample(s). One condition only, so there is nothing to compare against.`
      : P.hasStats
      ? (s.de ? `${P.statsName} (${P.label}): log₂FC ${s.de.lfc > 0 ? '+' : ''}${s.de.lfc.toFixed(2)}, adjusted p = ${fmtP(s.de.padj)}, average expression ${s.de.bm.toFixed(0)}` : 'This gene had too few reads to be tested statistically.')
      : `${P.label}: log₂FC ${s.lfcP > 0 ? '+' : ''}${s.lfcP.toFixed(2)}, descriptive only (one dish per condition, no statistical test).`;
    $('g-cards').innerHTML = CONDS.map(c => { const k = NOREP() ? c.n : (s.g.cpm[c.id] || []).length; return `<div class="stat" style="border-top-color:${c.color}"><div class="v">${fmtN(s.m[c.id])}</div><div class="l">${esc(c.short)} · ${esc(UNIT())}<br><span style="text-transform:none;letter-spacing:0">${k} dish${k === 1 ? '' : 'es'}${NOREP() ? ' (est.)' : ''}</span></div></div>`; }).join('');
    $('g-cards').className = 'cond-cards ' + (CONDS.length <= 3 ? 'grid3' : 'grid5');
    renderGeneChart(s); $('g-verdict').innerHTML = verdict(s);
    $('g-link').textContent = location.href.split('#')[0] + '#ds=' + DS.id + '&gene=' + n;
    drawPrimary(); drawSecondary();
    if (scroll) $('gene-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderGeneChart(s) {
    const xs = [], ys = [], cols = [], txt = [], U = UNIT();
    if (!NOREP()) CONDS.forEach((c, i) => { const arr = s.g.cpm[c.id] || []; arr.forEach((v, j) => { xs.push(i + (j - (arr.length - 1) / 2) * 0.14); ys.push(v); cols.push(c.color); txt.push(`${c.label} · dish ${j + 1}<br>${v.toFixed(1)} ${U}`); }); });
    const traces = [{ type: 'bar', x: CONDS.map((c, i) => i), y: CONDS.map(c => s.m[c.id]), marker: { color: CONDS.map(c => c.color), opacity: NOREP() ? .75 : .45 }, name: NOREP() ? 'group average' : 'average', hovertemplate: 'average %{y:.1f} ' + U + '<extra></extra>', width: .6 }];
    if (!NOREP()) traces.push({ type: 'scatter', mode: 'markers', x: xs, y: ys, text: txt, hoverinfo: 'text', marker: { color: cols, size: 12, line: { width: 2, color: CSSV('--s1') } }, name: 'each dish' });
    const note = $('chart-note'); if (note) note.innerHTML = NOREP()
      ? 'Bars are <strong>group averages reconstructed</strong> from the published summary table. The individual dish values were not deposited, so no dots are shown.'
      : 'Bars = average · dots = each individual dish (replicate)';
    Plotly.react('gene-chart', traces, Object.assign({}, PLOT, {
      xaxis: { tickvals: CONDS.map((c, i) => i), ticktext: CONDS.map(c => c.label), gridcolor: GRID, range: [-0.6, CONDS.length - 0.4] },
      yaxis: { title: logScale ? U + ' (log scale)' : U, type: logScale ? 'log' : 'linear', gridcolor: GRID, rangemode: 'tozero' },
      showlegend: !NOREP(), legend: { orientation: 'h', y: 1.15, bgcolor: 'rgba(0,0,0,0)' }, margin: { t: 30, r: 20, b: 55, l: 60 }, hovermode: 'closest'
    }), CFG);
  }
  function verdict(s) {
    const P = DS.primary, S = DS.secondary, out = [];
    if (SINGLE()) {
      const v = s.m[P.num];
      const level = v >= 100 ? 'Strongly expressed.' : v >= 10 ? 'Moderately expressed.'
                  : v >= 1 ? 'Weakly expressed.' : 'Essentially off.';
      return '<div class="verdict" style="border-color:var(--muted)"><strong>' + fmtN(v) + ' ' + esc(UNIT())
        + '</strong> in ' + esc(P.numShort) + '. ' + level
        + ' With one condition there is no fold change and no statistical test.</div>';
    }
    const den = s.m[P.den], num = s.m[P.num], nd = CMAP[P.den], nn = CMAP[P.num];
    if (P.hasStats) {
      if (s.de && s.de.padj < 0.05 && Math.abs(s.de.lfc) > 1) {
        out.push(`<div class="verdict" style="border-color:${s.de.lfc > 0 ? '#e05252' : '#4a90d9'}"><strong>This gene changed significantly.</strong> It is about <strong>${fmtX(s.de.lfc)} ${s.de.lfc > 0 ? 'higher' : 'lower'}</strong> in ${esc(nn.label)} than in ${esc(nd.label)} (${fmtN(den)} → ${fmtN(num)} ${UNIT()}). Adjusted p = ${fmtP(s.de.padj)} from ${nd.n} vs ${nn.n} dishes, so this is very unlikely to be luck.${P.statsNote ? ' <span class="hint">' + esc(P.statsNote) + '</span>' : ''}</div>`);
      } else if (s.de) {
        out.push(`<div class="verdict" style="border-color:var(--muted)"><strong>No significant change.</strong> ${esc(nd.label)} ${fmtN(den)} vs ${esc(nn.label)} ${fmtN(num)} ${UNIT()} (log₂FC ${s.de.lfc > 0 ? '+' : ''}${s.de.lfc.toFixed(2)}, adjusted p = ${fmtP(s.de.padj)}). Any difference is within the natural dish-to-dish wobble, or smaller than the 2× cutoff.</div>`);
      } else {
        out.push(`<div class="verdict" style="border-color:var(--muted)"><strong>Not enough reads to test.</strong> This gene is expressed too weakly to judge reliably.</div>`);
      }
    } else {
      const big = Math.abs(s.lfcP) > EXPL_CUT, hi = Math.max(den, num);
      if (big) out.push(`<div class="verdict" style="border-color:${s.lfcP > 0 ? '#e05252' : '#4a90d9'}"><strong>This gene is about ${fmtX(s.lfcP)} ${s.lfcP > 0 ? 'higher' : 'lower'} in ${esc(nn.label)}</strong> than in ${esc(nd.label)} (${fmtN(den)} → ${fmtN(num)} ${UNIT()}). With <strong>one dish per condition there is no statistical test</strong>, so this is an observation to follow up, not a proven result.${hi < 10 ? ' And it is weakly expressed, so the ratio is noisy: treat with extra caution.' : ' It is solidly expressed, which makes the ratio more trustworthy.'}</div>`);
      else out.push(`<div class="verdict" style="border-color:var(--muted)"><strong>Little change.</strong> ${esc(nd.label)} ${fmtN(den)} vs ${esc(nn.label)} ${fmtN(num)} ${UNIT()} (log₂FC ${s.lfcP > 0 ? '+' : ''}${s.lfcP.toFixed(2)}), below the ${fold(EXPL_CUT).toFixed(1)}× line we use for "worth noticing" when there are no replicates.</div>`);
    }
    if (S) {
      const sd = s.m[S.den], sn = s.m[S.num], big = Math.abs(s.lfcS) > EXPL_CUT, oldBig = Math.abs(s.lfcP) > EXPL_CUT;
      if (big) out.push(`<div class="verdict" style="border-color:#00b894"><strong>${esc(CMAP[S.num].label)} looks different from ${esc(CMAP[S.den].label)} here</strong>, about ${fmtX(s.lfcS)} ${s.lfcS > 0 ? 'higher' : 'lower'} (${fmtN(sd)} → ${fmtN(sn)} ${UNIT()}). ${esc(S.note)}</div>`);
      else out.push(`<div class="verdict" style="border-color:#00b894"><strong>${esc(CMAP[S.num].label)} looks about the same as ${esc(CMAP[S.den].label)}</strong> for this gene (${fmtN(sd)} vs ${fmtN(sn)} ${UNIT()}).</div>`);
      if (oldBig && !big) out.push(`<div class="verdict" style="border-color:var(--gold)"><strong>The key contrast:</strong> ${esc(nn.label)} moved this gene a lot, ${esc(CMAP[S.num].label)} barely touched it. ${esc(S.contrastNote || '')}</div>`);
      else if (oldBig && big && Math.sign(s.lfcP) === Math.sign(s.lfcS)) out.push(`<div class="verdict" style="border-color:var(--gold)"><strong>Both moved this gene the same way.</strong> Because they were sequenced in different batches, agreement like this is <em>more</em> believable, since it points to a shared effect.</div>`);
      else if (!oldBig && big) out.push(`<div class="verdict" style="border-color:var(--gold)"><strong>Only ${esc(CMAP[S.num].label)} moved this gene.</strong> Interesting, but with one sample in a separate batch, this is exactly the kind of change that could also be a batch effect. The way to find out: repeat with replicates.</div>`);
    }
    return out.join('');
  }

  // ── primary plot: volcano (stats) or MA (no stats) ─────────────────────────
  function buildPrimary() {
    const P = DS.primary, x = [], y = [], n = [], col = [];
    NAMES.forEach(name => {
      const s = geneStats(name), sc = sigClass(s), c = sc === 'up' ? '#e05252' : sc === 'dn' ? '#4a90d9' : DIM;
      if (P.hasStats) { const d = s.de; if (!d || !(d.padj > 0)) return; x.push(d.lfc); y.push(Math.min(-Math.log10(d.padj), 300)); }
      else { const a = (s.m[P.num] + s.m[P.den]) / 2; if (!(a > 1)) return; x.push(Math.log2(a + 1)); y.push(s.lfcP); }
      n.push(name); col.push(c);
    });
    PRIM = { x, y, n, col };
    if (P.hasStats) {
      $('primary-title').textContent = 'Volcano plot: every gene at once';
      $('primary-legend').innerHTML = `Red = significantly up in ${esc(P.numShort)} · Blue = significantly down · Grey = no significant change · Dashed line = p<sub>adj</sub> 0.05`;
    } else {
      $('primary-title').textContent = 'MA plot: every gene at once (no p-values with n=1)';
      $('primary-legend').innerHTML = `Red = more than ${fold(EXPL_CUT).toFixed(1)}× higher in ${esc(P.numShort)} · Blue = more than ${fold(EXPL_CUT).toFixed(1)}× lower · Grey = smaller change`;
    }
    drawPrimary();
    if (!handlersAttached) { $('primary-plot').on('plotly_click', e => { const p = e.points && e.points[0]; if (p && p.customdata) showGene(p.customdata, true); }); }
  }
  function drawPrimary() {
    if (!PRIM) return; const P = DS.primary;
    const t = [{ type: 'scattergl', mode: 'markers', x: PRIM.x, y: PRIM.y, text: PRIM.n, customdata: PRIM.n, marker: { color: PRIM.col, size: 5, opacity: .7 },
      hovertemplate: P.hasStats ? '<b>%{text}</b><br>log₂FC %{x:.2f}<br>−log₁₀ p %{y:.1f}<extra></extra>' : '<b>%{text}</b><br>expression %{x:.1f}<br>log₂FC %{y:.2f}<extra></extra>' }];
    if (current) {
      const s = geneStats(current); let px = null, py = null;
      if (P.hasStats) { if (s.de) { px = s.de.lfc; py = Math.min(-Math.log10(s.de.padj), 300); } }
      else { px = Math.log2((s.m[P.num] + s.m[P.den]) / 2 + 1); py = s.lfcP; }
      if (px !== null) t.push({ type: 'scatter', mode: 'markers+text', x: [px], y: [py], text: [current], textposition: 'top center', textfont: { color: ACCENT, size: 13 }, marker: { color: ACCENT, size: 14, line: { width: 2, color: '#fff' } }, hoverinfo: 'skip', customdata: [current] });
    }
    const lay = Object.assign({}, PLOT, { showlegend: false, margin: { t: 20, r: 20, b: 55, l: 65 }, hovermode: 'closest' });
    if (P.hasStats) {
      lay.xaxis = { title: `log₂ fold change (${P.numShort} ÷ ${P.denShort})`, gridcolor: GRID, zerolinecolor: ZERO };
      lay.yaxis = { title: '−log₁₀ adjusted p-value (confidence)', gridcolor: GRID };
      lay.shapes = [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 1.301, y1: 1.301, line: { color: '#fff', dash: 'dash', width: 1 } },
        { type: 'line', x0: 1, x1: 1, y0: 0, y1: 1, yref: 'paper', line: { color: '#e05252', dash: 'dot', width: 1 } },
        { type: 'line', x0: -1, x1: -1, y0: 0, y1: 1, yref: 'paper', line: { color: '#4a90d9', dash: 'dot', width: 1 } }];
    } else {
      lay.xaxis = { title: 'log₂ average expression (how strongly the gene is on)', gridcolor: GRID };
      lay.yaxis = { title: `log₂ fold change (${P.numShort} ÷ ${P.denShort})`, gridcolor: GRID, zerolinecolor: ZERO };
      lay.shapes = [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: EXPL_CUT, y1: EXPL_CUT, line: { color: '#e05252', dash: 'dot', width: 1 } },
        { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: -EXPL_CUT, y1: -EXPL_CUT, line: { color: '#4a90d9', dash: 'dot', width: 1 } }];
    }
    Plotly.react('primary-plot', t, lay, CFG);
  }

  // ── secondary plot (concordance) ───────────────────────────────────────────
  function buildSecondary() {
    const S = DS.secondary, sec = $('compare'), nav = $('nav-compare');
    if (!S) { sec.classList.add('hidden'); nav.classList.add('hidden'); SEC = null; return; }
    sec.classList.remove('hidden'); nav.classList.remove('hidden');
    $('sec-title').textContent = S.title; $('sec-note').innerHTML = S.warn || '';
    const P = DS.primary, x = [], y = [], n = [], col = [];
    NAMES.forEach(name => { const s = geneStats(name); if (!(s.m[P.num] > 2 || s.m[P.den] > 2 || s.m[S.num] > 2)) return; x.push(s.lfcP); y.push(s.lfcS); n.push(name); col.push(s.lfcP > EXPL_CUT ? '#e05252' : s.lfcP < -EXPL_CUT ? '#4a90d9' : DIM); });
    SEC = { x, y, n, col }; drawSecondary();
    if (!handlersAttached) { $('sec-plot').on('plotly_click', e => { const p = e.points && e.points[0]; if (p && p.customdata) showGene(p.customdata, true); }); }
  }
  function drawSecondary() {
    if (!SEC || !DS.secondary) return; const P = DS.primary, S = DS.secondary;
    const t = [{ type: 'scattergl', mode: 'markers', x: SEC.x, y: SEC.y, text: SEC.n, customdata: SEC.n, hovertemplate: `<b>%{text}</b><br>${P.numShort} log₂FC %{x:.2f}<br>${S.numShort} log₂FC %{y:.2f}<extra></extra>`, marker: { color: SEC.col, size: 5, opacity: .65 } }];
    if (current) { const s = geneStats(current); t.push({ type: 'scatter', mode: 'markers+text', x: [s.lfcP], y: [s.lfcS], text: [current], textposition: 'top center', textfont: { color: ACCENT, size: 13 }, marker: { color: ACCENT, size: 14, line: { width: 2, color: '#fff' } }, hoverinfo: 'skip', customdata: [current] }); }
    Plotly.react('sec-plot', t, Object.assign({}, PLOT, {
      xaxis: { title: `${P.numShort} vs ${P.denShort} (log₂FC)`, gridcolor: GRID, zerolinecolor: ZERO },
      yaxis: { title: `${S.numShort} vs ${S.denShort} (log₂FC)`, gridcolor: GRID, zerolinecolor: ZERO },
      showlegend: false, margin: { t: 20, r: 20, b: 55, l: 65 }, hovermode: 'closest',
      shapes: [{ type: 'line', x0: -7, x1: 9, y0: -7, y1: 9, line: { color: 'rgba(111,66,193,.45)', dash: 'dash', width: 1.5 } }],
      annotations: [{ text: 'same effect in both', x: 6.2, y: 6.9, showarrow: false, font: { color: CSSV('--accent-soft'), size: 11 }, textangle: -36 }]
    }), CFG);
  }

  // ── themes ─────────────────────────────────────────────────────────────────
  function renderThemeChips() {
    $('theme-chips').innerHTML = DS.sets.map((s, i) => `<button class="chip theme" data-i="${i}">${esc(s.title.split(': ')[0])}</button>`).join('');
    $('theme-chips').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { $('theme-chips').querySelectorAll('.chip').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderTheme(DS.sets[+b.dataset.i]); }));
  }
  function renderTheme(set) {
    const P = DS.primary, S = DS.secondary;
    $('theme-panel').classList.remove('hidden'); $('theme-title').textContent = set.title;
    if (SINGLE()) {
      $('theme-head').innerHTML = `<th>Gene</th><th>${esc(CMAP[P.num].short)}</th><th>Level</th>`;
      $('theme-tbody').innerHTML = set.genes.filter(g => GENES[g]).map(g => {
        const v = geneStats(g).m[P.num];
        const lab = v >= 100 ? '<span class="pill pill-up">high</span>' : v >= 10 ? '<span class="pill pill-purple">moderate</span>' : v >= 1 ? '<span class="pill pill-ns">low</span>' : '<span class="pill pill-ns">off</span>';
        return `<tr class="rowlink" data-g="${esc(g)}"><td class="mono" style="font-weight:600">${esc(g)}</td><td class="mono">${fmtN(v)}</td><td>${lab}</td></tr>`;
      }).join('');
      $('theme-tbody').querySelectorAll('tr').forEach(r => r.addEventListener('click', () => pick(r.dataset.g)));
      const tf0 = document.getElementById('theme-foot'); if (tf0) tf0.textContent = 'Average ' + UNIT();
      return;
    }
    $('theme-head').innerHTML = `<th>Gene</th><th>${esc(CMAP[P.den].short)}</th><th>${esc(CMAP[P.num].short)}</th>${S ? `<th>${esc(CMAP[S.num].short)}</th>` : ''}<th>${esc(P.numShort)} vs ${esc(P.denShort)}</th>${S ? `<th>${esc(S.numShort)} vs ${esc(S.denShort)}</th>` : ''}<th>Verdict</th>`;
    $('theme-tbody').innerHTML = set.genes.filter(g => GENES[g]).map(g => {
      const s = geneStats(g), sc = sigClass(s);
      const vP = sc === 'up' ? `<span class="pill pill-up">↑ ${fmtX(s.lfcP)}</span>` : sc === 'dn' ? `<span class="pill pill-dn">↓ ${fmtX(s.lfcP)}</span>` : `<span class="pill pill-ns">${P.hasStats ? 'n.s.' : '≈ same'}</span>`;
      let vS = '', v = '';
      if (S) {
        vS = `<td>${Math.abs(s.lfcS) > EXPL_CUT ? `<span class="pill pill-new">${s.lfcS > 0 ? '↑' : '↓'} ${fmtX(s.lfcS)}</span>` : '<span class="pill pill-ns">≈ ctrl</span>'}</td>`;
        if (sc !== 'ns' && Math.abs(s.lfcS) <= EXPL_CUT) v = `${P.numShort} only`; else if (sc !== 'ns' && Math.abs(s.lfcS) > EXPL_CUT && Math.sign(s.lfcP) === Math.sign(s.lfcS)) v = 'both (shared)'; else if (sc === 'ns' && Math.abs(s.lfcS) > EXPL_CUT) v = `${S.numShort} only (hint)`; else v = 'flat';
      } else v = sc === 'up' ? `higher in ${P.numShort}` : sc === 'dn' ? `lower in ${P.numShort}` : 'flat';
      return `<tr class="rowlink" data-g="${esc(g)}"><td class="mono" style="font-weight:600">${esc(g)}</td><td class="mono">${fmtN(s.m[P.den])}</td><td class="mono">${fmtN(s.m[P.num])}</td>${S ? `<td class="mono">${fmtN(s.m[S.num])}</td>` : ''}<td>${vP}</td>${vS}<td class="hint">${v}</td></tr>`;
    }).join('');
    $('theme-tbody').querySelectorAll('tr').forEach(r => r.addEventListener('click', () => pick(r.dataset.g)));
    const tf = document.getElementById('theme-foot'); if (tf) tf.textContent = 'Values are average ' + UNIT() + (NOREP() ? ' (reconstructed group means).' : '.') + ' Click a row to open that gene.';
  }

  // ── pathway enrichment + STRING network ────────────────────────────────────
  let enrDir = 'up';
  function switchEnr(d) {
    enrDir = d;
    $('enr-up-btn').className = 'dir-btn' + (d === 'up' ? ' up-active' : '');
    $('enr-dn-btn').className = 'dir-btn' + (d === 'dn' ? ' dn-active' : '');
    drawEnr();
  }
  window.switchEnr = switchEnr;

  function renderPathways() {
    const sec = $('pathways'), navP = document.querySelector('nav a[href="#pathways"]');
    const has = !!(DS.enrich && ((DS.enrich.up || []).length || (DS.enrich.dn || []).length));
    sec.classList.toggle('hidden', !has);
    if (navP) navP.classList.toggle('hidden', !has);
    if (!has) return;
    const P = DS.primary;
    $('enr-up-btn').textContent = '↑ Up in ' + P.numShort;
    $('enr-dn-btn').textContent = '↓ Down in ' + P.numShort;
    $('enr-how').textContent = DS.enrich.how || '';
    switchEnr('up');
  }

  function drawEnr() {
    const list = (DS.enrich && DS.enrich[enrDir]) || [], box = $('enr-box');
    if (!list.length) {
      box.innerHTML = '<p class="hint" style="padding:14px">No pathway came out significant in this direction. With few genes (or few replicates) that is common. It means "not enough evidence", not "nothing happened".</p>';
      return;
    }
    const color = enrDir === 'up' ? '#e05252' : '#4a90d9';
    const maxN = Math.max(...list.map(t => t.nlp));
    const dbs = [...new Set(list.map(t => t.db))];
    box.innerHTML = dbs.map(db => {
      const ts = list.filter(t => t.db === db);
      return '<div class="enr-group"><div class="enr-db">' + esc(db) + '</div>' + ts.map(t => {
        const w = Math.max(3, t.nlp / maxN * 100).toFixed(1);
        const ps = t.p < 1e-4 ? t.p.toExponential(1) : t.p.toFixed(4);
        const genes = (t.genes || '').split(';').filter(Boolean);
        return '<div class="enr-row">'
          + '<div class="enr-term" title="click to show genes">' + esc(t.term) + '</div>'
          + '<div class="enr-bar"><div class="enr-fill" style="width:' + w + '%;background:' + color + '99"></div></div>'
          + '<div class="enr-p">' + ps + '</div><div class="enr-ov">' + esc(t.overlap) + '</div>'
          + '<div class="enr-genes">' + genes.map(g => '<span class="g" data-g="' + esc(g) + '">' + esc(g) + '</span>').join('') + '</div>'
          + '</div>';
      }).join('') + '</div>';
    }).join('');
    box.querySelectorAll('.enr-term').forEach(el => el.addEventListener('click', () => el.parentElement.classList.toggle('open')));
    box.querySelectorAll('.enr-genes .g').forEach(el => el.addEventListener('click', () => {
      // Enrichr returns UPPERCASE symbols; match back to this dataset's casing
      const n = resolveName(el.dataset.g) || resolveName(el.dataset.g.charAt(0) + el.dataset.g.slice(1).toLowerCase());
      if (n) pick(n); else showNotFound(el.dataset.g);
    }));
  }

  // ── cross-check an uploaded dataset against the published study ────────────
  const LANDMARKS = [
    ['Id3', 'blocks differentiation, the classic hit'],
    ['Id2', 'blocks differentiation'],
    ['Id1', 'blocks differentiation'],
    ['Dkk1', 'Wnt inhibitor'],
    ['Slit3', 'axon guidance cue'],
    ['Dbh', 'makes noradrenaline'],
    ['Sctr', 'secretin receptor'],
    ['Cdk1', 'drives cell division'],
    ['Rrm2', 'DNA building blocks'],
    ['Mki67', 'proliferation marker'],
    ['Gng4', 'neuronal signalling'],
    ['Gap43', 'axon growth'],
    ['Pcp4', 'neuronal calcium signalling'],
    ['Thy1', 'neuronal surface protein'],
    ['Gapdh', 'housekeeping, should barely move'],
    ['Actb', 'housekeeping, should barely move'],
  ];

  // gene -> {lfc, padj, expr} for any dataset, keyed by UPPERCASE symbol
  function lfcMap(ds) {
    const P = ds.primary, out = {};
    Object.keys(ds.genes).forEach(n => {
      const g = ds.genes[n];
      const a = mean(g.cpm[P.den] || []), b = mean(g.cpm[P.num] || []);
      const l = (P.hasStats && g.de) ? g.de.lfc : lfc(b, a);
      if (isFinite(l)) out[n.toUpperCase()] = { lfc: l, padj: g.de ? g.de.padj : null, expr: (a + b) / 2, name: n };
    });
    return out;
  }
  function pearson(x, y) {
    const n = x.length; if (n < 3) return NaN;
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  // P(X >= k) for the hypergeometric: how surprising is an overlap of k?
  function hyperSF(k, N, K, n) {
    const lg = lgamma, lc = (a, b) => lg(a + 1) - lg(b + 1) - lg(a - b + 1);
    let p = 0; const top = Math.min(K, n);
    for (let i = k; i <= top; i++) p += Math.exp(lc(K, i) + lc(N - K, n - i) - lc(N, n));
    return Math.min(1, Math.max(0, p));
  }

  function computeCrossCheck(ds) {
    const pub = DATASETS.find(d => d.id === 'cevallos');
    if (!pub) return null;
    const A = lfcMap(ds), B = lfcMap(pub);
    const rows = [];
    Object.keys(A).forEach(k => { if (B[k]) rows.push({ sym: k, name: A[k].name, you: A[k].lfc, pub: B[k].lfc, pubP: B[k].padj, expr: A[k].expr }); });
    if (rows.length < 30) return { tooFew: true, n: rows.length };
    const expressed = rows.filter(r => r.expr >= 5);
    const base = expressed.length >= 200 ? expressed : rows;
    const pubSig = base.filter(r => r.pubP != null && r.pubP < 0.05 && Math.abs(r.pub) > 1);
    const rAll = pearson(base.map(r => r.you), base.map(r => r.pub));
    const rSig = pubSig.length >= 20 ? pearson(pubSig.map(r => r.you), pubSig.map(r => r.pub)) : NaN;
    const dirSig = pubSig.length ? pubSig.filter(r => Math.sign(r.you) === Math.sign(r.pub)).length / pubSig.length : NaN;
    // top-100 overlap in each direction
    const K = Math.min(100, Math.floor(base.length / 10));
    const byYou = base.slice().sort((a, b) => a.you - b.you), byPub = base.slice().sort((a, b) => a.pub - b.pub);
    const setDn = new Set(byPub.slice(0, K).map(r => r.sym)), setUp = new Set(byPub.slice(-K).map(r => r.sym));
    const ovDn = byYou.slice(0, K).filter(r => setDn.has(r.sym)).length;
    const ovUp = byYou.slice(-K).filter(r => setUp.has(r.sym)).length;
    const expect = K * K / base.length, ov = ovUp + ovDn;
    const enrich = expect > 0 ? (ov / 2) / expect : NaN;
    const pOv = hyperSF(Math.round(ov / 2), base.length, K, K);
    // quadrant counts on genes that moved appreciably in both
    const moved = base.filter(r => Math.abs(r.you) > 0.5 && Math.abs(r.pub) > 0.5);
    const agreeMoved = moved.length ? moved.filter(r => Math.sign(r.you) === Math.sign(r.pub)).length / moved.length : NaN;
    const markers = LANDMARKS.map(([g, what]) => {
      const r = rows.find(x => x.sym === g.toUpperCase());
      return r ? { gene: r.name, what, you: r.you, pub: r.pub, pubP: r.pubP } : null;
    }).filter(Boolean);
    return { n: base.length, nSig: pubSig.length, rAll, rSig, dirSig, K, ovUp, ovDn, expect, enrich, pOv,
             moved: moved.length, agreeMoved, markers, points: base };
  }

  function renderCrossCheck() {
    const sec = $('crosscheck'), nav = $('nav-crosscheck');
    const show = DS && !DS.singleGroup && (DS.id === 'upload' || DS.id === 'lab');
    sec.classList.toggle('hidden', !show); if (nav) nav.classList.toggle('hidden', !show);
    if (!show) return;
    const pct = v => isNaN(v) ? '-' : (100 * v).toFixed(0) + '%';
    // the same panel serves an uploaded file and the built-in backup data, so it says which
    const isUp = DS.id === 'upload';
    const MINE = isUp ? 'your data' : 'the backup data';
    const MINE_CAP = isUp ? 'Your' : 'The backup data\u2019s';
    $('cc-h2').textContent = isUp ? 'Does your result match the published study?'
                                  : 'Does the backup data match the published study?';
    $('cc-th-you').textContent = isUp ? 'Your log\u2082FC' : 'Backup log\u2082FC';
    const cc = computeCrossCheck(DS);
    if (!cc || cc.tooFew) {
      $('cc-stats').innerHTML = '';
      $('cc-caveat').innerHTML = 'Too few matching genes to compare.';
      $('cc-markers').innerHTML = ''; $('cc-verdict').innerHTML = ''; Plotly.purge('cc-plot'); return;
    }
    $('cc-caveat').innerHTML = DS.simulated
      ? '<strong>⚠ This file is the simulated practice dataset.</strong> It was generated <em>from</em> the published study\'s own numbers, so it will match almost perfectly by construction. That is circular: it shows the comparison working, not a real replication. Upload genuine data to get a meaningful answer.'
      : '';
    $('cc-stats').innerHTML = [
      ['color:var(--gold)', isNaN(cc.rSig) ? (isNaN(cc.rAll) ? '-' : cc.rAll.toFixed(2)) : cc.rSig.toFixed(2),
       isNaN(cc.rSig) ? 'correlation (all genes)' : 'correlation on their strong genes'],
      ['color:var(--green)', pct(cc.dirSig), 'same direction<br>on their significant genes'],
      ['color:var(--blue)', pct(cc.agreeMoved), 'same direction<br>on genes that moved in both'],
      ['color:var(--purple)', isNaN(cc.enrich) ? '-' : cc.enrich.toFixed(1) + '×', 'top-gene overlap<br>vs chance'],
    ].map(([c, v, l]) => '<div class="stat"><div class="v" style="' + c + '">' + v + '</div><div class="l">' + l + '</div></div>').join('');

    // scatter
    const sig = cc.points.filter(r => r.pubP != null && r.pubP < 0.05 && Math.abs(r.pub) > 1);
    const rest = cc.points.filter(r => !(r.pubP != null && r.pubP < 0.05 && Math.abs(r.pub) > 1));
    const mk = (d, name, color, size, op) => ({ type: 'scattergl', mode: 'markers', name,
      x: d.map(r => r.you), y: d.map(r => r.pub), text: d.map(r => r.name), customdata: d.map(r => r.name),
      hovertemplate: '<b>%{text}</b><br>' + (isUp ? 'yours' : 'backup') + ' %{x:.2f}<br>published %{y:.2f}<extra></extra>',
      marker: { color, size, opacity: op } });
    const lim = Math.max(2, Math.min(9, Math.ceil(Math.max(
      ...cc.points.map(r => Math.abs(r.you)).filter(isFinite).sort((a, b) => b - a).slice(0, 20),
      ...cc.points.map(r => Math.abs(r.pub)).filter(isFinite).sort((a, b) => b - a).slice(0, 20)))));
    Plotly.react('cc-plot', [mk(rest, 'other genes', DIM, 4, .45), mk(sig, 'significant in published', ACCENT, 5, .75)],
      Object.assign({}, PLOT, {
        xaxis: { title: (isUp ? 'YOUR' : 'BACKUP DATA') + ' log₂ fold change', gridcolor: GRID, zerolinecolor: ZERO, range: [-lim, lim] },
        yaxis: { title: 'PUBLISHED log₂ fold change', gridcolor: GRID, zerolinecolor: ZERO, range: [-lim, lim] },
        margin: { t: 16, r: 20, b: 55, l: 65 }, hovermode: 'closest',
        legend: { bgcolor: 'rgba(0,0,0,0)', y: 1.08, orientation: 'h' },
        shapes: [{ type: 'line', x0: -lim, y0: -lim, x1: lim, y1: lim, line: { color: 'rgba(111,66,193,.5)', dash: 'dash', width: 1.5 } }],
      }), CFG);
    if (!$('cc-plot').__wired) { $('cc-plot').on('plotly_click', e => { const p = e.points && e.points[0]; if (p && p.customdata) showGene(p.customdata, true); }); $('cc-plot').__wired = 1; }

    // landmark table
    $('cc-markers').innerHTML = cc.markers.map(m => {
      const agree = Math.sign(m.you) === Math.sign(m.pub);
      const bothFlat = Math.abs(m.you) < 0.3 && Math.abs(m.pub) < 0.3;
      const yoursFlat = Math.abs(m.you) < 0.3 && Math.abs(m.pub) >= 1;
      const theirsFlat = Math.abs(m.pub) < 0.3 && Math.abs(m.you) >= 1;
      const tick = bothFlat ? '<span class="pill pill-ns">both flat ✓</span>'
        : yoursFlat ? '<span class="pill pill-ns" title="' + MINE + ' shows essentially no change, so this is not really agreement">too small to tell</span>'
        : theirsFlat ? '<span class="pill pill-ns">not seen in theirs</span>'
        : agree ? '<span class="pill pill-new">✓ same direction</span>'
                : '<span class="pill pill-dn">✗ opposite</span>';
      const col = v => v > 0 ? '#e05252' : '#4a90d9';
      return '<tr class="rowlink" data-g="' + esc(m.gene) + '"><td class="mono" style="font-weight:600">' + esc(m.gene) + '</td>'
        + '<td class="hint">' + esc(m.what) + '</td>'
        + '<td class="mono" style="color:' + col(m.you) + '">' + (m.you > 0 ? '+' : '') + m.you.toFixed(2) + '</td>'
        + '<td class="mono" style="color:' + col(m.pub) + '">' + (m.pub > 0 ? '+' : '') + m.pub.toFixed(2) + '</td>'
        + '<td>' + tick + '</td></tr>';
    }).join('');
    $('cc-markers').querySelectorAll('tr').forEach(r => r.addEventListener('click', () => pick(r.dataset.g)));

    // verdict
    const r = isNaN(cc.rSig) ? cc.rAll : cc.rSig, d = cc.dirSig;
    let head, body, colr;
    if (r >= 0.5 && d >= 0.75) {
      colr = '#00b894'; head = 'Strong agreement with the published study.';
      body = MINE_CAP + ' fold changes track theirs closely (correlation ' + r.toFixed(2) + ', ' + pct(d) + ' the same direction on their significant genes), and the top-changing genes overlap theirs about ' + cc.enrich.toFixed(0) + '× more than chance would give. Two independent experiments finding the same thing is far stronger evidence than either alone.';
    } else if (r >= 0.25 || d >= 0.65) {
      colr = ACCENT; head = 'Moderate agreement: the broad story matches, the details are noisy.';
      body = 'Correlation is ' + r.toFixed(2) + ' with ' + pct(d) + ' directional agreement on their significant genes, and the top genes overlap theirs ' + cc.enrich.toFixed(1) + '× more than chance. That pattern usually means ' + (isUp ? 'your experiment is' : 'this experiment was') + ' measuring the same biology but with fewer replicates or less depth, so only the largest changes come through clearly. Trust the strongest hits; treat the absence of a gene as "not enough evidence" rather than "no change".';
    } else {
      colr = CSSV('--muted'); head = 'Little agreement with this particular study.';
      body = 'Correlation is ' + (isNaN(r) ? 'not estimable' : r.toFixed(2)) + ' and directional agreement is ' + pct(d) + ', close to a coin flip. That is entirely expected if ' + (isUp ? 'your experiment asks' : 'the experiment asked') + ' a different question: a different treatment, cell type or timepoint. It only counts as a problem if the aim was to reproduce this specific differentiation experiment.';
    }
    $('cc-verdict').innerHTML = '<div class="verdict" style="border-color:' + colr + '"><strong>' + head + '</strong> ' + body + '</div>';
  }

  // ── upload: parsing, grouping, stats ───────────────────────────────────────
  const HK = ['Actb', 'Gapdh', 'Rplp0', 'Ppia', 'B2m', 'Tbp', 'Hprt', 'ACTB', 'GAPDH', 'RPLP0', 'PPIA', 'B2M', 'TBP', 'HPRT1'];
  let UP = null; // parsed file: {samples:[{name,total}], genes:[{name,vals:[]}], hasBiotype, pcMask}
  function parseTable(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (lines.length < 2) throw new Error('The file needs a header row and at least one gene row.');
    const first = lines[0];
    const delim = first.includes('\t') ? '\t' : first.includes(',') ? ',' : first.includes(';') ? ';' : /\s+/;
    const split = l => (delim instanceof RegExp ? l.trim().split(delim) : l.split(delim)).map(v => v.trim().replace(/^"|"$/g, ''));
    const header = split(first);
    const rows = lines.slice(1).map(split).filter(r => r.length >= 2);
    const lower = header.map(h => h.toLowerCase());
    let geneCol = lower.indexOf('gene_name'); if (geneCol < 0) geneCol = lower.findIndex(h => ['gene', 'symbol', 'gene_symbol', 'genename', 'name', 'gene_id', 'id'].includes(h)); if (geneCol < 0) geneCol = 0;
    const biotypeCol = lower.indexOf('gene_biotype');
    let sampleIdx = header.map((h, i) => i).filter(i => lower[i].endsWith('_cpm'));
    let isCpmCols = sampleIdx.length > 0;
    if (!isCpmCols) {
      sampleIdx = header.map((h, i) => i).filter(i => i !== geneCol && i !== biotypeCol && !lower[i].endsWith('_count') && !['gene_id', 'id', 'gene_biotype', 'gene_name', 'gene', 'symbol'].includes(lower[i]));
      // keep only columns that look numeric in the first rows
      sampleIdx = sampleIdx.filter(i => rows.slice(0, 20).filter(r => r[i] !== undefined && r[i] !== '').every(r => !isNaN(parseFloat(r[i]))));
      if (!sampleIdx.length) { // maybe only _count columns exist
        sampleIdx = header.map((h, i) => i).filter(i => lower[i].endsWith('_count'));
      }
    }
    if (sampleIdx.length < 1) throw new Error('Could not find a numeric sample column. Check that the first row is a header and the other columns are numbers.');
    const samples = sampleIdx.map(i => ({ name: header[i].replace(/_(cpm|count)$/i, ''), col: i, total: 0 }));
    const genes = [];
    rows.forEach(r => {
      const name = r[geneCol]; if (!name || name === 'NA') return;
      const vals = sampleIdx.map(i => { const v = parseFloat(r[i]); return isNaN(v) ? 0 : v; });
      vals.forEach((v, k) => samples[k].total += v);
      genes.push({ name, vals, pc: biotypeCol >= 0 ? (r[biotypeCol] === 'protein_coding') : true });
    });
    return { samples, genes, hasBiotype: biotypeCol >= 0, isCpmCols };
  }
  // Group A is the starting point, group B is what it is compared against, so every
  // fold change reads as B relative to A. Names that mean "before the change" go to A.
  const STARTS = /^(und|undiff|undifferentiated|ctrl|control|untreated|baseline|day0|d0|t0)$/;
  const ENDS = /^(dif|diff|differentiated|treated|treatment)$/;
  const LONG = { und: 'Undifferentiated', undiff: 'Undifferentiated', undifferentiated: 'Undifferentiated',
                 dif: 'Differentiated', diff: 'Differentiated', differentiated: 'Differentiated' };
  function guessGroups(samples) {
    const base = s => s.name.replace(/[-_ ]?(rep|r|s|sample)?\d+$/i, '').replace(/\d+$/, '').toLowerCase();
    const bases = samples.map(base); let uniq = Array.from(new Set(bases));
    if (uniq.length === 1 && (STARTS.test(uniq[0]) || ENDS.test(uniq[0]))) {
      // only one condition survived (e.g. the undifferentiated run failed): do not split it in two
      return { groups: bases.map(() => 'A'), names: [LONG[uniq[0]] || uniq[0], ''] };
    }
    if (uniq.length === 2) {
      if (ENDS.test(uniq[0]) && STARTS.test(uniq[1])) uniq = [uniq[1], uniq[0]];
      return { groups: bases.map(b => b === uniq[0] ? 'A' : 'B'),
               names: [LONG[uniq[0]] || uniq[0] || 'Undifferentiated', LONG[uniq[1]] || uniq[1] || 'Differentiated'] };
    }
    const half = Math.ceil(samples.length / 2);
    return { groups: samples.map((s, i) => i < half ? 'A' : 'B'), names: ['Undifferentiated', 'Differentiated'] };
  }
  function renderUpSamples() {
    const g = guessGroups(UP.samples);
    $('up-nameA').value = cap(g.names[0]); if (g.names[1]) $('up-nameB').value = cap(g.names[1]);
    $('up-samples').innerHTML = UP.samples.map((s, i) => `<tr><td class="mono">${esc(s.name)}</td><td class="mono hint">${fmtTotal(s.total)}</td><td><select class="btn up-grp" data-i="${i}" style="padding:4px 8px"><option value="A" ${g.groups[i] === 'A' ? 'selected' : ''}>A · undifferentiated (starting point)</option><option value="B" ${g.groups[i] === 'B' ? 'selected' : ''}>B · differentiated (compared against A)</option><option value="X">ignore</option></select></td></tr>`).join('');
    $('up-run').disabled = false;
  }
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const fmtTotal = t => t >= 1e6 ? (t / 1e6).toFixed(2) + 'M' : t >= 1e3 ? (t / 1e3).toFixed(0) + 'K' : t.toFixed(0);

  $('up-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    $('up-status').textContent = 'Reading ' + f.name + '…';
    const rd = new FileReader();
    rd.onload = () => { try { loadText(rd.result, f.name); } catch (err) { $('up-status').innerHTML = '<span style="color:var(--red)">' + esc(err.message) + '</span>'; } };
    rd.readAsText(f);
  });
  function loadText(text, fname) {
    UP = parseTable(text); UP.fname = fname;
    const sums = UP.samples.map(s => s.total), looksCpm = UP.isCpmCols || sums.every(t => t > 0.85e6 && t < 1.15e6);
    $('up-iscpm').checked = looksCpm;
    $('up-status').innerHTML = `Loaded <strong>${esc(fname)}</strong>: ${UP.samples.length} samples, ${UP.genes.length.toLocaleString()} genes${UP.hasBiotype ? ' (biotype column found)' : ''}. Values look like <strong>${looksCpm ? 'CPM' : 'raw counts'}</strong>.`;
    renderUpSamples();
  }
  $('up-run').addEventListener('click', () => { try { runUpload(); } catch (err) { $('up-status').innerHTML = '<span style="color:var(--red)">' + esc(err.message) + '</span>'; } });

  function runUpload() {
    if (!UP) return;
    const grp = Array.from(document.querySelectorAll('.up-grp')).map(s => s.value);
    const A = [], B = []; grp.forEach((g, i) => { if (g === 'A') A.push(i); else if (g === 'B') B.push(i); });
    if (!A.length && !B.length) throw new Error('Assign at least one sample to a group.');
    const single = !A.length || !B.length;
    const nameA = $('up-nameA').value.trim() || 'Undifferentiated', nameB = $('up-nameB').value.trim() || 'Differentiated';
    const isCpm = $('up-iscpm').checked, pcOnly = $('up-pconly').checked && UP.hasBiotype;
    const scale = UP.samples.map(s => isCpm ? 1 : (s.total > 0 ? 1e6 / s.total : 0));
    // per gene CPM per group, dedupe names by keeping highest total
    const byName = {};
    UP.genes.forEach(g => {
      if (pcOnly && !g.pc) return;
      const a = A.map(i => +(g.vals[i] * scale[i]).toFixed(3)), b = B.map(i => +(g.vals[i] * scale[i]).toFixed(3));
      if (Math.max(...a, ...b) <= 1) return;
      const tot = a.concat(b).reduce((x, y) => x + y, 0);
      if (!byName[g.name] || byName[g.name].tot < tot) byName[g.name] = { a, b, tot };
    });
    const names = Object.keys(byName); if (names.length < 50) throw new Error('Fewer than 50 expressed genes found. Is the first column the gene name and the others numeric?');
    if (single) {
      // Only one condition was uploaded, so there is nothing to compare against. Build a
      // browse-only dataset: expression levels, ranked themes, gene lookup. No fold change.
      const useB = !A.length, idx = useB ? B : A, nm = useB ? nameB : nameA;
      const genes1 = {}, ranked1 = [];
      names.forEach(n => {
        const vals = useB ? byName[n].b : byName[n].a;
        genes1[n] = { cpm: { A: vals } };
        ranked1.push({ n, v: mean(vals) });
      });
      ranked1.sort((p, q) => q.v - p.v);
      const sets1 = [{ title: 'Highest expressed genes', desc: '', genes: ranked1.slice(0, 25).map(r => r.n) }];
      const hk1 = HK.filter(h => genes1[h]);
      if (hk1.length) sets1.push({ title: 'Housekeeping genes', desc: '', genes: hk1 });
      const ds1 = {
        id: 'upload', singleGroup: true, simulated: /SIMULATED/i.test(UP.fname || ''),
        chipLabel: '② ' + (UP.fname.length > 22 ? UP.fname.slice(0, 20) + '…' : UP.fname),
        title: 'Your data: ' + nm,
        tagline: `${UP.fname} · ${idx.length} sample${idx.length === 1 ? '' : 's'} · ${names.length.toLocaleString()} expressed genes · one condition only`,
        intro: '',
        conditions: [{ id: 'A', label: nm, short: nm, color: '#7E57C2', n: idx.length, desc: 'Uploaded samples' }],
        primary: { num: 'A', den: 'A', numShort: nm, denShort: nm, label: nm, hasStats: false, statsName: '', statsNote: '' },
        secondary: null, genes: genes1, sets: sets1, top: { up: [], down: [] },
        summary: { nGenes: names.length, nUp: 0, nDn: 0, upLabel: '', dnLabel: '' },
        quick: ranked1.slice(0, 8).map(r => r.n),
      };
      const k = DATASETS.findIndex(d => d.id === 'upload');
      if (k >= 0) DATASETS[k] = ds1; else DATASETS.push(ds1);
      $('up-export').disabled = false;
      $('up-status').innerHTML += ` <strong style="color:var(--green)">Loaded ${names.length.toLocaleString()} genes in one condition.</strong> No comparison is possible, so the plots and the published cross-check are hidden.`;
      activate(ds1); $('datasets').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const hasStats = A.length >= 2 && B.length >= 2;
    const genes = {}, pvals = [];
    names.forEach(n => { const r = byName[n]; genes[n] = { cpm: { A: r.a, B: r.b } }; if (hasStats) { const p = welch(r.a.map(v => Math.log2(v + 1)), r.b.map(v => Math.log2(v + 1))); pvals.push([n, p, lfc(mean(r.b), mean(r.a)), mean(r.a.concat(r.b))]); } });
    if (hasStats) { const adj = bh(pvals.map(x => x[1])); pvals.forEach((x, i) => genes[x[0]].de = { lfc: +x[2].toFixed(3), padj: +adj[i].toPrecision(3), p: +x[1].toPrecision(3), bm: +x[3].toFixed(1) }); }
    // ranking
    const ranked = names.map(n => { const g = genes[n]; const l = g.de ? g.de.lfc : lfc(mean(g.cpm.B), mean(g.cpm.A)); const sig = g.de ? (g.de.padj < 0.05 && Math.abs(l) > 1) : Math.abs(l) > EXPL_CUT; return { n, l, sig, bm: mean(g.cpm.A.concat(g.cpm.B)) }; });
    const well = ranked.filter(r => r.bm >= 20 && r.sig);
    const topUp = well.filter(r => r.l > 0).sort((p, q) => q.l - p.l).slice(0, 25).map(r => r.n), topDn = well.filter(r => r.l < 0).sort((p, q) => p.l - q.l).slice(0, 25).map(r => r.n);
    const nUp = ranked.filter(r => r.sig && r.l > 0).length, nDn = ranked.filter(r => r.sig && r.l < 0).length;
    const sets = [{ title: `Top genes up in ${nameB}`, desc: `The 25 most-increased well-expressed genes (${hasStats ? 'significant, ' : ''}average CPM ≥ 20).`, genes: topUp },
                  { title: `Top genes down in ${nameB}`, desc: `The 25 most-decreased well-expressed genes.`, genes: topDn }];
    const hk = HK.filter(h => genes[h]); if (hk.length) sets.push({ title: 'Housekeeping genes: a built-in health check', desc: 'Genes every cell needs all the time. If these move a lot, either the cells are in serious trouble or something technical went wrong.', genes: hk });
    const ds = {
      id: 'upload', simulated: /SIMULATED/i.test(UP.fname || ''),
      chipLabel: '② ' + (UP.fname.length > 22 ? UP.fname.slice(0, 20) + '…' : UP.fname), title: 'Your data: ' + nameB + ' vs ' + nameA,
      tagline: `${UP.fname} · ${UP.samples.length} samples loaded · ${names.length.toLocaleString()} expressed genes · analysed entirely in your browser`,
      intro: `<p><strong style="color:var(--text)">${esc(nameA)}</strong> (${A.length} dish${A.length === 1 ? '' : 'es'}) is the starting point; <strong style="color:var(--text)">${esc(nameB)}</strong> (${B.length} dish${B.length === 1 ? '' : 'es'}) is what it is compared against, so every fold change below reads as ${esc(nameB)} relative to ${esc(nameA)}. ${isCpm ? 'Values were used as CPM as provided.' : 'Raw counts were rescaled to counts-per-million.'} ${pcOnly ? 'Only protein-coding genes were kept.' : ''} ${hasStats ? `Because both groups have replicates, each gene got a Welch t-test on log₂(CPM+1) with Benjamini–Hochberg correction. <em>This is a classroom approximation of DESeq2, fine for exploring, not for publishing.</em>` : `<strong>At least one group has a single dish, so no statistics were possible</strong>, so fold changes are descriptive only.`}</p>`,
      conditions: [{ id: 'A', label: nameA, short: nameA, color: '#4a90d9', n: A.length, desc: 'Group A: the starting point' }, { id: 'B', label: nameB, short: nameB, color: '#e05252', n: B.length, desc: 'Group B: compared against Group A' }],
      primary: { num: 'B', den: 'A', numShort: nameB, denShort: nameA, label: `${nameB} vs ${nameA}`, hasStats, statsName: 'Welch t-test', statsNote: hasStats ? '(t-test approximation, not DESeq2)' : '' },
      secondary: null, genes, sets, top: { up: topUp, down: topDn },
      summary: { nGenes: names.length, nUp, nDn, upLabel: hasStats ? `genes significantly UP in ${nameB}` : `genes > ${fold(EXPL_CUT).toFixed(1)}× higher in ${nameB}`, dnLabel: hasStats ? `genes significantly DOWN in ${nameB}` : `genes > ${fold(EXPL_CUT).toFixed(1)}× lower in ${nameB}` },
      quick: topUp.slice(0, 4).concat(topDn.slice(0, 4)),
    };
    const idx = DATASETS.findIndex(d => d.id === 'upload'); if (idx >= 0) DATASETS[idx] = ds; else DATASETS.push(ds);
    $('up-export').disabled = false; $('up-status').innerHTML += ` <strong style="color:var(--green)">Analysis done: ${nUp} up, ${nDn} down.</strong> Scroll up: the explorer now shows your data.`;
    activate(ds); $('datasets').scrollIntoView({ behavior: 'smooth' });
  }
  $('up-export').addEventListener('click', () => {
    const ds = DATASETS.find(d => d.id === 'upload'); if (!ds) return;
    if (ds.singleGroup) {
      const nm = ds.conditions[0].label;
      const rows = [['gene', 'mean_' + nm + '_CPM'].join(',')];
      Object.keys(ds.genes).forEach(n => rows.push([n, mean(ds.genes[n].cpm.A).toFixed(2)].join(',')));
      const blob0 = new Blob([rows.join('\n')], { type: 'text/csv' }), u0 = URL.createObjectURL(blob0);
      const a0 = document.createElement('a'); a0.href = u0; a0.download = 'expression_' + nm + '.csv';
      document.body.appendChild(a0); a0.click(); a0.remove(); URL.revokeObjectURL(u0); return;
    }
    const A = ds.conditions[0].label, B = ds.conditions[1].label, st = ds.primary.hasStats;
    const lines = [['gene', 'mean_' + A + '_CPM', 'mean_' + B + '_CPM', 'log2FC'].concat(st ? ['p_value', 'adj_p_value'] : []).join(',')];
    Object.keys(ds.genes).forEach(n => { const g = ds.genes[n], a = mean(g.cpm.A), b = mean(g.cpm.B), l = g.de ? g.de.lfc : lfc(b, a); lines.push([n, a.toFixed(2), b.toFixed(2), l.toFixed(3)].concat(st ? [g.de.p, g.de.padj] : []).join(',')); });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' }), u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = 'results_' + B + '_vs_' + A + '.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  });

  // Welch t-test + Benjamini–Hochberg (numerically standard implementations)
  function welch(a, b) {
    const n1 = a.length, n2 = b.length, m1 = mean(a), m2 = mean(b), v1 = variance(a), v2 = variance(b);
    const se2 = v1 / n1 + v2 / n2; if (!(se2 > 0)) return 1;
    const t = Math.abs(m2 - m1) / Math.sqrt(se2);
    const df = se2 * se2 / ((v1 / n1) * (v1 / n1) / (n1 - 1) + (v2 / n2) * (v2 / n2) / (n2 - 1));
    if (!(df > 0)) return 1;
    const p = ibeta(df / (df + t * t), df / 2, 0.5);   // two-sided p
    return Math.min(1, Math.max(0, p));
  }
  function bh(p) {
    const n = p.length, idx = p.map((v, i) => i).sort((i, j) => p[i] - p[j]), adj = new Array(n); let prev = 1;
    for (let k = n - 1; k >= 0; k--) { const i = idx[k]; const v = Math.min(prev, p[i] * n / (k + 1)); adj[i] = v; prev = v; }
    return adj;
  }
  function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (let j = 0; j < 6; j++) s += c[j] / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function betacf(a, b, x) { const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d; for (let m = 1; m <= MAXIT; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break; } return h; }
  function ibeta(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }

  // ── nav spy, boot ──────────────────────────────────────────────────────────
  const navAs = document.querySelectorAll('nav a[href^="#"]'), secs = document.querySelectorAll('main section[id]');
  window.addEventListener('scroll', () => { let c = ''; secs.forEach(s => { if (!s.classList.contains('hidden') && window.scrollY >= s.offsetTop - 80) c = s.id; }); navAs.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + c)); }, { passive: true });

  window.CADExplorer = { loadText, activate: id => { const d = DATASETS.find(x => x.id === id); if (d) activate(d); }, datasets: () => DATASETS.map(d => d.id), _welch: welch, _bh: bh };

  const h = location.hash, mds = h.match(/ds=([^&]+)/), mg = h.match(/gene=([^&]+)/);
  const start = (mds && DATASETS.find(d => d.id === mds[1])) || DATASETS[0];
  activate(start, mg ? decodeURIComponent(mg[1]) : null);
  handlersAttached = true;
})();
