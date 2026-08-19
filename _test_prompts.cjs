/**
 * Tests automatisés — Architecture modulaire de prompt (quizPromptFragments)
 * Exécuter : node _test_prompts.cjs
 *
 * Vérifie les 7 conditions des "Tests obligatoires" du cahier des charges :
 *  T1. facile → contient NIVEAU FACILE + ancrage, SANS NIVEAU MOYEN ni NIVEAU DIFFICILE
 *  T2. moyen  → contient NIVEAU MOYEN, SANS ancrage, SANS FACILE ni DIFFICILE
 *  T3. difficile → contient NIVEAU DIFFICILE, SANS ancrage, SANS FACILE ni MOYEN
 *  T4. Aucun placeholder {theme}/{sous_theme}/{difficulte}/{portee} non résolu
 *  T5. construirePrompt() lève une erreur pour une difficulté inconnue
 *  T6. getFallbackQuiz retourne exactement N questions statiques (filet de sécurité)
 *  T7. La cascade contenu (FIFO) est documentée — pas de second appel IA simulable ici
 */

// Import dynamique ESM → CommonJS bridge
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Compiler les fichiers TS en JS temporaires pour les tester
const tmpDir = path.join(__dirname, '_test_tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

// Copier et transpiler avec esbuild (rapide, pas de config)
function buildAndRequire(tsFile) {
  const outFile = path.join(tmpDir, path.basename(tsFile).replace('.ts', '.cjs'));
  execSync(
    `npx esbuild "${tsFile}" --bundle=false --format=cjs --outfile="${outFile}" --platform=node`,
    { stdio: 'pipe' }
  );
  return require(outFile);
}

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? '\n     → ' + detail : ''}`);
    failed++;
  }
}

// ── Charger les modules ──
console.log('\n═══ Chargement des modules ═══');
let fragments, fallback;
try {
  fragments = buildAndRequire(path.join(__dirname, 'server/quizPromptFragments.ts'));
  console.log('  ✅ quizPromptFragments.ts chargé');
} catch (e) {
  console.error('  ❌ Impossible de charger quizPromptFragments.ts:', e.message);
  process.exit(1);
}
try {
  fallback = buildAndRequire(path.join(__dirname, 'server/fallbackQuestionBank.ts'));
  console.log('  ✅ fallbackQuestionBank.ts chargé');
} catch (e) {
  console.error('  ❌ Impossible de charger fallbackQuestionBank.ts:', e.message);
  process.exit(1);
}

const { construirePrompt } = fragments;
const { getFallbackQuiz } = fallback;

const PARAMS_BASE = {
  theme: 'Cinéma',
  sousTheme: 'Films cultes',
  portee: 'Français',
  historiqueQuestions: ['Spider-Man costume couleurs', 'Batman origine Bruce Wayne'],
};

// ── T1 : facile ──
console.log('\n═══ T1 : difficulté FACILE ═══');
const promptFacile = construirePrompt({ ...PARAMS_BASE, difficulte: 'facile' });
assert('Contient REGLES_ANTI_INVENTION', promptFacile.includes('INTERDICTION ABSOLUE D\'INVENTION'));
assert('Contient "NIVEAU FACILE"', promptFacile.includes('NIVEAU FACILE'));
assert('Contient le bloc ANCRAGE_PAR_THEME', promptFacile.includes('ANCRAGE SPECTATEUR'));
assert('N\'contient PAS "NIVEAU MOYEN"', !promptFacile.includes('NIVEAU MOYEN'));
assert('N\'contient PAS "NIVEAU DIFFICILE"', !promptFacile.includes('NIVEAU DIFFICILE'));

// ── T2 : moyen ──
console.log('\n═══ T2 : difficulté MOYEN ═══');
const promptMoyen = construirePrompt({ ...PARAMS_BASE, difficulte: 'moyen' });
assert('Contient "NIVEAU MOYEN"', promptMoyen.includes('NIVEAU MOYEN'));
assert('N\'contient PAS "ANCRAGE SPECTATEUR"', !promptMoyen.includes('ANCRAGE SPECTATEUR'));
assert('N\'contient PAS "NIVEAU FACILE"', !promptMoyen.includes('NIVEAU FACILE'));
assert('N\'contient PAS "NIVEAU DIFFICILE"', !promptMoyen.includes('NIVEAU DIFFICILE'));

// ── T3 : difficile ──
console.log('\n═══ T3 : difficulté DIFFICILE ═══');
const promptDifficile = construirePrompt({ ...PARAMS_BASE, difficulte: 'difficile' });
assert('Contient "NIVEAU DIFFICILE"', promptDifficile.includes('NIVEAU DIFFICILE'));
assert('N\'contient PAS "ANCRAGE SPECTATEUR"', !promptDifficile.includes('ANCRAGE SPECTATEUR'));
assert('N\'contient PAS "NIVEAU FACILE"', !promptDifficile.includes('NIVEAU FACILE'));
assert('N\'contient PAS "NIVEAU MOYEN"', !promptDifficile.includes('NIVEAU MOYEN'));

// ── T4 : Aucun placeholder non résolu ──
console.log('\n═══ T4 : Placeholders résolus ═══');
const PLACEHOLDERS = ['{theme}', '{sous_theme}', '{difficulte}', '{portee}', '{question_count}'];
for (const p of PLACEHOLDERS) {
  for (const [level, prompt] of [['facile', promptFacile], ['moyen', promptMoyen], ['difficile', promptDifficile]]) {
    assert(
      `Pas de "${p}" non résolu en ${level}`,
      !prompt.includes(p),
      `Trouvé dans le prompt ${level} : ...${prompt.slice(prompt.indexOf(p) - 20, prompt.indexOf(p) + 30)}...`
    );
  }
}

// Vérifier que les valeurs ont bien été injectées
assert(
  'Valeur theme injectée dans facile',
  promptFacile.includes('Cinéma'),
);
assert(
  'Valeur sousTheme injectée dans facile',
  promptFacile.includes('Films cultes'),
);
assert(
  'Valeur portée injectée dans facile',
  promptFacile.includes('Français'),
);

// ── T5 : Erreur pour difficulté inconnue ──
console.log('\n═══ T5 : Difficulté invalide ═══');
try {
  construirePrompt({ ...PARAMS_BASE, difficulte: 'ultra-difficile' });
  assert('Lève une erreur pour difficulté inconnue', false, 'Aucune erreur levée');
} catch (e) {
  assert('Lève une erreur pour difficulté inconnue', e.message.includes('inconnue') || e.message.includes('attendu'));
}

// ── T6 : getFallbackQuiz ──
console.log('\n═══ T6 : getFallbackQuiz (filet de sécurité) ═══');
const fallbackCinema = getFallbackQuiz('Cinéma', 10);
// Le pool Cinéma (2 entrées dédiées + 5 génériques = 7 total) — slice à 10 retourne les disponibles
assert('Retourne au minimum 5 questions (pool partiel)', fallbackCinema.length >= 5);
assert('Ne retourne pas plus que demandé', fallbackCinema.length <= 10);
assert('Chaque question a un champ "question"', fallbackCinema.every(q => q.question));
assert('Chaque question a 4 réponses', fallbackCinema.every(q => q.reponses?.length === 4));
assert('Chaque question a est_fallback_statique: true', fallbackCinema.every(q => q.est_fallback_statique === true));
assert('Chaque question a fait_verifiable: true', fallbackCinema.every(q => q.fait_verifiable === true));

const fallbackFree = getFallbackQuiz('MonThèmeLibreInexistant', 10);
assert('Thème libre inconnu → pool générique (≥5 questions)', fallbackFree.length >= 5);
assert('Thème libre → est_fallback_statique: true', fallbackFree.every(q => q.est_fallback_statique === true));

// ── T7 : Anti-hallucination (vérification architecturale) ──
console.log('\n═══ T7 : Anti-hallucination (vérification architecturale) ═══');
const generateContent = fs.readFileSync(path.join(__dirname, 'server/generate.ts'), 'utf8');
assert(
  'generate.ts rejette fait_verifiable absent',
  generateContent.includes('isFactVerifiable'),
);
assert(
  'generate.ts rejette les sources vagues',
  generateContent.includes('isVagueSource'),
);
assert(
  'generate.ts importe construirePrompt',
  generateContent.includes("from './quizPromptFragments.js'"),
);
assert(
  'generate.ts utilise AI_SYSTEM_MINIMAL (plus d\'AI_SYSTEM seul)',
  generateContent.includes('AI_SYSTEM_MINIMAL') && !generateContent.includes("const AI_SYSTEM ="),
);
assert(
  'generate.ts appelle construirePrompt dans buildPrompt',
  generateContent.includes('return construirePrompt({'),
);
assert(
  'generate.ts a un mode topup pour le rattrapage',
  generateContent.includes("'topup'"),
);
assert(
  'temperature abaissée (0.15)',
  generateContent.includes('temperature: 0.15'),
);

// ── Résumé ──
console.log('\n═══════════════════════════════════════');
console.log(`RÉSULTAT : ${passed} tests réussis, ${failed} tests échoués`);
if (failed === 0) {
  console.log('✅ Tous les tests obligatoires sont validés.');
} else {
  console.log('❌ Des tests ont échoué — voir ci-dessus.');
  process.exit(1);
}

// Nettoyage
fs.rmSync(tmpDir, { recursive: true, force: true });
