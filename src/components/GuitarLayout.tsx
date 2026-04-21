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
import { useGuitarAudio } from '../hooks/useGuitarAudio';
import { ChordPad }       from './ChordPad';
import { StrumArea }      from './StrumArea';
import { RadialMenu }     from './RadialMenu';

// ─── Layout constants ─────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSlotFromPoint(x: number, y: number): number | null {
  for (let i = 0; i < CHORD_POSITIONS.length; i++) {
    const { cx, cy } = CHORD_POSITIONS[i];
    if ((x - cx) ** 2 + (y - cy) ** 2 <= BUTTON_R * BUTTON_R) return i;
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

  // touchId → 'chord' | 'strum'
  const touchRoleRef     = useRef<Map<number, 'chord' | 'strum'>>(new Map());
  // touchId → slotIndex (chord touches only)
  const chordTouchMapRef = useRef<Map<number, number>>(new Map());

  // Long-press tracking for radial menu (one active long-press at a time)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressDataRef  = useRef<{ touchId: number; sx: number; sy: number } | null>(null);

  // Radial drag tracking
  const radialStateRef = useRef<RadialState | null>(null);
  const radialTouchRef = useRef<number | null>(null);  // which touchId is driving the radial
  useEffect(() => { radialStateRef.current = radialState; }, [radialState]);

  // ── Audio helpers ────────────────────────────────────────────────────────────

  const tryStartChord = (slotIndex: number, strumId: number) => {
    const chord = chordSlotsRef.current[slotIndex]?.chord;
    if (!chord) return;
    strumChord(strumId, chord.frequencies);
  };

  // ── Stop everything on disable / edit toggle ──────────────────────────────────

  useEffect(() => {
    if (disabled || editMode) {
      stopAll();
      touchRoleRef.current.clear();
      chordTouchMapRef.current.clear();
      setHeldSlotIndex(null);
    }
  }, [disabled, editMode, stopAll]);

  // ── Touch handlers — use changedTouches for proper multi-touch support ────────

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
          const origin = { x: pageX, y: pageY };
          radialTouchRef.current = touchId;
          setRadialState({ slotIndex, origin, dragPos: origin });
        }, LONG_PRESS_MS);
        continue;
      }

      const slotIndex = getSlotFromPoint(x, y);
      if (slotIndex !== null) {
        // Chord press
        touchRoleRef.current.set(touchId, 'chord');
        chordTouchMapRef.current.set(touchId, slotIndex);
        setHeldSlotIndex(slotIndex);
        // Immediately play if a strum is already active
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
          strumChord(touchId, OPEN_STRING_FREQS);
        }
      }
    }
  }, []);

  const handleTouchMove = useCallback((e: NativeSyntheticEvent<NativeTouchEvent>) => {
    for (const touch of e.nativeEvent.changedTouches) {
      const touchId = Number(touch.identifier);
      const x       = touch.locationX;
      const y       = touch.locationY;
      const pageX   = touch.pageX;
      const pageY   = touch.pageY;

      if (editModeRef.current) {
        // Cancel long-press if finger moved too far
        const lp = longPressDataRef.current;
        if (lp && lp.touchId === touchId && longPressTimerRef.current !== null) {
          const dx = x - lp.sx;
          const dy = y - lp.sy;
          if (dx * dx + dy * dy > CANCEL_MOVE_PX * CANCEL_MOVE_PX) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
            longPressDataRef.current  = null;
          }
        }
        // Update radial drag position
        if (radialStateRef.current && touchId === radialTouchRef.current) {
          const pos = { x: pageX, y: pageY };
          setRadialState(prev => prev ? { ...prev, dragPos: pos } : null);
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
          for (const [tid, r] of touchRoleRef.current) {
            if (r === 'strum') { stopChord(tid); tryStartChord(newSlot, tid); }
          }
        } else if (newSlot === null && oldSlot !== undefined) {
          // Slid off all buttons — release this chord touch
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
    }
  }, []);

  const handleTouchEnd = useCallback((e: NativeSyntheticEvent<NativeTouchEvent>) => {
    for (const touch of e.nativeEvent.changedTouches) {
      const touchId = Number(touch.identifier);

      // Always clear any pending long-press for this touch
      const lp = longPressDataRef.current;
      if (lp && lp.touchId === touchId) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressDataRef.current = null;
      }

      if (editModeRef.current) {
        // Radial is managed by its own dwell — just clear drag touch ref
        if (touchId === radialTouchRef.current) radialTouchRef.current = null;
        continue;
      }

      const role = touchRoleRef.current.get(touchId);
      touchRoleRef.current.delete(touchId);

      if (role === 'chord') {
        chordTouchMapRef.current.delete(touchId);
        if (chordTouchMapRef.current.size === 0) {
          setHeldSlotIndex(null);
          for (const [tid, r] of touchRoleRef.current) {
            if (r === 'strum') stopChord(tid);
          }
        } else {
          setHeldSlotIndex([...chordTouchMapRef.current.values()].at(-1)!);
        }
      } else if (role === 'strum') {
        stopChord(touchId);
      }
    }
  }, []);

  // ── Radial callbacks ─────────────────────────────────────────────────────────

  const handleVariantConfirmed = useCallback((root: RootNote, variant: ChordVariant) => {
    const rs = radialStateRef.current;
    if (rs) onUpdateSlotRef.current(rs.slotIndex, buildChord(root, variant));
    radialTouchRef.current = null;
    setRadialState(null);
  }, []);

  const handleRadialDismiss = useCallback(() => {
    radialTouchRef.current = null;
    setRadialState(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View
      style={styles.container}
      onStartShouldSetResponder={() => true}
      onTouchStart={disabled ? undefined : handleTouchStart}
      onTouchMove={disabled  ? undefined : handleTouchMove}
      onTouchEnd={disabled   ? undefined : handleTouchEnd}
      onTouchCancel={disabled ? undefined : handleTouchEnd}
    >
      {/* Strum area — full-screen faded visual background */}
      <StrumArea
        hasActiveChord={heldSlotIndex !== null}
        editMode={editMode}
      />

      {/* Chord circles — absolute positioned, pointerEvents none so touches reach root View */}
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

      {/* Radial chord picker */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  padContainer: {
    position: 'absolute',
  },
});
