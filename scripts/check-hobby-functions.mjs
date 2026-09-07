/**
 * Hobby refuses a deploy with more than 12 serverless functions.
 * Each api/*.ts file (except tsconfig) is one function.
 */
import { readdirSync } from 'node:fs'

const HOBBY_MAX = 12
const files = readdirSync('api')
  .filter((name) => name.endsWith('.ts') && name !== 'tsconfig.json')
  .sort()

if (files.length > HOBBY_MAX) {
  console.error(
    `[vercel-hobby] ${files.length} functions in api/ (max ${HOBBY_MAX}).`,
  )
  console.error(
    'Merge the new endpoint into an existing api/*.ts file and add a vercel.json rewrite.',
  )
  console.error(`Current: ${files.join(', ')}`)
  process.exit(1)
}

console.log(`[vercel-hobby] ${files.length}/${HOBBY_MAX} serverless functions`)
