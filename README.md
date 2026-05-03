# SOUNDGRAPH

A native mobile instrument suite built with React Native and Expo. Designed for landscape touch screens — polyphonic and expressive. No browser required. Currently ships two instruments: a 10-hole diatonic harmonica and a six-string chord guitar.

---

## What it does

The aesthetic is intentionally sparse — black background, lime green neon glow on active elements, monospace type throughout — somewhere between a hardware sequencer and a terminal from 1994.

### Harmonica

Soundgraph presents a 2×10 grid of playable keys modelled on a 10-hole diatonic harmonica. The top row is blow notes, the bottom row is draw notes. Touch any key to hear it. Touch multiple keys at once for polyphonic chords. Slide your finger horizontally to glide between notes; slide vertically to bend pitch up or down, the same way you'd bend a string on a guitar.

Four tunings are available, switchable mid-play via a swipe-down panel. Any ringing notes stop cleanly when you switch.

| Tuning | Description |
|---|---|
| **Richter (C)** | Standard C diatonic layout. The default tuning for blues, folk, and rock harmonica worldwide. |
| **Paddy Richter** | Richter except hole 3 blow is raised G4 → A4. That single change makes the natural minor run accessible without bending — the preferred tuning for Irish and Scottish traditional music. |
| **Country (C)** | Richter with hole 5 draw raised F5 → F#5 (and hole 9 draw F6 → F#6). Opens up the raised 4th runs that define country and bluegrass phrasing. |
| **Natural Minor (Dm)** | Retuned to D natural minor throughout. Blow row plays the Dm arpeggio; draw row fills the scale. |

### Guitar

The guitar mode presents six horizontal strings across a full-screen strum area, overlaid by nine chord buttons arranged in a 3×3 grid. Hold a chord button with one finger and strum the string area with another to play the chord. Release the chord button to return to open strings (standard EADGBE tuning).

Each string is independently touchable: a single tap plucks that string and triggers a visible vibration animation. Moving a finger across the string area activates each new string it crosses — a continuous strum. Sounds fade naturally over about one second rather than cutting off, approximating the decay of a real string.

