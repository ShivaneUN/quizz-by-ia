import { execFileSync } from 'node:child_process'

let email = ''
try {
  email = execFileSync('git', ['var', 'GIT_AUTHOR_IDENT'], {
    encoding: 'utf8',
  }).trim()
} catch {
  process.exit(0)
}

const match = email.match(/<([^>]+)>/)
const authorEmail = match?.[1] ?? ''
if (authorEmail && /@example\.com$/i.test(authorEmail)) {
  console.error(
    `[git] author ${authorEmail} is not linked to the Vercel GitHub account.`,
  )
  console.error(
    'This repo must commit as Yowshi <294892313+ShivaneUN@users.noreply.github.com>.',
  )
  console.error('Run: npm run setup:git')
  process.exit(1)
}
