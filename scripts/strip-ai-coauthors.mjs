/**
 * Vercel Hobby treats extra commit authors as collaborators and blocks the deploy.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) process.exit(0)

const text = readFileSync(file, 'utf8')
const next = text
  .split(/\r?\n/)
  .filter((line) => {
    if (!/^Co-authored-by:/i.test(line)) return true
    return !/cursor|cursoragent@cursor\.com|noreply@anthropic\.com|claude/i.test(
      line,
    )
  })
  .join('\n')

if (next !== text) writeFileSync(file, next)
