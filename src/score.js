// THE SCORING ENGINE - rewritten for news, not music.
//
// Music and news go viral in completely different shapes, so the maths changes:
//
//   Music: builds over days and weeks. Half-life measured in DAYS.
//   News:  explodes in hours and is dead by tomorrow. Half-life in HOURS.
//
// And for news the single most important measurement is not how loud a story is.
// It is HOW MANY COUNTRIES ARE CARRYING IT, AND HOW FAST THAT NUMBER IS GROWING.
//
//   3 countries -> 3 countries in 6 hours   = a regional story. Ignore.
//   3 countries -> 11 countries in 6 hours  = going global right now. This one.
//
// That second number is only visible if you recorded the first one six hours ago.
// Which is exactly what store.js has been doing. This is the payoff.

import { key } from './store.js';

const HALFLIFE_HOURS = 18;      // a news story loses half its heat in 18 hours
const MAX_COUNTRIES = 14;       // how many Google News editions we read

export function scoreAll(records, previousIndex) {
  return records.map((r) => ({ ...r, ...scoreOne(r, previousIndex.get(key(r))) }));
}

function scoreOne(r, prev) {
  // ---- 1. SPREAD: how many countries, and is that number growing? ---------
  // This dominates everything else for news, which is why it is first and why
  // it gets the biggest weight.
  const rawCountries = r.countryCount || 1;

  // CRITICAL CORRECTION. Google shows the same article in several country
  // editions, so "3 countries, 1 publisher" is not three countries covering a
  // story - it is one article displayed three times. Counting that as spread
  // is the single easiest way to publish a false alarm.
  //
  // A country only counts if an independent newsroom is behind it, so the real
  // reach can never exceed the number of distinct publishers.
  const countries = r.publisherCount
    ? Math.min(rawCountries, r.publisherCount)
    : rawCountries;

  const prevCountries = prev?.effectiveCountries ?? prev?.countryCount ?? (prev ? 1 : null);

  // Share of the world we can see that is genuinely carrying this story.
  const reach = Math.min(countries / MAX_COUNTRIES, 1);

  // New countries picked up since the last reading. This is the "going global
  // right now" signal, and it is the thing nobody else can compute.
  const newCountries = prevCountries === null ? 0 : Math.max(0, countries - prevCountries);
  const spreadRate = newCountries / Math.max(prevCountries || 1, 1);

  // ---- 2. VOLUME ACCELERATION -------------------------------------------
  let accel;
  if (typeof r.volumeDelta === 'number' && r.volume) {
    const before = r.volume - r.volumeDelta;
    accel = before > 0 ? r.volumeDelta / before : 1;
  } else if (prev && prev.volume > 0) {
    accel = (r.volume - prev.volume) / prev.volume;
  } else {
    accel = prior(r);
  }
  accel = clamp(accel, -1, 3);

  // ---- 3. FRESHNESS ------------------------------------------------------
  const ageHours = r.ageHours ?? (r.ageDays ? r.ageDays * 24 : 12);
  const freshness = Math.pow(0.5, ageHours / HALFLIFE_HOURS);

  // ---- 4. TIER URGENCY ---------------------------------------------------
  // Tier 1 sources (social, news wires) tell you something is happening NOW.
  // Tier 3 (Wikipedia) confirms yesterday. Both matter, but only one is urgent.
  const tierWeight = { 1: 1.25, 2: 1.0, 3: 0.7 }[r.tier ?? 2];

  // ---- 5. INDEPENDENCE ---------------------------------------------------
  // 20 articles from 20 different publishers is real. 20 articles that are all
  // one wire story reprinted is not. Publisher variety is our fake-volume filter.
  const independence = r.publisherCount
    ? Math.min(1.3, 0.7 + 0.6 * (r.publisherCount / Math.max(r.articleCount, 1)))
    : 1;

  // ---- COMBINE -----------------------------------------------------------
  // Spread is weighted more heavily than raw acceleration, because for news
  // that is what actually predicts what happens next.
  const core = 60 * reach + 90 * spreadRate + 40 * Math.max(accel, 0);
  const velocity = +(core * freshness * tierWeight * independence).toFixed(2);

  return {
    velocity,
    effectiveCountries: countries,   // after the independence correction
    syndicated: rawCountries > countries,
    countryCount: rawCountries,      // raw editions, kept for display
    newCountries,
    reach: +reach.toFixed(2),
    spreadRate: +spreadRate.toFixed(2),
    accel: +accel.toFixed(3),
    ageHours: +ageHours.toFixed(1),
    ageDays: +(ageHours / 24).toFixed(2),
    phase: phase(r, countries, newCountries, ageHours),
    reachLabel: countries === rawCountries
      ? `${rawCountries} countries`
      : `${rawCountries} editions, ${countries} independent`,
  };
}

// A plain-English label for where a story is in its life. This is what your
// customer actually reads - the number is just how we got here.
function phase(r, countries, newCountries, ageHours) {
  // Only Google News gives us a country count, so only it gets a spread phase.
  // Labelling a Bluesky topic "LOCAL" just because we cannot count countries
  // would be lying with a straight face.
  if (r.source !== 'googlenews') {
    return r.tier === 3 ? 'CONFIRMED' : 'SIGNAL';
  }
  if (ageHours <= 6 && countries <= 3) return 'BREAKING';   // just started somewhere
  if (newCountries >= 2) return 'SPREADING';                // crossing borders now
  if (countries >= 7) return 'GLOBAL';                      // everyone has it
  if (ageHours > 30) return 'FADING';
  return 'LOCAL';
}

// Estimate for items we have never seen before, per source.
function prior(r) {
  switch (r.source) {
    case 'bluesky':    return clamp(1.2 - r.pos * 0.04, 0.1, 1.2);      // rank is all we get
    case 'reddit':     return clamp((r.uph || 0) / 800, 0.05, 1.2);     // upvotes per hour
    case 'gtrends':    return clamp(Math.log10((r.volume || 1000) / 500) / 2, 0.05, 1.2);
    case 'googlenews': return clamp((r.articleCount || 1) / 12, 0.1, 1.2);
    case 'wikipedia':  return 0.3;
    default:           return 0.2;
  }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
