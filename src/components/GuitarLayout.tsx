import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  LayoutRectangle,
  Dimensions,
} from 'react-native';

import { ChordSlot, ChordDefinition, RootNote, ChordVariant, buildChord } from '../data/chords';
import { useGuitarAudio } from '../hooks/useGuitarAudio';
import { ChordPad } from './ChordPad';
import { StrumArea } from './StrumArea';
import { RadialMenu, getNearestRoot, getNearestVariant } from './RadialMenu';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RadialState {
  slotIndex:    number;
  origin:       { x: number; y: number };  // absolute screen coords (clamped)
  layer:        1 | 2;
  selectedRoot: RootNote | null;
  dragPos:      { x: number; y: number };
}

interface Props {
  chordSlots:    ChordSlot[];
  onUpdateSlot:  (index: number, chord: ChordDefinition) => void;
  editMode:      boolean;
  disabled:      boolean;
}

const LONG_PRESS_MS  = 400;
const CANCEL_MOVE_PX = 8;

// ─── Component ────────────────────────────────────────────────────────────────

export function GuitarLayout({ chordSlots, onUpdateSlot, editMode, disabled }: Props) {
  const { strumChord, stopChord, stopAll } = useGuitarAudio();

  const [heldSlotIndex, setHeldSlotIndex] = useState<number | null>(null);
  const [radialState,   setRadialState]   = useState<RadialState | null>(null);

  // Refs for stale-closure-safe access inside PanResponder
  const editModeRef     = useRef(editMode);
  const chordSlotsRef   = useRef(chordSlots);
  const onUpdateSlotRef = useRef(onUpdateSlot);

  useEffect(() => { editModeRef.current     = editMode;    }, [editMode]);
  useEffect(() => { chordSlotsRef.current   = chordSlots;  }, [chordSlots]);
  useEffect(() => { onUpdateSlotRef.current = onUpdateSlot;}, [onUpdateSlot]);

  // Audio-critical refs — no re-renders on update
  const chordTouchMapRef  = useRef<Map<number, number>>(new Map()); // touchId → slotIndex
  const strumTouchIdsRef  = useRef<Set<number>>(new Set());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  // Radial state refs — kept in sync with useState for PanResponder reads
  const radialStateRef = useRef<RadialState | null>(null);
  const dragPosRef     = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => { radialStateRef.current = radialState; }, [radialState]);

  // Layout ref (relative to parent) — used for slot geometry only
  const chordAreaLayout = useRef<LayoutRectangle | null>(null);

  // Stop audio when disabled or edit mode toggles on
  useEffect(() => {
    if (disabled || editMode) {
      stopAll();
      strumTouchIdsRef.current.clear();
      chordTouchMapRef.current.clear();
      setHeldSlotIndex(null);
    }
  }, [disabled, editMode, stopAll]);

  // ── Geometry: touch point → slot index (0–8) ────────────────────────────────
  const getSlotFromPoint = (x: number, y: number): number | null => {
    const layout = chordAreaLayout.current;
    if (!layout) return null;
    const col = Math.floor((x / layout.width)  * 3);
    const row = Math.floor((y / layout.height) * 3);
    if (col < 0 || col > 2 || row < 0 || row > 2) return null;
    return row * 3 + col;
  };

  // ── Audio helpers ────────────────────────────────────────────────────────────
  const tryStartChord = (slotIndex: number, strumId: number) => {
    const chord = chordSlotsRef.current[slotIndex]?.chord;
    if (!chord) return;
    strumChord(strumId, chord.frequencies);
  };

  // ── Strum area callbacks ─────────────────────────────────────────────────────
  const handleStrumStart = useCallback((strumId: number) => {
    strumTouchIdsRef.current.add(strumId);
    const vals = [...chordTouchMapRef.current.values()];
    if (vals.length > 0) {
      tryStartChord(vals.at(-1)!, strumId);
    }
  }, []);   // tryStartChord reads refs — safe without deps

  const handleStrumEnd = useCallback((strumId: number) => {
    strumTouchIdsRef.current.delete(strumId);
    stopChord(strumId);
  }, [stopChord]);

  // ── Chord area PanResponder ──────────────────────────────────────────────────
  const chordPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onMoveShouldSetPanResponder:         () => true,
      onStartShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: (evt) => {
        const { locationX: x, locationY: y, pageX, pageY } = evt.nativeEvent;
        const touchId = Number(evt.nativeEvent.identifier);

        if (editModeRef.current) {
          longPressStartRef.current = { x, y };
          const slotIndex = getSlotFromPoint(x, y);

          longPressTimerRef.current = setTimeout(() => {
            if (slotIndex === null) return;
            // pageX/pageY are absolute screen coords
            const origin = { x: pageX, y: pageY };
            const rs: RadialState = {
              slotIndex,
              origin,
              layer:        1,
              selectedRoot: null,
              dragPos:      origin,
            };
            dragPosRef.current = origin;
            setRadialState(rs);
          }, LONG_PRESS_MS);
          return;
        }

        // Play mode
        const slotIndex = getSlotFromPoint(x, y);
        if (slotIndex === null) return;
        chordTouchMapRef.current.set(touchId, slotIndex);
        setHeldSlotIndex(slotIndex);
        if (strumTouchIdsRef.current.size > 0) {
          for (const strumId of strumTouchIdsRef.current) {
            tryStartChord(slotIndex, strumId);
          }
        }
      },

      onPanResponderMove: (evt) => {
        const { locationX: x, locationY: y, pageX, pageY } = evt.nativeEvent;
        const touchId = Number(evt.nativeEvent.identifier);

        if (editModeRef.current) {
          // Cancel long-press if finger moved too far before timer fired
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

          // Update dragPos on active radial
          if (radialStateRef.current) {
            const pos = { x: pageX, y: pageY };
            dragPosRef.current = pos;
            setRadialState(prev => prev ? { ...prev, dragPos: pos } : null);
          }
          return;
        }

        // Play mode: slot change while dragging
        const newSlot = getSlotFromPoint(x, y);
        const oldSlot = chordTouchMapRef.current.get(touchId);
        if (newSlot !== null && newSlot !== oldSlot) {
          chordTouchMapRef.current.set(touchId, newSlot);
          setHeldSlotIndex(newSlot);
          for (const strumId of strumTouchIdsRef.current) {
            stopChord(strumId);
            tryStartChord(newSlot, strumId);
          }
        }
      },

      onPanResponderRelease: (evt) => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;

        if (editModeRef.current) {
          const rs = radialStateRef.current;
          if (!rs) return;

          const { width: SW, height: SH } = Dimensions.get('window');
          const ITEM_SIZE = 44;
          const clamp = (v: number, size: number, max: number) =>
            Math.max(size / 2 + 8, Math.min(max - size / 2 - 8, v));
          const cx = clamp(rs.origin.x, ITEM_SIZE, SW);
          const cy = clamp(rs.origin.y, ITEM_SIZE, SH);
          const pos = dragPosRef.current;

          if (rs.layer === 1) {
            const root = getNearestRoot(pos, cx, cy);
            if (root) {
              // Auto-select major for quick one-layer assignment
              const chord = buildChord(root, 'major');
              onUpdateSlotRef.current(rs.slotIndex, chord);
            }
          } else if (rs.layer === 2 && rs.selectedRoot) {
            const variant = getNearestVariant(pos, cx, cy);
            const chord   = buildChord(rs.selectedRoot, variant ?? 'major');
            onUpdateSlotRef.current(rs.slotIndex, chord);
          }
          setRadialState(null);
          return;
        }

        // Play mode
        const touchId = Number(evt.nativeEvent.identifier);
        chordTouchMapRef.current.delete(touchId);
        if (chordTouchMapRef.current.size === 0) {
          setHeldSlotIndex(null);
          for (const strumId of strumTouchIdsRef.current) {
            stopChord(strumId);
          }
        } else {
          const lastSlot = [...chordTouchMapRef.current.values()].at(-1)!;
          setHeldSlotIndex(lastSlot);
        }
      },

      onPanResponderTerminate: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;
        chordTouchMapRef.current.clear();
        setHeldSlotIndex(null);
        setRadialState(null);
        stopAll();
      },
    })
  ).current;

  // ── Radial callbacks (from RadialMenu's useEffect threshold detection) ───────
  const handleRootHover = useCallback((root: RootNote | null) => {
    setRadialState(prev => {
      if (!prev || !root || prev.layer !== 1) return prev;
      return { ...prev, layer: 2, selectedRoot: root };
    });
  }, []);

  const handleVariantRelease = useCallback((variant: ChordVariant | null) => {
    const rs = radialStateRef.current;
    if (rs?.selectedRoot) {
      const chord = buildChord(rs.selectedRoot, variant ?? 'major');
      onUpdateSlotRef.current(rs.slotIndex, chord);
    }
    setRadialState(null);
  }, []);

  const handleRadialDismiss = useCallback(() => setRadialState(null), []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Left: chord pad grid */}
      <View
        style={styles.chordArea}
        onLayout={e => { chordAreaLayout.current = e.nativeEvent.layout; }}
        {...chordPanResponder.panHandlers}
      >
        <View style={styles.chordGrid}>
          {chordSlots.map((slot, i) => (
            <View key={i} style={styles.padWrapper}>
              <ChordPad
                slot={slot}
                isActive={!editMode && heldSlotIndex === i}
                isEditMode={editMode}
                onLongPress={() => {}}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Right: strum area */}
      <StrumArea
        hasActiveChord={heldSlotIndex !== null}
        editMode={editMode}
        disabled={disabled}
        onStrumStart={handleStrumStart}
        onStrumEnd={handleStrumEnd}
      />

      {/* Radial chord picker overlay */}
      {radialState && (
        <RadialMenu
          origin={radialState.origin}
          layer={radialState.layer}
          selectedRoot={radialState.selectedRoot}
          dragPos={radialState.dragPos}
          onRootHover={handleRootHover}
          onVariantRelease={handleVariantRelease}
          onDismiss={handleRadialDismiss}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex:          1,
    flexDirection: 'row',
  },
  chordArea: {
    flex:             3,
    padding:          4,
    borderRightWidth: 2,
    borderRightColor: '#003a0d',
  },
  chordGrid: {
    flex:          1,
    flexDirection: 'row',
    flexWrap:      'wrap',
  },
  padWrapper: {
    width:       '33.333%',
    aspectRatio: 1,
  },
});
