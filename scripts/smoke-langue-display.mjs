import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Inline display logic (mirror)
function normalizeLoose(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[«»"'']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const FR = new Set(
  ['bonjour', 'merci', 'chat', 'salut', 'matinal', 'aurevoir'].map((w) =>
    normalizeLoose(w).replace(/\s+/g, ''),
  ),
)
function isLatinTranscriptionGloss(raw) {
  const t = raw.trim()
  if (!t) return false
  if (!/^[A-Za-zĀāĒēĪīŌōŪūÂâÊêÎîÔôÛûÄäËëÏïÖöÜüŸÿ'\-\s]+$/.test(t)) return false
  if (/[àâäéèêëïîôùûüçœæ]/i.test(t) && !/[āēīōū]/.test(t)) return false
  const words = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.some((w) => FR.has(w))) return false
  return true
}
function display(answer, question, revealed) {
  const raw = answer.trim()
  if (!raw || revealed) return raw
  let s = raw
  while (/\([^)]*\)\s*\([^)]*\)\s*$/u.test(s)) {
    s = s.replace(/\s*\([^)]*\)\s*$/u, '').trim()
  }
  return s
    .replace(/\s*\(([^)]+)\)\s*$/u, (_f, inner) => {
      const t = String(inner).trim()
      if (!t || !isLatinTranscriptionGloss(t)) return ''
      return ` (${t})`
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function needsLatin(answer) {
  return /[^\u0000-\u024f\u1e00-\u1eff\s\d!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~«»…’‘“”–—]/.test(
    answer,
  )
}
function hasTranscription(answer) {
  const groups = [...answer.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim())
  return groups.length === 1 && isLatinTranscriptionGloss(groups[0])
}
function spoiler(answer) {
  const groups = [...answer.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim())
  if (groups.length >= 2) return true
  if (groups.length !== 1) return false
  return !isLatinTranscriptionGloss(groups[0])
}

const special = [
  ['こんにちは (konnichiwa)', 'こんにちは (konnichiwa)'],
  ['안녕하세요 (annyeonghaseyo)', '안녕하세요 (annyeonghaseyo)'],
  ['안녕하세요 (annyeong haseyo)', '안녕하세요 (annyeong haseyo)'],
  ['你好 (nihao)', '你好 (nihao)'],
  ['你好 (ni hao)', '你好 (ni hao)'],
  ['مرحبا (marhaba)', 'مرحبا (marhaba)'],
  ['привет (privet)', 'привет (privet)'],
  ['γεια (geia)', 'γεια (geia)'],
  ['שלום (shalom)', 'שלום (shalom)'],
  ['नमस्ते (namaste)', 'नमस्ते (namaste)'],
  ['សួស្តី (suostei)', 'សួស្តី (suostei)'],
  ['안녕하세요 (bonjour)', '안녕하세요'],
  ['안녕하세요 (annyeonghaseyo) (bonjour)', '안녕하세요 (annyeonghaseyo)'],
]

let ok = true
console.log('SPECIAL SCRIPT DISPLAY')
for (const [a, exp] of special) {
  const got = display(a, 'Quel mot signifie «bonjour» ?', false)
  const pass = got === exp
  if (!pass) ok = false
  console.log(pass ? 'OK' : 'FAIL', a, '=>', got)
}

console.log('VALIDATION')
const samples = [
  { a: '안녕하세요 (annyeonghaseyo)', need: true, has: true, spoil: false },
  { a: 'សួស្តី (suostei)', need: true, has: true, spoil: false },
  { a: '안녕하세요 (bonjour)', need: true, has: false, spoil: true },
  { a: 'hello', need: false, has: false, spoil: false },
  { a: '안녕하세요', need: true, has: false, spoil: false },
]
for (const s of samples) {
  const n = needsLatin(s.a)
  const h = hasTranscription(s.a)
  const sp = spoiler(s.a)
  const pass = n === s.need && h === s.has && sp === s.spoil
  if (!pass) ok = false
  console.log(
    pass ? 'OK' : 'FAIL',
    s.a,
    { need: n, has: h, spoil: sp },
    'expected',
    s,
  )
}

// themes.ts langues list must include all special + latin
const themesSrc = readFileSync(join(root, 'src/lib/themes.ts'), 'utf8')
const metaSrc = readFileSync(join(root, 'src/lib/languesMeta.ts'), 'utf8')
const required = [
  'Arabe',
  'Japonais',
  'Coréen',
  'Chinois',
  'Russe',
  'Grec',
  'Hébreu',
  'Hindi',
  'Cambodgien',
  'Anglais',
  'Vietnamien',
]
console.log('CATALOG')
for (const name of required) {
  const inThemes = themesSrc.includes(`'${name}'`)
  const inMeta =
    metaSrc.includes(`'${name}'`) || metaSrc.includes(`"${name}"`) || metaSrc.includes(`sub: '${name}'`)
  const pass = inThemes && (['Anglais', 'Vietnamien'].includes(name) ? inThemes : inMeta)
  if (!pass) ok = false
  console.log(pass ? 'OK' : 'FAIL', name, { inThemes, inMeta })
}

process.exit(ok ? 0 : 1)
