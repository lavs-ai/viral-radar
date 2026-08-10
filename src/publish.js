// PUBLISHER - builds everything a customer or a client ever sees.
//
//   docs/index.html          the dashboard (this is your shop window)
//   docs/api/latest.json     your API
//   docs/story/<slug>.html   one page per story
//   newsletter/<hour>.md     your own record, one file per hour
//
// Design direction: a meteorological bulletin. Global news spreading country to
// country behaves like a weather front crossing a map, so the page borrows that
// visual language - cool-to-hot gradient encoding intensity, precise station-code
// notation for countries, and a hard-edged data grid rather than soft cards.
//
// The signature element is the COUNTRY STRIP: every country carrying a story,
// with the ones gained since the last reading lit up. That is the picture of the
// story. Not a stock photo - the actual shape of how far it has travelled.

import { writeJson, loadHistory, seriesFor } from './store.js';
import { diversify } from './dedupe.js';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const SITE_NAME = 'Viral Radar';
const SITE_URL = process.env.SITE_URL || 'https://lavs-ai.github.io/viral-radar';
const WATCHED = 14; // Google News editions we read

export async function publish(scored) {
  const ranked = [...scored].sort((a, b) => b.finalScore - a.finalScore);
  const takenAt = new Date().toISOString();
  const history = await loadHistory(12);

  const news = ranked.filter((r) => r.source === 'googlenews');
  const spreading = news.filter((r) => r.newCountries > 0 || r.phase === 'BREAKING').slice(0, 10);
  const global = news.filter((r) => r.phase === 'GLOBAL' && !spreading.includes(r)).slice(0, 10);
  const signals = diversify(ranked.filter((r) => r.source !== 'googlenews' && r.norm >= 62), 4, 10);

  // Attach the country-count series so each row can draw its own trace.
  const withSeries = (arr) =>
    arr.map((r) => ({ ...r, series: r.fp ? seriesFor(history, r.fp).filter((v) => v !== null) : [] }));

  const S = withSeries(spreading);
  const G = withSeries(global);

  // ---- API ---------------------------------------------------------------
  await writeJson('docs/api/latest.json', {
    takenAt,
    watchedCountries: WATCHED,
    spreading: S.map(apiShape),
    global: G.map(apiShape),
    signals: signals.map(apiShape),
  });
  await writeJson('docs/api/all.json', { takenAt, records: ranked.slice(0, 400).map(apiShape) });

  // ---- Dashboard ---------------------------------------------------------
  await mkdir('docs', { recursive: true });
  await writeFile('docs/index.html', dashboard(S, G, signals, takenAt, news.length));
  await writeFile('docs/.nojekyll', '');

  // ---- Story pages -------------------------------------------------------
  await mkdir('docs/story', { recursive: true });
  for (const r of [...S, ...G]) {
    await writeFile(path.join('docs/story', `${slug(r.entity)}.html`), storyPage(r, takenAt));
  }
  await writeFile('docs/sitemap.xml', await sitemap());

  // ---- Newsletter: ONE FILE PER HOUR -------------------------------------
  // An hourly pipeline writing a daily file overwrites itself 23 times a day.
  // Hour-stamped names sort correctly and never collide.
  await mkdir('newsletter', { recursive: true });
  const stamp = takenAt.slice(0, 13).replace('T', '-');
  await writeFile(`newsletter/${stamp}.md`, brief(S, G, takenAt));

  return { spreading: S.length, global: G.length, signals: signals.length, total: ranked.length };
}

const apiShape = (r) => ({
  entity: r.entity, source: r.source, phase: r.phase, status: r.status,
  countries: r.countries, countryCount: r.countryCount, newCountries: r.newCountries,
  articleCount: r.articleCount, publisherCount: r.publisherCount, publishers: r.publishers,
  effectiveCountries: r.effectiveCountries, syndicated: r.syndicated,
  ageHours: r.ageHours, score: r.finalScore, confidence: r.confidence,
  category: r.category, why: r.why, angle: r.angle, url: r.url, fp: r.fp,
});

