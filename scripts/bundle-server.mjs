/**
 * Pre-bundle les fichiers server/ avec esbuild pour éviter les erreurs
 * d'imports .ts sur Vercel serverless ESM.
 */
import { build } from 'esbuild'
import { readdirSync } from 'fs'

const serverFiles = readdirSync('server')
  .filter(f => f.endsWith('.ts'))
  .map(f => `server/${f}`)

await build({
  entryPoints: serverFiles,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'server',
  outExtension: { '.js': '.mjs' },
  // Ne pas bundler les packages npm externes
  external: [
    '@vercel/node',
    '@upstash/redis',
    'redis',
    'node:*',
    'msedge-tts',
    'groq-sdk',
    '@google/generative-ai',
  ],
  allowOverwrite: true,
})
console.log('server/ bundled successfully')
