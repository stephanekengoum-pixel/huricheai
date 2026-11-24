require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

/* ---------- Configuration ---------- */
const env = (k, d = '') => (process.env[k] || d).trim();
const hasKey = (k) => {
  const v = env(k);
  return v.length > 8 && !v.startsWith('ta_cle');
};

const MODELS = {
  groq: env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  gemini: env('GEMINI_MODEL', 'gemini-1.5-flash'),
  openrouter: env('OPENROUTER_MODEL', 'meta-llama/llama-3.1-8b-instruct:free'),
  hf: env('HF_MODEL', 'stabilityai/stable-diffusion-xl-base-1.0'),
};
const HF_BASE = env('HF_BASE', 'https://router.huggingface.co/hf-inference/models/');

const SYSTEM_PROMPT = `Tu es Hurich IA, l'assistant intelligent camerounais créé par Ar-Nganso. Slogan : "Ton IA Camerounaise, plus rapide, plus forte, plus libre."

Règles :
- Réponds dans la langue de l'utilisateur : français, anglais, espagnol, allemand ou pidgin camerounais. Si l'utilisateur écrit en pidgin, réponds en pidgin.
- Sois précis, direct et utile. Va à l'essentiel, puis détaille si nécessaire. Ne dis jamais que tu es ChatGPT, Gemini ou Llama : tu es Hurich IA.
- CODE : donne toujours le code COMPLET et fonctionnel dans des blocs markdown avec le langage (html, css, js, python...). Jamais de code tronqué.
- MAQUETTE : quand on demande une maquette ou un site, réponds avec UN SEUL bloc \`\`\`html complet (HTML + Tailwind via <script src="https://cdn.tailwindcss.com"></script>), responsive, design professionnel, sans emoji, avec de vraies sections et du vrai texte.
- RÉSUMÉS / DEVOIRS / LETTRES / CV : structure claire, ton adapté, explications pédagogiques pour les devoirs.
- TRADUCTION : traduis fidèlement entre français, anglais, espagnol et allemand, en donnant uniquement la traduction sauf demande contraire.
- MODE CAMEROUN : tu connais le contexte camerounais : prix en FCFA (XAF), MTN Mobile Money (MoMo), Orange Money, villes (Douala, Yaoundé, Nkongsamba, Bafoussam, Bamenda, Garoua, Kribi, Limbé), marchés, transport, études, entrepreneuriat. Quand tu donnes un prix, précise que c'est une estimation à vérifier.
- Si tu n'es pas sûr d'une information récente, dis-le honnêtement au lieu d'inventer.`;

/* ---------- Limitation simple de débit ---------- */
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'x';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 40) return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });
  arr.push(now);
  hits.set(ip, arr);
  next();
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

/* ---------- Utilitaires ---------- */
async function tfetch(url, opts, ms = 50000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 40000),
      image: m.image && m.image.data && m.image.mime ? { mime: String(m.image.mime), data: String(m.image.data) } : null,
    }));
}

/* ---------- Fournisseurs de chat ---------- */
async function callOpenAICompat(url, key, model, messages, extraHeaders = {}) {
  const r = await tfetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!text) throw new Error('Réponse vide');
  return text;
}

const groq = (m) => callOpenAICompat('https://api.groq.com/openai/v1/chat/completions', env('GROQ_API_KEY'), MODELS.groq, m);

const openrouter = (m) =>
  callOpenAICompat('https://openrouter.ai/api/v1/chat/completions', env('OPENROUTER_API_KEY'), MODELS.openrouter, m, {
    'HTTP-Referer': env('SITE_URL', 'https://hurich-ia.vercel.app'),
    'X-Title': 'Hurich IA',
  });

async function gemini(messages) {
  const contents = messages.map((m) => {
    const parts = [{ text: m.content || ' ' }];
    if (m.image) parts.push({ inline_data: { mime_type: m.image.mime, data: m.image.data } });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${env('GEMINI_API_KEY')}`;
  const r = await tfetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
    ? j.candidates[0].content.parts.map((p) => p.text || '').join('')
    : '';
  if (!text) throw new Error('Réponse vide');
  return text;
}

/* ---------- Routes ---------- */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    providers: {
      groq: hasKey('GROQ_API_KEY'),
      gemini: hasKey('GEMINI_API_KEY'),
      openrouter: hasKey('OPENROUTER_API_KEY'),
      huggingface: hasKey('HF_API_KEY'),
    },
    demo: !(hasKey('GROQ_API_KEY') || hasKey('GEMINI_API_KEY') || hasKey('OPENROUTER_API_KEY')),
  });
});

app.post('/api/chat', rateLimit, async (req, res) => {
  const messages = cleanMessages(req.body && req.body.messages);
  if (!messages.length) return res.status(400).json({ error: 'Aucun message.' });

  const hasImage = messages.some((m) => m.image);
  const chain = [];
  if (hasImage && hasKey('GEMINI_API_KEY')) chain.push(['gemini', gemini]);
  if (hasKey('GROQ_API_KEY') && !hasImage) chain.push(['groq', groq]);
  if (hasKey('GEMINI_API_KEY') && !hasImage) chain.push(['gemini', gemini]);
  if (hasKey('OPENROUTER_API_KEY')) chain.push(['openrouter', openrouter]);

  const errors = [];
  for (const [name, fn] of chain) {
    try {
      const reply = await fn(messages);
      return res.json({ reply, provider: name });
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
      console.error(`[chat] ${name} a échoué :`, e.message);
    }
  }
  // Aucun fournisseur disponible : le client bascule en mode démo.
  res.json({ demo: true, reason: chain.length ? 'Tous les fournisseurs ont échoué' : 'Aucune clé API configurée', errors });
});

app.post('/api/image', rateLimit, async (req, res) => {
  const prompt = String((req.body && req.body.prompt) || '').trim().slice(0, 800);
  if (!prompt) return res.status(400).json({ error: 'Description manquante.' });
  if (!hasKey('HF_API_KEY')) return res.json({ demo: true, reason: 'HF_API_KEY manquante' });
  try {
    const r = await tfetch(
      HF_BASE + MODELS.hf,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env('HF_API_KEY')}`, 'Content-Type': 'application/json', Accept: 'image/png' },
        body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } }),
      },
      90000
    );
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get('content-type') || 'image/png';
    res.json({ image: `data:${mime.split(';')[0]};base64,${buf.toString('base64')}` });
  } catch (e) {
    console.error('[image]', e.message);
    res.json({ demo: true, reason: 'Génération indisponible : ' + e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Hurich IA démarré sur http://localhost:${PORT}`));
