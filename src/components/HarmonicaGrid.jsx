import { useState, useRef, useCallback, useEffect } from 'react'
import { useAudioEngine } from '../hooks/useAudioEngine'

// ─── Tuning definitions ───────────────────────────────────────────────────────
// Paddy Richter raises hole 3 blow one whole step (G4 → A4) for Celtic playing
const TUNINGS = [
  {
    id: 'richter',
    name: 'RICHTER TUNING',
    rows: [
      // Blow (top row)
      [
        { label: 'C4',  freq: 261.63 },
        { label: 'E4',  freq: 329.63 },
        { label: 'G4',  freq: 392.00 },
        { label: 'C5',  freq: 523.25 },
        { label: 'E5',  freq: 659.25 },
        { label: 'G5',  freq: 783.99 },
        { label: 'C6',  freq: 1046.50 },
        { label: 'E6',  freq: 1318.51 },
        { label: 'G6',  freq: 1567.98 },
        { label: 'C7',  freq: 2093.00 },
      ],
      // Draw (bottom row)
      [
        { label: 'D4',  freq: 293.66 },
        { label: 'G4',  freq: 392.00 },
        { label: 'B4',  freq: 493.88 },
        { label: 'D5',  freq: 587.33 },
        { label: 'F5',  freq: 698.46 },
        { label: 'A5',  freq: 880.00 },
        { label: 'B5',  freq: 987.77 },
        { label: 'D6',  freq: 1174.66 },
        { label: 'F6',  freq: 1396.91 },
        { label: 'A6',  freq: 1760.00 },
      ],
    ],
  },
  {
    id: 'paddy-richter',
    name: 'PADDY RICHTER',
    rows: [
      // Blow: hole 3 raised G4 → A4
      [
        { label: 'C4',  freq: 261.63 },
        { label: 'E4',  freq: 329.63 },
        { label: 'A4',  freq: 440.00 },
        { label: 'C5',  freq: 523.25 },
        { label: 'E5',  freq: 659.25 },
        { label: 'G5',  freq: 783.99 },
        { label: 'C6',  freq: 1046.50 },
        { label: 'E6',  freq: 1318.51 },
        { label: 'G6',  freq: 1567.98 },
        { label: 'C7',  freq: 2093.00 },
      ],
      // Draw: identical to Richter
      [
        { label: 'D4',  freq: 293.66 },
        { label: 'G4',  freq: 392.00 },
        { label: 'B4',  freq: 493.88 },
        { label: 'D5',  freq: 587.33 },
        { label: 'F5',  freq: 698.46 },
        { label: 'A5',  freq: 880.00 },
        { label: 'B5',  freq: 987.77 },
        { label: 'D6',  freq: 1174.66 },
        { label: 'F6',  freq: 1396.91 },
        { label: 'A6',  freq: 1760.00 },
      ],
    ],
  },
]

const ROW_LABELS = ['BLOW', 'DRAW']

// Must match BEND_PX_RANGE in useAudioEngine so visual scale tracks pitch 1-to-1
const VISUAL_BEND_PX_RANGE = 120

const keyId     = (row, col) => `${row}-${col}`
const voiceId   = (id)       => `touch-${id}`

