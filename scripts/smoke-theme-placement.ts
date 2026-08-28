/**
 * Smoke tests placeTheme (DOFUS → Jeux vidéo, orphelin → Custom).
 *   npx tsx scripts/smoke-theme-placement.ts
 */
import { placeTheme, formatPlacementLabel } from '../server/themePlacement.ts'

const cases: { raw: string; expect: string }[] = [
  { raw: 'DOFUS', expect: 'catalog:jeuxvideo:DOFUS' },
  { raw: 'Jeux vidéo — DOFUS', expect: 'catalog:jeuxvideo:DOFUS' },
  { raw: 'Jeux vidéo — RPG', expect: 'catalog:jeuxvideo:RPG' },
  { raw: 'Musique — Pop', expect: 'catalog:musique:Pop' },
  { raw: 'Super Mario', expect: 'catalog:jeuxvideo:Super Mario' },
  { raw: 'Rocket League', expect: 'catalog:jeuxvideo:Rocket League' },
  { raw: 'Black Clover', expect: 'catalog:cinema:Black Clover' },
  { raw: 'Solo Leveling', expect: 'catalog:cinema:Solo Leveling' },
  { raw: 'Ma vie de bureau un mardi', expect: 'custom:Custom:Ma vie de bureau un mardi' },
]

function key(p: ReturnType<typeof placeTheme>): string {
  if (p.kind === 'catalog') {
    return `catalog:${p.themeId}:${p.subTheme}`
  }
  return `custom:${p.themeLabel}:${p.subTheme}`
}

let fail = 0
for (const c of cases) {
  const p = placeTheme(c.raw)
  const got = key(p)
  const ok = got === c.expect
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.raw} → ${formatPlacementLabel(p)}`)
  if (!ok) {
    console.log(`     attendu ${c.expect}, obtenu ${got}`)
    fail++
  }
}

if (fail) {
  console.error(`\n${fail} échec(s)`)
  process.exit(1)
}
console.log('\nTous les cas OK')