Chord slots are customisable in edit mode: long-press any chord button to open a chord picker sheet. Roots are arranged in circle-of-fifths order (C G D A E B F# C# G# D# A# F) so musically related keys sit next to each other. Hover a root for 0.6 seconds to confirm it, then hover a variant (major, minor, maj7, m7, 7, sus2, sus4, add9) to set the chord.

---

## What is technically interesting

### Web Audio API running natively

Sound is generated with [`react-native-audio-api`](https://github.com/software-mansion/react-native-audio-api), which implements the Web Audio API spec as a native module — same `AudioContext`, `OscillatorNode`, and `GainNode` primitives as in a browser, but compiled to native audio threads on Android and iOS. Each active touch creates its own `OscillatorNode` (square wave) routed through a `GainNode` for envelope control, all feeding into a shared master gain. There are no audio files and no samples.

### True polyphony via touch identifier tracking

React Native assigns each simultaneous touch a stable numeric `identifier` via `nativeEvent`. The audio engine maintains a `Map<number, Voice>` keyed by that identifier, so each finger owns an independent oscillator. Lifting one finger releases only its voice; the others keep playing. This is what makes chords and glides work correctly.

### Pitch bend via `setTargetAtTime`

Vertical finger movement is mapped to ±2 semitones using `oscillator.frequency.setTargetAtTime()` with a 15 ms time constant. This ramps smoothly rather than jumping, which produces the continuous wobble of a real bend rather than a stepped pitch shift. The reference Y position resets each time a finger enters a new key, so bending always starts from the center pitch of the current note.

### Glide via layout-relative coordinate math

Horizontal gliding works by recording the pixel dimensions of the key area `View` via `onLayout`, then mapping each `touchmove` coordinate to a grid cell using integer division. When a finger crosses into a different cell, the old voice is released with its fade-out envelope and a new one is attacked — seamlessly, mid-gesture. No DOM, no `elementFromPoint` — just geometry.

### Guitar mode: oscillator pool for zero-latency chords

Calling `createOscillator()` and `osc.start()` has a measurable startup cost. Playing a six-note chord by creating six oscillators at strum time introduces an audible delay — worse the faster you play. Guitar mode solves this with a pre-warmed oscillator pool: on mount, 12 oscillators are created, started, and held silently at zero gain. When a chord or string is triggered, the engine acquires oscillators from the pool, sets their frequency, and ramps gain up. On release it ramps back to zero and returns them to the pool. No oscillators are created at playback time — only `frequency.setValueAtTime` and `gain.linearRampToValueAtTime`, which are near-instantaneous scheduled parameter updates. The pool grows lazily if more simultaneous voices are needed.

### Guitar mode: per-string voice management with natural decay

Each plucked string uses `gain.setTargetAtTime(0, t, 0.25)` — an exponential curve with a 0.25 s time constant, giving about one second of natural-sounding decay. The caller never stops the voice explicitly; the oscillator is returned to the pool automatically after the decay window elapses. Swipe strum creates a new independent voice per `(touchId × 10 + stringIndex)`, so earlier strings keep ringing while newer ones attack — simulating the overlap of a real strum.

### Guitar mode: dwell-based chord selection

Rather than confirm on finger-lift, the chord picker uses dwell timing: hovering a button for 600 ms fires the selection. This allows continuous-drag chord selection — long-press to open the sheet, drag directly onto a root, wait 0.6 s, drag onto a variant, wait 0.6 s — without lifting the finger. The root grid follows circle-of-fifths ordering rather than alphabetical so that common chord progressions (I–IV–V, I–vi–IV–V, etc.) are physically adjacent.

### Guitar mode: multi-touch classification

All touches — chord holds, string plucks, and strum sweeps — flow through a single `onTouchStart`/`onTouchMove`/`onTouchEnd` handler that iterates `e.nativeEvent.changedTouches`. Each touch is classified at contact time: if it lands inside a chord button circle it is tagged `'chord'`; anything else is tagged `'strum'`. A `Map<touchId, role>` persists that classification through the touch's lifetime, so a finger that starts on a chord button never accidentally triggers a strum and vice versa, regardless of how far it drifts.

### Swipe-down tuning menu

The tuning panel lives above the screen and slides into view when the user swipes down from a thin handle strip at the top. A `PanResponder` tracks the gesture and drives an `Animated.Value` directly, so the panel follows the finger in real time before snapping open or closed via a spring animation. The grid receives a `disabled` prop during this gesture to prevent accidental note triggers.

### Orientation lock

The app locks itself to landscape on mount via `expo-screen-orientation`. The key grid is designed exclusively for landscape — locking orientation prevents the layout from collapsing on rotation and keeps the instrument playable at any screen size.

---

## Known issues and upcoming work

- **String fuzziness during strumming** — rapid swipe strums can trigger multiple overlapping voices on the same string faster than the previous one has fully decayed, causing a slightly muddy sound. A per-string voice-stealing mechanism is planned to cut the prior voice cleanly before attacking the new one.
- **String orientation** — strings are currently ordered low-to-high top-to-bottom on screen. A future update will mirror how a guitar sits in your hand: low strings at the top when held in portrait-landscape, high strings at the bottom, matching muscle memory from a physical instrument.
- **Chord voicing quality** — the current voicings are built from interval patterns spread over two octaves. Work is ongoing to improve the voicing of individual chord types (particularly extended chords) so each sounds more natural in a musical context.
- **Additional instruments** — the architecture supports adding new instrument modes. Future candidates include a bass, a piano roll, and a simple drum pad.

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Android Studio](https://developer.android.com/studio) with the Android SDK installed (for Android builds)
- [JDK 17](https://adoptium.net/) — required by React Native 0.76
- A physical Android device or emulator (USB debugging enabled)

### Install

```bash
git clone https://github.com/your-username/Soundgraph_V2.git
cd Soundgraph_V2
npm install
```

### Run on Android

Plug in your device (or start an emulator), then:

```bash
npx expo run:android
```

Expo will compile the native Android project, install the APK, and launch the Metro bundler. The app will open automatically on your device in landscape mode.

> **First run only:** Expo generates the `android/` native project on first build. Subsequent builds are faster thanks to Gradle's build cache.

### Run on iOS

```bash
npx expo run:ios
```

Requires a Mac with Xcode installed.

---

## Playing

### Harmonica

| Gesture | Effect |
|---|---|
| Tap a key | Play that note |
| Hold multiple keys | Polyphonic chord |
| Hold + slide left or right | Glide to adjacent notes |
| Hold + slide up | Bend pitch up (±2 semitones max) |
| Hold + slide down | Bend pitch down |
| Swipe down from top strip | Open tuning menu |
| Tap outside menu / swipe up | Close tuning menu |

### Guitar

| Gesture | Effect |
|---|---|
| Hold a chord button | Arm that chord |
| Tap a string | Pluck that string (fades naturally) |
| Swipe across strings | Strum — each crossed string sounds |
| Hold chord + swipe strings | Strum the armed chord |
| No chord held + touch strings | Open strings (EADGBE) |
| Long-press a chord button (edit mode) | Open chord picker |
| Drag to a root + hold 0.6 s | Select root note |
| Drag to a variant + hold 0.6 s | Confirm chord, close picker |

---

## Note layout

**Richter / Country (C Diatonic)**
```
Hole:    1    2    3    4    5    6    7    8    9   10
Blow:   C4   E4   G4   C5   E5   G5   C6   E6   G6   C7
Draw:   D4   G4   B4   D5   F5   A5   B5   D6   F6   A6
```

**Paddy Richter** — hole 3 blow only: G4 → **A4**

**Country** — holes 5 and 9 draw: F5 → **F#5**, F6 → **F#6**

**Natural Minor (Dm)**
```
Hole:    1    2    3    4    5    6    7    8    9   10
Blow:   D4   F4   A4   D5   F5   A5   D6   F6   A6   D7
Draw:   E4   G4   B♭4  C5   E5   G5   C6   E6   G6   C7
```

---

## Stack

- [Expo 52](https://expo.dev/) — native build toolchain and device APIs
- [React Native 0.76](https://reactnative.dev/) — UI and touch event system
- [react-native-audio-api](https://github.com/software-mansion/react-native-audio-api) — Web Audio API spec running natively
- [expo-screen-orientation](https://docs.expo.dev/versions/latest/sdk/screen-orientation/) — landscape lock
- [react-native-safe-area-context](https://github.com/th3rdwave/react-native-safe-area-context) — notch/cutout avoidance
