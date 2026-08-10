// STORY CLUSTERING - the hard part, and the reason this is worth something.
//
// The problem: 14 countries each give us 40 headlines. That is 560 headlines.
// But the same event is written up differently everywhere:
//
//   US : "Trump says Strait of Hormuz deal could happen soon amid Iran-Oman talks"
//   IN : "Hormuz deal possible soon, Trump tells reporters as Oman mediates"
//   AU : "Iran-Oman talks: Trump signals Hormuz breakthrough"
//
// To a computer those are three unrelated strings. To a human they are obviously
// one story running in three countries. Until you can tell that automatically,
// you cannot count countries - and counting countries is the whole product.
//
// How we do it: pull the distinctive words out of each headline (names, places,
// organisations - the words that stay the same when a story is rewritten), then
// group headlines that share enough of them.
//
// This is deliberately simple. It is not machine learning. It gets roughly 80%
// of stories right, which is plenty, and it costs nothing and never goes down.

const STOP = new Set(`
a an the and or but of in on at to for with from by as is are was were be been
being it its this that these those he she they them his her their we you your our
i my me not no so if then than there here what which who whom whose when where why
how all any both each few more most other some such only own same too very can will
just dont should now says say said new says amid after before over under into out
up down off again more live updates report reports latest breaking news video watch
first last week day today year years time make made get got go going one two three
monday tuesday wednesday thursday friday saturday sunday
january february march april may june july august september october november december
jan feb mar apr jun jul aug sep sept oct nov dec horoscope
`.trim().split(/\s+/));

