# Contexte agent — Quizz

## Morpion (mini-jeu multi)

- Préfixe Redis dédié `quizz:morpion:` — ne jamais écrire dans `quizz:room:`.
- CRUD : `server/morpion.ts` ; IA pure : `server/morpionAi.ts` ; HTTP : `api/morpion.ts`.
- Une salle démarre vs IA (joueur virtuel `__ia__`). Un 2ᵉ humain peut rejoindre tant que vs IA ; l’IA est remplacée, plateau et tour conservés.
- Coup IA calculé **sous verrou serveur** juste après le coup humain. Poll 500 ms comme le quiz.
- Lobby : hub Mini-jeux (pas le lobby quiz). Liste `joinable` + `active` via ZSET.
- TTL salle 5 min (touch au poll) ; humain sans poll 45 s → abandon (remet l’IA ou ferme).
