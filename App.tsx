/**
 * SoundGraph V2 — React Native harmonica instrument
 *
 * Architecture
 * ────────────
 *  • HarmonicaGrid   Full-screen landscape key grid; handles multi-touch
 *                    note playing, horizontal glide, and vertical pitch bend.
 *  • TuningMenu      Animated panel that slides down from the top when the
 *                    user swipes down from the thin handle bar at the very top.
 *  • useAudioEngine  Polyphonic square-wave synthesiser via react-native-audio-api
 *                    (Web Audio API spec running natively).
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { HarmonicaGrid } from './src/components/HarmonicaGrid';
import { TUNINGS, Tuning } from './src/data/tunings';

// ─── Lock orientation on mount ───────────────────────────────────────────────
ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

// ─── Theme ───────────────────────────────────────────────────────────────────
const C = {
  GREEN:      '#00ff41',
  DIM_GREEN:  '#005c13',
  DIMMER:     '#002a08',
  BLACK:      '#000000',
  MENU_BG:    'rgba(0,8,2,0.97)',
  HANDLE:     '#003a0d',
} as const;

const MONO = Platform.select({
  ios:     'Courier New',
  android: 'monospace',
  default: 'Courier New',
});

// ─── Menu geometry ───────────────────────────────────────────────────────────
const HANDLE_HEIGHT   = 22;  // always-visible swipe-zone at the very top
const MENU_HEIGHT     = 210; // full panel height (visible when open)
const SWIPE_THRESHOLD = MENU_HEIGHT * 0.35; // how far to drag before snap-open
const TRIGGER_ZONE    = 50;  // px from top of screen that activates the gesture

// ─── Root component ──────────────────────────────────────────────────────────
export default function App() {
  const [activeTuningId, setActiveTuningId] = useState<string>(TUNINGS[0].id);
  const [menuOpen, setMenuOpen]             = useState(false);

  const currentTuning: Tuning =
    TUNINGS.find(t => t.id === activeTuningId) ?? TUNINGS[0];

  // ── Menu animation ─────────────────────────────────────────────────────────
  // translateY: -MENU_HEIGHT = fully hidden above screen | 0 = fully visible
  const menuY = useRef(new Animated.Value(-MENU_HEIGHT)).current;

  const snapOpen = useCallback(() => {
    setMenuOpen(true);
    Animated.spring(menuY, {
      toValue:         0,
      useNativeDriver: true,
      tension:         70,
      friction:        12,
    }).start();
  }, [menuY]);

  const snapClosed = useCallback(() => {
    Animated.spring(menuY, {
      toValue:         -MENU_HEIGHT,
      useNativeDriver: true,
      tension:         70,
      friction:        12,
    }).start(() => setMenuOpen(false));
  }, [menuY]);

  const selectTuning = useCallback((id: string) => {
    setActiveTuningId(id);
    snapClosed();
  }, [snapClosed]);

  // ── Swipe-down pan responder (lives on the handle strip) ───────────────────
  const handlePan = useRef(
    PanResponder.create({
      // Only capture a gesture that starts inside the handle zone
      onStartShouldSetPanResponder: (evt) =>
        evt.nativeEvent.pageY < TRIGGER_ZONE,

      onMoveShouldSetPanResponder: (evt, gs) =>
        !menuOpen && gs.dy > 6 && evt.nativeEvent.pageY < TRIGGER_ZONE + 30,

      onPanResponderMove: (_, gs) => {
        // Clamp so the panel never slides below its natural resting position
        const newY = Math.min(0, -MENU_HEIGHT + gs.dy);
        menuY.setValue(newY);
      },

      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_THRESHOLD) {
          snapOpen();
        } else {
          // Not dragged far enough — snap back
          Animated.spring(menuY, {
            toValue:         -MENU_HEIGHT,
            useNativeDriver: true,
            tension:         80,
            friction:        14,
          }).start();
        }
      },
    })
  ).current;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <StatusBar hidden />

        {/* ── Grid (fills everything below the handle) ── */}
        <View style={styles.gridWrapper}>
          <HarmonicaGrid tuning={currentTuning} disabled={menuOpen} />
        </View>

        {/* ── Swipe handle strip ── */}
        <View
          style={styles.handleStrip}
          {...handlePan.panHandlers}
          pointerEvents="box-only"
        >
          <View style={styles.handlePill} />
          <Text style={styles.handleLabel}>{currentTuning.name}</Text>
        </View>

        {/* ── Tap-outside backdrop (closes menu) ── */}
        {menuOpen && (
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={snapClosed}
            activeOpacity={1}
          />
        )}

        {/* ── Animated tuning menu panel ── */}
        <Animated.View
          style={[
            styles.menuPanel,
            { transform: [{ translateY: menuY }] },
          ]}
          pointerEvents={menuOpen ? 'box-none' : 'none'}
        >
          <View style={styles.menuInner}>
            {/* Close handle inside menu */}
            <View style={styles.menuCloseArea}>
              <View style={styles.menuClosePill} />
            </View>

            <Text style={styles.menuTitle}>SELECT TUNING</Text>

            <View style={styles.tuningList}>
              {TUNINGS.map(t => (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [
                    styles.tuningItem,
                    t.id === activeTuningId && styles.tuningItemActive,
                    pressed && styles.tuningItemPressed,
                  ]}
                  onPress={() => selectTuning(t.id)}
                >
                  <Text
                    style={[
                      styles.tuningName,
                      t.id === activeTuningId && styles.tuningNameActive,
                    ]}
                  >
                    {t.name}
                  </Text>
                  {t.id === activeTuningId && (
                    <View style={styles.activeIndicator} />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: C.BLACK,
  },

  // ── Grid ──────────────────────────────────────────────────────────────────
  gridWrapper: {
    flex:       1,
    marginTop:  HANDLE_HEIGHT, // leave room for the handle strip
  },

  // ── Handle strip ──────────────────────────────────────────────────────────
  handleStrip: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    height:          HANDLE_HEIGHT,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    backgroundColor: C.BLACK,
    borderBottomWidth: 1,
    borderBottomColor: C.DIMMER,
    zIndex:          10,
  },
  handlePill: {
    width:           32,
    height:          3,
    borderRadius:    2,
    backgroundColor: C.HANDLE,
  },
  handleLabel: {
    fontFamily:    MONO,
    fontSize:      9,
    color:         C.DIM_GREEN,
    letterSpacing: 2,
  },

  // ── Backdrop ──────────────────────────────────────────────────────────────
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex:          20,
  },

  // ── Menu panel ────────────────────────────────────────────────────────────
  menuPanel: {
    position:  'absolute',
    top:       0,
    left:      0,
    right:     0,
    height:    MENU_HEIGHT,
    zIndex:    30,
  },
  menuInner: {
    flex:            1,
    backgroundColor: C.MENU_BG,
    borderBottomWidth: 1,
    borderBottomColor: C.DIM_GREEN,
    paddingHorizontal: 24,
    paddingBottom:     16,
  },
  menuCloseArea: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  menuClosePill: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: C.DIM_GREEN,
  },
  menuTitle: {
    fontFamily:    MONO,
    fontSize:      10,
    color:         C.DIM_GREEN,
    letterSpacing: 3,
    marginBottom:  14,
    marginTop:     6,
  },

  // ── Tuning list ───────────────────────────────────────────────────────────
  tuningList: {
    flexDirection: 'column',
    gap:           2,
  },
  tuningItem: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth:     1,
    borderColor:     C.DIMMER,
    borderRadius:    2,
  },
  tuningItemActive: {
    borderColor:     C.DIM_GREEN,
    backgroundColor: 'rgba(0,92,19,0.15)',
  },
  tuningItemPressed: {
    backgroundColor: 'rgba(0,255,65,0.08)',
  },
  tuningName: {
    fontFamily:    MONO,
    fontSize:      13,
    color:         C.DIM_GREEN,
    letterSpacing: 1.5,
    flex:          1,
  },
  tuningNameActive: {
    color:         C.GREEN,
    textShadowColor: C.GREEN,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  activeIndicator: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: C.GREEN,
    shadowColor:     C.GREEN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   1,
    shadowRadius:    4,
    elevation:       4,
  },
});
