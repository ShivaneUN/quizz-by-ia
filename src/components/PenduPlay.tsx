import { useEffect, useRef, useState } from 'react'
import {
  AZERTY_ROWS,
  MAX_STROKES,
  MULTI_MAX,
  MULTI_MIN,
  SOLO_DUO_WORDS,
  activeStrokes,
  continuePendu,
  createDuoGame,
  createMultiGame,
  createSoloGame,
  displaySlots,
  guessLetter,
  letterKeyState,
  playerMultiRound,
  rankedPlayers,
  resolvePenduPlayer,
  turnLabel,
  type PenduGame,
  type PenduMode,
  type PenduPlayer,
} from '../lib/pendu'
import { takePenduWords, takePenduWordsNeeded } from '../lib/penduFill'
import type { PenduWordSource } from '../lib/penduWords'
import type { Difficulty } from '../types'
import { PenduGallows } from './PenduGallows'
import './PenduPlay.css'

interface PenduPlayProps {
  onScoreChange?: (score: number) => void
  startMode?: PenduMode
  startNames?: string[]
  startDifficulty?: Difficulty
  startWords?: string[]
  startWordSource?: PenduWordSource
  onExit?: () => void
  remote?: {
    game: PenduGame
    myId?: string        // identifiant du joueur local (multi parallèle)
    myName?: string
    myTurn: boolean
    busy?: boolean
    onLetter: (letter: string) => void
    onHintEliminate: () => void
    onHintReveal: () => void
    onContinue: () => void
  }
}

