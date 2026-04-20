import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  NativeSyntheticEvent,
  NativeTouchEvent,
} from 'react-native';

interface Props {
  hasActiveChord: boolean;
  editMode:       boolean;
  disabled:       boolean;
  onStrumStart:   (touchId: number) => void;
  onStrumEnd:     (touchId: number) => void;
}

const C = {
  GREEN:     '#00ff41',
  DIM_GREEN: '#005c13',
  DIMMER:    '#002a08',
  BLACK:     '#000000',
};

const MONO = Platform.select({
  ios:     'Courier New',
  android: 'monospace',
  default: 'Courier New',
});

export function StrumArea({ hasActiveChord, editMode, disabled, onStrumStart, onStrumEnd }: Props) {
  const pulseAnim = useRef(new Animated.Value(0.15)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (hasActiveChord && !editMode) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.45, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.15, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      Animated.timing(pulseAnim, { toValue: 0.15, duration: 200, useNativeDriver: true }).start();
    }
  }, [hasActiveChord, editMode]);

  const handleTouchStart = (e: NativeSyntheticEvent<NativeTouchEvent>) => {
    if (disabled || editMode) return;
    for (const t of e.nativeEvent.changedTouches) {
      onStrumStart(Number(t.identifier));
    }
  };

  const handleTouchEnd = (e: NativeSyntheticEvent<NativeTouchEvent>) => {
    if (disabled || editMode) return;
    for (const t of e.nativeEvent.changedTouches) {
      onStrumEnd(Number(t.identifier));
    }
  };

  return (
    <View
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Vertical string lines */}
      {[0.15, 0.30, 0.45, 0.60, 0.75, 0.90].map((pos, i) => (
        <View
          key={i}
          style={[styles.string, { left: `${pos * 100}%` as any }]}
        />
      ))}

      {/* Pulse glow overlay */}
      <Animated.View style={[styles.pulseOverlay, { opacity: pulseAnim }]} />

      {/* Center label */}
      <Text style={styles.label}>
        {editMode ? 'EDIT MODE' : hasActiveChord ? 'STRUM' : ''}
      </Text>

      {editMode && (
        <View style={styles.editOverlay} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#010e03',
    borderLeftWidth: 2,
    borderLeftColor: '#003a0d',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  string: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#003a0d',
  },
  pulseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.GREEN,
  },
  label: {
    color: C.DIM_GREEN,
    fontFamily: MONO,
    fontSize: 13,
    letterSpacing: 4,
    opacity: 0.7,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
