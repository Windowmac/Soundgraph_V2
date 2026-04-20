import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { ChordSlot } from '../data/chords';

interface Props {
  slot:        ChordSlot;
  isActive:    boolean;
  isEditMode:  boolean;
  onLongPress: (index: number, x: number, y: number) => void;
  // Touch callbacks are handled by the parent PanResponder;
  // these are for visual-only feedback triggered externally.
}

const C = {
  GREEN:     '#00ff41',
  DIM_GREEN: '#005c13',
  DIMMER:    '#002a08',
  BORDER:    '#003a0d',
};

const MONO = Platform.select({
  ios:     'Courier New',
  android: 'monospace',
  default: 'Courier New',
});

export function ChordPad({ slot, isActive, isEditMode }: Props) {
  const label = slot.chord?.label ?? '—';

  return (
    <View style={[
      styles.pad,
      isActive    && styles.padActive,
      isEditMode  && styles.padEdit,
    ]}>
      <Text style={[styles.label, isActive && styles.labelActive]}>
        {label}
      </Text>
      {isEditMode && (
        <Text style={styles.editHint}>hold</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    flex: 1,
    margin: 3,
    borderWidth: 1,
    borderColor: C.BORDER,
    borderRadius: 4,
    backgroundColor: '#020e04',
    justifyContent: 'center',
    alignItems: 'center',
    // Android elevation for inactive
    elevation: 1,
  },
  padActive: {
    backgroundColor: C.GREEN,
    borderColor: C.GREEN,
    elevation: 6,
    // iOS shadow
    shadowColor: C.GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  padEdit: {
    borderColor: C.DIM_GREEN,
    borderStyle: 'dashed',
  },
  label: {
    color: C.GREEN,
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  labelActive: {
    color: C.DIMMER,
  },
  editHint: {
    color: C.DIM_GREEN,
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    marginTop: 2,
    opacity: 0.6,
  },
});