const slug = (s) =>
  String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'story';

// JSON.stringify escapes quotes but NOT "</script>". A headline containing that
// closes the tag early and everything after it runs as live HTML. Headlines come
// from third-party feeds, so this is real, not theoretical. Escaping the angle
// brackets as unicode keeps the JSON valid and makes breaking out impossible.
const safeJsonLd = (obj) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Cool to hot, driven by how much of the watched world has the story.
function heatColor(countryCount) {
  const t = Math.min((countryCount || 1) / WATCHED, 1);
  if (t > 0.62) return 'var(--hot)';
  if (t > 0.32) return 'var(--warm)';
  return 'var(--cool)';
}

// ---------------------------------------------------------------------------
// STYLE
// ---------------------------------------------------------------------------
const CSS = `
/* Direction: a masthead. Publications are recognised by their paper colour
   (FT salmon, Economist red), so this owns a bone/oyster stock instead of the
   usual white or cream. Dark ink band up top for authority, warm paper below
   for reading. Serif display for editorial weight, mono for anything measured. */
:root{
  --paper:#EFEDE6; --paper-2:#F6F5F0; --card:#FCFBF8;
  --ink:#15171C; --ink-band:#101319; --ink-2:#343A44; --mute:#585F6B;
  --rule:#D6D2C6; --rule-2:#BFB9A9;
  --signal:#AE2E1F; --amber:#8A5606; --cool:#23508C; --live:#2E7D5B;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);
  font-family:"Public Sans",system-ui,-apple-system,sans-serif;
  font-size:16.5px;line-height:1.6;-webkit-font-smoothing:antialiased}
.mono{font-family:"DM Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.wrap{max-width:1020px;margin:0 auto;padding:0 24px}
.pad{padding-bottom:104px}

/* ---------- masthead band ---------- */
.band{background:var(--ink-band);color:var(--paper-2);
  background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);
  background-size:22px 22px}
.bar{display:flex;justify-content:space-between;align-items:center;gap:16px;
  padding:16px 0;border-bottom:1px solid rgba(255,255,255,.13);flex-wrap:wrap}
.brand{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:1.22rem;letter-spacing:-.01em}
.brand em{font-style:italic;color:#D9A441}
.stamp{font-family:"DM Mono",monospace;font-size:.7rem;color:#A3A9B4;
  display:flex;align-items:center;gap:9px}
.dot{width:7px;height:7px;border-radius:50%;background:#4ADE80;
  box-shadow:0 0 10px rgba(74,222,128,.9);animation:pulse 2.6s ease-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}

.hero{padding:60px 0 46px}
.kicker{font-family:"DM Mono",monospace;font-size:.66rem;letter-spacing:.3em;
  text-transform:uppercase;color:#8E9099;margin:0 0 24px}
.hero h1{font-family:Newsreader,Georgia,serif;font-weight:500;
  font-size:clamp(2.5rem,6.6vw,4.5rem);line-height:1.02;letter-spacing:-.022em;
  margin:0 0 20px;text-wrap:balance;color:#FBFAF7}
.hero h1 .count{font-weight:600;color:#E8A33D;font-variant-numeric:tabular-nums}
.subline{font-family:"DM Mono",monospace;font-size:.76rem;color:#E8A33D;margin:0 0 22px;
  padding-left:13px;border-left:2px solid rgba(232,163,61,.45)}
.hero p{max-width:58ch;color:#A9AEB8;margin:0;font-size:1rem}

/* reach meter, 14 slots */
.gauge{display:flex;gap:3px;margin:34px 0 10px}
.gauge i{height:22px;flex:1;background:rgba(255,255,255,.09);border-radius:1px}
.gauge i.on{background:linear-gradient(180deg,#E8A33D,#B97F1F)}
.gauge-label{font-family:"DM Mono",monospace;font-size:.66rem;letter-spacing:.16em;
  text-transform:uppercase;color:#8E9099}

/* ---------- sections ---------- */
.sec{margin:52px 0 18px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;
  padding-bottom:10px;border-bottom:2px solid var(--ink)}
.sec h2{font-family:"DM Mono",monospace;font-size:.72rem;letter-spacing:.22em;
  text-transform:uppercase;font-weight:500;margin:0}
.sec .note{font-size:.82rem;color:var(--mute)}

/* ---------- story ---------- */
.story{background:var(--card);border:1px solid var(--rule);border-radius:3px;
  padding:22px 24px 20px;margin-bottom:12px;position:relative;
  transition:box-shadow .18s,transform .18s,border-color .18s}
.story::before{content:"";position:absolute;left:-1px;top:-1px;bottom:-1px;width:3px;
  background:var(--rule-2);border-radius:3px 0 0 3px}
.story.is-spreading::before{background:var(--signal)}
.story:hover{border-color:var(--rule-2);transform:translateY(-1px);
  box-shadow:0 8px 22px rgba(21,23,28,.09)}
.story h3{font-family:Newsreader,Georgia,serif;font-weight:600;
  margin:0 0 6px;font-size:1.24rem;letter-spacing:-.012em;line-height:1.28}
.story h3 a{color:inherit;text-decoration:none}
.story h3 a:hover{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}

.badge{display:inline-block;font-family:"DM Mono",monospace;font-size:.63rem;
  letter-spacing:.13em;text-transform:uppercase;padding:3px 9px;margin-bottom:11px;
  border:1px solid;border-radius:2px}
.badge.up{color:var(--signal);border-color:var(--signal);background:rgba(185,50,34,.06)}
.badge.new{color:var(--amber);border-color:rgba(168,106,18,.5);background:rgba(168,106,18,.07)}
.badge.gl{color:var(--cool);border-color:rgba(35,80,140,.45);background:rgba(35,80,140,.06)}
.badge.sig{color:var(--mute);border-color:var(--rule)}

/* SIGNATURE: country strip */
.strip{display:flex;flex-wrap:wrap;gap:4px;margin:15px 0 13px}
.cc{font-family:"DM Mono",monospace;font-size:.68rem;letter-spacing:.05em;
  padding:4px 8px;border:1px solid var(--rule);border-radius:2px;
  color:var(--mute);background:var(--paper-2)}
.cc.new{background:var(--signal);border-color:var(--signal);color:#fff}

.trace{display:flex;align-items:flex-end;gap:3px;height:24px;margin:11px 0 13px}
.trace i{width:8px;border-radius:1px 1px 0 0;background:var(--rule-2)}
.trace i:last-child{background:var(--signal)}

.meta{display:flex;flex-wrap:wrap;gap:16px;font-family:"DM Mono",monospace;
  font-size:.7rem;color:var(--mute)}
.meta b{color:var(--ink);font-weight:500}
.meta .warn{color:var(--amber)}
.pubs{margin:12px 0 0;font-family:"DM Mono",monospace;font-size:.67rem;
  color:var(--mute);line-height:1.75}
.pubs span{letter-spacing:.15em;text-transform:uppercase;font-size:.6rem;
  color:var(--ink-2);margin-right:9px}
.angle{margin:15px 0 0;padding-top:13px;border-top:1px solid var(--rule);
  font-size:.95rem;color:var(--ink-2)}
.angle span{display:block;font-family:"DM Mono",monospace;font-size:.61rem;
  letter-spacing:.16em;text-transform:uppercase;color:var(--mute);margin-bottom:4px}

.empty{color:var(--mute);font-size:.95rem;padding:24px 0;font-style:italic}
.sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:6px}
.sources div{background:var(--paper-2);border:1px solid var(--rule);border-radius:3px;padding:15px 16px}
.sources b{display:block;font-family:Newsreader,Georgia,serif;font-size:1rem;
  font-weight:600;margin-bottom:5px}
.sources em{font-style:normal;color:var(--mute);font-size:.79rem;line-height:1.55;display:block}
.disclaimer{color:var(--mute);font-size:.79rem;max-width:70ch;margin-top:18px}
footer{margin-top:64px;padding-top:22px;border-top:2px solid var(--ink);
  font-family:"DM Mono",monospace;font-size:.68rem;color:var(--mute);
  display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap}
a{color:var(--ink)}
a:focus-visible,.story:focus-within{outline:2px solid var(--cool);outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media(max-width:560px){.hero{padding:40px 0 34px}.story{padding:17px 18px}.gauge i{height:16px}}
`;

