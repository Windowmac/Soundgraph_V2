# SOUNDGRAPH

A native mobile harmonica instrument built with React Native and Expo. Designed for landscape touch screens — polyphonic, bendable, and glide-able. No browser required.

---

## What it does

Soundgraph presents a 2×10 grid of playable keys modelled on a 10-hole diatonic harmonica. The top row is blow notes, the bottom row is draw notes. Touch any key to hear it. Touch multiple keys at once for polyphonic chords. Slide your finger horizontally to glide between notes; slide vertically to bend pitch up or down, the same way you'd bend a string on a guitar.

The aesthetic is intentionally sparse — black background, lime green neon glow on active keys, monospace type throughout — somewhere between a hardware sequencer and a terminal from 1994.

### Tunings

Four tunings are available, switchable mid-play via a swipe-down panel. Any ringing notes stop cleanly when you switch.

| Tuning | Description |
|---|---|
| **Richter (C)** | Standard C diatonic layout. The default tuning for blues, folk, and rock harmonica worldwide. |
| **Paddy Richter** | Richter except hole 3 blow is raised G4 → A4. That single change makes the natural minor run accessible without bending — the preferred tuning for Irish and Scottish traditional music. |
| **Country (C)** | Richter with hole 5 draw raised F5 → F#5 (and hole 9 draw F6 → F#6). Opens up the raised 4th runs that define country and bluegrass phrasing. |
| **Natural Minor (Dm)** | Retuned to D natural minor throughout. Blow row plays the Dm arpeggio; draw row fills the scale. |

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

### Swipe-down tuning menu

The tuning panel lives above the screen and slides into view when the user swipes down from a thin handle strip at the top. A `PanResponder` tracks the gesture and drives an `Animated.Value` directly, so the panel follows the finger in real time before snapping open or closed via a spring animation. The grid receives a `disabled` prop during this gesture to prevent accidental note triggers.

### Orientation lock

The app locks itself to landscape on mount via `expo-screen-orientation`. The key grid is designed exclusively for landscape — locking orientation prevents the layout from collapsing on rotation and keeps the instrument playable at any screen size.

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

| Gesture | Effect |
|---|---|
| Tap a key | Play that note |
| Hold multiple keys | Polyphonic chord |
| Hold + slide left or right | Glide to adjacent notes |
| Hold + slide up | Bend pitch up (±2 semitones max) |
| Hold + slide down | Bend pitch down |
| Swipe down from top strip | Open tuning menu |
| Tap outside menu / swipe up | Close tuning menu |

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
