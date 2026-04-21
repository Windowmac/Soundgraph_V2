import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { ChordSlot } from '../data/chords';

interface Props {
  slot:       ChordSlot;
  isActive:   boolean;
  isEditMode: boolean;
  size:       number;   // diameter in dp — caller controls sizing
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

export function ChordPad({ slot, isActive, isEditMode, size }: Props) {
  const label    = slot.chord?.label ?? '—';
  const radius   = size / 2;
  const fontSize = Math.round(size * 0.14);

  return (
    <View style={[
      styles.pad,
      { width: size, height: size, borderRadius: radius },
      isActive   && styles.padActive,
      isEditMode && styles.padEdit,
    ]}>
      <Text style={[styles.label, { fontSize }, isActive && styles.labelActive]}>
        {label}
      </Text>
      {isEditMode && (
        <Text style={[styles.editHint, { fontSize: Math.max(7, fontSize * 0.55) }]}>hold</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    borderWidth:     1.5,
    borderColor:     C.BORDER,
    backgroundColor: 'rgba(2,14,4,0.88)',
    justifyContent:  'center',
    alignItems:      'center',
    elevation:       3,
  },
  padActive: {
    backgroundColor: C.GREEN,
    borderColor:     C.GREEN,
    elevation:       8,
    shadowColor:     C.GREEN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.9,
    shadowRadius:    10,
  },
  padEdit: {
    borderColor: C.DIM_GREEN,
    borderStyle: 'dashed',
  },
  label: {
    color:      C.GREEN,
    fontFamily: MONO,
    fontWeight: '700',
  },
  labelActive: {
    color: C.DIMMER,
  },
  editHint: {
    color:         C.DIM_GREEN,
    fontFamily:    MONO,
    letterSpacing: 1,
    marginTop:     2,
    opacity:       0.7,
  },
});
