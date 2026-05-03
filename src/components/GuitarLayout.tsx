import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeTouchEvent,
} from 'react-native';

import {
  ChordSlot, ChordDefinition, RootNote, ChordVariant,
  buildChord, OPEN_STRING_FREQS,
} from '../data/chords';
import { useGuitarAudio }              from '../hooks/useGuitarAudio';
import { ChordPad }                    from './ChordPad';
import { StrumArea, StrumAreaHandle }  from './StrumArea';
import { ChordPickerSheet }            from './ChordPickerSheet';

// ─── Layout constants ─────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');

const BUTTON_GAP  = 10;
const BUTTON_DIAM = Math.min(90, Math.floor((SW - BUTTON_GAP * 4) / 3));
const BUTTON_R    = BUTTON_DIAM / 2;

const GRID_COLS = 3;
const GRID_LEFT = BUTTON_GAP + BUTTON_R;
const GRID_TOP  = BUTTON_GAP + BUTTON_R;

const CHORD_POSITIONS = Array.from({ length: 9 }, (_, i) => ({
  cx: GRID_LEFT + (i % GRID_COLS) * (BUTTON_DIAM + BUTTON_GAP),
  cy: GRID_TOP  + Math.floor(i / GRID_COLS) * (BUTTON_DIAM + BUTTON_GAP),
}));

// Guitar string Y-positions as fractions of container height
const STRING_Y_FRAC = [0.15, 0.30, 0.45, 0.60, 0.75, 0.90];

const LONG_PRESS_MS  = 400;
const CANCEL_MOVE_PX = 8;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PickerState {
  slotIndex: number;
  dragPos:   { x: number; y: number };
}