function defaultNames(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Joueur ${i + 1}`)
}

const WOOD = '#c4a06a'
const BODY_COLOR = '#ff6b6b'
const BASE_COLOR = '#9aadc4'

/** Mini potence SVG (viewBox 100×100, rendue petite via CSS) */
function MiniGallows({ strokes, status }: { strokes: number; status: string }) {
  const n = Math.max(0, Math.min(MAX_STROKES, strokes))
  const bodyColor = status === 'won' ? '#22c55e' : BODY_COLOR
  return (
    <svg className="ppm__gallows" viewBox="0 0 100 100" aria-hidden="true">
      {/* Base */}
      <path d="M10 95 H50" fill="none" stroke={BASE_COLOR} strokeWidth="4" strokeLinecap="round" />
      {n >= 1 && <path d="M25 95 V10" fill="none" stroke={WOOD} strokeWidth="4" strokeLinecap="round" />}
      {n >= 2 && <path d="M25 10 H65" fill="none" stroke={WOOD} strokeWidth="4" strokeLinecap="round" />}
      {n >= 3 && <path d="M65 10 V22" fill="none" stroke={WOOD} strokeWidth="3.5" strokeLinecap="round" />}
      {n >= 4 && <circle cx="65" cy="30" r="8" fill="none" stroke={bodyColor} strokeWidth="3" />}
      {n >= 5 && <path d="M65 38 V62" fill="none" stroke={bodyColor} strokeWidth="3" strokeLinecap="round" />}
      {n >= 6 && <path d="M65 44 L54 54" fill="none" stroke={bodyColor} strokeWidth="3" strokeLinecap="round" />}
      {n >= 7 && <path d="M65 44 L76 54" fill="none" stroke={bodyColor} strokeWidth="3" strokeLinecap="round" />}
      {n >= 8 && <path d="M65 62 L55 78" fill="none" stroke={bodyColor} strokeWidth="3" strokeLinecap="round" />}
      {n >= 9 && <path d="M65 62 L75 78" fill="none" stroke={bodyColor} strokeWidth="3" strokeLinecap="round" />}
    </svg>
  )
}

/** Mini-vue d'un joueur en mode multi parallèle */
function MultiPlayerMini({
  player,
  word,
  isMe,
}: {
  player: PenduPlayer
  word: string
  isMe: boolean
}) {
  const mr = player.multiRound
  const status = mr?.status ?? 'playing'
  const revealed = mr?.revealed ?? []
  const strokes = mr?.strokes ?? 0

  // Affiche _ ou ✓ par lettre (sans révéler quelle lettre c'est)
  const slots = word.split('').map((letter, i) => {
    if (letter === '-') return <span key={i} className="ppm__hyphen">-</span>
    if (status === 'won') return <span key={i} className="ppm__slot ppm__slot--won">✓</span>
    if (status === 'lost') return <span key={i} className="ppm__slot ppm__slot--lost">✗</span>
    const found = revealed.includes(letter)
    return (
      <span key={i} className={`ppm__slot${found ? ' ppm__slot--found' : ''}`}>
        {found ? '✓' : '_'}
      </span>
    )
  })

  return (
    <li className={`pendu-play__player ppm${isMe ? ' ppm--me' : ''}${status === 'won' ? ' ppm--won' : ''}${status === 'lost' ? ' ppm--lost' : ''}`}>
      <MiniGallows strokes={strokes} status={status} />
      <span className="ppm__word" aria-hidden="true">{slots}</span>
      <div className="ppm__footer">
        <span className="ppm__name">{player.name}{isMe ? ' · toi' : ''}</span>
        <span className="ppm__pts">{player.points} pts</span>
      </div>
    </li>
  )
}

function gameFromStart(
  mode?: PenduMode,
  names?: string[],
  difficulty: Difficulty = 'medium',
  words?: string[],
): PenduGame | null {
  if (mode === 'solo') return createSoloGame(difficulty, words)
  if (mode === 'duo') return createDuoGame(undefined, difficulty, words)
  if (mode === 'multi')
    return createMultiGame(names ?? defaultNames(4), difficulty, words)
  return null
}

export function PenduPlay({
  onScoreChange,
  startMode,
  startNames,
  startDifficulty = 'medium',
  startWords,
  startWordSource = 'bank',
  onExit,
  remote,
}: PenduPlayProps) {
  const [localGame, setLocalGame] = useState<PenduGame | null>(() =>
    gameFromStart(startMode, startNames, startDifficulty, startWords),
  )
  const game = remote?.game ?? localGame
  const setGame = setLocalGame
  const [setupCount, setSetupCount] = useState(4)
  const [setupNames, setSetupNames] = useState(() => defaultNames(4))
  const lastSoloScore = useRef(false)
  const lastNames = useRef<string[]>(startNames?.length ? startNames : defaultNames(4))
  const lastMode = useRef<PenduMode>(startMode ?? 'solo')
  const lastDifficulty = useRef<Difficulty>(startDifficulty)
  const lastWordSource = useRef<PenduWordSource>(startWordSource)
  const onScoreRef = useRef(onScoreChange)
  onScoreRef.current = onScoreChange
  const [menu, setMenu] = useState<'home' | 'setup'>('home')

  useEffect(() => {
    if (game?.mode === 'solo' && game.status === 'gameOver' && !lastSoloScore.current) {
      lastSoloScore.current = true
      onScoreRef.current?.(game.totalScore)
    }
  }, [game])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!game || game.status !== 'playing') return
      if (remote && game?.mode === 'multi') {
        if (remote.busy) return
      } else if (remote && (!remote.myTurn || remote.busy)) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const k = e.key.toUpperCase()
      if (k.length === 1 && k >= 'A' && k <= 'Z') {
        e.preventDefault()
        playLetter(k)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, remote])

  function playLetter(L: string) {
    if (remote) {
      if (!remote.busy && (game?.mode !== 'multi' ? remote.myTurn : true)) remote.onLetter(L)
      return
    }
    setGame((g) => (g ? guessLetter(g, L) : g))
  }

  function playContinue() {
    if (remote) {
      remote.onContinue()
      return
    }
    setGame((g) => (g ? continuePendu(g) : g))
  }

  async function start(mode: PenduMode, names?: string[]) {
    lastSoloScore.current = false
    lastMode.current = mode
    const n = names ?? lastNames.current
    if (mode === 'multi') lastNames.current = n
    try {
      const words = await takePenduWords(
        takePenduWordsNeeded(mode),
        lastDifficulty.current,
        mode,
        lastWordSource.current,
      )
      if (mode === 'solo') setGame(createSoloGame(lastDifficulty.current, words))
      else if (mode === 'duo')
        setGame(createDuoGame(undefined, lastDifficulty.current, words))
      else setGame(createMultiGame(n, lastDifficulty.current, words))
    } catch {
      if (mode === 'solo') setGame(createSoloGame(lastDifficulty.current))
      else if (mode === 'duo') setGame(createDuoGame(undefined, lastDifficulty.current))
      else setGame(createMultiGame(n, lastDifficulty.current))
    }
    setMenu('home')
  }

  function openSetup() {
    lastMode.current = 'multi'
    setMenu('setup')
  }

  function resizeSetup(n: number) {
    const count = Math.max(MULTI_MIN, Math.min(MULTI_MAX, n))
    setSetupCount(count)
    setSetupNames((prev) => {
      const next = prev.slice(0, count)
      while (next.length < count) next.push(`Joueur ${next.length + 1}`)
      return next
    })
  }

  function backToMenu() {
    if (onExit) {
      onExit()
      return
    }
    setGame(null)
    setMenu('home')
  }

  function replay() {
    if (lastMode.current === 'multi') start('multi', lastNames.current)
    else start(lastMode.current)
  }

  if (!remote && !game && menu === 'home') {
    return (
      <div className="pendu-play">
        <p className="pendu-play__lead">Choisis un mode</p>
        <div className="pendu-play__modes">
          <button type="button" className="pendu-play__mode" onClick={() => start('solo')}>
            <span className="pendu-play__mode-name">Solo</span>
            <span className="pendu-play__mode-desc">10 mots · 9 erreurs</span>
          </button>
          <button type="button" className="pendu-play__mode" onClick={() => start('duo')}>
            <span className="pendu-play__mode-name">Duo</span>
            <span className="pendu-play__mode-desc">Équipe · tours alternés</span>
          </button>
          <button
            type="button"
            className="pendu-play__mode pendu-play__mode--multi"
            onClick={openSetup}
          >
            <span className="pendu-play__mode-name">Multi</span>
            <span className="pendu-play__mode-desc">2–8 joueurs · pendu individuel</span>
          </button>
        </div>
      </div>
    )
  }

  if (!remote && !game && menu === 'setup') {
    return (
      <div className="pendu-play">
        <p className="pendu-play__lead">Partie multi</p>
        <label className="pendu-play__slider">
          <span>
            Joueurs : <strong>{setupCount}</strong>
          </span>
          <input
            type="range"
            min={MULTI_MIN}
            max={MULTI_MAX}
            value={setupCount}
            onChange={(e) => resizeSetup(Number(e.target.value))}
          />
        </label>
        <div className="pendu-play__names">
          {setupNames.map((name, i) => (
            <input
              key={i}
              type="text"
              maxLength={16}
              value={name}
              aria-label={`Nom du joueur ${i + 1}`}
              onChange={(e) => {
                const v = e.target.value
                setSetupNames((prev) => prev.map((n, j) => (j === i ? v : n)))
              }}
            />
          ))}
        </div>
        <div className="pendu-play__row">
          <button type="button" className="pendu-play__ghost" onClick={backToMenu}>
            Retour
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => start('multi', setupNames)}
          >
            Lancer
          </button>
        </div>
      </div>
    )
  }

  if (!game) return null

  if (game.status === 'gameOver') {
    const ranked = game.mode === 'multi' ? rankedPlayers(game) : []
    return (
      <div className="pendu-play">
        <p className="pendu-play__end-title">Partie terminée</p>
        {game.mode === 'multi' ? (
          <ol className="pendu-play__rank">
            {ranked.map((p, i) => (
              <li key={`${p.name}-${i}`}>
                <span className="pendu-play__rank-pos">{i + 1}</span>
                <span className="pendu-play__rank-name">{p.name}</span>
                <span className="pendu-play__rank-pts">{p.points} pts</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="pendu-play__end-score">
            Score {game.mode === 'duo' ? 'd’équipe' : 'final'} :{' '}
            <strong>{game.totalScore}</strong>
          </p>
        )}
        {game.round.word && (
          <p className="pendu-play__reveal">
            Mot : <strong>{game.round.word}</strong>
          </p>
        )}
        <div className="pendu-play__row">
          <button type="button" className="pendu-play__ghost" onClick={backToMenu}>
            {remote ? 'Retour' : 'Menu'}
          </button>
          {!remote && (
            <button type="button" className="btn btn--primary" onClick={replay}>
              Rejouer
            </button>
          )}
        </div>
      </div>
    )
  }

  // Multi parallèle : état propre au joueur local
  const myId = remote?.myId
  const me = game.mode === 'multi' && myId
    ? resolvePenduPlayer(game, myId, { name: remote?.myName })
    : null
  const myMultiRound = me
    ? me.multiRound ?? null
    : game.mode === 'multi' && myId
      ? playerMultiRound(game, myId, { name: remote?.myName })
      : null
  const myMultiDone = myMultiRound?.status === 'won' || myMultiRound?.status === 'lost'

  // Strokes à afficher pour la potence
  const myStrokes = game.mode === 'multi' && myMultiRound != null
    ? myMultiRound.strokes
    : activeStrokes(game)

  // Slots à afficher (pour multi : selon revealed du joueur local)
  const slotsToShow = game.mode === 'multi' && myMultiRound != null
    ? game.round.word.split('').map((letter) => {
        const hyphen = letter === '-'
        return {
          letter,
          hyphen,
          shown: hyphen || myMultiRound.revealed.includes(letter),
        }
      })
    : displaySlots(game.round)

  // Lettres déjà tentées par CE joueur (multi) ou partagées (solo/duo)
  const roundActive = game.status === 'playing'
  // En multi parallèle : je peux jouer si mon status est 'playing'
  const canPlay = roundActive && (
    game.mode === 'multi'
      ? !myMultiDone && !remote?.busy
      : (!remote || (remote.myTurn && !remote.busy))
  )

  const turn = turnLabel(game)
  const activePlayer =
    game.mode === 'duo' ? game.players[game.duoTurn] : null

  return (
    <div className={`pendu-play${myMultiRound?.status === 'lost' ? ' is-lost' : ''}${myMultiRound?.status === 'won' && game.mode === 'multi' ? ' is-won' : ''}${game.wordResult === 'lost' && game.mode !== 'multi' ? ' is-lost' : ''}${game.wordResult === 'won' && game.mode !== 'multi' ? ' is-won' : ''}`}>
      <div className="pendu-play__hud">
        <div className="pendu-play__stat">
          <span className="pendu-play__stat-label">Mot</span>
          <span className="pendu-play__stat-value">
            {game.wordIndex + 1}/{game.words.length || SOLO_DUO_WORDS}
          </span>
        </div>
        {game.mode !== 'multi' && (
          <div className="pendu-play__stat">
            <span className="pendu-play__stat-label">Score</span>
            <span className="pendu-play__stat-value">
              {game.totalScore}
              {canPlay ? ` · ${game.wordScore}` : ''}
            </span>
          </div>
        )}
        {game.mode === 'multi' && myMultiRound && (
          <div className="pendu-play__stat">
            <span className="pendu-play__stat-label">Pts</span>
            <span className="pendu-play__stat-value">
              {me?.points ?? game.players.find((p) => p.id === myId)?.points ?? 0}
            </span>
          </div>
        )}
        {turn && (
          <div className="pendu-play__stat pendu-play__stat--turn">
            <span className="pendu-play__stat-label">Tour</span>
            <span className="pendu-play__stat-value">
              {activePlayer?.name ?? `Joueur ${game.duoTurn + 1}`}
            </span>
          </div>
        )}
      </div>

      <PenduGallows strokes={myStrokes} className="pendu-play__gallows" />

      <p className="pendu-play__word" aria-live="polite">
        {slotsToShow.map((s, i) => (
          <span
            key={`${i}-${s.letter}`}
            className={`${s.shown ? 'is-shown' : ''}${s.hyphen ? ' is-hyphen' : ''}`.trim() || undefined}
          >
            {s.hyphen ? '-' : s.shown ? s.letter : '_'}
          </span>
        ))}
      </p>

      {game.message && (
        <p className="pendu-play__msg" role="status">
          {game.message}
        </p>
      )}

      {/* Multi parallèle : si j'ai terminé ce mot, j'attends les autres */}
      {game.mode === 'multi' && myMultiDone && roundActive && (
        <p className="pendu-play__waiting">
          {myMultiRound?.status === 'won' ? '✅ Mot trouvé !' : '💀 Pendu !'}{' '}
          En attente des autres joueurs…
        </p>
      )}

      {game.status === 'wordOver' && game.mode !== 'multi' && (
        <button
          type="button"
          className="btn btn--primary pendu-play__continue"
          onClick={() => playContinue()}
        >
          {game.wordIndex + 1 >= game.words.length ? 'Voir le score' : 'Mot suivant'}
        </button>
      )}

      {roundActive && (
        <div className="pendu-play__keys" aria-label="Clavier">
          {AZERTY_ROWS.map((row, r) => (
            <div
              key={r}
              className={`pendu-play__key-row${r === 2 ? ' pendu-play__key-row--short' : ''}`}
            >
              {row.map((L) => {
                const st = game.mode === 'multi' && myMultiRound != null
                  ? (myMultiRound.guesses.includes(L)
                      ? (game.round.unique.includes(L) ? 'good' : 'bad')
                      : 'idle')
                  : letterKeyState(game.round, L)
                return (
                  <button
                    key={L}
                    type="button"
                    className={`pendu-play__key is-${st}`}
                    disabled={!canPlay || st !== 'idle'}
                    onClick={() => playLetter(L)}
                  >
                    {L}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {onExit && (
        <button
          type="button"
          className="pendu-play__ghost"
          onClick={backToMenu}
        >
          {remote ? 'Retour à la salle' : 'Quitter'}
        </button>
      )}

      {game.mode === 'multi' && (
        <ul className="pendu-play__players pendu-play__players--parallel">
          {game.players.map((p, i) => (
            <MultiPlayerMini
              key={p.id || `${p.name}-${i}`}
              player={p}
              word={game.round.word}
              isMe={Boolean(
                (p.id && myId && p.id === myId) ||
                  (me && p === me) ||
                  (p.id && me?.id && p.id === me.id),
              )}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
