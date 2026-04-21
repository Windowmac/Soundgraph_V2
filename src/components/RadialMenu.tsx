import React, { useEffect, useRef, useState, useMemo } from 'react';
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

const ITEM_SIZE  = 72;   // diameter of each menu item
const RADIUS_L1  = 150;  // root-note ring radius
const RADIUS_L2  = 150;  // variant ring radius
const HIT_RADIUS = 64;   // px proximity to activate an item
const DWELL_MS   = 800;  // ms of hovering to confirm a selection
// How far beyond the confirmed L1 item to place the L2 ring center
const L2_OFFSET  = 110;

const C = {
  GREEN:     '#00ff41',
  DIM_GREEN: '#005c13',
  DIMMER:    '#002a08',
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

function clampToScreen(value: number, margin: number, max: number): number {
  return Math.max(margin, Math.min(max - margin, value));
}

function itemPos(index: number, total: number, cx: number, cy: number, radius: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  origin:             { x: number; y: number };  // absolute screen coords of long-press
  dragPos:            { x: number; y: number };  // current finger position
  onVariantConfirmed: (root: RootNote, variant: ChordVariant) => void;
  onDismiss:          () => void;
}

// ─── RadialMenu ───────────────────────────────────────────────────────────────

export function RadialMenu({ origin, dragPos, onVariantConfirmed, onDismiss }: Props) {
  const { width: SW, height: SH } = Dimensions.get('window');

  // Clamp L1 center to screen
  const cx = clampToScreen(origin.x, ITEM_SIZE, SW);
  const cy = clampToScreen(origin.y, ITEM_SIZE, SH);

  // Internal dwell state
  const [confirmedRoot,    setConfirmedRoot]    = useState<RootNote | null>(null);
  const [l2Origin,         setL2Origin]         = useState<{ x: number; y: number } | null>(null);
  const [hoveredRootIdx,   setHoveredRootIdx]   = useState<number>(-1);
  const [hoveredVariantIdx, setHoveredVariantIdx] = useState<number>(-1);

  const dwellTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredKeyRef  = useRef<string>('');
  const confirmedRootRef   = useRef<RootNote | null>(null);
  const l2OriginRef        = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { confirmedRootRef.current = confirmedRoot; }, [confirmedRoot]);
  useEffect(() => { l2OriginRef.current      = l2Origin;      }, [l2Origin]);

  // Animations
  const l1Opacity  = useRef(new Animated.Value(0)).current;
  const l2Opacity  = useRef(new Animated.Value(0)).current;
  const lineOpacity = useRef(new Animated.Value(0)).current;

  // Fade in L1 on mount
  useEffect(() => {
    Animated.timing(l1Opacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, []);

  // Pre-compute L1 positions
  const rootItems = useMemo(() =>
    ALL_ROOTS.map((root, i) => ({ root, ...itemPos(i, ALL_ROOTS.length, cx, cy, RADIUS_L1) })),
  [cx, cy]);

  // Pre-compute L2 positions (depend on l2Origin)
  const variantItems = useMemo(() => {
    if (!l2Origin) return [];
    const l2x = clampToScreen(l2Origin.x, ITEM_SIZE, SW);
    const l2y = clampToScreen(l2Origin.y, ITEM_SIZE, SH);
    return ALL_VARIANTS.map((variant, i) => ({
      variant,
      ...itemPos(i, ALL_VARIANTS.length, l2x, l2y, RADIUS_L2),
    }));
  }, [l2Origin, SW, SH]);

  // ── Main dwell detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const hasL2 = confirmedRootRef.current !== null;

    if (hasL2 && l2OriginRef.current) {
      // L2 phase: find nearest variant
      const l2x = clampToScreen(l2OriginRef.current.x, ITEM_SIZE, SW);
      const l2y = clampToScreen(l2OriginRef.current.y, ITEM_SIZE, SH);
      let minD = Infinity;
      let nearIdx = -1;
      variantItems.forEach(({ x, y }, i) => {
        const d = dist(dragPos, { x, y });
        if (d < minD && d < HIT_RADIUS) { minD = d; nearIdx = i; }
      });
      setHoveredVariantIdx(nearIdx);

      const key = nearIdx >= 0 ? `v${nearIdx}` : '';
      if (key !== lastHoveredKeyRef.current) {
        lastHoveredKeyRef.current = key;
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        if (nearIdx >= 0) {
          dwellTimerRef.current = setTimeout(() => {
            const root    = confirmedRootRef.current;
            const variant = ALL_VARIANTS[nearIdx];
            if (root && variant) onVariantConfirmed(root, variant);
          }, DWELL_MS);
        }
      }
    } else {
      // L1 phase: find nearest root
      let minD = Infinity;
      let nearIdx = -1;
      rootItems.forEach(({ x, y }, i) => {
        const d = dist(dragPos, { x, y });
        if (d < minD && d < HIT_RADIUS) { minD = d; nearIdx = i; }
      });
      setHoveredRootIdx(nearIdx);

      const key = nearIdx >= 0 ? `r${nearIdx}` : '';
      if (key !== lastHoveredKeyRef.current) {
        lastHoveredKeyRef.current = key;
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        if (nearIdx >= 0) {
          dwellTimerRef.current = setTimeout(() => {
            const root = ALL_ROOTS[nearIdx];
            const item = rootItems[nearIdx];
            // Compute L2 center: extend beyond the confirmed item
            const dirX = item.x - cx;
            const dirY = item.y - cy;
            const mag  = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
            const newL2 = {
              x: item.x + (dirX / mag) * L2_OFFSET,
              y: item.y + (dirY / mag) * L2_OFFSET,
            };
            setConfirmedRoot(root);
            setL2Origin(newL2);
            lastHoveredKeyRef.current = '';  // reset so variant dwell can start fresh
            // Fade in L2 and connecting line
            Animated.parallel([
              Animated.timing(l2Opacity,   { toValue: 1, duration: 150, useNativeDriver: true }),
              Animated.timing(lineOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
            ]).start();
          }, DWELL_MS);
        }
      }
    }
  }, [dragPos, variantItems, rootItems]);

  // Clear dwell timer on unmount
  useEffect(() => () => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
  }, []);

  // ── Connecting line geometry ─────────────────────────────────────────────────
  // Position the view at its own center so RN's default center-rotation is correct
  const lineGeom = useMemo(() => {
    if (!confirmedRoot || !l2Origin) return null;
    const rootIdx = ALL_ROOTS.indexOf(confirmedRoot);
    if (rootIdx < 0) return null;
    const item = rootItems[rootIdx];
    const dx = l2Origin.x - item.x;
    const dy = l2Origin.y - item.y;
    const len   = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const centerX = item.x + dx / 2;
    const centerY = item.y + dy / 2;
    return { centerX, centerY, len, angle };
  }, [confirmedRoot, l2Origin, rootItems]);

  // ── Clamped L2 center for rendering ─────────────────────────────────────────
  const l2cx = l2Origin ? clampToScreen(l2Origin.x, ITEM_SIZE, SW) : 0;
  const l2cy = l2Origin ? clampToScreen(l2Origin.y, ITEM_SIZE, SH) : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Scrim */}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />

      {/* Connecting line between confirmed L1 item and L2 origin */}
      {lineGeom && (
        <Animated.View style={[
          styles.line,
          {
            left:      lineGeom.centerX - lineGeom.len / 2,
            top:       lineGeom.centerY - 1,
            width:     lineGeom.len,
            transform: [{ rotate: `${lineGeom.angle}deg` }],
            opacity:   lineOpacity,
          },
        ]} />
      )}

      {/* L1 center indicator */}
      <View style={[styles.center, { left: cx - 14, top: cy - 14 }]}>
        <Text style={styles.centerText}>{confirmedRoot ?? '●'}</Text>
      </View>

      {/* L1: root notes — always visible once opened */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: l1Opacity }]} pointerEvents="none">
        {rootItems.map(({ root, x, y }, i) => {
          const isHovered   = i === hoveredRootIdx;
          const isConfirmed = root === confirmedRoot;
          return (
            <View
              key={root}
              style={[
                styles.item,
                { left: x - ITEM_SIZE / 2, top: y - ITEM_SIZE / 2 },
                isHovered   && styles.itemHighlight,
                isConfirmed && styles.itemConfirmed,
              ]}
            >
              <Text style={[styles.itemText, (isHovered || isConfirmed) && styles.itemTextHighlight]}>
                {root}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      {/* L2: chord variants — appear after L1 dwell confirms */}
      {l2Origin && (
        <>
          {/* L2 center indicator */}
          <View style={[styles.center, { left: l2cx - 14, top: l2cy - 14 }]}>
            <Text style={styles.centerText}>{confirmedRoot}</Text>
          </View>

          <Animated.View style={[StyleSheet.absoluteFill, { opacity: l2Opacity }]} pointerEvents="none">
            {variantItems.map(({ variant, x, y }, i) => {
              const isHovered = i === hoveredVariantIdx;
              const label = variant === 'major'
                ? (confirmedRoot ?? '')
                : VARIANT_LABELS[variant];
              return (
                <View
                  key={variant}
                  style={[
                    styles.item,
                    { left: x - ITEM_SIZE / 2, top: y - ITEM_SIZE / 2 },
                    isHovered && styles.itemHighlight,
                    variant === 'major' && styles.itemMajorDefault,
                  ]}
                >
                  <Text style={[styles.itemText, isHovered && styles.itemTextHighlight]}>
                    {label || 'maj'}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── Exported geometry helpers (used by GuitarLayout for clamping) ────────────

export function getClampedOrigin(
  origin: { x: number; y: number },
  sw: number, sh: number
): { cx: number; cy: number } {
  return {
    cx: clampToScreen(origin.x, ITEM_SIZE, sw),
    cy: clampToScreen(origin.y, ITEM_SIZE, sh),
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  line: {
    position:        'absolute',
    height:          2,
    backgroundColor: C.GREEN,
    opacity:         0.7,
  },
  center: {
    position:        'absolute',
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: C.DIM_GREEN,
    justifyContent:  'center',
    alignItems:      'center',
    zIndex:          3,
  },
  centerText: {
    fontFamily: MONO,
    fontSize:   11,
    color:      C.GREEN,
    fontWeight: '700',
  },
  item: {
    position:        'absolute',
    width:           ITEM_SIZE,
    height:          ITEM_SIZE,
    borderRadius:    ITEM_SIZE / 2,
    backgroundColor: C.BG,
    borderWidth:     1.5,
    borderColor:     C.DIM_GREEN,
    justifyContent:  'center',
    alignItems:      'center',
  },
  itemHighlight: {
    borderColor:     C.GREEN,
    backgroundColor: 'rgba(0,255,65,0.18)',
    shadowColor:     C.GREEN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.85,
    shadowRadius:    8,
    elevation:       8,
  },
  itemConfirmed: {
    borderColor:     C.GREEN,
    backgroundColor: 'rgba(0,255,65,0.28)',
    shadowColor:     C.GREEN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.7,
    shadowRadius:    6,
    elevation:       6,
  },
  itemMajorDefault: {
    borderColor:     C.DIM_GREEN,
    backgroundColor: 'rgba(0,92,19,0.25)',
  },
  itemText: {
    fontFamily:    MONO,
    fontSize:      13,
    color:         C.DIM_GREEN,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
  itemTextHighlight: {
    color: C.GREEN,
  },
});