interface Props {
  chordSlots:   ChordSlot[];
  onUpdateSlot: (index: number, chord: ChordDefinition) => void;
  editMode:     boolean;
  disabled:     boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSlotFromPoint(x: number, y: number): number | null {
  for (let i = 0; i < CHORD_POSITIONS.length; i++) {
    const { cx, cy } = CHORD_POSITIONS[i];
    if ((x - cx) ** 2 + (y - cy) ** 2 <= BUTTON_R * BUTTON_R) return i;
  }
  return null;
}

// Always returns the nearest string index (0–5); every strum-area touch hits a string.
function getNearestString(y: number, containerHeight: number): number {
  let minDist = Infinity;
  let nearest = 0;
  for (let i = 0; i < STRING_Y_FRAC.length; i++) {
    const d = Math.abs(y - STRING_Y_FRAC[i] * containerHeight);
    if (d < minDist) { minDist = d; nearest = i; }
  }
  return nearest;
}

// Map string index to frequency: chord note if chord held, open string otherwise.
function getStringFreq(
  stringIdx: number,
  chord: ChordDefinition | null | undefined
): number {
  if (chord) return chord.frequencies[stringIdx];
  return OPEN_STRING_FREQS[stringIdx];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GuitarLayout({ chordSlots, onUpdateSlot, editMode, disabled }: Props) {
  const { strumChord, stopChord, pluckString, stopAll, prewarm } = useGuitarAudio();

  const [heldSlotIndex, setHeldSlotIndex] = useState<number | null>(null);
  const [pickerState,   setPickerState]   = useState<PickerState | null>(null);

  const strumAreaRef    = useRef<StrumAreaHandle>(null);
  const layoutHeightRef = useRef(600);

  // Stale-closure-safe refs
  const editModeRef     = useRef(editMode);
  const chordSlotsRef   = useRef(chordSlots);
  const onUpdateSlotRef = useRef(onUpdateSlot);
  useEffect(() => { editModeRef.current     = editMode;    }, [editMode]);
  useEffect(() => { chordSlotsRef.current   = chordSlots;  }, [chordSlots]);
  useEffect(() => { onUpdateSlotRef.current = onUpdateSlot;}, [onUpdateSlot]);

  // touchId → 'chord' | 'strum'
  const touchRoleRef     = useRef<Map<number, 'chord' | 'strum'>>(new Map());
  // touchId → slotIndex (chord touches)
  const chordTouchMapRef = useRef<Map<number, number>>(new Map());
  // touchIds that are pluck voices — don't call stopChord on release
  const pluckTouchSetRef = useRef<Set<number>>(new Set());
  // touchId → last string index (for swipe strum crossing detection)
  const lastStringRef    = useRef<Map<number, number>>(new Map());

  // Long-press tracking
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDataRef  = useRef<{ touchId: number; sx: number; sy: number } | null>(null);

  // Picker state ref
  const pickerStateRef = useRef<PickerState | null>(null);
  const pickerTouchRef = useRef<number | null>(null);
  useEffect(() => { pickerStateRef.current = pickerState; }, [pickerState]);

  // Prewarm oscillator pool on mount to eliminate first-note latency
  useEffect(() => { prewarm(12); }, [prewarm]);

  // ── Stop everything on disable / edit toggle ──────────────────────────────────

  useEffect(() => {
    if (disabled || editMode) {
      stopAll();
      touchRoleRef.current.clear();
      chordTouchMapRef.current.clear();
      pluckTouchSetRef.current.clear();
      lastStringRef.current.clear();
      setHeldSlotIndex(null);
    }
  }, [disabled, editMode, stopAll]);

  // ── Helper: get current held chord ───────────────────────────────────────────

  function getHeldChord(): ChordDefinition | null {
    const vals = [...chordTouchMapRef.current.values()];
    if (vals.length === 0) return null;
    return chordSlotsRef.current[vals.at(-1)!]?.chord ?? null;
  }

  // ── Touch start ───────────────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: NativeSyntheticEvent<NativeTouchEvent>) => {
    for (const touch of e.nativeEvent.changedTouches) {
      const touchId = Number(touch.identifier);
      const x       = touch.locationX;
      const y       = touch.locationY;
      const pageX   = touch.pageX;
      const pageY   = touch.pageY;

      if (editModeRef.current) {
        const slotIndex = getSlotFromPoint(x, y);
        if (slotIndex === null) continue;
        longPressDataRef.current = { touchId, sx: x, sy: y };
        longPressTimerRef.current = setTimeout(() => {
          pickerTouchRef.current = touchId;
          setPickerState({ slotIndex, dragPos: { x: pageX, y: pageY } });
        }, LONG_PRESS_MS);
        continue;
      }

      const slotIndex = getSlotFromPoint(x, y);
      if (slotIndex !== null) {
        // Chord button pressed
        touchRoleRef.current.set(touchId, 'chord');
        chordTouchMapRef.current.set(touchId, slotIndex);
        setHeldSlotIndex(slotIndex);

        // Kill all active string sounds on chord change, then restart strum voices
        stopAll();
        pluckTouchSetRef.current.clear();
        lastStringRef.current.clear();

        for (const [tid, role] of touchRoleRef.current) {
          if (role === 'strum') {
            strumChord(tid, chordSlotsRef.current[slotIndex]?.chord?.frequencies ?? OPEN_STRING_FREQS);
          }
        }
      } else {
        // Strum area — pluck nearest string
        touchRoleRef.current.set(touchId, 'strum');
        const si    = getNearestString(y, layoutHeightRef.current);
        const chord = getHeldChord();
        const freq  = getStringFreq(si, chord);
        pluckString(touchId, freq);
        pluckTouchSetRef.current.add(touchId);
        lastStringRef.current.set(touchId, si);
        strumAreaRef.current?.pluck(si);
      }
    }
  }, [strumChord, pluckString, stopAll]);

  // ── Touch move ────────────────────────────────────────────────────────────────

