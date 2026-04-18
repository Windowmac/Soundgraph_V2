import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Tuning } from '../data/tunings';

// ─── Constants ────────────────────────────────────────────────────────────────
const VISUAL_BEND_PX_RANGE = 120; // must match BEND_PX_RANGE in useAudioEngine.ts

const C = {
  GREEN:       '#00ff41',
  DIM_GREEN:   '#005c13',
  DIMMER:      '#003a0d',
  BLACK:       '#000000',
  KEY_BG:      '#020e04',
  KEY_BORDER:  '#003a0d',
} as const;

const MONOSPACE = Platform.select({
  ios:     'Courier New',
  android: 'monospace',
  default: 'Courier New',
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface BendState {
  amount:    number;          // 0 – 1
  direction: 'up' | 'down';  // finger moved up → pitch up
}

interface TouchEntry {
  row:    number;
  col:    number;
  startY: number; // y at the moment this note was entered (resets on glide)
}

interface Props {
  tuning:   Tuning;
  disabled: boolean; // true when the tuning menu is open
}

// ─── Component ────────────────────────────────────────────────────────────────
export function HarmonicaGrid({ tuning, disabled }: Props) {
  const { startNote, bendNote, stopNote, stopAll } = useAudioEngine();

  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [bendStates, setBendStates] = useState<Map<string, BendState>>(new Map());

  // Stores the pixel dimensions of the key area View so we can map touches → cells
  const keyAreaLayout = useRef({ width: 0, height: 0 });

  // Maps each active touch identifier to the note it is currently playing
  const touchMapRef = useRef<Map<number, TouchEntry>>(new Map());

  // ── Key identity helper ────────────────────────────────────────────────────
  const keyId = (row: number, col: number) => `${row}-${col}`;

  // ── Geometry: map a pixel coordinate to a grid cell ───────────────────────
  // The key area spans 2 rows × 10 columns with no offsets.
  // Returns null when the point is outside the View bounds.
  const getKeyFromPoint = useCallback(
    (x: number, y: number): { row: number; col: number } | null => {
      const { width, height } = keyAreaLayout.current;
      if (width === 0 || height === 0) return null;
      if (x < 0 || x >= width || y < 0 || y >= height) return null;
      const col = Math.min(9, Math.max(0, Math.floor((x / width) * 10)));
      const row = Math.min(1, Math.max(0, Math.floor((y / height) * 2)));
      return { row, col };
    },
    []
  );

  // ── Reset state whenever the tuning changes ────────────────────────────────
  useEffect(() => {
    stopAll();
    touchMapRef.current.clear();
    setActiveKeys(new Set());
    setBendStates(new Map());
  }, [tuning.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activate / deactivate a key ───────────────────────────────────────────
  const activateKey = useCallback(
    (row: number, col: number, touchId: number) => {
      startNote(touchId, tuning.rows[row][col].freq);
      setActiveKeys(prev => new Set([...prev, keyId(row, col)]));
    },
    [startNote, tuning]
  );

  const deactivateKey = useCallback(
    (row: number, col: number, touchId: number) => {
      stopNote(touchId);
      const id = keyId(row, col);
      setActiveKeys(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setBendStates(prev => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
    [stopNote]
  );

  // ── Touch handlers ────────────────────────────────────────────────────────
  const handleTouchStart = useCallback(
    (e: any) => {
      if (disabled) return;
      const { changedTouches } = e.nativeEvent;
      for (const touch of changedTouches) {
        const { identifier, locationX, locationY } = touch;
        const key = getKeyFromPoint(locationX, locationY);
        if (!key) continue;
        touchMapRef.current.set(identifier, { ...key, startY: locationY });
        activateKey(key.row, key.col, identifier);
      }
    },
    [disabled, getKeyFromPoint, activateKey]
  );

  const handleTouchMove = useCallback(
    (e: any) => {
      if (disabled) return;
      const { changedTouches } = e.nativeEvent;
      for (const touch of changedTouches) {
        const { identifier, locationX, locationY } = touch;
        const entry = touchMapRef.current.get(identifier);
        if (!entry) continue;

        const newKey = getKeyFromPoint(locationX, locationY);

        if (newKey && (newKey.row !== entry.row || newKey.col !== entry.col)) {
          // ── Glide: finger crossed into a different cell ──────────────────
          deactivateKey(entry.row, entry.col, identifier);
          touchMapRef.current.set(identifier, { ...newKey, startY: locationY });
          activateKey(newKey.row, newKey.col, identifier);
        } else {
          // ── Bend: vertical movement on the same cell ─────────────────────
          // Positive deltaY = finger moved UP = pitch rises
          const deltaY     = entry.startY - locationY;
          bendNote(identifier, deltaY);

          const id         = keyId(entry.row, entry.col);
          const bendAmount = Math.min(1, Math.abs(deltaY) / VISUAL_BEND_PX_RANGE);
          const direction  = deltaY < 0 ? 'down' : 'up';

          setBendStates(prev => {
            const next = new Map(prev);
            next.set(id, { amount: bendAmount, direction });
            return next;
          });
        }
      }
    },
    [disabled, getKeyFromPoint, activateKey, deactivateKey, bendNote]
  );

  const handleTouchEnd = useCallback(
    (e: any) => {
      const { changedTouches } = e.nativeEvent;
      for (const touch of changedTouches) {
        const { identifier } = touch;
        const entry = touchMapRef.current.get(identifier);
        if (!entry) continue;
        deactivateKey(entry.row, entry.col, identifier);
        touchMapRef.current.delete(identifier);
      }
    },
    [deactivateKey]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Row labels column (BLOW / DRAW) — outside touch area ── */}
      <View style={styles.labelColumn} pointerEvents="none">
        {tuning.rows.map((_, rowIdx) => (
          <View key={rowIdx} style={styles.labelCell}>
            <Text style={styles.rowLabel}>
              {rowIdx === 0 ? 'BLOW' : 'DRAW'}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Key area — the single touch-event target ── */}
      <View
        style={styles.keyArea}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          keyAreaLayout.current = { width, height };
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {tuning.rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row} pointerEvents="none">
            {row.map((note, colIdx) => {
              const active = activeKeys.has(keyId(rowIdx, colIdx));
              const bend   = bendStates.get(keyId(rowIdx, colIdx));

              return (
                <View
                  key={colIdx}
                  style={[
                    styles.key,
                    active ? styles.keyActive : styles.keyInactive,
                    colIdx === 9 && styles.keyLast,
                  ]}
                  pointerEvents="none"
                >
                  {/* Hole number — small, top-center */}
                  <Text style={[styles.holeNum, active && styles.holeNumActive]}>
                    {colIdx + 1}
                  </Text>

                  {/* Note name — prominent, centered */}
                  <Text style={[styles.noteLabel, active && styles.noteLabelActive]}>
                    {note.label}
                  </Text>

                  {/* Bend indicator bar */}
                  {bend && bend.amount > 0.03 && (
                    <View
                      style={[
                        styles.bendBar,
                        { height: Math.max(3, Math.round(bend.amount * 12)) },
                        bend.direction === 'up'
                          ? styles.bendBarTop
                          : styles.bendBarBottom,
                      ]}
                    />
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex:           1,
    flexDirection:  'row',
    backgroundColor: C.BLACK,
  },

  // ── Label column ──────────────────────────────────────────────────────────
  labelColumn: {
    width:          44,
    flexDirection:  'column',
  },
  labelCell: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'flex-end',
    paddingRight:   6,
    borderRightWidth: 1,
    borderRightColor: C.DIMMER,
  },
  rowLabel: {
    color:          C.DIM_GREEN,
    fontFamily:     MONOSPACE,
    fontSize:       9,
    letterSpacing:  1.5,
  },

  // ── Key area ──────────────────────────────────────────────────────────────
  keyArea: {
    flex:           1,
    flexDirection:  'column',
  },
  row: {
    flex:           1,
    flexDirection:  'row',
  },

  // ── Individual keys ───────────────────────────────────────────────────────
  key: {
    flex:             1,
    justifyContent:   'center',
    alignItems:       'center',
    borderRightWidth: 1,
    borderRightColor: C.KEY_BORDER,
    borderTopWidth:   1,
    borderTopColor:   C.KEY_BORDER,
    position:         'relative',
    overflow:         'hidden',
  },
  keyLast: {
    borderRightWidth: 0,
  },
  keyInactive: {
    backgroundColor: C.KEY_BG,
  },
  keyActive: {
    backgroundColor: C.GREEN,
    // Shadow only works on iOS; Android uses elevation
    shadowColor:     C.GREEN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.9,
    shadowRadius:    10,
    elevation:       8,
    zIndex:          2,
  },

  // ── Key labels ────────────────────────────────────────────────────────────
  holeNum: {
    position:     'absolute',
    top:          5,
    left:         0,
    right:        0,
    textAlign:    'center',
    fontFamily:   MONOSPACE,
    fontSize:     9,
    color:        C.DIMMER,
    letterSpacing: 0.5,
  },
  holeNumActive: {
    color: 'rgba(0,0,0,0.4)',
  },
  noteLabel: {
    fontFamily:   MONOSPACE,
    fontSize:     15,
    color:        C.GREEN,
    letterSpacing: 0.5,
    textShadowColor: C.GREEN,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius:  4,
  },
  noteLabelActive: {
    color:            C.BLACK,
    textShadowRadius: 0,
  },

  // ── Bend indicator ────────────────────────────────────────────────────────
  bendBar: {
    position:        'absolute',
    left:            0,
    right:           0,
    backgroundColor: 'rgba(0,255,65,0.55)',
  },
  bendBarTop: {
    top: 0,
  },
  bendBarBottom: {
    bottom: 0,
  },
});
