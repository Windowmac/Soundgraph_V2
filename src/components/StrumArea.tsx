import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';

interface Props {
  hasActiveChord: boolean;
  editMode:       boolean;
}

const C = {
  GREEN:     '#00ff41',
  DIM_GREEN: '#005c13',
};

const MONO = Platform.select({
  ios:     'Courier New',
  android: 'monospace',
  default: 'Courier New',
});

// StrumArea is a passive visual layer — all touch handling is in GuitarLayout.
// It sits as an absoluteFill background behind the chord circles.
export function StrumArea({ hasActiveChord, editMode }: Props) {
  const pulseAnim = useRef(new Animated.Value(0.12)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (hasActiveChord && !editMode) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.30, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.12, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      Animated.timing(pulseAnim, { toValue: 0.12, duration: 200, useNativeDriver: true }).start();
    }
  }, [hasActiveChord, editMode]);

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Horizontal string lines — crossing them top-to-bottom = natural strum */}
      {[0.15, 0.30, 0.45, 0.60, 0.75, 0.90].map((pos, i) => (
        <View
          key={i}
          style={[styles.string, { top: `${pos * 100}%` as any }]}
        />
      ))}

      {/* Pulse glow — subtle since area is faded */}
      <Animated.View style={[styles.pulseOverlay, { opacity: pulseAnim }]} />

      {/* Label */}
      <Text style={styles.label}>
        {editMode ? 'EDIT' : hasActiveChord ? 'STRUM' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    opacity:         0.45,
    backgroundColor: '#010e03',
    justifyContent:  'center',
    alignItems:      'center',
    overflow:        'hidden',
  },
  string: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          1,
    backgroundColor: '#007a20',
  },
  pulseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.GREEN,
  },
  label: {
    color:         C.DIM_GREEN,
    fontFamily:    MONO,
    fontSize:      13,
    letterSpacing: 4,
    opacity:       0.7,
  },
});
