export type RootNote =
  | 'A' | 'A#' | 'B' | 'C' | 'C#' | 'D'
  | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#';

export type ChordVariant =
  | 'major' | 'minor' | 'sus2' | 'sus4'
  | 'maj7'  | 'min7'  | '7'    | 'add9';

export interface ChordDefinition {
  root:        RootNote;
  variant:     ChordVariant;
  label:       string;
  frequencies: number[];  // 6 Hz values, low → high (one per guitar string)
}

export interface ChordSlot {
  index: number;              // 0–8
  chord: ChordDefinition | null;
}

// ─── Root base frequencies in guitar register (~A2–G#3) ──────────────────────
const ROOT_FREQ: Record<RootNote, number> = {
  'A':  110.00,
  'A#': 116.54,
  'B':  123.47,
  'C':  130.81,
  'C#': 138.59,
  'D':  146.83,
  'D#': 155.56,
  'E':  164.81,
  'F':  174.61,
  'F#': 185.00,
  'G':  196.00,
  'G#': 207.65,
};

// ─── Chord interval patterns (semitones from root, 6 notes: R 3 5 R' 3' 5') ──
// One semitone value per guitar string (low → high). Each chord covers 2 octaves,
// giving each string a unique pitch and avoiding duplicate middle strings.
const CHORD_INTERVALS: Record<ChordVariant, number[]> = {
  major: [0,  4,  7, 12, 16, 19],  // R  3  5  R'  3'  5'
  minor: [0,  3,  7, 12, 15, 19],  // R  b3 5  R'  b3' 5'
  sus2:  [0,  2,  7, 12, 14, 19],  // R  2  5  R'  2'  5'
  sus4:  [0,  5,  7, 12, 17, 19],  // R  4  5  R'  4'  5'
  maj7:  [0,  4,  7, 11, 16, 19],  // R  3  5  7   3'  5'
  min7:  [0,  3,  7, 10, 15, 19],  // R  b3 5  b7  b3' 5'
  '7':   [0,  4,  7, 10, 16, 19],  // R  3  5  b7  3'  5'
  add9:  [0,  4,  7, 14, 16, 19],  // R  3  5  9   3'  5'
};

// ─── Human-readable variant labels ───────────────────────────────────────────
export const VARIANT_LABELS: Record<ChordVariant, string> = {
  major: 'maj',
  minor: 'm',
  sus2:  'sus2',
  sus4:  'sus4',
  maj7:  'maj7',
  min7:  'm7',
  '7':   '7',
  add9:  'add9',
};

export const ALL_ROOTS:    RootNote[]    = ['A','A#','B','C','C#','D','D#','E','F','F#','G','G#'];
export const ALL_VARIANTS: ChordVariant[] = ['major','minor','sus2','sus4','maj7','min7','7','add9'];

// ─── Build a ChordDefinition from root + variant ─────────────────────────────
export function buildChord(root: RootNote, variant: ChordVariant): ChordDefinition {
  const base      = ROOT_FREQ[root];
  const intervals = CHORD_INTERVALS[variant];
  const frequencies = intervals.map(s => base * Math.pow(2, s / 12));

  const varLabel = variant === 'major' ? '' : VARIANT_LABELS[variant];
  const label    = `${root}${varLabel}`;

  return { root, variant, label, frequencies };
}

// ─── Open guitar string frequencies: E2 A2 D3 G3 B3 E4 (standard tuning) ─────
export const OPEN_STRING_FREQS: number[] = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];

// ─── Default 9 chord slots ────────────────────────────────────────────────────
export const DEFAULT_CHORD_SLOTS: ChordSlot[] = [
  { index: 0, chord: buildChord('C',  'major') },
  { index: 1, chord: buildChord('A',  'minor') },
  { index: 2, chord: buildChord('F',  'major') },
  { index: 3, chord: buildChord('G',  'major') },
  { index: 4, chord: buildChord('D',  'minor') },
  { index: 5, chord: buildChord('E',  'minor') },
  { index: 6, chord: buildChord('A',  'major') },
  { index: 7, chord: buildChord('D',  'major') },
  { index: 8, chord: buildChord('E',  'major') },
];
