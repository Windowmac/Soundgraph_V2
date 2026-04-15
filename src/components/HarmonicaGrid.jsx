import { useState, useRef, useCallback, useEffect } from 'react'
import { useAudioEngine } from '../hooks/useAudioEngine'

// C Diatonic Harmonica — 10 holes
// Row 0 = Blow (exhale), Row 1 = Draw (inhale)
const NOTES = [
  // Blow row (top)
  [
    { label: 'C4',  freq: 261.63, hole: 1 },
    { label: 'E4',  freq: 329.63, hole: 2 },
    { label: 'G4',  freq: 392.00, hole: 3 },
    { label: 'C5',  freq: 523.25, hole: 4 },
    { label: 'E5',  freq: 659.25, hole: 5 },
    { label: 'G5',  freq: 783.99, hole: 6 },
    { label: 'C6',  freq: 1046.50, hole: 7 },
    { label: 'E6',  freq: 1318.51, hole: 8 },
    { label: 'G6',  freq: 1567.98, hole: 9 },
    { label: 'C7',  freq: 2093.00, hole: 10 },
  ],
  // Draw row (bottom)
  [
    { label: 'D4',  freq: 293.66, hole: 1 },
    { label: 'G4',  freq: 392.00, hole: 2 },
    { label: 'B4',  freq: 493.88, hole: 3 },
    { label: 'D5',  freq: 587.33, hole: 4 },
    { label: 'F5',  freq: 698.46, hole: 5 },
    { label: 'A5',  freq: 880.00, hole: 6 },
    { label: 'B5',  freq: 987.77, hole: 7 },
    { label: 'D6',  freq: 1174.66, hole: 8 },
    { label: 'F6',  freq: 1396.91, hole: 9 },
    { label: 'A6',  freq: 1760.00, hole: 10 },
  ],
]

const ROW_LABELS = ['BLOW', 'DRAW']

export function HarmonicaGrid() {
  const { startNote, bendNote, stopNote } = useAudioEngine()

  // activeKeys: Set of "row-col" strings
  const [activeKeys, setActiveKeys] = useState(new Set())

  // Map touchId -> { row, col, startX }
  const touchMapRef = useRef(new Map())

  const keyId = (row, col) => `${row}-${col}`
  const touchNoteId = (touchId) => `touch-${touchId}`

  const activateKey = useCallback((row, col, touchId) => {
    const noteId = touchNoteId(touchId)
    const note = NOTES[row][col]
    startNote(noteId, note.freq)
    setActiveKeys(prev => new Set([...prev, keyId(row, col)]))
  }, [startNote])

  const deactivateKey = useCallback((row, col, touchId) => {
    const noteId = touchNoteId(touchId)
    stopNote(noteId)
    setActiveKeys(prev => {
      const next = new Set(prev)
      next.delete(keyId(row, col))
      return next
    })
  }, [stopNote])

  const handleTouchStart = useCallback((e) => {
    e.preventDefault()
    Array.from(e.changedTouches).forEach(touch => {
      const el = document.elementFromPoint(touch.clientX, touch.clientY)
      if (!el) return
      const row = parseInt(el.dataset.row)
      const col = parseInt(el.dataset.col)
      if (isNaN(row) || isNaN(col)) return

      touchMapRef.current.set(touch.identifier, { row, col, startX: touch.clientX })
      activateKey(row, col, touch.identifier)
    })
  }, [activateKey])

  const handleTouchMove = useCallback((e) => {
    e.preventDefault()
    Array.from(e.changedTouches).forEach(touch => {
      const entry = touchMapRef.current.get(touch.identifier)
      if (!entry) return

      const deltaX = touch.clientX - entry.startX
      bendNote(touchNoteId(touch.identifier), deltaX)
    })
  }, [bendNote])

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault()
    Array.from(e.changedTouches).forEach(touch => {
      const entry = touchMapRef.current.get(touch.identifier)
      if (!entry) return
      deactivateKey(entry.row, entry.col, touch.identifier)
      touchMapRef.current.delete(touch.identifier)
    })
  }, [deactivateKey])

  // Mouse support for desktop testing
  const mouseVoiceRef = useRef(null)
  const mouseStartXRef = useRef(0)

  const handleMouseDown = useCallback((e, row, col) => {
    const voiceId = 'mouse-0'
    mouseVoiceRef.current = { row, col }
    mouseStartXRef.current = e.clientX
    startNote(voiceId, NOTES[row][col].freq)
    setActiveKeys(prev => new Set([...prev, keyId(row, col)]))
  }, [startNote])

  const handleMouseMove = useCallback((e) => {
    if (!mouseVoiceRef.current) return
    const deltaX = e.clientX - mouseStartXRef.current
    bendNote('mouse-0', deltaX)
  }, [bendNote])

  const handleMouseUp = useCallback(() => {
    if (!mouseVoiceRef.current) return
    const { row, col } = mouseVoiceRef.current
    stopNote('mouse-0')
    setActiveKeys(prev => {
      const next = new Set(prev)
      next.delete(keyId(row, col))
      return next
    })
    mouseVoiceRef.current = null
  }, [stopNote])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <div
      style={styles.wrapper}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div style={styles.title}>SOUNDGRAPH</div>
      <div style={styles.subtitle}>C DIATONIC HARMONICA</div>

      <div style={styles.gridContainer}>
        {/* Hole number header */}
        <div style={styles.headerRow}>
          <div style={styles.rowLabelSpacer} />
          {NOTES[0].map((note) => (
            <div key={note.hole} style={styles.holeLabel}>
              {note.hole}
            </div>
          ))}
        </div>

        {NOTES.map((row, rowIdx) => (
          <div key={rowIdx} style={styles.row}>
            <div style={styles.rowLabel}>{ROW_LABELS[rowIdx]}</div>
            {row.map((note, colIdx) => {
              const active = activeKeys.has(keyId(rowIdx, colIdx))
              return (
                <div
                  key={colIdx}
                  data-row={rowIdx}
                  data-col={colIdx}
                  style={{
                    ...styles.key,
                    ...(active ? styles.keyActive : styles.keyInactive),
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

      <div style={styles.hint}>
        HOLD + SLIDE LATERALLY TO BEND
      </div>
    </div>
  )
}

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
    fontSize: 'clamp(8px, 1.6vw, 12px)',
    letterSpacing: '0.3em',
    marginBottom: '32px',
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
  rowLabelSpacer: {
    width: '42px',
  },
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
    transition: 'background 0.04s, box-shadow 0.04s',
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
  hint: {
    marginTop: '28px',
    color: '#003a0d',
    fontSize: 'clamp(7px, 1.2vw, 10px)',
    letterSpacing: '0.25em',
    fontFamily: '"Courier New", Courier, monospace',
  },
}
