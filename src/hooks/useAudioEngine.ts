import { useRef, useCallback } from 'react';
import { AudioContext } from 'react-native-audio-api';

// ─── Constants ────────────────────────────────────────────────────────────────
// Envelope times in seconds — short attack prevents clicks; release fades out
const ATTACK_TIME      = 0.01;   // 10 ms fade-in
const RELEASE_TIME     = 0.06;   // 60 ms fade-out
const MASTER_GAIN      = 0.18;

// Pitch bend: ±2 semitones mapped over ±120 px of vertical finger travel
const MAX_BEND_SEMITONES = 2;
const BEND_PX_RANGE      = 120;

function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

interface Voice {
  osc: any;
  gain: any;
  baseFreq: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAudioEngine() {
  const ctxRef    = useRef<any>(null);
  const masterRef = useRef<any>(null);
  // Map<touchIdentifier (number), Voice>
  const voicesRef = useRef<Map<number, Voice>>(new Map());

  // Lazy-init AudioContext on first sound (required on mobile)
  function getContext(): any {
    if (!ctxRef.current) {
      ctxRef.current  = new AudioContext();
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.setValueAtTime(MASTER_GAIN, ctxRef.current.currentTime);
      masterRef.current.connect(ctxRef.current.destination);
    }
    // Resume if the context was suspended (happens on some devices)
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  // ── Start a new note for a given touch ──────────────────────────────────────
  const startNote = useCallback((touchId: number, frequency: number) => {
    const ctx = getContext();
    // Guard: don't double-start the same touch
    if (voicesRef.current.has(touchId)) return;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Attack envelope — ramp from silence to full over ATTACK_TIME
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + ATTACK_TIME);

    osc.connect(gain);
    gain.connect(masterRef.current);
    osc.start();

    voicesRef.current.set(touchId, { osc, gain, baseFreq: frequency });
  }, []);

  // ── Bend the pitch of a held note ───────────────────────────────────────────
  // deltaPixels: positive = finger moved up = pitch up
  const bendNote = useCallback((touchId: number, deltaPixels: number) => {
    const voice = voicesRef.current.get(touchId);
    if (!voice || !ctxRef.current) return;

    const semitones = Math.max(
      -MAX_BEND_SEMITONES,
      Math.min(MAX_BEND_SEMITONES, (deltaPixels / BEND_PX_RANGE) * MAX_BEND_SEMITONES)
    );
    const newFreq = voice.baseFreq * semitoneRatio(semitones);

    // setTargetAtTime with 15 ms time constant → smooth, natural string-bend feel
    voice.osc.frequency.setTargetAtTime(newFreq, ctxRef.current.currentTime, 0.015);
  }, []);

  // ── Release a note and schedule its cleanup ──────────────────────────────────
  const stopNote = useCallback((touchId: number) => {
    const voice = voicesRef.current.get(touchId);
    if (!voice || !ctxRef.current) return;

    const ctx = ctxRef.current;
    const { osc, gain } = voice;

    // Exponential decay to silence — avoids clicks on release
    gain.gain.setTargetAtTime(0, ctx.currentTime, RELEASE_TIME / 4);

    // Disconnect nodes after the envelope has faded
    const capturedOsc  = osc;
    const capturedGain = gain;
    setTimeout(() => {
      try { capturedOsc.stop();         } catch (_) {}
      try { capturedOsc.disconnect();   } catch (_) {}
      try { capturedGain.disconnect();  } catch (_) {}
    }, (RELEASE_TIME + 0.05) * 1000);

    voicesRef.current.delete(touchId);
  }, []);

  // ── Stop every active voice (tuning change, app background, etc.) ───────────
  const stopAll = useCallback(() => {
    for (const id of Array.from(voicesRef.current.keys())) {
      stopNote(id);
    }
  }, [stopNote]);

  return { startNote, bendNote, stopNote, stopAll };
}
