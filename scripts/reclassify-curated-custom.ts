/**
 * Reclasse data/curated/custom/*.json vers le bon thème catalogue
 * (ex. DOFUS → catalog/jeuxvideo/dofus.json) ou garde Custom si orphelin.
 *
 *   npx tsx scripts/reclassify-curated-custom.ts
 */
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendQuestionToFile,
  curatedDataRoot,
  type FileCuratedQuestion,
} from '../server/curatedFiles.ts'
import { placeTheme } from '../server/themePlacement.ts'

type Payload = {
  placementKind?: string
  theme?: string
  customKey?: string
  groupKey?: string
  subTheme?: string
  questions?: FileCuratedQuestion[]
}

function main() {
  const root = curatedDataRoot()
  const customDir = join(root, 'custom')
  if (!existsSync(customDir)) {
    console.log('Pas de dossier custom')
    return
  }

  const files = readdirSync(customDir).filter((n) => n.endsWith('.json'))
  let moved = 0
  let kept = 0
  let skipped = 0

  for (const name of files) {
    const path = join(customDir, name)
    let payload: Payload
    try {
      payload = JSON.parse(readFileSync(path, 'utf8')) as Payload
    } catch {
      console.warn('JSON invalide', path)
      continue
    }
    const questions = Array.isArray(payload.questions) ? payload.questions : []
    if (questions.length === 0) {
      unlinkSync(path)
      console.log(`vide → supprimé ${name}`)
      continue
    }

    const remaining: FileCuratedQuestion[] = []
    for (const q of questions) {
      const raw = String(q.rawTheme || payload.theme || name.replace(/\.json$/, ''))
      const placement = placeTheme(raw)
      const event: FileCuratedQuestion & {
        placementKind: 'catalog' | 'custom'
        theme: string
        rawTheme: string
      } = {
        ...q,
        placementKind: placement.kind,
        theme: placement.themeLabel,
        themeId: placement.themeId,
        subTheme: placement.subTheme,
        customKey: placement.customKey,
        groupKey: undefined,
        rawTheme: placement.rawTheme || raw,
      }

      if (placement.kind === 'custom') {
        // Reste orphelin → réécrire en Custom — <sub>
        remaining.push({
          ...q,
          rawTheme: placement.rawTheme || raw,
        })
        kept++
        continue
      }

      const res = appendQuestionToFile(event)
      if (res.ok && !res.skipped) {
        moved++
        console.log(
          `→ ${placement.themeLabel} — ${placement.subTheme} ← ${q.question?.slice(0, 48)}…`,
        )
      } else if (res.skipped === 'duplicate') {
        moved++
        skipped++
      } else {
        remaining.push(q)
        console.warn('échec écriture', q.question?.slice(0, 40))
      }
    }

    if (remaining.length === 0) {
      unlinkSync(path)
      console.log(`supprimé ${name} (tout déplacé)`)
    } else {
      const first = remaining[0]
      const placement = placeTheme(
        String(first.rawTheme || payload.theme || name.replace(/\.json$/, '')),
      )
      writeFileSync(
        path,
        JSON.stringify(
          {
            placementKind: 'custom',
            theme: 'Custom',
            subTheme: placement.subTheme || payload.theme,
            customKey: placement.customKey || name.replace(/\.json$/, ''),
            groupKey: `custom/${placement.customKey || name.replace(/\.json$/, '')}`,
            questions: remaining,
          },
          null,
          2,
        ) + '\n',
        'utf8',
      )
      console.log(`gardé Custom — ${placement.subTheme} (${remaining.length} Q)`)
    }
  }

  console.log(
    `\nDone. déplacés≈${moved}, orphelins≈${kept}, doublons≈${skipped}`,
  )
}

main()
