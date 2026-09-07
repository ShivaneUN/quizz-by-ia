/**
 * Repo-local Git identity + hooks so Vercel Hobby deploys are not blocked.
 * Placeholder emails like developer@example.com are not linked to the
 * GitHub account that owns the Vercel project.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const LINKED_NAME = 'Yowshi'
const LINKED_EMAIL = '294892313+ShivaneUN@users.noreply.github.com'

if (!existsSync('.git')) process.exit(0)

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

try {
  git(['config', 'core.hooksPath', '.githooks'])
} catch {
  // CI / read-only checkouts
}

let email = ''
try {
  email = git(['config', '--local', 'user.email'])
} catch {
  try {
    email = git(['config', 'user.email'])
  } catch {
    email = ''
  }
}

if (!email || /@example\.com$/i.test(email)) {
  try {
    git(['config', '--local', 'user.name', LINKED_NAME])
    git(['config', '--local', 'user.email', LINKED_EMAIL])
    console.log(`[setup-git] local identity → ${LINKED_NAME} <${LINKED_EMAIL}>`)
  } catch {
    // Cannot write git config (Vercel build, sandboxed checkout)
  }
}
