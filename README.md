# SOUNDGRAPH

A browser-based digital harmonica built with React and the Web Audio API. Designed for touch screens but fully playable with a mouse. No native compilation, no app store — open it in a browser and play.

---

## What it does

Soundgraph presents a 2×10 grid of playable squares modelled on a 10-hole diatonic harmonica. The top row is blow notes, the bottom row is draw notes. Touch or click any square to hear it. Touch multiple squares at once for polyphonic chords. Slide your finger horizontally across the grid to glide between notes; slide vertically to bend pitch up or down, the same way you'd bend a string on a guitar.

The aesthetic is intentionally sparse — black background, lime green neon glow on active keys, monospace type throughout — somewhere between a hardware sequencer and a terminal from 1994.

### Tunings

Two tunings are available, switchable at runtime with no interruption to playing:

| Tuning | Description |
|---|---|
| **Richter Tuning** | Standard C diatonic layout. The default tuning for blues, folk, and rock harmonica worldwide. Hole 3 blow is G4. |
| **Paddy Richter** | Identical to Richter except hole 3 blow is raised a whole step (G4 → A4). That single change makes the natural minor run on the lower octave accessible without bending, which is why it's the preferred tuning for Irish and Scottish traditional music. |

---

## What is technically interesting

### No audio libraries

Sound is generated entirely with the browser-native [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API). Each active touch creates its own `OscillatorNode` (square wave) routed through a `GainNode` for envelope control, all feeding into a shared master gain node. There are no audio files, no samples, no third-party audio packages.

### True polyphony via touch identifier tracking

The browser assigns each simultaneous touch a stable numeric `identifier`. The audio engine maintains a `Map` keyed by that identifier, so each finger owns an independent oscillator. Lifting one finger releases only its voice; the others keep playing. This is what makes chords and glides work correctly — there is no "one note at a time" limitation.

### Pitch bend via `setTargetAtTime`

Vertical finger movement is mapped to a ±2 semitone frequency deviation using `oscillator.frequency.setTargetAtTime()`. This ramps smoothly rather than jumping, which produces the continuous wobble of a string bend rather than a stepped pitch shift. The reference Y position resets each time a finger enters a new square, so bending always starts from the centre pitch of the current note.

### Glide via `elementFromPoint`

Horizontal gliding works by calling `document.elementFromPoint(x, y)` on every `touchmove` event and reading the `data-row` / `data-col` attributes of whichever element is under the finger. When those values differ from the currently tracked square, the old voice is released with its fade-out envelope and a new one is attacked — seamlessly, mid-gesture.

### Touch event propagation isolation

The grid wrapper intercepts all touch events and calls `e.preventDefault()` to suppress browser scroll and zoom behaviour. UI controls (tuning selector) sit inside the same wrapper, so they need to stop their own touch events from bubbling before the grid handler can swallow them — otherwise taps on buttons never synthesise a click. Each button handles `onTouchEnd` directly and calls `e.stopPropagation()` to break out of the grid's event boundary.

---

## Getting started

Requires [Node.js](https://nodejs.org/) v16 or later and npm.

```bash
git clone https://github.com/your-username/Soundgraph_V2.git
cd Soundgraph_V2
npm install
npm run dev
```

Vite will print two URLs:

```
Local:   http://localhost:5173/
Network: http://192.168.x.x:5173/
```

Open the **Local** URL in a desktop browser to test with a mouse. Open the **Network** URL on any phone or tablet on the same Wi-Fi network to test with touch. No build step, no deployment, no app installation required.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Compile a production build to `dist/` |
| `npm run preview` | Serve the production build locally for final testing |

---

## Playing

| Gesture | Effect |
|---|---|
| Tap / click a square | Play that note |
| Hold multiple squares | Polyphonic chord |
| Hold + slide left or right | Glide to adjacent notes |
| Hold + slide up | Bend pitch up (max ±2 semitones) |
| Hold + slide down | Bend pitch down |

The tuning buttons at the bottom of the screen switch between Richter and Paddy Richter. Any notes currently ringing stop cleanly when you switch.

---

## Note layout (C Diatonic)

```
Hole:    1    2    3    4    5    6    7    8    9   10
Blow:   C4   E4   G4   C5   E5   G5   C6   E6   G6   C7
Draw:   D4   G4   B4   D5   F5   A5   B5   D6   F6   A6
```

Paddy Richter replaces hole 3 blow with **A4**.

---

## Stack

- [React 18](https://react.dev/) — UI and state
- [Vite 4](https://vitejs.dev/) — dev server and bundler
- Web Audio API — all sound synthesis, built into the browser