const HEAD = (title, desc) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,500&family=Public+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>`;

const statusBar = (takenAt) => `<div class="bar">
  <div class="brand">Viral <em>Radar</em></div>
  <div class="stamp"><span class="dot"></span>Reading ${esc(takenAt.slice(11, 16))} UTC · ${esc(takenAt.slice(0, 10))}</div>
</div>`;

// The country strip. New arrivals in solid red, established ones dimmed.
function countryStrip(r) {
  const all = r.countries || [];
  if (!all.length) return '';
  const newCount = r.newCountries || 0;
  // Careful: slice(-0) is slice(0), which returns EVERYTHING. Guard explicitly,
  // or a story that gained no countries lights up every chip as brand new.
  const newest = newCount > 0 ? new Set(all.slice(-newCount)) : new Set();
  return `<div class="strip">${all
    .map((c) => `<span class="cc ${newest.has(c) ? 'new' : 'off'}">${esc(c)}</span>`)
    .join('')}</div>`;
}

// Bar trace of country count across the last readings.
function trace(series, current) {
  const data = [...(series || []), current].filter((n) => typeof n === 'number').slice(-12);
  // A trace where every bar is the same height is visual noise pretending to be
  // information. Only draw it once the country count has actually changed.
  if (data.length < 3 || new Set(data).size < 2) return '';
  const max = Math.max(...data, 2);
  return `<div class="trace" role="img" aria-label="Country count over the last ${data.length} readings">${data
    .map((v) => `<i style="height:${Math.max(3, Math.round((v / max) * 22))}px"></i>`)
    .join('')}</div>`;
}

function storyRow(r, kind) {
  const badge =
    kind === 'spreading'
      ? (r.newCountries > 0
          ? `<span class="badge up">+${r.newCountries} ${r.newCountries === 1 ? 'new country' : 'new countries'} this hour</span>`
          : `<span class="badge new">Breaking · first seen ${age(r.ageHours).replace(' old', ' ago')}</span>`)
      : kind === 'global'
      ? `<span class="badge gl">In ${r.countryCount} countries</span>`
      : `<span class="badge sig">${esc(r.source)}</span>`;

  return `<article class="story${kind === 'spreading' ? ' is-spreading' : ''}">
  ${badge}
  <h3><a href="story/${slug(r.entity)}.html">${esc(r.entity)}</a></h3>
  ${countryStrip(r)}
  ${trace(r.series, r.countryCount)}
  <div class="meta">
    <span><b>${r.effectiveCountries ?? r.countryCount ?? 1}</b> of ${WATCHED} countries</span>
    ${r.publisherCount ? `<span><b>${r.publisherCount}</b> ${r.publisherCount === 1 ? 'publisher' : 'publishers'}</span>` : ''}
    ${r.syndicated ? `<span class="warn">${r.countryCount} editions, ${r.effectiveCountries} independent</span>` : ''}
    ${r.ageHours != null ? `<span><b>${age(r.ageHours)}</b></span>` : ''}
    <span>score <b>${r.finalScore}</b></span>
  </div>
  ${publisherLine(r)}
  ${r.angle ? `<p class="angle"><span>What to do</span>${esc(r.angle)}</p>` : ''}
