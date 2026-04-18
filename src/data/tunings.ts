export interface Note {
  label: string;
  freq: number;
}

export interface Tuning {
  id: string;
  name: string;
  rows: [Note[], Note[]]; // [blow, draw] — each 10 notes
}

export const TUNINGS: Tuning[] = [
  {
    id: 'richter',
    name: 'RICHTER (C)',
    rows: [
      // Blow row
      [
        { label: 'C4',  freq: 261.63 },
        { label: 'E4',  freq: 329.63 },
        { label: 'G4',  freq: 392.00 },
        { label: 'C5',  freq: 523.25 },
        { label: 'E5',  freq: 659.25 },
        { label: 'G5',  freq: 783.99 },
        { label: 'C6',  freq: 1046.50 },
        { label: 'E6',  freq: 1318.51 },
        { label: 'G6',  freq: 1567.98 },
        { label: 'C7',  freq: 2093.00 },
      ],
      // Draw row
      [
        { label: 'D4',  freq: 293.66 },
        { label: 'G4',  freq: 392.00 },
        { label: 'B4',  freq: 493.88 },
        { label: 'D5',  freq: 587.33 },
        { label: 'F5',  freq: 698.46 },
        { label: 'A5',  freq: 880.00 },
        { label: 'B5',  freq: 987.77 },
        { label: 'D6',  freq: 1174.66 },
        { label: 'F6',  freq: 1396.91 },
        { label: 'A6',  freq: 1760.00 },
      ],
    ],
  },
  {
    id: 'paddy-richter',
    name: 'PADDY RICHTER',
    rows: [
      // Blow row — hole 3 raised G4 → A4 for Celtic playing
      [
        { label: 'C4',  freq: 261.63 },
        { label: 'E4',  freq: 329.63 },
        { label: 'A4',  freq: 440.00 },
        { label: 'C5',  freq: 523.25 },
        { label: 'E5',  freq: 659.25 },
        { label: 'G5',  freq: 783.99 },
        { label: 'C6',  freq: 1046.50 },
        { label: 'E6',  freq: 1318.51 },
        { label: 'G6',  freq: 1567.98 },
        { label: 'C7',  freq: 2093.00 },
      ],
      // Draw row — identical to Richter
      [
        { label: 'D4',  freq: 293.66 },
        { label: 'G4',  freq: 392.00 },
        { label: 'B4',  freq: 493.88 },
        { label: 'D5',  freq: 587.33 },
        { label: 'F5',  freq: 698.46 },
        { label: 'A5',  freq: 880.00 },
        { label: 'B5',  freq: 987.77 },
        { label: 'D6',  freq: 1174.66 },
        { label: 'F6',  freq: 1396.91 },
        { label: 'A6',  freq: 1760.00 },
      ],
    ],
  },
  {
    id: 'country',
    name: 'COUNTRY (C)',
    rows: [
      // Blow — same as Richter
      [
        { label: 'C4',  freq: 261.63 },
        { label: 'E4',  freq: 329.63 },
        { label: 'G4',  freq: 392.00 },
        { label: 'C5',  freq: 523.25 },
        { label: 'E5',  freq: 659.25 },
        { label: 'G5',  freq: 783.99 },
        { label: 'C6',  freq: 1046.50 },
        { label: 'E6',  freq: 1318.51 },
        { label: 'G6',  freq: 1567.98 },
        { label: 'C7',  freq: 2093.00 },
      ],
      // Draw — hole 5 raised F5 → F#5 for country/bluegrass runs
      [
        { label: 'D4',  freq: 293.66 },
        { label: 'G4',  freq: 392.00 },
        { label: 'B4',  freq: 493.88 },
        { label: 'D5',  freq: 587.33 },
        { label: 'F#5', freq: 739.99 },
        { label: 'A5',  freq: 880.00 },
        { label: 'B5',  freq: 987.77 },
        { label: 'D6',  freq: 1174.66 },
        { label: 'F#6', freq: 1479.98 },
        { label: 'A6',  freq: 1760.00 },
      ],
    ],
  },
  {
    id: 'natural-minor',
    name: 'NATURAL MINOR (Dm)',
    rows: [
      // Blow — D natural minor arpeggio
      [
        { label: 'D4',  freq: 293.66 },
        { label: 'F4',  freq: 349.23 },
        { label: 'A4',  freq: 440.00 },
        { label: 'D5',  freq: 587.33 },
        { label: 'F5',  freq: 698.46 },
        { label: 'A5',  freq: 880.00 },
        { label: 'D6',  freq: 1174.66 },
        { label: 'F6',  freq: 1396.91 },
        { label: 'A6',  freq: 1760.00 },
        { label: 'D7',  freq: 2349.32 },
      ],
      // Draw — scale fill
      [
        { label: 'E4',  freq: 329.63 },
        { label: 'G4',  freq: 392.00 },
        { label: 'B♭4', freq: 466.16 },
        { label: 'C5',  freq: 523.25 },
        { label: 'E5',  freq: 659.25 },
        { label: 'G5',  freq: 783.99 },
        { label: 'C6',  freq: 1046.50 },
        { label: 'E6',  freq: 1318.51 },
        { label: 'G6',  freq: 1567.98 },
        { label: 'C7',  freq: 2093.00 },
      ],
    ],
  },
];