  const handleTouchMove = useCallback((e: NativeSyntheticEvent<NativeTouchEvent>) => {
    for (const touch of e.nativeEvent.changedTouches) {
      const touchId = Number(touch.identifier);
      const x       = touch.locationX;
      const y       = touch.locationY;
      const pageX   = touch.pageX;
      const pageY   = touch.pageY;

      if (editModeRef.current) {
        const lp = longPressDataRef.current;
        if (lp && lp.touchId === touchId && longPressTimerRef.current !== null) {
          const dx = x - lp.sx, dy = y - lp.sy;
          if (dx * dx + dy * dy > CANCEL_MOVE_PX * CANCEL_MOVE_PX) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
            longPressDataRef.current  = null;
          }
        }
        if (pickerStateRef.current && touchId === pickerTouchRef.current) {
          const pos = { x: pageX, y: pageY };
          setPickerState(prev => prev ? { ...prev, dragPos: pos } : null);
        }
        continue;
      }

      const role = touchRoleRef.current.get(touchId);

      if (role === 'chord') {
        const newSlot = getSlotFromPoint(x, y);
        const oldSlot = chordTouchMapRef.current.get(touchId);
        if (newSlot !== null && newSlot !== oldSlot) {
          chordTouchMapRef.current.set(touchId, newSlot);
          setHeldSlotIndex(newSlot);

          // Kill all string sounds on chord change
          stopAll();
          pluckTouchSetRef.current.clear();
          lastStringRef.current.clear();

          for (const [tid, r] of touchRoleRef.current) {
            if (r === 'strum') {
              strumChord(tid, chordSlotsRef.current[newSlot]?.chord?.frequencies ?? OPEN_STRING_FREQS);
            }
          }
        } else if (newSlot === null && oldSlot !== undefined) {
          chordTouchMapRef.current.delete(touchId);
          touchRoleRef.current.delete(touchId);
          if (chordTouchMapRef.current.size === 0) {
            setHeldSlotIndex(null);
            for (const [tid, r] of touchRoleRef.current) {
              if (r === 'strum' && !pluckTouchSetRef.current.has(tid)) stopChord(tid);
            }
          } else {
            setHeldSlotIndex([...chordTouchMapRef.current.values()].at(-1)!);
          }
        }
      } else if (role === 'strum' && pluckTouchSetRef.current.has(touchId)) {
        // Swipe strum: detect string crossings
        const si     = getNearestString(y, layoutHeightRef.current);
        const lastSi = lastStringRef.current.get(touchId);
        if (si !== lastSi) {
          lastStringRef.current.set(touchId, si);
          const chord = getHeldChord();
          const freq  = getStringFreq(si, chord);
          // Use a unique voice ID per (touch, string) to allow overlap
          const voiceId = touchId * 10 + si;
          pluckString(voiceId, freq);
          strumAreaRef.current?.pluck(si);
        }
      }
    }
  }, [strumChord, stopChord, pluckString, stopAll]);

  // ── Touch end ─────────────────────────────────────────────────────────────────

  const handleTouchEnd = useCallback((e: NativeSyntheticEvent<NativeTouchEvent>) => {
    for (const touch of e.nativeEvent.changedTouches) {
      const touchId = Number(touch.identifier);

      const lp = longPressDataRef.current;
      if (lp && lp.touchId === touchId) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressDataRef.current = null;
      }

      if (editModeRef.current) {
        if (touchId === pickerTouchRef.current) pickerTouchRef.current = null;
        continue;
      }

      const role = touchRoleRef.current.get(touchId);
      touchRoleRef.current.delete(touchId);

      if (role === 'chord') {
        chordTouchMapRef.current.delete(touchId);
        if (chordTouchMapRef.current.size === 0) {
          setHeldSlotIndex(null);
          for (const [tid, r] of touchRoleRef.current) {
            if (r === 'strum' && !pluckTouchSetRef.current.has(tid)) stopChord(tid);
          }
        } else {
          setHeldSlotIndex([...chordTouchMapRef.current.values()].at(-1)!);
        }
      } else if (role === 'strum') {
        lastStringRef.current.delete(touchId);
        if (pluckTouchSetRef.current.has(touchId)) {
          pluckTouchSetRef.current.delete(touchId);
          // Pluck voices auto-fade; no explicit stop needed
        } else {
          stopChord(touchId);
        }
      }
    }
  }, [stopChord]);

  // ── Picker callbacks ──────────────────────────────────────────────────────────

  const handleVariantConfirmed = useCallback((root: RootNote, variant: ChordVariant) => {
    const ps = pickerStateRef.current;
    if (ps) onUpdateSlotRef.current(ps.slotIndex, buildChord(root, variant));
    pickerTouchRef.current = null;
    setPickerState(null);
  }, []);

  const handlePickerDismiss = useCallback(() => {
    pickerTouchRef.current = null;
    setPickerState(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View
      style={styles.container}
      onStartShouldSetResponder={() => true}
      onLayout={e => { layoutHeightRef.current = e.nativeEvent.layout.height; }}
      onTouchStart={disabled ? undefined : handleTouchStart}
      onTouchMove={disabled  ? undefined : handleTouchMove}
      onTouchEnd={disabled   ? undefined : handleTouchEnd}
      onTouchCancel={disabled ? undefined : handleTouchEnd}
    >
      <StrumArea
        ref={strumAreaRef}
        hasActiveChord={heldSlotIndex !== null}
        editMode={editMode}
      />

      {CHORD_POSITIONS.map(({ cx, cy }, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[styles.padContainer, { left: cx - BUTTON_R, top: cy - BUTTON_R }]}
        >
          <ChordPad
            slot={chordSlots[i]}
            isActive={!editMode && heldSlotIndex === i}
            isEditMode={editMode}
            size={BUTTON_DIAM}
          />
        </View>
      ))}

      {pickerState && (
        <ChordPickerSheet
          dragPos={pickerState.dragPos}
          onVariantConfirmed={handleVariantConfirmed}
          onDismiss={handlePickerDismiss}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  padContainer: {
    position: 'absolute',
  },
});
