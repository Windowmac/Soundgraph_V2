/**
 * SoundGraph V2 — React Native multi-instrument app
 *
 * Instruments
 * ───────────
 *  • Harmonica  — 2×10 grid, horizontal glide, vertical pitch bend
 *  • Guitar     — 9 chord nodes + strum area; radial chord editor
 *
 * Shared infrastructure
 * ─────────────────────
 *  • Slide-down menu  Mode selector + per-mode settings (tunings / edit mode)
 *  • react-native-audio-api  Web Audio API spec running on native threads
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
import { GuitarLayout }  from './src/components/GuitarLayout';
import { TUNINGS, Tuning } from './src/data/tunings';
import {
  ChordSlot,
  ChordDefinition,
  DEFAULT_CHORD_SLOTS,
} from './src/data/chords';

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

type AppMode = 'harmonica' | 'guitar';

// ─── Menu geometry ───────────────────────────────────────────────────────────
const HANDLE_HEIGHT   = 22;
const MENU_HEIGHT     = 280;  // expanded to fit mode row + edit toggle + tunings
const SWIPE_THRESHOLD = MENU_HEIGHT * 0.35;
const TRIGGER_ZONE    = 50;

// ─── Root component ──────────────────────────────────────────────────────────
export default function App() {
  const [appMode,         setAppMode]        = useState<AppMode>('harmonica');
  const [activeTuningId,  setActiveTuningId] = useState<string>(TUNINGS[0].id);
  const [guitarEditMode,  setGuitarEditMode] = useState(false);
  const [chordSlots,      setChordSlots]     = useState<ChordSlot[]>(DEFAULT_CHORD_SLOTS);
  const [menuOpen,        setMenuOpen]       = useState(false);

  const currentTuning: Tuning =
    TUNINGS.find(t => t.id === activeTuningId) ?? TUNINGS[0];

  // ── Menu animation ─────────────────────────────────────────────────────────
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

  const selectMode = useCallback((mode: AppMode) => {
    setAppMode(mode);
    if (mode === 'harmonica') setGuitarEditMode(false);
    snapClosed();
  }, [snapClosed]);

  const handleUpdateSlot = useCallback((index: number, chord: ChordDefinition) => {
    setChordSlots(prev => prev.map(s => s.index === index ? { ...s, chord } : s));
  }, []);

  // ── Handle label ────────────────────────────────────────────────────────────
  const handleLabel = appMode === 'guitar'
    ? (guitarEditMode ? 'GUITAR · EDIT' : 'GUITAR')
    : currentTuning.name;

  // ── Swipe-down pan responder ─────────────────────────────────────────────
  const handlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) =>
        evt.nativeEvent.pageY < TRIGGER_ZONE,

      onMoveShouldSetPanResponder: (evt, gs) =>
        !menuOpen && gs.dy > 6 && evt.nativeEvent.pageY < TRIGGER_ZONE + 30,

      onPanResponderMove: (_, gs) => {
        const newY = Math.min(0, -MENU_HEIGHT + gs.dy);
        menuY.setValue(newY);
      },

      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_THRESHOLD) {
          snapOpen();
        } else {
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

        {/* ── Instrument grid ── */}
        <View style={styles.gridWrapper}>
          {appMode === 'harmonica' ? (
            <HarmonicaGrid tuning={currentTuning} disabled={menuOpen} />
          ) : (
            <GuitarLayout
              chordSlots={chordSlots}
              onUpdateSlot={handleUpdateSlot}
              editMode={guitarEditMode}
              disabled={menuOpen}
            />
          )}
        </View>

        {/* ── Swipe handle strip ── */}
        <View
          style={styles.handleStrip}
          {...handlePan.panHandlers}
          pointerEvents="box-only"
        >
          <View style={styles.handlePill} />
          <Text style={styles.handleLabel}>{handleLabel}</Text>
        </View>

        {/* ── Backdrop ── */}
        {menuOpen && (
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={snapClosed}
            activeOpacity={1}
          />
        )}

        {/* ── Slide-down menu panel ── */}
        <Animated.View
          style={[styles.menuPanel, { transform: [{ translateY: menuY }] }]}
          pointerEvents={menuOpen ? 'box-none' : 'none'}
        >
          <View style={styles.menuInner}>
            <View style={styles.menuCloseArea}>
              <View style={styles.menuClosePill} />
            </View>

            {/* Mode selector row */}
            <Text style={styles.menuTitle}>MODE</Text>
            <View style={styles.modeRow}>
              {(['harmonica', 'guitar'] as AppMode[]).map(mode => (
                <Pressable
                  key={mode}
                  style={({ pressed }) => [
                    styles.modeButton,
                    appMode === mode && styles.modeButtonActive,
                    pressed && styles.modeButtonPressed,
                  ]}
                  onPress={() => selectMode(mode)}
                >
                  <Text style={[
                    styles.modeButtonLabel,
                    appMode === mode && styles.modeButtonLabelActive,
                  ]}>
                    {mode.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Guitar edit toggle */}
            {appMode === 'guitar' && (
              <Pressable
                style={({ pressed }) => [
                  styles.editToggle,
                  guitarEditMode && styles.editToggleActive,
                  pressed && styles.editTogglePressed,
                ]}
                onPress={() => setGuitarEditMode(v => !v)}
              >
                <Text style={[
                  styles.editToggleLabel,
                  guitarEditMode && styles.editToggleLabelActive,
                ]}>
                  {guitarEditMode ? '● EDIT CHORDS ON' : '○ EDIT CHORDS'}
                </Text>
              </Pressable>
            )}

            {/* Tuning list (harmonica only) */}
            <Text style={[styles.menuTitle, styles.menuTitleSpaced, appMode === 'guitar' && styles.dimmed]}>
              TUNING
            </Text>
            <View style={[styles.tuningList, appMode === 'guitar' && styles.dimmed]}>
              {TUNINGS.map(t => (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [
                    styles.tuningItem,
                    t.id === activeTuningId && styles.tuningItemActive,
                    pressed && appMode === 'harmonica' && styles.tuningItemPressed,
                  ]}
                  onPress={() => appMode === 'harmonica' && selectTuning(t.id)}
                  disabled={appMode === 'guitar'}
                >
                  <Text style={[
                    styles.tuningName,
                    t.id === activeTuningId && appMode === 'harmonica' && styles.tuningNameActive,
                  ]}>
                    {t.name}
                  </Text>
                  {t.id === activeTuningId && appMode === 'harmonica' && (
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

  gridWrapper: {
    flex:      1,
    marginTop: HANDLE_HEIGHT,
  },

  handleStrip: {
    position:          'absolute',
    top:               0,
    left:              0,
    right:             0,
    height:            HANDLE_HEIGHT,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               10,
    backgroundColor:   C.BLACK,
    borderBottomWidth: 1,
    borderBottomColor: C.DIMMER,
    zIndex:            10,
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

  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex:          20,
  },

  menuPanel: {
    position: 'absolute',
    top:      0,
    left:     0,
    right:    0,
    height:   MENU_HEIGHT,
    zIndex:   30,
  },
  menuInner: {
    flex:              1,
    backgroundColor:   C.MENU_BG,
    borderBottomWidth: 1,
    borderBottomColor: C.DIM_GREEN,
    paddingHorizontal: 24,
    paddingBottom:     16,
  },
  menuCloseArea: {
    alignItems:    'center',
    paddingTop:    8,
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
    marginBottom:  8,
    marginTop:     6,
  },
  menuTitleSpaced: {
    marginTop: 12,
  },

  // ── Mode row ──────────────────────────────────────────────────────────────
  modeRow: {
    flexDirection: 'row',
    gap:           8,
    marginBottom:  4,
  },
  modeButton: {
    flex:              1,
    paddingVertical:   8,
    paddingHorizontal: 12,
    borderWidth:       1,
    borderColor:       C.DIMMER,
    borderRadius:      2,
    alignItems:        'center',
  },
  modeButtonActive: {
    borderColor:     C.DIM_GREEN,
    backgroundColor: 'rgba(0,92,19,0.20)',
  },
  modeButtonPressed: {
    backgroundColor: 'rgba(0,255,65,0.08)',
  },
  modeButtonLabel: {
    fontFamily:    MONO,
    fontSize:      11,
    color:         C.DIM_GREEN,
    letterSpacing: 2,
  },
  modeButtonLabelActive: {
    color:            C.GREEN,
    textShadowColor:  C.GREEN,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },

  // ── Edit chords toggle ────────────────────────────────────────────────────
  editToggle: {
    paddingVertical:   8,
    paddingHorizontal: 12,
    borderWidth:       1,
    borderColor:       C.DIMMER,
    borderRadius:      2,
    marginBottom:      4,
  },
  editToggleActive: {
    borderColor:     C.GREEN,
    backgroundColor: 'rgba(0,255,65,0.08)',
  },
  editTogglePressed: {
    backgroundColor: 'rgba(0,255,65,0.05)',
  },
  editToggleLabel: {
    fontFamily:    MONO,
    fontSize:      11,
    color:         C.DIM_GREEN,
    letterSpacing: 2,
  },
  editToggleLabelActive: {
    color: C.GREEN,
  },

  // ── Tuning list ───────────────────────────────────────────────────────────
  tuningList: {
    flexDirection: 'column',
    gap:           2,
  },
  tuningItem: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   8,
    paddingHorizontal: 12,
    borderWidth:       1,
    borderColor:       C.DIMMER,
    borderRadius:      2,
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
    fontSize:      12,
    color:         C.DIM_GREEN,
    letterSpacing: 1.5,
    flex:          1,
  },
  tuningNameActive: {
    color:            C.GREEN,
    textShadowColor:  C.GREEN,
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
  dimmed: {
    opacity: 0.35,
  },
});
