const RANDOM_ADJECTIVES = [
  'Rapide',
  'Fou',
  'Cool',
  'Sauvage',
  'Éclair',
  'Royal',
  'Ninja',
  'Turbo',
  'Lucky',
  'Cosmic',
  'Funky',
  'Sharp',
  'Brave',
  'Magic',
  'Ultra',
  'Pixel',
  'Golden',
  'Silent',
  'Crazy',
  'Epic',
]

const RANDOM_NOUNS = [
  'Panda',
  'Tigre',
  'Falcon',
  'Dragon',
  'Lynx',
  'Phoenix',
  'Wolf',
  'Fox',
  'Shark',
  'Eagle',
  'Comet',
  'Viper',
  'Lion',
  'Bear',
  'Owl',
  'Raven',
  'Bolt',
  'Storm',
  'Nova',
  'Ace',
]

export function randomPseudo(): string {
  const adj =
    RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)]!
  const noun =
    RANDOM_NOUNS[Math.floor(Math.random() * RANDOM_NOUNS.length)]!
  const n = Math.floor(Math.random() * 90) + 10
  return `${adj}${noun}${n}`.slice(0, 24)
}
