import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { RootNote, ChordVariant, ALL_ROOTS, ALL_VARIANTS, VARIANT_LABELS } from '../data/chords';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_SIZE    = 44;
const RADIUS_L1    = 80;   // root notes circle radius
const RADIUS_L2    = 76;   // variant circle radius
const HIT_RADIUS   = 40;   // px threshold to activate an item

const C = {
  GREEN:     '#00ff41',
  DIM_GREEN: '#005c13',
  DIMMER:    '#002a08',
  BLACK:     '#000000',
  BG:        'rgba(0,8,2,0.93)',
};

const MONO = Platform.select({
  ios:     'Courier New',
  android: 'monospace',
  default: 'Courier New',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function clampToScreen(value: number, size: number, max: number): number {
  return Math.max(size / 2 + 8, Math.min(max - size / 2 - 8, value));
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  origin:           { x: number; y: number };
  layer:            1 | 2;
  selectedRoot:     RootNote | null;
  dragPos:          { x: number; y: number };
  onRootHover:      (root: RootNote | null) => void;
  onVariantRelease: (variant: ChordVariant | null) => void;
  onDismiss:        () => void;
}

// ─── RadialMenu ───────────────────────────────────────────────────────────────

export function RadialMenu({
  origin, layer, selectedRoot, dragPos,
  onRootHover, onVariantRelease, onDismiss,
}: Props) {
  const { width: SW, height: SH } = Dimensions.get('window');

  const layer1Opacity = useRef(new Animated.Value(0)).current;
  const layer2Opacity = useRef(new Animated.Value(0)).current;
  const prevLayer     = useRef<1 | 2>(1);

  // Clamp origin to keep menu on screen
  const cx = clampToScreen(origin.x, ITEM_SIZE, SW);
  const cy = clampToScreen(origin.y, ITEM_SIZE, SH);

  // ── Animate layer transitions ─────────────────────────────────────────────
  useEffect(() => {
    if (layer === 1 && prevLayer.current !== 1) {
      Animated.parallel([
        Animated.timing(layer1Opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(layer2Opacity, { toValue: 0, duration: 80,  useNativeDriver: true }),
      ]).start();
    } else if (layer === 1) {
      // First mount
      Animated.timing(layer1Opacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    } else if (layer === 2) {
      Animated.parallel([
        Animated.timing(layer1Opacity, { toValue: 0, duration: 80,  useNativeDriver: true }),
        Animated.timing(layer2Opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }
    prevLayer.current = layer;
  }, [layer]);

  // Notify parent when dragPos crosses a root threshold (layer 1 → 2 transition)
  useEffect(() => {
    if (layer !== 1) return;
    const nearestRoot = getNearestRoot(dragPos, cx, cy);
    if (nearestRoot !== null) {
      onRootHover(nearestRoot);
    }
  }, [dragPos, layer, cx, cy]);

  // When layer 2 and user releases (dragPos won't change — parent fires onVariantRelease)
  // The nearest variant at dragPos is computed by the parent calling onVariantRelease
  // via the PanResponder release in GuitarLayout. We expose a helper for that.

  // ── Layer 1 items (12 root notes) ────────────────────────────────────────
  const rootItems = useMemo(() => {
    return ALL_ROOTS.map((root, i) => {
      const angle = (i / ALL_ROOTS.length) * 2 * Math.PI - Math.PI / 2;
      const ix    = cx + RADIUS_L1 * Math.cos(angle);
      const iy    = cy + RADIUS_L1 * Math.sin(angle);
      return { root, ix, iy };
    });
  }, [cx, cy]);

  // ── Layer 2 items (8 chord variants) ─────────────────────────────────────
  const variantItems = useMemo(() => {
    return ALL_VARIANTS.map((variant, i) => {
      const angle = (i / ALL_VARIANTS.length) * 2 * Math.PI - Math.PI / 2;
      const ix    = cx + RADIUS_L2 * Math.cos(angle);
      const iy    = cy + RADIUS_L2 * Math.sin(angle);
      return { variant, ix, iy };
    });
  }, [cx, cy]);

  // Nearest item highlight
  const nearestRootIdx    = layer === 1 ? getNearestRootIdx(dragPos, rootItems)    : -1;
  const nearestVariantIdx = layer === 2 ? getNearestVariantIdx(dragPos, variantItems) : -1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dim background scrim */}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />

      {/* Center indicator */}
      <View style={[styles.center, { left: cx - 14, top: cy - 14 }]}>
        <Text style={styles.centerText}>
          {layer === 2 && selectedRoot ? selectedRoot : '●'}
        </Text>
      </View>

      {/* Layer 1: Root notes */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: layer1Opacity }]}
        pointerEvents="none"
      >
        {rootItems.map(({ root, ix, iy }, i) => {
          const isNearest = i === nearestRootIdx;
          return (
            <View
              key={root}
              style={[
                styles.item,
                {
                  left:  ix - ITEM_SIZE / 2,
                  top:   iy - ITEM_SIZE / 2,
                  width: ITEM_SIZE,
                  height: ITEM_SIZE,
                },
                isNearest && styles.itemHighlight,
              ]}
            >
              <Text style={[styles.itemText, isNearest && styles.itemTextHighlight]}>
                {root}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      {/* Layer 2: Chord variants */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: layer2Opacity }]}
        pointerEvents="none"
      >
        {variantItems.map(({ variant, ix, iy }, i) => {
          const isNearest = i === nearestVariantIdx;
          const displayLabel = variant === 'major'
            ? (selectedRoot ?? '') + ''
            : VARIANT_LABELS[variant];
          return (
            <View
              key={variant}
              style={[
                styles.item,
                {
                  left:  ix - ITEM_SIZE / 2,
                  top:   iy - ITEM_SIZE / 2,
                  width: ITEM_SIZE,
                  height: ITEM_SIZE,
                },
                isNearest && styles.itemHighlight,
                variant === 'major' && styles.itemMajorDefault,
              ]}
            >
              <Text style={[styles.itemText, isNearest && styles.itemTextHighlight]}>
                {displayLabel || 'maj'}
              </Text>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ─── Exported helpers (used by GuitarLayout on release) ──────────────────────

export function getNearestRoot(
  dragPos: { x: number; y: number },
  cx: number, cy: number
): RootNote | null {
  let minD = Infinity;
  let nearest: RootNote | null = null;
  ALL_ROOTS.forEach((root, i) => {
    const angle = (i / ALL_ROOTS.length) * 2 * Math.PI - Math.PI / 2;
    const ix    = cx + RADIUS_L1 * Math.cos(angle);
    const iy    = cy + RADIUS_L1 * Math.sin(angle);
    const d     = dist(dragPos, { x: ix, y: iy });
    if (d < minD && d < HIT_RADIUS) {
      minD    = d;
      nearest = root;
    }
  });
  return nearest;
}

export function getNearestVariant(
  dragPos: { x: number; y: number },
  cx: number, cy: number
): ChordVariant | null {
  let minD = Infinity;
  let nearest: ChordVariant | null = null;
  ALL_VARIANTS.forEach((variant, i) => {
    const angle = (i / ALL_VARIANTS.length) * 2 * Math.PI - Math.PI / 2;
    const ix    = cx + RADIUS_L2 * Math.cos(angle);
    const iy    = cy + RADIUS_L2 * Math.sin(angle);
    const d     = dist(dragPos, { x: ix, y: iy });
    if (d < minD && d < HIT_RADIUS) {
      minD    = d;
      nearest = variant;
    }
  });
  return nearest;
}

// Internal index helpers for highlight rendering
function getNearestRootIdx(
  dragPos: { x: number; y: number },
  items: Array<{ root: RootNote; ix: number; iy: number }>
): number {
  let minD = Infinity;
  let idx  = -1;
  items.forEach(({ ix, iy }, i) => {
    const d = dist(dragPos, { x: ix, y: iy });
    if (d < minD && d < HIT_RADIUS) { minD = d; idx = i; }
  });
  return idx;
}

function getNearestVariantIdx(
  dragPos: { x: number; y: number },
  items: Array<{ variant: ChordVariant; ix: number; iy: number }>
): number {
  let minD = Infinity;
  let idx  = -1;
  items.forEach(({ ix, iy }, i) => {
    const d = dist(dragPos, { x: ix, y: iy });
    if (d < minD && d < HIT_RADIUS) { minD = d; idx = i; }
  });
  return idx;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  center: {
    position:        'absolute',
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: C.DIM_GREEN,
    justifyContent:  'center',
    alignItems:      'center',
    zIndex:          2,
  },
  centerText: {
    fontFamily: MONO,
    fontSize:   11,
    color:      C.GREEN,
    fontWeight: '700',
  },
  item: {
    position:        'absolute',
    borderRadius:    ITEM_SIZE / 2,
    backgroundColor: C.BG,
    borderWidth:     1,
    borderColor:     C.DIM_GREEN,
    justifyContent:  'center',
    alignItems:      'center',
  },
  itemHighlight: {
    borderColor:     C.GREEN,
    backgroundColor: 'rgba(0,255,65,0.18)',
    // iOS glow
    shadowColor:     C.GREEN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.8,
    shadowRadius:    6,
    elevation:       6,
  },
  itemMajorDefault: {
    borderColor:     C.DIM_GREEN,
    backgroundColor: 'rgba(0,92,19,0.25)',
  },
  itemText: {
    fontFamily:    MONO,
    fontSize:      11,
    color:         C.DIM_GREEN,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
  itemTextHighlight: {
    color: C.GREEN,
  },
});
