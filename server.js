const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
// Optional password gate — only active if SITE_PASSWORD is set.
// Uses HTTP Basic Auth (browser shows a native login prompt).
// Username can be anything; only the password is checked.
// ─────────────────────────────────────────────────────────────
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

app.use((req, res, next) => {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return next(); // no password set = site stays open

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
    if (timingSafeEqual(pass, sitePassword)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="FPL Dashboard"');
  res.status(401).send('Authentication required.');
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// Basic rate limiting — protects the Gemini free-tier quota (and
// the FPL API) from being hammered by one visitor. In-memory only,
// no dependency needed for a single-instance personal deployment.
// ─────────────────────────────────────────────────────────────
const rateBuckets = new Map(); // ip -> [timestamps]

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const key = ip + ':' + req.path;
    const timestamps = (rateBuckets.get(key) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= max) {
      const retryAfterSec = Math.ceil((windowMs - (now - timestamps[0])) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: `Too many requests — try again in about ${retryAfterSec}s.` });
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

// Periodic cleanup so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateBuckets.entries()) {
    const fresh = timestamps.filter(t => now - t < 60 * 60 * 1000);
    if (fresh.length) rateBuckets.set(key, fresh); else rateBuckets.delete(key);
  }
}, 15 * 60 * 1000);

// ─────────────────────────────────────────────────────────────
// AI Assistant — Google Gemini, key stays server-side
// ─────────────────────────────────────────────────────────────
const SQUAD_CONTEXT = `
You are a Fantasy Premier League (FPL) transfer and lineup assistant for a specific
user's 2026/27 season squad. Answer only using football/FPL knowledge relevant to
the question, be concise, and always end with a clear recommendation.

CURRENT 15-MAN SQUAD (£102.5m, ~£2.5m over the standard £100m budget with confirmed prices):
GK: Emiliano Martínez (Aston Villa, £5.0m) | Backup GK (£4.0m)
DEF: Gabriel (Arsenal, £8.0m) | Matty Cash (Aston Villa, £4.0m) | Ezri Konsa (Aston Villa, £4.0m) | Joachim Andersen (Fulham, £4.0m) | Neco Williams (Nott'm Forest, £4.0m)
MID: Bukayo Saka (Arsenal, £9.5m) | Declan Rice (Arsenal, £7.5m) | Bruno Fernandes (Man Utd, £12.0m, confirmed official price) | Dominik Szoboszlai (Liverpool, £7.0m, confirmed official price) | Pascal Gross (Brighton, £4.5m)
FWD: Erling Haaland (Man City, £15.5m, captain) | Dominic Calvert-Lewin (Leeds, £6.0m) | João Pedro (Chelsea, £7.5m)

Known context: Andersen replaced Marcos Senesi after Senesi moved to Tottenham.
João Pedro replaced Hugo Ekitike after Ekitike's long-term Achilles injury.
Szoboszlai is flagged as a risk (unclear role under new Liverpool manager Iraola).
Calvert-Lewin's GW1 fixture (away at Nottingham Forest) is a tough opener, but he
starts anyway since the squad rules fix forwards at exactly 3 (no bench forward).
Squad formation is typically 3-4-3, with 3-5-2/4-4-2 as fallback formations to
bench a forward with a bad fixture in favor of Gross (MID) or Williams (DEF).

The user may also tell you about edits they've made in the dashboard's own "Edit
Squad" panel (a player swapped for someone else, a note added) — treat anything
they tell you about their current squad as more up to date than the list above.

When the user mentions news (an injury, a transfer, a lineup change, a bad
gameweek), incorporate it and suggest what to do about it — a transfer target,
a captaincy change, or a formation/bench swap — with brief reasoning.
`.trim();

app.post('/api/assistant', rateLimit({ windowMs: 10 * 60 * 1000, max: 15 }), async (req, res) => {
  const userMessage = (req.body && req.body.message || '').toString().slice(0, 2000);
  if (!userMessage.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not set on this Render service. Add it under Environment in the Render dashboard.'
    });
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SQUAD_CONTEXT }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 700 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return res.status(502).json({ error: 'The AI assistant is unavailable right now. Try again shortly.' });
    }

    const data = await response.json();
    const text = ((data.candidates || [])[0]?.content?.parts || [])
      .map(part => part.text || '')
      .filter(Boolean)
      .join('\n');

    res.json({ reply: text || "I couldn't generate a response — try rephrasing your question." });
  } catch (err) {
    console.error('Assistant request failed:', err);
    res.status(500).json({ error: 'Something went wrong reaching the assistant.' });
  }
});

