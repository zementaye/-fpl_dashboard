const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Squad context the assistant uses to ground its answers.
// Keep this in sync with the PLAYERS array in public/index.html.
const SQUAD_CONTEXT = `
You are a Fantasy Premier League (FPL) transfer and lineup assistant for a specific
user's 2026/27 season squad. Answer only using football/FPL knowledge relevant to
the question, be concise, and always end with a clear recommendation.

CURRENT 15-MAN SQUAD (£100.0m):
GK: Emiliano Martínez (Aston Villa, £5.0m) | Backup GK (£4.0m)
DEF: Gabriel (Arsenal, £8.0m) | Matty Cash (Aston Villa, £4.0m) | Ezri Konsa (Aston Villa, £4.0m) | Joachim Andersen (Fulham, £4.0m) | Neco Williams (Nott'm Forest, £4.0m)
MID: Bukayo Saka (Arsenal, £9.5m) | Declan Rice (Arsenal, £7.5m) | Bruno Fernandes (Man Utd, £10.0m) | Dominik Szoboszlai (Liverpool, £6.5m) | Pascal Gross (Brighton, £4.5m)
FWD: Erling Haaland (Man City, £15.5m, captain) | Dominic Calvert-Lewin (Leeds, £6.0m) | João Pedro (Chelsea, £7.5m)

Known context: Andersen replaced Marcos Senesi after Senesi moved to Tottenham.
João Pedro replaced Hugo Ekitike after Ekitike's long-term Achilles injury.
Szoboszlai is flagged as a risk (unclear role under new Liverpool manager Iraola).
Calvert-Lewin's GW1 fixture (away at Nottingham Forest) is a tough opener, but he
starts anyway since the squad rules fix forwards at exactly 3 (no bench forward).
Squad formation is typically 3-4-3, with 3-5-2/4-4-2 as fallback formations to
bench a forward with a bad fixture in favor of Gross (MID) or Williams (DEF).

When the user mentions news (an injury, a transfer, a lineup change, a bad
gameweek), incorporate it and suggest what to do about it — a transfer target,
a captaincy change, or a formation/bench swap — with brief reasoning.
`.trim();

app.post('/api/assistant', async (req, res) => {
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FPL dashboard running on port ${PORT}`);
});
