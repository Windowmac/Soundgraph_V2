import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Dimensions,
} from 'react-native';

import {
  ChordSlot, ChordDefinition, RootNote, ChordVariant,
  buildChord, OPEN_STRING_FREQS,
} from '../data/chords';
import { useGuitarAudio }  from '../hooks/useGuitarAudio';
import { ChordPad }        from './ChordPad';
import { StrumArea }       from './StrumArea';
import { RadialMenu }      from './RadialMenu';

// ─── Layout constants ─────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');

// Chord button diameter: target ~120dp, capped so 3 buttons + gaps fit screen
const BUTTON_GAP  = 10;
const BUTTON_DIAM = Math.min(120, Math.floor((SW - BUTTON_GAP * 4) / 3));
const BUTTON_R    = BUTTON_DIAM / 2;

// Position 9 buttons in a 3×3 grid anchored to the top-left quadrant
const GRID_COLS   = 3;
const GRID_ROWS   = 3;
const GRID_LEFT   = BUTTON_GAP + BUTTON_R;
const GRID_TOP    = BUTTON_GAP + BUTTON_R;

// Pre-compute all button centers [{ cx, cy }]
const CHORD_POSITIONS: Array<{ cx: number; cy: number }> = Array.from(
  { length: GRID_COLS * GRID_ROWS },
  (_, i) => {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    return {
      cx: GRID_LEFT  + col * (BUTTON_DIAM + BUTTON_GAP),
      cy: GRID_TOP   + row * (BUTTON_DIAM + BUTTON_GAP),
    };
  }
);

const LONG_PRESS_MS  = 400;
const CANCEL_MOVE_PX = 8;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RadialState {
  slotIndex: number;
  origin:    { x: number; y: number };
  dragPos:   { x: number; y: number };
}

interface Props {
  chordSlots:   ChordSlot[];
  onUpdateSlot: (index: number, chord: ChordDefinition) => void;
  editMode:     boolean;
  disabled:     boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSlotFromPoint(x: number, y: number): number | null {
  for (let i = 0; i < CHORD_POSITIONS.length; i++) {
    const { cx, cy } = CHORD_POSITIONS[i];
    if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= BUTTON_R) return i;
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GuitarLayout({ chordSlots, onUpdateSlot, editMode, disabled }: Props) {
  const { strumChord, stopChord, stopAll } = useGuitarAudio();

  const [heldSlotIndex, setHeldSlotIndex] = useState<number | null>(null);
  const [radialState,   setRadialState]   = useState<RadialState | null>(null);

  // Stale-closure-safe refs
  const editModeRef     = useRef(editMode);
  const chordSlotsRef   = useRef(chordSlots);
  const onUpdateSlotRef = useRef(onUpdateSlot);
  useEffect(() => { editModeRef.current     = editMode;    }, [editMode]);
  useEffect(() => { chordSlotsRef.current   = chordSlots;  }, [chordSlots]);
  useEffect(() => { onUpdateSlotRef.current = onUpdateSlot;}, [onUpdateSlot]);

  // touchId → 'chord' | 'strum' | 'radial-drag'
  const touchRoleRef     = useRef<Map<number, 'chord' | 'strum'>>(new Map());
  // touchId → slotIndex  (chord presses only)
  const chordTouchMapRef = useRef<Map<number, number>>(new Map());

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const radialStateRef    = useRef<RadialState | null>(null);
  const dragPosRef        = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => { radialStateRef.current = radialState; }, [radialState]);

  // ── Audio helpers ────────────────────────────────────────────────────────────

  const tryStartChord = (slotIndex: number, strumId: number) => {
    const chord = chordSlotsRef.current[slotIndex]?.chord;
    if (!chord) return;
    strumChord(strumId, chord.frequencies);
  };

  const tryStrumOpen = (strumId: number) => {
    strumChord(strumId, OPEN_STRING_FREQS);
  };

  // ── Stop all on disable / edit-mode toggle ────────────────────────────────────
  useEffect(() => {
    if (disabled || editMode) {
      stopAll();
      touchRoleRef.current.clear();
      chordTouchMapRef.current.clear();
      setHeldSlotIndex(null);
    }
  }, [disabled, editMode, stopAll]);

  // ── PanResponder ─────────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onMoveShouldSetPanResponder:         () => true,
      onStartShouldSetPanResponderCapture: () => false,

      // ── Touch down ──────────────────────────────────────────────────────────
      onPanResponderGrant: (evt) => {
        const { locationX: x, locationY: y, pageX, pageY, identifier } = evt.nativeEvent;
        const touchId   = Number(identifier);
        const slotIndex = getSlotFromPoint(x, y);

        if (editModeRef.current) {
          // Only open radial when tapping a chord button
          if (slotIndex === null) return;
          longPressStartRef.current = { x, y };

          longPressTimerRef.current = setTimeout(() => {
            const origin = { x: pageX, y: pageY };
            const rs: RadialState = { slotIndex, origin, dragPos: origin };
            dragPosRef.current = origin;
            setRadialState(rs);
          }, LONG_PRESS_MS);
          return;
        }

        if (slotIndex !== null) {
          // Chord press
          touchRoleRef.current.set(touchId, 'chord');
          chordTouchMapRef.current.set(touchId, slotIndex);
          setHeldSlotIndex(slotIndex);
          // If a strum is already active, start chord immediately
          for (const [tid, role] of touchRoleRef.current) {
            if (role === 'strum') tryStartChord(slotIndex, tid);
          }
        } else {
          // Strum press
          touchRoleRef.current.set(touchId, 'strum');
          const chordVals = [...chordTouchMapRef.current.values()];
          if (chordVals.length > 0) {
            tryStartChord(chordVals.at(-1)!, touchId);
          } else {
            tryStrumOpen(touchId);
          }
        }
      },

      // ── Finger moves ────────────────────────────────────────────────────────
      onPanResponderMove: (evt) => {
        const { locationX: x, locationY: y, pageX, pageY, identifier } = evt.nativeEvent;
        const touchId = Number(identifier);

        if (editModeRef.current) {
          // Cancel long-press if finger moved too far
          const start = longPressStartRef.current;
          if (start && longPressTimerRef.current !== null) {
            const dx = x - start.x;
            const dy = y - start.y;
            if (Math.sqrt(dx * dx + dy * dy) > CANCEL_MOVE_PX) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current  = null;
              longPressStartRef.current = null;
            }
          }
          // Update drag position for open radial
          if (radialStateRef.current) {
            const pos = { x: pageX, y: pageY };
            dragPosRef.current = pos;
            setRadialState(prev => prev ? { ...prev, dragPos: pos } : null);
          }
          return;
        }

        const role = touchRoleRef.current.get(touchId);
        if (role === 'chord') {
          // Slide to a new chord button
          const newSlot = getSlotFromPoint(x, y);
          const oldSlot = chordTouchMapRef.current.get(touchId);
          if (newSlot !== null && newSlot !== oldSlot) {
            chordTouchMapRef.current.set(touchId, newSlot);
            setHeldSlotIndex(newSlot);
            // Restart active strums on new chord
            for (const [tid, r] of touchRoleRef.current) {
              if (r === 'strum') {
                stopChord(tid);
                tryStartChord(newSlot, tid);
              }
            }
          } else if (newSlot === null && oldSlot !== undefined) {
            // Finger slid off buttons — treat as release from chord
            chordTouchMapRef.current.delete(touchId);
            touchRoleRef.current.delete(touchId);
            if (chordTouchMapRef.current.size === 0) {
              setHeldSlotIndex(null);
              for (const [tid, r] of touchRoleRef.current) {
                if (r === 'strum') stopChord(tid);
              }
            } else {
              setHeldSlotIndex([...chordTouchMapRef.current.values()].at(-1)!);
            }
          }
        }
      },