</article>`;
}

// Naming the newsrooms does two jobs: it lets a client verify the story, and it
// exposes syndication. Ten articles from ten mastheads is real. Ten articles
// from one wire report is not, and the reader can now see the difference.
function publisherLine(r) {
  if (!r.publishers?.length) return '';
  const shown = r.publishers.slice(0, 5).map(esc).join(' · ');
  const more = r.publishers.length > 5 ? ` +${r.publishers.length - 5} more` : '';
  return `<p class="pubs"><span>Reported by</span>${shown}${more}</p>`;
}

function signalRow(r) {
  return `<article class="story">
  <span class="badge sig">${esc(r.source)}</span>
  <h3>${esc(r.entity)}</h3>
  <div class="meta"><span>score <b>${r.finalScore}</b></span><span>${esc(r.phase || '')}</span></div>
</article>`;
}

const age = (h) => (h == null ? '' : h < 1 ? 'just now' : `${Math.round(h)}h old`);

function dashboard(spreading, global, signals, takenAt, trackedCount) {
  // Only count stories that genuinely gained a country. Counting "breaking but
  // static" here would inflate the headline number, and the headline number is
  // the one thing a customer checks at a glance.
  const n = spreading.filter((r) => r.newCountries > 0).length;
  const watchedOn = Math.max(...global.concat(spreading).map((r) => r.countryCount || 0), 0);

  return HEAD(
    `${SITE_NAME} — stories crossing borders right now`,
    `Live tracking of which news stories are spreading across ${WATCHED} countries, updated hourly.`
  ) + `<div class="band"><div class="wrap">` + statusBar(takenAt) + `