// ─────────────────────────────────────────────────────────────
// Live FPL data — proxies the official public FPL API server-side
// (browsers get blocked by CORS hitting it directly) and matches
// it against our 15-man squad by name + team.
// ─────────────────────────────────────────────────────────────

// key = the exact player name used in the dashboard's PLAYERS array
const SQUAD_LOOKUP = [
  { key: 'Emiliano Martínez', team: 'Aston Villa', surnames: ['martinez'] },
  { key: 'Gabriel', team: 'Arsenal', surnames: ['gabriel', 'magalhaes'] },
  { key: 'Matty Cash', team: 'Aston Villa', surnames: ['cash'] },
  { key: 'Ezri Konsa', team: 'Aston Villa', surnames: ['konsa'] },
  { key: 'Joachim Andersen', team: 'Fulham', surnames: ['andersen'] },
  { key: 'Neco Williams', team: "Nott'm Forest", surnames: ['williams'] },
  { key: 'Bukayo Saka', team: 'Arsenal', surnames: ['saka'] },
  { key: 'Declan Rice', team: 'Arsenal', surnames: ['rice'] },
  { key: 'Bruno Fernandes', team: 'Man Utd', surnames: ['fernandes'] },
  { key: 'Dominik Szoboszlai', team: 'Liverpool', surnames: ['szoboszlai'] },
  { key: 'Pascal Gross', team: 'Brighton', surnames: ['gross', 'gro'] },
  { key: 'Erling Haaland', team: 'Man City', surnames: ['haaland'] },
  { key: 'Dominic Calvert-Lewin', team: 'Leeds', surnames: ['calvertlewin'] },
  { key: 'João Pedro', team: 'Chelsea', surnames: ['pedro'] },
];

function normalize(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const STATUS_LABELS = {
  a: 'Available', d: 'Doubtful', i: 'Injured',
  s: 'Suspended', u: 'Unavailable', n: 'Not in squad',
};

let fplCache = { data: null, fetchedAt: 0 };
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

app.get('/api/fpl-data', rateLimit({ windowMs: 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const now = Date.now();
    let bootstrap;
    if (fplCache.data && (now - fplCache.fetchedAt) < CACHE_MS) {
      bootstrap = fplCache.data;
    } else {
      const r = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/');
      if (!r.ok) throw new Error('FPL API returned ' + r.status);
      bootstrap = await r.json();
      fplCache = { data: bootstrap, fetchedAt: now };
    }

    const teamsById = {};
    (bootstrap.teams || []).forEach(t => { teamsById[t.id] = t.name; });

    const matched = {};
    SQUAD_LOOKUP.forEach(entry => {
      const candidates = (bootstrap.elements || []).filter(el => {
        const teamName = teamsById[el.team] || '';
        const teamMatch = normalize(teamName).includes(normalize(entry.team.replace("Nott'm", 'Nottingham')))
          || normalize(entry.team).includes(normalize(teamName))
          || normalize(teamName) === normalize(entry.team);
        if (!teamMatch) return false;
        const hay = normalize(el.web_name + el.first_name + el.second_name);
        return entry.surnames.some(s => hay.includes(normalize(s)));
      });
      if (candidates.length) {
        const el = candidates[0];
        matched[entry.key] = {
          price: el.now_cost / 10,
          status: el.status,
          statusLabel: STATUS_LABELS[el.status] || el.status,
          news: el.news || '',
          chanceNextRound: el.chance_of_playing_next_round,
          selectedByPercent: el.selected_by_percent,
          formPoints: el.form,
          totalPoints: el.total_points,
        };
      }
    });

    const events = bootstrap.events || [];
    const nextEvent = events.find(e => e.is_next) || events.find(e => !e.finished);

    res.json({
      players: matched,
      matchedCount: Object.keys(matched).length,
      expectedCount: SQUAD_LOOKUP.length,
      nextDeadline: nextEvent ? nextEvent.deadline_time : null,
      currentGameweek: nextEvent ? nextEvent.id : null,
      fetchedAt: fplCache.fetchedAt,
    });
  } catch (err) {
    console.error('FPL data fetch failed:', err);
    res.status(502).json({ error: 'Could not reach the live FPL API right now.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FPL dashboard running on port ${PORT}`);
});
