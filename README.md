# Quizz

Quiz solo React (Vite) avec banque de questions pré-générée par thème et palier.

## Stack

- Frontend : React + Vite (Vercel)
- API : `/api/generate-questions` (serverless Vercel + middleware Vite en local)
- Stockage temporaire : `localStorage` (Firebase plus tard)
- Génération : Groq et/ou Gemini (`GROQ_API_KEY` / `GEMINI_API_KEY`) — choix Auto / Groq / Gemini

## Démarrage

```bash
npm install
cp .env.example .env   # ajoute GROQ_API_KEY (recommandé)
npm run dev
```

Sans clé API, l'app sert des **questions mock** (jouable immédiatement).

## Flux

1. Choix du thème → slug normalisé
2. Si banque absente en localStorage → `POST /api/generate-questions` (mode `initial`, 10×3)
3. Sinon → pioche directe, **aucun appel API**
4. Progression Facile → Moyen → Difficile (seuil 7/10)
5. Palier épuisé pour le joueur → génération `complementary` (max 10)

## Déploiement Vercel

1. Projet lié au repo
2. Variables d'environnement `GROQ_API_KEY` et/ou `GEMINI_API_KEY`
3. Build : `npm run build` (défaut Vite)