<section class="hero">
  <p class="kicker">Live global spread monitor</p>
  <h1>${n > 0
    ? `<span class="count">${n}</span> ${n === 1 ? 'story is' : 'stories are'} crossing borders right now.`
    : `<span class="count">${trackedCount}</span> stories on the board.`}</h1>
  ${n > 0 ? '' : '<p class="subline">None has crossed a border since the last reading. Quiet cycle.</p>'}
  <p>We read the front page of ${WATCHED} countries at the same moment, work out which
  differently-worded headlines are the same story, and count how fast that number grows.
  A story in one country is local news. The same story in eleven is a global event in progress.</p>
  <div class="gauge">${Array.from({ length: WATCHED }, (_, i) =>
    `<i class="${i < watchedOn ? 'on' : ''}"></i>`).join('')}</div>
  <div class="gauge-label">Widest reach this reading — ${watchedOn} of ${WATCHED} countries</div>
</section>
</div></div><div class="wrap pad">

<div class="sec"><h2>Spreading now</h2><span class="note">Gaining countries, or newly broken in the last few hours</span></div>
${spreading.length
    ? spreading.map((r) => storyRow(r, 'spreading')).join('')
    : '<p class="empty">No story gained a country this hour. Quiet cycle — check back at the next reading.</p>'}

<div class="sec"><h2>Already global</h2><span class="note">Everyone has these. Too late to be first.</span></div>
${global.length
    ? global.map((r) => storyRow(r, 'global')).join('')
    : '<p class="empty">Nothing has reached seven countries yet.</p>'}

<div class="sec"><h2>Early signals</h2><span class="note">Social and search chatter, no country count yet</span></div>
${signals.length ? signals.map(signalRow).join('') : '<p class="empty">No strong signals this reading.</p>'}

<div class="sec"><h2>Where this comes from</h2></div>
<div class="sources">
  <div><b>Google News</b><em>Front page of ${WATCHED} countries, read at the same moment. Gives the country count.</em></div>
  <div><b>Bluesky</b><em>Trending topics. Social chatter usually moves first.</em></div>
  <div><b>Google Trends</b><em>Daily search trends across 8 countries. Shows when the public starts looking.</em></div>
  <div><b>Reddit</b><em>Rising posts. Sits between social chatter and the news cycle.</em></div>
  <div><b>Wikipedia</b><em>Most-viewed pages in 7 languages. Confirms a story was real, not just widely printed.</em></div>
</div>
<p class="disclaimer">We publish headlines, publisher names and counts only — never article text.
Every story links back to its original source. All five feeds are public and free to read.</p>