// Words that carry identity: names, places, brands. These are worth much more
// than ordinary words when deciding if two headlines are the same story.
function signature(headline) {
  const words = headline.split(/\s+/);

  const proper = new Set();  // Capitalised mid-sentence = likely a name
  const plain = new Set();

  words.forEach((w, i) => {
    const clean = w.replace(/[^\p{L}\p{N}'-]/gu, '');
    if (clean.length < 3) return;
    const lower = clean.toLowerCase();
    if (STOP.has(lower)) return;

    // Capitalised and not the first word => proper noun (person, place, org)
    if (i > 0 && /^[\p{Lu}]/u.test(clean)) proper.add(lower);
    else plain.add(lower);
  });

  return { proper: [...proper], plain: [...plain], all: [...new Set([...proper, ...plain])] };
}

// How similar are two headlines? Proper nouns count triple.
function similarity(a, b) {
  const properHits = a.proper.filter((t) => b.proper.includes(t)).length;
  const plainHits = a.all.filter((t) => b.all.includes(t)).length - properHits;
  const score = properHits * 3 + plainHits;
  const size = Math.min(a.all.length, b.all.length) || 1;
  return score / (size + 2);
}

const THRESHOLD = 0.48;   // tuned by hand - raise it for tighter clusters

export function clusterNews(articles) {
  const clusters = [];
  // Inverted index: rare word -> which clusters contain it. Without this we would
  // compare every headline to every cluster, which gets slow fast.
  const index = new Map();

  for (const art of articles) {
    const sig = signature(art.headline);
    if (sig.all.length < 2) continue; // too thin to match on

    // Only consider clusters that already share at least one distinctive word.
    const candidates = new Set();
    for (const t of sig.proper.length ? sig.proper : sig.all) {
      (index.get(t) || []).forEach((ci) => candidates.add(ci));
    }

    let best = -1;
    let bestScore = 0;
    for (const ci of candidates) {
      const s = similarity(sig, clusters[ci].sig);
      if (s > bestScore) { bestScore = s; best = ci; }
    }

    if (best >= 0 && bestScore >= THRESHOLD) {
      addToCluster(clusters[best], art, sig);
    } else {
      clusters.push(newCluster(art, sig));
      const ci = clusters.length - 1;
      for (const t of sig.all) {
        if (!index.has(t)) index.set(t, []);
        index.get(t).push(ci);
      }
    }
  }

  return mergePass(clusters).map(finalise).filter((c) => c.articleCount >= 2);
  // One article in one country is not a story yet. Two is the minimum bar.
}

// SECOND PASS. The first pass processes headlines one at a time, so a cluster
// can drift: two groups of the same story form independently before either has
// enough words to recognise the other. This pass compares finished clusters,
// which have much richer word sets, and joins the obvious duplicates.
function mergePass(clusters) {
  const alive = clusters.map((c, i) => ({ c, i, dead: false }));

  for (let a = 0; a < alive.length; a++) {
    if (alive[a].dead) continue;
    for (let b = a + 1; b < alive.length; b++) {
      if (alive[b].dead) continue;

      const A = alive[a].c.sig.proper;
      const B = alive[b].c.sig.proper;
      if (A.length < 2 || B.length < 2) continue;

      const shared = A.filter((t) => B.includes(t)).length;
      // Two or more shared names, covering a third of the smaller set = same story.
      if (shared >= 2 && shared / Math.min(A.length, B.length) >= 0.33) {
        absorb(alive[a].c, alive[b].c);
        alive[b].dead = true;
      }
    }
  }
  return alive.filter((x) => !x.dead).map((x) => x.c);
}

function absorb(into, from) {
  into.headlines.push(...from.headlines);
  from.countries.forEach((c) => into.countries.add(c));
  from.publishers.forEach((p) => into.publishers.add(p));
  into.bestPos = Math.min(into.bestPos, from.bestPos);
  into.articleCount += from.articleCount;
  into.minAgeHours = Math.min(into.minAgeHours, from.minAgeHours);
  if (from.firstSeen < into.firstSeen) into.firstSeen = from.firstSeen;
  into.sig.proper = [...new Set([...into.sig.proper, ...from.sig.proper])].slice(0, 30);
  into.sig.all = [...new Set([...into.sig.all, ...from.sig.all])].slice(0, 50);
}

function newCluster(art, sig) {
  return {
    sig,
    headlines: [art.headline],
    countries: new Set([art.country]),
    publishers: new Set(art.publisher ? [art.publisher] : []),
    bestPos: art.pos,
    articleCount: 1,
    firstSeen: art.publishedAt,
    minAgeHours: art.ageHours,
    url: art.url,
  };
}

function addToCluster(c, art, sig) {
  c.headlines.push(art.headline);
  c.countries.add(art.country);
  if (art.publisher) c.publishers.add(art.publisher);
  c.bestPos = Math.min(c.bestPos, art.pos);
  c.articleCount++;
  c.minAgeHours = Math.min(c.minAgeHours, art.ageHours);
  if (art.publishedAt < c.firstSeen) c.firstSeen = art.publishedAt;
  // Keep the union of distinctive words so the cluster stays matchable.
  c.sig.proper = [...new Set([...c.sig.proper, ...sig.proper])].slice(0, 24);
  c.sig.all = [...new Set([...c.sig.all, ...sig.all])].slice(0, 40);
}

function finalise(c) {
  // Pick the headline that mentions the most of the cluster's key names.
  // Shortest-wins was wrong: after merging, the shortest headline is often an
  // odd side-story that happened to get pulled in. Most-representative-wins is
  // the label a human would have chosen.
  const keys = c.sig.proper.slice(0, 10);
  const label = [...new Set(c.headlines)]
    .map((h) => {
      const low = h.toLowerCase();
      return { h, hits: keys.filter((k) => low.includes(k)).length };
    })
    .sort((a, b) => b.hits - a.hits || a.h.length - b.h.length)[0].h;

  return {
    source: 'googlenews',
    kind: 'news',
    tier: 1,
    entity: label,
    variants: [...new Set(c.headlines)].slice(0, 6),
    countries: [...c.countries],
    countryCount: c.countries.size,
    publisherCount: c.publishers.size,
    // Keep the actual names, not just the count. A client who cannot see who
    // is reporting a story has no way to verify it, and an unverifiable claim
    // is worth nothing to someone paying for it.
    publishers: [...c.publishers].slice(0, 10),
    articleCount: c.articleCount,
    pos: c.bestPos,
    volume: c.articleCount,
    ageHours: +c.minAgeHours.toFixed(1),
    firstSeen: c.firstSeen,
    url: c.url,
    keywords: c.sig.proper.slice(0, 8),
    // Stable ID across readings. Headlines get reworded every hour; the names
    // inside them do not. Fingerprinting on names is what lets us chart a
    // single story's country count over time.
    fp: c.sig.proper.slice(0, 4).sort().join('|') || label.toLowerCase().slice(0, 40),
  };
}
