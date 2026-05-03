import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { RootNote, ChordVariant, VARIANT_LABELS } from '../data/chords';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');

const SHEET_HEIGHT = 280;
const ROOT_BTN_W   = Math.floor((SW - 36) / 6);  // 6 per row, account for gaps
const ROOT_BTN_H   = 52;
const VAR_BTN_W    = Math.floor((SW - 28) / 4);   // 4 per row, account for gaps
const VAR_BTN_H    = 48;
const DWELL_MS     = 600;

// Circle of fifths order (musically adjacent keys are neighbours)
const CIRCLE_OF_FIFTHS: RootNote[] = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F',
];

// Variant grid: 4 per row × 2 rows
const VARIANT_ROWS: ChordVariant[][] = [
  ['major', 'minor', 'maj7', 'min7'],
  ['7',     'sus2',  'sus4', 'add9'],
];

const C = {
  GREEN:     '#00ff41',
  DIM_GREEN: '#005c13',
  SHEET_BG:  'rgba(0,18,5,0.98)',
};

const MONO = Platform.select({
  ios:     'Courier New',
  android: 'monospace',
  default: 'Courier New',
});

// ─── Layout record ────────────────────────────────────────────────────────────

interface AbsRect { x: number; y: number; w: number; h: number }

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  dragPos:            { x: number; y: number };
  onVariantConfirmed: (root: RootNote, variant: ChordVariant) => void;
  onDismiss:          () => void;
}

// ─── ChordPickerSheet ─────────────────────────────────────────────────────────