<footer>
  <span>Updated hourly · Independent · Not affiliated with any source listed</span>
  <span><a href="api/latest.json">JSON feed</a></span>
</footer>
</div></body></html>`;
}

function storyPage(r, takenAt) {
  const n = r.effectiveCountries ?? r.countryCount ?? 1;
  const title = `${r.entity} — spreading in ${n} ${n === 1 ? 'country' : 'countries'}`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', headline: r.entity,
    dateModified: takenAt, author: { '@type': 'Organization', name: SITE_NAME },
  };

  return HEAD(title, `Live spread tracking. Currently in ${n} of ${WATCHED} countries.`)
    + `<div class="band"><div class="wrap">` + statusBar(takenAt) + `
<script type="application/ld+json">${safeJsonLd(ld)}</script>
<section class="hero">
  <p class="gauge-label"><a href="../index.html">← All stories</a></p>
  <h1>${esc(r.entity)}</h1>
  <p>Currently carried by <strong>${n} of ${WATCHED}</strong> ${n === 1 ? 'country' : 'countries'} we watch${
    r.newCountries ? `, up ${r.newCountries} since the last reading` : ''}.
  ${r.publisherCount ? `${r.publisherCount} independent ${r.publisherCount === 1 ? 'publisher' : 'publishers'}.` : ''}</p>
  ${countryStrip(r)}
  ${trace(r.series, r.countryCount)}
</section>
</div></div><div class="wrap pad">

${r.why ? `<div class="sec"><h2>Why it is rising</h2></div><p>${esc(r.why)}</p>` : ''}
${r.angle ? `<div class="sec"><h2>What to do about it</h2></div><p>${esc(r.angle)}</p>` : ''}

<div class="sec"><h2>How this is measured</h2></div>
<p>We read the news front page of ${WATCHED} countries at the same moment and group headlines
that are about the same event, even when they are worded completely differently. The score
rewards a story that is gaining countries fast, is still young, and is being covered by many
independent publishers rather than one wire report reprinted everywhere.</p>

${r.url ? `<p class="mono"><a href="${esc(r.url)}" rel="nofollow noopener">Original source →</a></p>` : ''}
<footer><span>Re-measured every hour</span><span><a href="../api/latest.json">JSON feed</a></span></footer>
</div></body></html>`;
}

async function sitemap() {
  const files = await readdir('docs/story').catch(() => []);
  const urls = ['', ...files.map((f) => `story/${f}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE_URL}/${u}</loc><changefreq>hourly</changefreq></url>`).join('\n')}
</urlset>`;
}

function brief(spreading, global, takenAt) {
  const line = (r, i) =>
    `**${i + 1}. ${r.entity}**\n` +
    `${r.effectiveCountries ?? r.countryCount} ${(r.effectiveCountries ?? r.countryCount) === 1 ? 'country' : 'countries'}` +
    `${r.newCountries ? ` (+${r.newCountries} this reading)` : ''}` +
    ` · ${r.publisherCount || '?'} publishers · ${Math.round(r.ageHours)}h old\n` +
    `\`${(r.countries || []).join(' ')}\`\n` +
    (r.why ? `${r.why}\n` : '') +
    (r.angle ? `> **Do this:** ${r.angle}\n` : '');

  return `# Viral Radar — ${takenAt.slice(0, 16).replace('T', ' ')} UTC

**${spreading.length} ${spreading.length === 1 ? 'story' : 'stories'} gained countries this hour.**

## Spreading now
${spreading.length ? spreading.slice(0, 8).map(line).join('\n') : '_Quiet cycle. Nothing crossed a border this hour._'}

## Already global
${global.slice(0, 5).map((r, i) => `${i + 1}. **${r.entity}** — ${r.countryCount} countries`).join('\n') || '_None._'}

---
*Read from Google News in ${WATCHED} countries, Bluesky, Google Trends, Reddit and Wikipedia — all at the same moment. Scored on how fast a story crosses borders, not how loud it is.*
`;
}