      // ── Finger lifts ────────────────────────────────────────────────────────
      onPanResponderRelease: (evt) => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;

        if (editModeRef.current) return;  // radial manages its own close

        const touchId = Number(evt.nativeEvent.identifier);
        const role    = touchRoleRef.current.get(touchId);
        touchRoleRef.current.delete(touchId);

        if (role === 'chord') {
          chordTouchMapRef.current.delete(touchId);
          if (chordTouchMapRef.current.size === 0) {
            setHeldSlotIndex(null);
            // Stop all strum voices since no chord is held
            for (const [tid, r] of touchRoleRef.current) {
              if (r === 'strum') stopChord(tid);
            }
          } else {
            setHeldSlotIndex([...chordTouchMapRef.current.values()].at(-1)!);
          }
        } else if (role === 'strum') {
          stopChord(touchId);
        }
      },

      onPanResponderTerminate: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;
        touchRoleRef.current.clear();
        chordTouchMapRef.current.clear();
        setHeldSlotIndex(null);
        setRadialState(null);
        stopAll();
      },
    })
  ).current;

  // ── Radial callback ──────────────────────────────────────────────────────────
  const handleVariantConfirmed = useCallback((root: RootNote, variant: ChordVariant) => {
    const rs = radialStateRef.current;
    if (rs) {
      onUpdateSlotRef.current(rs.slotIndex, buildChord(root, variant));
    }
    setRadialState(null);
  }, []);

  const handleRadialDismiss = useCallback(() => setRadialState(null), []);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Strum area — full-screen faded background, pointer-events disabled (handled by PanResponder) */}
      <StrumArea
        hasActiveChord={heldSlotIndex !== null}
        editMode={editMode}
      />

      {/* Chord button circles — absolute positioned over strum area */}
      {CHORD_POSITIONS.map(({ cx, cy }, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.padContainer,
            {
              left: cx - BUTTON_R,
              top:  cy - BUTTON_R,
            },
          ]}
        >
          <ChordPad
            slot={chordSlots[i]}
            isActive={!editMode && heldSlotIndex === i}
            isEditMode={editMode}
            size={BUTTON_DIAM}
          />
        </View>
      ))}

      {/* Radial chord picker overlay */}
      {radialState && (
        <RadialMenu
          origin={radialState.origin}
          dragPos={radialState.dragPos}
          onVariantConfirmed={handleVariantConfirmed}
          onDismiss={handleRadialDismiss}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  padContainer: {
    position: 'absolute',
  },
});
