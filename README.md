# Hurich IA

> Ton IA Camerounaise, plus rapide, plus forte, plus libre.

Assistant IA complet : chat multilingue (français, anglais, espagnol, allemand, pidgin), générateur d'images, générateur de code avec bouton Copier, maquettes HTML/Tailwind avec aperçu, résumé de PDF, devoirs, CV, voix (micro et haut-parleur), traduction, historique, et Mode Cameroun (FCFA, MTN MoMo, Orange Money, villes).

Le site fonctionne **sans clé API** en mode démo. Dès que tu ajoutes tes clés, il passe automatiquement en mode complet.

## Structure

```
hurich-ia/
├── server.js          Backend Node.js Express
├── package.json
├── .env               Tes clés (ne jamais publier)
├── render.yaml        Configuration Render (backend)
├── vercel.json        Configuration Vercel (frontend)
└── public/
    ├── index.html
    ├── style.css
    ├── app.js
    ├── config.js      Adresse du backend (pour Vercel)
    └── assets/
        └── fondateur.jpg   (ta photo officielle, voir plus bas)
```

## 1. Les clés gratuites (2 minutes chacune)

| Service | Sert à | Lien |
|---|---|---|
| Groq | Chat et code (le plus rapide) | https://console.groq.com/keys |
| Gemini | Secours + lecture d'images | https://aistudio.google.com/app/apikey |
| OpenRouter | 2e secours | https://openrouter.ai/keys |
| Hugging Face | Génération d'images | https://huggingface.co/settings/tokens |

Pour chaque service : crée un compte gratuit, clique sur « Create API key », copie la clé. Pour Hugging Face, choisis un token de type **Read** (ou « Make calls to Inference Providers »).

Colle-les dans le fichier `.env` :

```
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
HF_API_KEY=hf_...
PORT=3000
```

Les offres gratuites ont des limites de requêtes par minute et par jour. C'est pour cela que Hurich IA passe automatiquement au fournisseur suivant (Groq, puis Gemini, puis OpenRouter, puis mode démo).

Si un modèle est retiré par son fournisseur, tu peux le changer sans toucher au code avec ces variables optionnelles : `GROQ_MODEL`, `GEMINI_MODEL`, `OPENROUTER_MODEL`, `HF_MODEL`.

## 2. Lancer en local

Il faut [Node.js 18 ou plus](https://nodejs.org).

```bash
npm install
npm start
```

Ouvre http://localhost:3000. Le point en haut à droite indique « En ligne » (clés détectées) ou « Mode démo ».

## 3. Mettre en ligne gratuitement

### Option simple : tout sur Render (recommandé pour commencer)

1. Mets le projet sur GitHub (le fichier `.env` est ignoré grâce à `.gitignore`).
2. Sur https://render.com : New > Blueprint (ou Web Service), choisis ton dépôt. `render.yaml` configure tout.
3. Dans l'onglet Environment, colle tes 4 clés.
4. Ton site est en ligne : `https://hurich-ia-api.onrender.com`. Le serveur gratuit s'endort après un moment d'inactivité, le premier chargement peut prendre une minute.

### Option frontend Vercel + backend Render

1. Déploie le backend sur Render comme ci-dessus.
2. Ouvre `public/config.js` et mets l'adresse Render : `window.HURICH_API = "https://hurich-ia-api.onrender.com";`
3. Sur https://vercel.com : New Project, choisis ton dépôt. `vercel.json` publie le dossier `public`.
4. Dans Render, tu peux restreindre l'accès avec `CORS_ORIGIN=https://ton-site.vercel.app`.

## 4. L'image officielle du fondateur

Une IA de texte ne peut pas reproduire fidèlement ton visage à partir d'une photo. Pour garder exactement ton visage, ta coiffure et ta tenue, utilise un générateur d'images qui accepte une photo de référence (par exemple Gemini ou ChatGPT avec ta photo jointe), avec ce prompt :

```
Photo professionnelle réaliste d'un jeune PDG tech africain, debout dans un bureau moderne haut de gamme avec vue panoramique sur la ville. Ne change absolument rien au visage, à la coiffure, à la peau et à la tenue de la photo de référence : chemise blanche, gilet sans manches noir, pantalon noir, cravate noire. Il tient dans sa main droite ouverte, vers l'avant, un hologramme 3D lumineux avec les lettres "IA" en néon violet et rose. Autour, des icônes IA flottantes, circuits, graphiques, cerveau IA, particules violettes. En arrière-plan : bureau avec 3 écrans de code, ordinateur portable, casque, clavier. Éclairage cinématographique, ambiance high-tech, couleurs violet, rose, bleu néon. Qualité photo corporate, ultra réaliste, format vertical.
```

Enregistre le résultat sous `public/assets/fondateur.jpg`. La page d'accueil l'utilise automatiquement comme fond, avec le logo HURICH IA et le bouton « Essayer Hurich IA ». Sans cette image, un fond dégradé violet et rose s'affiche.

## 5. Sécurité

- Ne publie jamais ton `.env`. Sur Render et Vercel, utilise les variables d'environnement.
- Les clés restent côté serveur : elles ne sont jamais envoyées au navigateur.
- Le serveur limite à 40 requêtes par minute et par adresse IP.

© 2026 Hurich IA - Créé au Cameroun par Ar-Nganso
