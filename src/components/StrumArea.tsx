import React, { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
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

export interface StrumAreaHandle {
  pluck: (stringIndex: number) => void;
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

const STRING_POSITIONS = [0.15, 0.30, 0.45, 0.60, 0.75, 0.90];
// Each string is rendered as a 6px tall View scaled down to ~1px at rest.
// On pluck the scaleY jumps to 1 then dampens back, giving a visible vibration.
const STRING_BASE_H = 6;

// StrumArea is a passive visual layer; all touch handling lives in GuitarLayout.
export const StrumArea = forwardRef<StrumAreaHandle, Props>(
  function StrumArea({ hasActiveChord, editMode }, ref) {
    const pulseAnim  = useRef(new Animated.Value(0.12)).current;
    const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);

    // One Animated.Value per string: 0 = rest, 1 = peak pluck
    const pluckAnims = useRef<Animated.Value[]>(
      STRING_POSITIONS.map(() => new Animated.Value(0))
    ).current;

    // Expose pluck() imperatively so GuitarLayout can trigger animations
    const pluck = useCallback((index: number) => {
      const anim = pluckAnims[index];
      if (!anim) return;
      anim.stopAnimation();
      // Dampened oscillation: peak → settle → small bounce → fade
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,    duration: 20,  useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.45, duration: 55,  useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.75, duration: 40,  useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3,  duration: 60,  useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5,  duration: 50,  useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0,    duration: 220, useNativeDriver: true }),
      ]).start();
    }, [pluckAnims]);

    useImperativeHandle(ref, () => ({ pluck }), [pluck]);

    // Global pulse when chord is held
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
        {STRING_POSITIONS.map((pos, i) => {
          const anim = pluckAnims[i];
          // opacity: rest = 0.35, pluck peak = 1.0
          const opacity = anim.interpolate({
            inputRange:  [0, 1],
            outputRange: [0.35, 1.0],
          });
          // scaleY: rest = 0.17 (≈1px from 6px base), pluck peak = 1.0 (6px)
          const scaleY = anim.interpolate({
            inputRange:  [0, 1],
            outputRange: [0.17, 1.0],
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.string,
                {
                  top:       `${pos * 100}%` as any,
                  marginTop: -(STRING_BASE_H / 2),
                  opacity,
                  transform: [{ scaleY }],
                },
              ]}
            />
          );
        })}

        {/* Global pulse overlay when chord is active */}
        <Animated.View style={[styles.pulseOverlay, { opacity: pulseAnim }]} />

        <Text style={styles.label}>
          {editMode ? 'EDIT' : ''}
        </Text>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    opacity:         0.5,
    backgroundColor: '#010e03',
    justifyContent:  'center',
    alignItems:      'center',
    overflow:        'hidden',
  },
  string: {
    position:        'absolute',
    left:            0,
    right:           0,
    height:          STRING_BASE_H,
    backgroundColor: C.GREEN,
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
