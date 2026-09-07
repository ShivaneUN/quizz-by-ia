/**
 * Point quizz-by-ia.vercel.app at the latest Ready production deployment.
 * Vercel auto-assigns quizz-by-ia-yowshi.vercel.app; the short alias does not
 * always move with it.
 */
import { execFileSync } from 'node:child_process'

const DOMAIN = 'quizz-by-ia.vercel.app'
const SCOPE = 'yowshi'

function vercel(args) {
  return execFileSync('npx', ['vercel', ...args, '--scope', SCOPE], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
}

const raw = vercel(['ls', 'quizz-by-ia', '--json', '--environment', 'production'])
const jsonStart = raw.indexOf('{')
if (jsonStart < 0) {
  console.error('[alias] vercel ls did not return JSON')
  process.exit(1)
}
const data = JSON.parse(raw.slice(jsonStart))
const deployments = Array.isArray(data) ? data : data.deployments ?? []
const ready = deployments.find(
  (d) =>
    String(d.state ?? d.status ?? '').toUpperCase() === 'READY' &&
    String(d.target ?? '').toLowerCase() === 'production',
) ?? deployments.find((d) => String(d.state ?? d.status ?? '').toUpperCase() === 'READY')

if (!ready?.url) {
  console.error('[alias] no Ready production deployment found')
  process.exit(1)
}

const url = ready.url.startsWith('http') ? ready.url : `https://${ready.url}`
console.log(`[alias] ${DOMAIN} → ${url}`)
process.stdout.write(vercel(['alias', 'set', url, DOMAIN]))