// ─── Component ────────────────────────────────────────────────────────────────
export function HarmonicaGrid() {
  const { startNote, bendNote, stopNote } = useAudioEngine()

  const [activeTuningId, setActiveTuningId] = useState('richter')
  const [activeKeys, setActiveKeys]         = useState(new Set())
  // bendStates: Map<keyId, { bendAmount: 0–1, bendDirection: 'up' | 'down' }>
  const [bendStates, setBendStates]         = useState(new Map())

  const tuning   = TUNINGS.find(t => t.id === activeTuningId)
  const notes    = tuning.rows

  // Keep a ref so event callbacks always read the latest tuning without
  // needing to be recreated every time tuning changes
  const notesRef = useRef(notes)
  notesRef.current = notes

  // Touch tracking: identifier → { row, col, startY }
  // startY resets each time a finger glides onto a new square, so bend
  // always measures from the moment the current note was entered
  const touchMapRef = useRef(new Map())

  // ── Bend visual helper ───────────────────────────────────────────────────
  const updateBendVisual = useCallback((row, col, deltaY) => {
    // deltaY = startY − currentY: positive means finger moved UP
    // bendDirection tracks screen direction: 'down' = finger moved toward bottom
    const bendAmount    = Math.min(1, Math.abs(deltaY) / VISUAL_BEND_PX_RANGE)
    const bendDirection = deltaY < 0 ? 'down' : 'up'
    setBendStates(prev => {
      const next = new Map(prev)
      next.set(keyId(row, col), { bendAmount, bendDirection })
      return next
    })
  }, [])

  // ── Core note helpers ────────────────────────────────────────────────────
  const activateKey = useCallback((row, col, vid) => {
    startNote(vid, notesRef.current[row][col].freq)
    setActiveKeys(prev => new Set([...prev, keyId(row, col)]))
  }, [startNote])

  const deactivateKey = useCallback((row, col, vid) => {
    stopNote(vid)
    const id = keyId(row, col)
    setActiveKeys(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setBendStates(prev => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [stopNote])

  // ── Touch handlers ───────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    e.preventDefault()
    for (const touch of e.changedTouches) {
      const el  = document.elementFromPoint(touch.clientX, touch.clientY)
      const row = el ? parseInt(el.dataset.row) : NaN
      const col = el ? parseInt(el.dataset.col) : NaN
      if (isNaN(row) || isNaN(col)) continue

      touchMapRef.current.set(touch.identifier, { row, col, startY: touch.clientY })
      activateKey(row, col, voiceId(touch.identifier))
    }
  }, [activateKey])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    for (const touch of e.changedTouches) {
      const entry = touchMapRef.current.get(touch.identifier)
      if (!entry) continue

      const el     = document.elementFromPoint(touch.clientX, touch.clientY)
      const newRow = el ? parseInt(el.dataset.row) : NaN
      const newCol = el ? parseInt(el.dataset.col) : NaN

      const movedToNewSquare =
        !isNaN(newRow) && !isNaN(newCol) &&
        (newRow !== entry.row || newCol !== entry.col)

      if (movedToNewSquare) {
        // Horizontal glide: transition to the new note
        deactivateKey(entry.row, entry.col, voiceId(touch.identifier))
        touchMapRef.current.set(touch.identifier, {
          row: newRow, col: newCol, startY: touch.clientY,
        })
        activateKey(newRow, newCol, voiceId(touch.identifier))
      } else {
        // Vertical movement: bend the current note
        // Upward finger movement (negative screen delta) = pitch up
        const deltaY = entry.startY - touch.clientY
        bendNote(voiceId(touch.identifier), deltaY)
        updateBendVisual(entry.row, entry.col, deltaY)
      }
    }
  }, [activateKey, deactivateKey, bendNote, updateBendVisual])

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault()
    for (const touch of e.changedTouches) {
      const entry = touchMapRef.current.get(touch.identifier)
      if (!entry) continue
      deactivateKey(entry.row, entry.col, voiceId(touch.identifier))
      touchMapRef.current.delete(touch.identifier)
    }
  }, [deactivateKey])

  // ── Mouse handlers (desktop testing) ────────────────────────────────────
  const mouseRef = useRef(null) // { row, col, startY }

  const handleMouseDown = useCallback((e, row, col) => {
    e.preventDefault()
    if (mouseRef.current) {
      deactivateKey(mouseRef.current.row, mouseRef.current.col, 'mouse-0')
    }
    mouseRef.current = { row, col, startY: e.clientY }
    activateKey(row, col, 'mouse-0')
  }, [activateKey, deactivateKey])

  const handleMouseMove = useCallback((e) => {
    if (!mouseRef.current) return
    const el     = document.elementFromPoint(e.clientX, e.clientY)
    const newRow = el ? parseInt(el.dataset.row) : NaN
    const newCol = el ? parseInt(el.dataset.col) : NaN

    const movedToNewSquare =
      !isNaN(newRow) && !isNaN(newCol) &&
      (newRow !== mouseRef.current.row || newCol !== mouseRef.current.col)

    if (movedToNewSquare) {
      deactivateKey(mouseRef.current.row, mouseRef.current.col, 'mouse-0')
      mouseRef.current = { row: newRow, col: newCol, startY: e.clientY }
      activateKey(newRow, newCol, 'mouse-0')
    } else {
      const deltaY = mouseRef.current.startY - e.clientY
      bendNote('mouse-0', deltaY)
      updateBendVisual(mouseRef.current.row, mouseRef.current.col, deltaY)
    }
  }, [activateKey, deactivateKey, bendNote, updateBendVisual])

  const handleMouseUp = useCallback(() => {
    if (!mouseRef.current) return
    deactivateKey(mouseRef.current.row, mouseRef.current.col, 'mouse-0')
    mouseRef.current = null
  }, [deactivateKey])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup',   handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup',   handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // ── Tuning switcher ──────────────────────────────────────────────────────
  const handleTuningChange = useCallback((id) => {
    // Kill all active voices before switching so nothing keeps ringing
    touchMapRef.current.forEach((_, touchId) => stopNote(voiceId(touchId)))
    touchMapRef.current.clear()
    if (mouseRef.current) {
      stopNote('mouse-0')
      mouseRef.current = null
    }
    setActiveKeys(new Set())
    setBendStates(new Map())
    setActiveTuningId(id)
  }, [stopNote])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={styles.wrapper}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div style={styles.title}>SOUNDGRAPH</div>
      <div style={styles.subtitle}>{tuning.name}</div>

      {/* ── Main grid ── */}
      <div style={styles.gridContainer}>
        <div style={styles.headerRow}>
          <div style={styles.rowLabelSpacer} />
          {notes[0].map((_, i) => (
            <div key={i} style={styles.holeLabel}>{i + 1}</div>
          ))}
        </div>

        {notes.map((row, rowIdx) => (
          <div key={rowIdx} style={styles.row}>
            <div style={styles.rowLabel}>{ROW_LABELS[rowIdx]}</div>
            {row.map((note, colIdx) => {
              const active = activeKeys.has(keyId(rowIdx, colIdx))

              // ── Bend-stretch transform ──────────────────────────────────
              // Check this key's own bend and both adjacent neighbors
              const selfBend  = bendStates.get(keyId(rowIdx, colIdx))
              const aboveBend = rowIdx > 0
                ? bendStates.get(keyId(rowIdx - 1, colIdx))
                : undefined
              const belowBend = rowIdx < notes.length - 1
                ? bendStates.get(keyId(rowIdx + 1, colIdx))
                : undefined

              let bendTransform = {}

              if (selfBend && selfBend.bendAmount > 0.01) {
                // Held key: grow toward the bend direction (100% → 150%)
                const scale  = 1 + 0.5 * selfBend.bendAmount
                const origin = selfBend.bendDirection === 'down'
                  ? 'top center'
                  : 'bottom center'
                bendTransform = {
                  transform:       `scaleY(${scale.toFixed(4)})`,
                  transformOrigin: origin,
                  zIndex:          2,
                }
              } else if (
                aboveBend &&
                aboveBend.bendDirection === 'down' &&
                aboveBend.bendAmount > 0.01
              ) {
                // Key above is stretching down toward us – retreat from top (100% → 75%)
                const scale = 1 - 0.5 * aboveBend.bendAmount
                bendTransform = {
                  transform:       `scaleY(${scale.toFixed(4)})`,
                  transformOrigin: 'bottom center',
                }
              } else if (
                belowBend &&
                belowBend.bendDirection === 'up' &&
                belowBend.bendAmount > 0.01
              ) {
                // Key below is stretching up toward us – retreat from bottom (100% → 75%)
                const scale = 1 - 0.5 * belowBend.bendAmount
                bendTransform = {
                  transform:       `scaleY(${scale.toFixed(4)})`,
                  transformOrigin: 'top center',
                }
              }

              return (
                <div
                  key={colIdx}
                  data-row={rowIdx}
                  data-col={colIdx}
                  style={{
                    ...styles.key,
                    ...(active ? styles.keyActive : styles.keyInactive),
                    ...bendTransform,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, rowIdx, colIdx)}
                >
                  <span style={{ ...styles.noteLabel, pointerEvents: 'none' }}>
                    {note.label}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* ── Tuning selector ── */}
      <div style={styles.tuningRow}>
        {TUNINGS.map(t => (
          <button
            key={t.id}
            style={{
              ...styles.tuningBtn,
              ...(activeTuningId === t.id ? styles.tuningBtnActive : {}),
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleTuningChange(t.id) }}
            onClick={() => handleTuningChange(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div style={styles.hint}>
        SLIDE ACROSS TO GLIDE  ·  SLIDE UP / DOWN TO BEND
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    background: '#000',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    fontFamily: '"Courier New", Courier, monospace',
  },
  title: {
    color: '#00ff41',
    fontSize: 'clamp(14px, 3vw, 22px)',
    letterSpacing: '0.4em',
    marginBottom: '4px',
    textShadow: '0 0 8px #00ff41',
  },
  subtitle: {
    color: '#005c13',
    fontSize: 'clamp(8px, 1.6vw, 11px)',
    letterSpacing: '0.3em',
    marginBottom: '28px',
  },
  gridContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '2px',
  },
  rowLabelSpacer: { width: '42px' },
  holeLabel: {
    width: 'clamp(42px, 7vw, 62px)',
    textAlign: 'center',
    color: '#004d10',
    fontSize: 'clamp(9px, 1.4vw, 12px)',
    letterSpacing: '0.1em',
    fontFamily: '"Courier New", Courier, monospace',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
  },
  rowLabel: {
    width: '42px',
    color: '#005c13',
    fontSize: 'clamp(7px, 1.2vw, 10px)',
    letterSpacing: '0.2em',
    textAlign: 'right',
    paddingRight: '6px',
    fontFamily: '"Courier New", Courier, monospace',
  },
  key: {
    width: 'clamp(42px, 7vw, 62px)',
    height: 'clamp(52px, 10vw, 80px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #003a0d',
    cursor: 'pointer',
    transition: 'background 0.04s, box-shadow 0.04s, transform 0.05s ease-out',
    position: 'relative',
  },
  keyInactive: {
    background: '#020e04',
    boxShadow: 'inset 0 0 6px #001a04',
  },
  keyActive: {
    background: '#00ff41',
    boxShadow: '0 0 14px #00ff41, 0 0 28px #00cc33, inset 0 0 8px #88ffaa',
    border: '1px solid #00ff41',
  },
  noteLabel: {
    color: '#00ff41',
    fontSize: 'clamp(8px, 1.4vw, 12px)',
    letterSpacing: '0.05em',
    textShadow: '0 0 4px #00ff41',
    fontFamily: '"Courier New", Courier, monospace',
  },
  tuningRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: '10px',
    marginTop: '24px',
  },
  tuningBtn: {
    background: 'transparent',
    border: '1px solid #003a0d',
    color: '#005c13',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: 'clamp(7px, 1.2vw, 10px)',
    letterSpacing: '0.2em',
    padding: '5px 10px',
    cursor: 'pointer',
    transition: 'color 0.1s, border-color 0.1s',
    touchAction: 'manipulation',
  },
  tuningBtnActive: {
    color: '#00ff41',
    borderColor: '#00ff41',
    textShadow: '0 0 6px #00ff41',
    boxShadow: '0 0 8px #003a0d',
  },
  hint: {
    marginTop: '14px',
    color: '#015514',
    fontSize: 'clamp(7px, 1.2vw, 10px)',
    letterSpacing: '0.25em',
    fontFamily: '"Courier New", Courier, monospace',
  },
}
