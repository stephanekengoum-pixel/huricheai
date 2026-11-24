/* =========================================================
   Hurich IA - application (JavaScript pur)
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- Stockage ---------- */
  const KEY_CHATS = 'hurich.chats.v1';
  const KEY_SET = 'hurich.settings.v1';
  const KEY_CUR = 'hurich.current.v1';

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Stockage plein : supprime d\'anciennes conversations.'); } };

  let chats = load(KEY_CHATS, []);
  let settings = Object.assign({ name: '', lang: 'fr-FR', auto: false, api: '' }, load(KEY_SET, {}));
  let currentId = load(KEY_CUR, null);
  let busy = false;
  let attachment = null; // { kind:'image'|'text', name, mime, data, text }
  let serverInfo = { ok: false, demo: true };

  const apiBase = () => (settings.api || window.HURICH_API || '').replace(/\/$/, '');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const cur = () => chats.find((c) => c.id === currentId) || null;
  const saveAll = () => { store(KEY_CHATS, chats); store(KEY_CUR, currentId); };

  /* ---------- Utilitaires ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Rendu Markdown léger ---------- */
  function codeBlock(b) {
    const lang = (b.l || 'code').toLowerCase();
    const canPreview = lang === 'html' || lang === 'htm';
    return `<div class="cb"><div class="cbh"><span>${esc(lang)}</span><span>${canPreview ? '<button data-act="preview">Aperçu</button>' : ''}<button data-act="copy">Copier</button></span></div><pre><code>${esc(b.c)}</code></pre></div>`;
  }

  function md(src) {
    const blocks = [];
    src = src.replace(/```(\w*)[^\S\n]*\n?([\s\S]*?)(?:```|$)/g, (m, l, c) => {
      blocks.push({ l, c: c.replace(/\n$/, '') });
      return `\u0000${blocks.length - 1}\u0000`;
    });
    let h = esc(src);
    h = h.replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^#{1,2} (.*)$/gm, '<h3>$1</h3>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`\n]+)`/g, '<code class="ic">$1</code>');
    h = h.replace(/(?:^|\n)((?:[-*•] .*(?:\n|$))+)/g, (m, l) =>
      '\n<ul>' + l.trim().split('\n').map((x) => '<li>' + x.replace(/^[-*•] /, '') + '</li>').join('') + '</ul>\n');
    h = h.replace(/(?:^|\n)((?:\d+\. .*(?:\n|$))+)/g, (m, l) =>
      '\n<ol>' + l.trim().split('\n').map((x) => '<li>' + x.replace(/^\d+\. /, '') + '</li>').join('') + '</ol>\n');
    h = h.replace(/\n/g, '<br>');
    h = h.replace(/<br>(<(?:ul|ol|h3|h4))/g, '$1').replace(/(<\/(?:ul|ol|h3|h4)>)<br>/g, '$1');
    h = h.replace(/\u0000(\d+)\u0000/g, (m, i) => codeBlock(blocks[+i]));
    return h;
  }

  /* ---------- Sidebar / historique ---------- */
  function renderSidebar() {
    const list = $('#chatList');
    const sorted = [...chats].sort((a, b) => b.updated - a.updated);
    if (!sorted.length) {
      list.innerHTML = '<div class="px-3 py-2 text-xs text-white/35">Aucune conversation pour le moment.</div>';
    } else {
      list.innerHTML = sorted.map((c) => `
        <div class="chat-item ${c.id === currentId ? 'active' : ''}" data-id="${c.id}">
          <span class="t">${esc(c.title)}</span>
          <span class="acts">
            <button class="mini" data-act="rename" title="Renommer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
            <button class="mini" data-act="delete" title="Supprimer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
          </span>
        </div>`).join('');
    }
    const name = settings.name.trim();
    $('#accountName').textContent = name || 'Mon compte';
    $('#accountInitial').textContent = (name[0] || 'U').toUpperCase();
  }

  $('#chatList').addEventListener('click', (e) => {
    const item = e.target.closest('.chat-item');
    if (!item) return;
    const id = item.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rename') {
      const c = chats.find((x) => x.id === id);
      const t = prompt('Nouveau nom de la conversation :', c.title);
      if (t && t.trim()) { c.title = t.trim().slice(0, 60); saveAll(); renderSidebar(); updateTitle(); }
    } else if (act === 'delete') {
      if (confirm('Supprimer cette conversation ?')) {
        chats = chats.filter((x) => x.id !== id);
        if (currentId === id) currentId = null;
        saveAll(); renderSidebar(); showView();
      }
    } else {
      currentId = id; saveAll(); renderSidebar(); showView(); closeSidebar();
    }
  });

  function newChat() {
    currentId = null;
    saveAll(); renderSidebar(); showView(); closeSidebar();
    setTimeout(() => $('#homeInput').focus(), 50);
  }

  /* ---------- Vues ---------- */
  function updateTitle() {
    $('#chatTitle').textContent = cur() ? cur().title : 'Hurich IA';
  }

  function showView() {
    const c = cur();
    const hasMsgs = c && c.messages.length > 0;
    $('#home').classList.toggle('hidden', !!hasMsgs);
    $('#chat').classList.toggle('hidden', !hasMsgs);
    $('#chat').classList.toggle('flex', !!hasMsgs);
    $('#composerWrap').classList.toggle('hidden', !hasMsgs);
    updateTitle();
    if (hasMsgs) { renderMessages(); $('#input').focus(); }
  }

  function aiAvatar() { return '<div class="ai-avatar">H</div>'; }

  function messageHTML(m, i) {
    if (m.role === 'user') {
      const img = m.image ? `<img class="attach-img" src="data:${m.image.mime};base64,${m.image.data}" alt="image jointe" />` : '';
      const file = m.fileName ? `<div class="text-xs opacity-80 mb-1">Fichier : ${esc(m.fileName)}</div>` : '';
      return `<div class="msg user" data-i="${i}"><div class="bubble-user">${img}${file}${esc(m.content)}</div></div>`;
    }
    const gen = m.generated ? `<img class="gen" src="${m.generated}" alt="image générée" />` : '';
    return `<div class="msg ai" data-i="${i}">${aiAvatar()}<div class="min-w-0 flex-1"><div class="bubble-ai inline-block">${md(m.content)}${gen}</div>
      <div class="ai-tools">
        <button class="mini" data-act="copymsg" title="Copier"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>
        <button class="mini" data-act="speak" title="Écouter"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg></button>
      </div></div></div>`;
  }

  function renderMessages() {
    const c = cur();
    if (!c) return;
    $('#msgInner').innerHTML = c.messages.map(messageHTML).join('');
    scrollDown();
  }

  function scrollDown() {
    const box = $('#messages');
    box.scrollTop = box.scrollHeight;
  }

  /* Délégation : copier, aperçu, écouter */
  $('#msgInner').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'copy') {
      const code = btn.closest('.cb').querySelector('code').textContent;
      navigator.clipboard.writeText(code).then(() => { btn.textContent = 'Copié'; setTimeout(() => (btn.textContent = 'Copier'), 1500); });
    } else if (act === 'preview') {
      const cb = btn.closest('.cb');
      const ex = cb.querySelector('iframe');
      if (ex) { ex.remove(); btn.textContent = 'Aperçu'; return; }
      const f = document.createElement('iframe');
      f.className = 'preview-frame';
      f.setAttribute('sandbox', 'allow-scripts');
      f.srcdoc = cb.querySelector('code').textContent;
      cb.appendChild(f);
      btn.textContent = 'Fermer l\'aperçu';
    } else if (act === 'copymsg') {
      const i = +btn.closest('.msg').dataset.i;
      navigator.clipboard.writeText(cur().messages[i].content).then(() => toast('Réponse copiée'));
    } else if (act === 'speak') {
      const i = +btn.closest('.msg').dataset.i;
      speak(cur().messages[i].content);
    }
  });

  /* ---------- Voix ---------- */
  function speak(text) {
    if (!('speechSynthesis' in window)) return toast('Lecture vocale non supportée sur ce navigateur.');
    speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, ' (bloc de code) ').replace(/[*#`_>]/g, '');
    const u = new SpeechSynthesisUtterance(clean.slice(0, 3000));
    u.lang = settings.lang;
    u.rate = 1.02;
    speechSynthesis.speak(u);
  }

  let recog = null;
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Reconnaissance vocale non supportée ici. Essaie Chrome ou Edge.');
    const btn = $('#micBtn');
    if (recog) { recog.stop(); return; }
    recog = new SR();
    recog.lang = settings.lang;
    recog.interimResults = true;
    recog.continuous = false;
    const base = $('#input').value;
    btn.classList.add('on');
    recog.onresult = (ev) => {
      let t = '';
      for (const r of ev.results) t += r[0].transcript;
      $('#input').value = (base ? base + ' ' : '') + t;
      autosize();
    };
    recog.onerror = () => toast('Micro indisponible ou refusé.');
    recog.onend = () => { btn.classList.remove('on'); recog = null; };
    recog.start();
  }

  /* ---------- Pièces jointes ---------- */
  function setAttachment(a) {
    attachment = a;
    const p = $('#attachPreview');
    if (!a) { p.classList.add('hidden'); p.innerHTML = ''; return; }
    p.classList.remove('hidden');
    p.innerHTML = `<span class="px-3 py-1.5 rounded-full bg-white/10 border border-white/10">${a.kind === 'image' ? 'Image' : 'Fichier'} : ${esc(a.name)}</span><button type="button" class="mini" id="rmAttach" title="Retirer">&times;</button>`;
    $('#rmAttach').onclick = () => setAttachment(null);
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function readPDF(file) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      out += tc.items.map((it) => it.str).join(' ') + '\n\n';
      if (out.length > 30000) break;
    }
    return out.trim();
  }

  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      if (file.type.startsWith('image/')) {
        if (file.size > 6 * 1024 * 1024) return toast('Image trop lourde (6 Mo max).');
        setAttachment({ kind: 'image', name: file.name, mime: file.type, data: await toBase64(file) });
      } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        toast('Lecture du PDF...');
        const text = await readPDF(file);
        if (!text) return toast('Aucun texte trouvé dans ce PDF (scan ?).');
        setAttachment({ kind: 'text', name: file.name, text: text.slice(0, 30000) });
      } else {
        const text = await file.text();
        setAttachment({ kind: 'text', name: file.name, text: text.slice(0, 30000) });
      }
    } catch (err) {
      console.error(err);
      toast('Impossible de lire ce fichier.');
    }
  }

  /* ---------- Appels serveur ---------- */
  async function apiPost(path, body) {
    const r = await fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function checkServer() {
    const dot = $('#statusDot'), txt = $('#statusText');
    try {
      const r = await fetch(apiBase() + '/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      serverInfo = await r.json();
      if (serverInfo.demo) { dot.style.background = '#f59e0b'; txt.textContent = 'Mode démo'; }
      else { dot.style.background = '#22c55e'; txt.textContent = 'En ligne'; }
    } catch {
      serverInfo = { ok: false, demo: true };
      dot.style.background = '#f59e0b'; txt.textContent = 'Mode démo';
    }
  }

  const IMAGE_RE = /^\s*(dessine|dessine-moi|dessinez|génère(?:-moi)?\s+(?:une?\s+)?image|genere(?:-moi)?\s+(?:une?\s+)?image|crée(?:-moi)?\s+(?:une?\s+)?image|draw|generate\s+an?\s+image|create\s+an?\s+image)\b/i;

  /* ---------- Envoi d'un message ---------- */
  async function send(text) {
    text = (text || '').trim();
    if ((!text && !attachment) || busy) return;
    busy = true;
    $('#sendBtn').disabled = true;

    let c = cur();
    if (!c) {
      c = { id: uid(), title: 'Nouvelle conversation', messages: [], updated: Date.now() };
      chats.push(c); currentId = c.id;
    }

    const userMsg = { role: 'user', content: text || 'Analyse ce fichier.' };
    let apiText = userMsg.content;
    if (attachment) {
      if (attachment.kind === 'image') userMsg.image = { mime: attachment.mime, data: attachment.data };
      else { userMsg.fileName = attachment.name; apiText = `[Contenu du fichier "${attachment.name}"]\n${attachment.text}\n[Fin du fichier]\n\n${userMsg.content}`; }
    }
    userMsg.apiContent = apiText;
    c.messages.push(userMsg);
    if (c.messages.length === 1) c.title = (text || attachment.name).slice(0, 48);
    c.updated = Date.now();
    setAttachment(null);
    saveAll(); renderSidebar(); showView();

    $('#input').value = ''; autosize();
    const holder = document.createElement('div');
    holder.className = 'msg ai';
    holder.innerHTML = aiAvatar() + '<div class="bubble-ai"><span class="typing"><i></i><i></i><i></i></span></div>';
    $('#msgInner').appendChild(holder);
    scrollDown();

    let reply = '', generated = null, provider = null;
    try {
      if (IMAGE_RE.test(text) && !userMsg.image) {
        const prompt = text.replace(IMAGE_RE, '').replace(/^[\s:,-]+/, '') || text;
        let data;
        try { data = await apiPost('/api/image', { prompt }); } catch { data = { demo: true }; }
        if (data.image) { generated = data.image; reply = 'Voici ton image.'; provider = 'huggingface'; }
        else { generated = demoImage(prompt); reply = 'Mode démo : voici une illustration générée localement. Ajoute ta clé `HF_API_KEY` pour obtenir de vraies images (Stable Diffusion XL).'; }
      } else {
        const history = c.messages.map((m) => ({ role: m.role, content: m.apiContent || m.content, image: m.image || null }));
        let data;
        try { data = await apiPost('/api/chat', { messages: history }); } catch { data = { demo: true }; }
        if (data.reply) { reply = data.reply; provider = data.provider; }
        else { reply = demoReply(text); provider = 'demo'; }
      }
    } catch (err) {
      console.error(err);
      reply = 'Une erreur est survenue. Réessaie dans un instant.';
    }

    const aiMsg = { role: 'assistant', content: reply, provider };
    if (generated) aiMsg.generated = generated;
    c.messages.push(aiMsg);
    c.updated = Date.now();
    saveAll();

    await typewriter(holder, aiMsg);
    renderMessages();
    renderSidebar();
    if (settings.auto) speak(reply);
    busy = false;
    $('#sendBtn').disabled = false;
    $('#input').focus();
  }

  async function typewriter(holder, msg) {
    const bubble = $('.bubble-ai', holder);
    const text = msg.content;
    if (text.length > 2500 || msg.generated) return;
    const step = Math.max(3, Math.ceil(text.length / 70));
    for (let i = step; i < text.length; i += step) {
      bubble.innerHTML = md(text.slice(0, i));
      scrollDown();
      await new Promise((r) => setTimeout(r, 14));
    }
  }

  /* ---------- Mode démo (marche sans clé API) ---------- */
  function demoImage(prompt) {
    let h = 0;
    for (const ch of prompt) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const a = Math.abs(h) % 360, b = (a + 70) % 360;
    const label = esc(prompt.slice(0, 38));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},75%,45%)"/><stop offset="1" stop-color="hsl(${b},80%,55%)"/></linearGradient><radialGradient id="r" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="768" height="768" fill="url(#g)"/><rect width="768" height="768" fill="url(#r)"/><circle cx="560" cy="230" r="120" fill="#fff" fill-opacity=".12"/><circle cx="210" cy="560" r="170" fill="#000" fill-opacity=".18"/><path d="M0 600 Q192 520 384 590 T768 570 V768 H0Z" fill="#0a0a0a" fill-opacity=".55"/><text x="384" y="395" font-family="Arial" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">${label}</text><text x="384" y="735" font-family="Arial" font-size="20" fill="#fff" fill-opacity=".7" text-anchor="middle">Hurich IA - mode démo</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  const DEMO_MOCKUP = `Voici une maquette de boutique en ligne. Clique sur **Aperçu** pour la voir.

\`\`\`html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boutique</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-neutral-950 text-white">
<header class="flex items-center justify-between px-6 py-4 border-b border-white/10">
  <div class="font-extrabold tracking-wide text-lg">MA <span class="text-fuchsia-400">BOUTIQUE</span></div>
  <nav class="hidden md:flex gap-6 text-sm text-white/70"><a href="#">Accueil</a><a href="#produits">Produits</a><a href="#contact">Contact</a></nav>
  <button class="bg-gradient-to-r from-violet-600 to-pink-500 px-4 py-2 rounded-xl text-sm font-semibold">Panier (0)</button>
</header>
<section class="px-6 py-16 text-center max-w-3xl mx-auto">
  <h1 class="text-4xl md:text-5xl font-extrabold leading-tight">Les meilleurs produits, livrés à Douala, Yaoundé et partout au Cameroun</h1>
  <p class="mt-4 text-white/60">Paiement par MTN MoMo et Orange Money. Livraison rapide.</p>
  <a href="#produits" class="inline-block mt-8 bg-gradient-to-r from-violet-600 to-pink-500 px-7 py-3 rounded-xl font-semibold">Voir les produits</a>
</section>
<section id="produits" class="px-6 pb-16 max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5">
  <div class="rounded-2xl bg-white/5 border border-white/10 p-5"><div class="h-36 rounded-xl bg-gradient-to-br from-violet-600/40 to-pink-500/40"></div><h3 class="mt-4 font-semibold">Produit 1</h3><p class="text-white/60 text-sm">15 000 FCFA</p><button class="mt-3 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm">Ajouter</button></div>
  <div class="rounded-2xl bg-white/5 border border-white/10 p-5"><div class="h-36 rounded-xl bg-gradient-to-br from-pink-500/40 to-orange-400/40"></div><h3 class="mt-4 font-semibold">Produit 2</h3><p class="text-white/60 text-sm">25 000 FCFA</p><button class="mt-3 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm">Ajouter</button></div>
  <div class="rounded-2xl bg-white/5 border border-white/10 p-5"><div class="h-36 rounded-xl bg-gradient-to-br from-blue-500/40 to-violet-600/40"></div><h3 class="mt-4 font-semibold">Produit 3</h3><p class="text-white/60 text-sm">9 500 FCFA</p><button class="mt-3 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm">Ajouter</button></div>
</section>
<footer id="contact" class="border-t border-white/10 py-6 text-center text-sm text-white/40">Contact : +237 6XX XX XX XX</footer>
</body>
</html>
\`\`\`

Tu peux me demander de changer les couleurs, les produits ou d'ajouter des sections.`;

  function demoReply(t) {
    const s = t.toLowerCase();
    const has = (...w) => w.some((x) => s.includes(x));
    const note = '\n\n_Mode démo : ajoute tes clés API pour des réponses complètes et illimitées._';

    if (has('maquette', 'mockup', 'site de vente', 'boutique')) return DEMO_MOCKUP + note;

    if (has('momo', 'orange money', 'mobile money', 'transfert'))
      return `**MTN MoMo et Orange Money au Cameroun**\n\n- Les deux services permettent d'envoyer et recevoir de l'argent, payer des factures (ENEO, CAMWATER, abonnements TV), acheter du crédit et payer chez les commerçants.\n- Pour retirer : va chez un agent agréé (kiosque MTN ou Orange) ou utilise un distributeur compatible.\n- Les frais dépendent du montant et de l'opération : consulte la grille officielle dans le menu *#150# (MTN) ou #150# (Orange) avant de valider.\n- Garde ton code secret pour toi. Aucun agent sérieux ne te le demande.\n\nVeux-tu un guide pas à pas pour un transfert ou un paiement de facture ?` + note;

    if (has('fcfa', 'prix', 'coûte', 'coute', 'combien', 'cher'))
      return `**Repères de prix au Cameroun (estimations à vérifier)**\n\n- Course en moto-taxi en ville : environ 200 à 500 FCFA\n- Trajet en taxi collectif : environ 300 à 400 FCFA\n- Repas simple (ndolé, poulet DG, poisson braisé) : 1 500 à 4 000 FCFA\n- Loyer d'une chambre moderne : 25 000 à 60 000 FCFA selon le quartier\n- Bus interurbain Douala - Yaoundé : environ 4 000 à 7 000 FCFA\n\nLes prix varient selon la ville (Douala, Yaoundé, Bafoussam, Nkongsamba) et la saison. Dis-moi ce que tu veux estimer et je détaille.` + note;

    if (has('douala', 'yaoundé', 'yaounde', 'nkongsamba', 'bafoussam', 'ville'))
      return `**Quelques repères sur les villes**\n\n- **Douala** : capitale économique et port principal, très commerçante.\n- **Yaoundé** : capitale politique, administrations et universités.\n- **Bafoussam** : grande ville de l'Ouest, cœur de l'activité agricole et commerciale.\n- **Nkongsamba** : ville du Moungo, carrefour agricole (café, banane) et ferroviaire.\n\nQue veux-tu savoir exactement : transport, logement, business, études ?` + note;

    if (has('python', 'javascript', 'code', 'html', 'script', 'fonction', 'programme'))
      return `Voici un exemple complet en Python que tu peux copier :\n\n\`\`\`python\ndef convertir_fcfa_en_euro(montant_fcfa):\n    # Parité fixe : 1 EUR = 655,957 FCFA\n    return round(montant_fcfa / 655.957, 2)\n\nif __name__ == "__main__":\n    for m in (5000, 25000, 100000):\n        print(f"{m} FCFA = {convertir_fcfa_en_euro(m)} EUR")\n\`\`\`\n\nDis-moi précisément ce que tu veux (langage, objectif, contraintes) et je te donne le code complet adapté.` + note;

    if (has('traduis', 'translate', 'traduction'))
      return `Je peux traduire entre le français, l'anglais, l'espagnol et l'allemand. En mode démo, la traduction automatique n'est pas disponible : ajoute une clé Groq ou Gemini (gratuite) et envoie-moi à nouveau ton texte.` + note;

    if (has('cv', 'lettre', 'motivation'))
      return `**Structure d'un CV efficace**\n\n1. Nom, téléphone, e-mail, ville\n2. Titre professionnel en une ligne\n3. Profil : 3 lignes sur ce que tu apportes\n4. Expériences : poste, entreprise, dates, résultats chiffrés\n5. Formation\n6. Compétences et langues\n\nEnvoie-moi tes informations et je rédige le CV complet.` + note;

    if (has('devoir', 'exercice', 'explique', 'résume', 'resume', 'dissertation'))
      return `Je t'aide volontiers. Envoie-moi l'énoncé complet (ou joins le PDF) et la matière. Je te donne la méthode, la correction détaillée et les explications pour que tu comprennes.` + note;

    if (has('how far', 'wetin', 'abeg', 'na so', 'i dey', 'sef'))
      return `I dey fine, my person! Wetin you wan make I help you with? I fit write code, translate, help with your homework, or talk about prices for Cameroon. Just tell me.` + note;

    if (has('bonjour', 'salut', 'hello', 'bonsoir', 'hey', 'coucou'))
      return `Bonjour${settings.name ? ' ' + esc(settings.name) : ''} ! Je suis Hurich IA, ton assistant camerounais. Je peux discuter, écrire du code, créer des maquettes, aider pour tes devoirs, traduire et parler des prix en FCFA. Que veux-tu faire ?` + note;

    return `J'ai bien reçu ta demande : « ${esc(t.slice(0, 120))} ».\n\nEn mode démo, je réponds seulement à des exemples (code, maquette, prix en FCFA, MoMo, CV, devoirs). Pour des réponses complètes sur n'importe quel sujet, ajoute ta clé Groq (gratuite, 2 minutes) dans le fichier .env : tout fonctionnera ensuite automatiquement.`;
  }

  /* ---------- Saisie ---------- */
  function autosize() {
    const t = $('#input');
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 160) + 'px';
  }
  $('#input').addEventListener('input', autosize);
  $('#input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); send($('#input').value); });
  $('#homeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#homeInput').value;
    $('#homeInput').value = '';
    send(v);
  });
  $('#micBtn').addEventListener('click', toggleMic);
  $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => { handleFile(e.target.files[0]); e.target.value = ''; });
  $('#composer').addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])][0];
    if (f) { e.preventDefault(); handleFile(f); }
  });

  $$('[data-prefill]').forEach((b) => b.addEventListener('click', () => {
    const i = $('#homeInput');
    i.value = b.dataset.prefill;
    i.focus();
    i.setSelectionRange(i.value.length, i.value.length);
  }));

  /* ---------- Sidebar mobile ---------- */
  function openSidebar() { $('#sidebar').classList.add('open'); $('#scrim').classList.remove('hidden'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.add('hidden'); }
  $('#menuBtn').addEventListener('click', openSidebar);
  $('#scrim').addEventListener('click', closeSidebar);
  $('#newChat').addEventListener('click', newChat);

  /* ---------- Paramètres / compte ---------- */
  function openModal(title) {
    $('#modalTitle').textContent = title;
    $('#setName').value = settings.name;
    $('#setLang').value = settings.lang;
    $('#setAuto').checked = settings.auto;
    $('#setApi').value = settings.api;
    $('#modal').classList.remove('hidden');
    $('#modal').classList.add('flex');
    closeSidebar();
  }
  const closeModal = () => { $('#modal').classList.add('hidden'); $('#modal').classList.remove('flex'); };
  $('#openSettings').addEventListener('click', () => openModal('Paramètres'));
  $('#openAccount').addEventListener('click', () => openModal('Mon compte'));
  $('#closeModal').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#saveSettings').addEventListener('click', () => {
    settings = { name: $('#setName').value.trim(), lang: $('#setLang').value, auto: $('#setAuto').checked, api: $('#setApi').value.trim() };
    store(KEY_SET, settings);
    renderSidebar(); closeModal(); checkServer(); toast('Enregistré');
  });
  $('#wipeAll').addEventListener('click', () => {
    if (confirm('Effacer toutes les conversations et les réglages de ce navigateur ?')) {
      chats = []; currentId = null; settings = { name: '', lang: 'fr-FR', auto: false, api: '' };
      localStorage.removeItem(KEY_CHATS); localStorage.removeItem(KEY_SET); localStorage.removeItem(KEY_CUR);
      closeModal(); renderSidebar(); showView(); toast('Tout est effacé');
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSidebar(); } });

  /* ---------- Démarrage ---------- */
  if (currentId && !cur()) currentId = null;
  renderSidebar();
  showView();
  checkServer();
})();