export function ChordPickerSheet({ dragPos, onVariantConfirmed, onDismiss }: Props) {
  const [selectedRoot,   setSelectedRoot]   = useState<RootNote | null>(null);
  const [hoveredRoot,    setHoveredRoot]     = useState<RootNote | null>(null);
  const [hoveredVariant, setHoveredVariant]  = useState<ChordVariant | null>(null);

  const selectedRootRef = useRef<RootNote | null>(null);
  useEffect(() => { selectedRootRef.current = selectedRoot; }, [selectedRoot]);

  const dwellTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDwellKeyRef = useRef<string>('');

  // Absolute rects for each button, populated after mount via measureInWindow
  const rootRectsRef    = useRef<Map<RootNote, AbsRect>>(new Map());
  const variantRectsRef = useRef<Map<ChordVariant, AbsRect>>(new Map());

  // View refs for measurement
  const rootViewRefs    = useRef<Map<RootNote,    React.RefObject<View>>>(
    new Map(CIRCLE_OF_FIFTHS.map(r => [r, React.createRef<View>()]))
  );
  const variantViewRefs = useRef<Map<ChordVariant, React.RefObject<View>>>(
    new Map(VARIANT_ROWS.flat().map(v => [v, React.createRef<View>()]))
  );

  // ── Slide-up animation ──────────────────────────────────────────────────────

  const slideAnim  = useRef(new Animated.Value(SHEET_HEIGHT + 20)).current;
  const varOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue:         0,
      duration:        220,
      useNativeDriver: true,
    }).start(() => {
      // Measure all root button positions once animation settles
      measureAllRoots();
    });
  }, []);

  const measureAllRoots = useCallback(() => {
    for (const [root, ref] of rootViewRefs.current) {
      ref.current?.measureInWindow((x, y, w, h) => {
        rootRectsRef.current.set(root, { x, y, w, h });
      });
    }
  }, []);

  const measureAllVariants = useCallback(() => {
    for (const [variant, ref] of variantViewRefs.current) {
      ref.current?.measureInWindow((x, y, w, h) => {
        variantRectsRef.current.set(variant, { x, y, w, h });
      });
    }
  }, []);

  const showVariants = useCallback(() => {
    Animated.timing(varOpacity, {
      toValue:         1,
      duration:        160,
      useNativeDriver: true,
    }).start(() => {
      // Measure variant buttons once they've appeared
      setTimeout(measureAllVariants, 0);
    });
  }, [varOpacity, measureAllVariants]);

  // ── Dwell detection on dragPos ───────────────────────────────────────────────

  useEffect(() => {
    const { x: px, y: py } = dragPos;
    const hasRoot = selectedRootRef.current !== null;

    if (!hasRoot) {
      let hit: RootNote | null = null;
      for (const [root, rect] of rootRectsRef.current) {
        if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
          hit = root;
          break;
        }
      }

      setHoveredRoot(hit);
      const key = hit ?? '';
      if (key !== lastDwellKeyRef.current) {
        lastDwellKeyRef.current = key;
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        if (hit) {
          const capturedHit = hit;
          dwellTimerRef.current = setTimeout(() => {
            setSelectedRoot(capturedHit);
            selectedRootRef.current = capturedHit;
            lastDwellKeyRef.current = '';
            showVariants();
          }, DWELL_MS);
        }
      }
    } else {
      let hit: ChordVariant | null = null;
      for (const [variant, rect] of variantRectsRef.current) {
        if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
          hit = variant;
          break;
        }
      }

      setHoveredVariant(hit);
      const key = hit ?? '';
      if (key !== lastDwellKeyRef.current) {
        lastDwellKeyRef.current = key;
        if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
        if (hit) {
          const capturedHit = hit;
          dwellTimerRef.current = setTimeout(() => {
            const root = selectedRootRef.current;
            if (root) onVariantConfirmed(root, capturedHit);
          }, DWELL_MS);
        }
      }
    }
  }, [dragPos, showVariants, onVariantConfirmed]);

  useEffect(() => () => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Scrim */}
      <View style={[StyleSheet.absoluteFill, styles.scrim]} onTouchEnd={onDismiss} />

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {selectedRoot ? `${selectedRoot} — pick variant` : 'SELECT ROOT'}
          </Text>
          {selectedRoot && (
            <Text
              style={styles.backBtn}
              onPress={() => {
                setSelectedRoot(null);
                selectedRootRef.current = null;
                setHoveredVariant(null);
                lastDwellKeyRef.current = '';
                varOpacity.setValue(0);
                // Re-measure roots since they become visible again
                setTimeout(measureAllRoots, 50);
              }}
            >
              ← back
            </Text>
          )}
        </View>

        {/* Root grid — circle of fifths, 2 rows × 6 */}
        {!selectedRoot && (
          <View style={styles.grid}>
            {[0, 1].map(row => (
              <View key={row} style={styles.row}>
                {CIRCLE_OF_FIFTHS.slice(row * 6, row * 6 + 6).map(root => {
                  const isHovered = root === hoveredRoot;
                  return (
                    <View
                      key={root}
                      ref={rootViewRefs.current.get(root)}
                      style={[styles.rootBtn, isHovered && styles.btnHovered]}
                    >
                      <Text style={[styles.rootText, isHovered && styles.textHovered]}>
                        {root}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* Variant grid — 2 rows × 4, fades in after root confirmed */}
        {selectedRoot && (
          <Animated.View style={[styles.grid, { opacity: varOpacity }]}>
            {VARIANT_ROWS.map((rowVariants, row) => (
              <View key={row} style={styles.row}>
                {rowVariants.map(variant => {
                  const isHovered = variant === hoveredVariant;
                  const label = variant === 'major'
                    ? selectedRoot
                    : `${selectedRoot}${VARIANT_LABELS[variant]}`;
                  return (
                    <View
                      key={variant}
                      ref={variantViewRefs.current.get(variant)}
                      style={[styles.variantBtn, isHovered && styles.btnHovered]}
                    >
                      <Text style={[styles.variantText, isHovered && styles.textHovered]}>
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    backgroundColor:   C.SHEET_BG,
    borderTopWidth:    1,
    borderTopColor:    C.DIM_GREEN,
    paddingHorizontal: 8,
    paddingTop:        12,
    paddingBottom:     20,
  },
  titleRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    marginBottom:      10,
    paddingHorizontal: 4,
  },
  title: {
    fontFamily:    MONO,
    fontSize:      11,
    color:         C.DIM_GREEN,
    letterSpacing: 2,
    fontWeight:    '700',
  },
  backBtn: {
    fontFamily: MONO,
    fontSize:   11,
    color:      C.GREEN,
    opacity:    0.8,
  },
  grid: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap:           4,
  },
  rootBtn: {
    flex:            1,
    height:          ROOT_BTN_H,
    borderRadius:    6,
    borderWidth:     1,
    borderColor:     C.DIM_GREEN,
    backgroundColor: 'rgba(0,20,5,0.8)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  variantBtn: {
    flex:            1,
    height:          VAR_BTN_H,
    borderRadius:    6,
    borderWidth:     1,
    borderColor:     C.DIM_GREEN,
    backgroundColor: 'rgba(0,20,5,0.8)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  btnHovered: {
    borderColor:     C.GREEN,
    backgroundColor: 'rgba(0,255,65,0.15)',
    shadowColor:     C.GREEN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.8,
    shadowRadius:    6,
    elevation:       6,
  },
  rootText: {
    fontFamily: MONO,
    fontSize:   15,
    color:      C.DIM_GREEN,
    fontWeight: '700',
  },
  variantText: {
    fontFamily: MONO,
    fontSize:   13,
    color:      C.DIM_GREEN,
    fontWeight: '700',
  },
  textHovered: {
    color: C.GREEN,
  },
});
