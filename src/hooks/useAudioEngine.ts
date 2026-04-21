import { useRef, useCallback } from 'react';
import { AudioContext } from 'react-native-audio-api';

const ATTACK_TIME        = 0.008;  // 8 ms
const RELEASE_TIME       = 0.06;   // 60 ms
const MASTER_GAIN        = 0.18;

const MAX_BEND_SEMITONES = 2;
const BEND_PX_RANGE      = 120;

function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

interface PooledOsc {
  osc:      any;
  gain:     any;
  inUse:    boolean;
  baseFreq: number;
}

export function useAudioEngine() {
  const ctxRef    = useRef<any>(null);
  const masterRef = useRef<any>(null);
  const poolRef   = useRef<PooledOsc[]>([]);   // grows lazily, oscillators stay running
  const voicesRef = useRef<Map<number, number>>(new Map()); // touchId → pool index

  function getContext(): any {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      ctxRef.current    = ctx;
      masterRef.current = ctx.createGain();
      masterRef.current.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
      masterRef.current.connect(ctx.destination);
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  // Return a free pool index, growing the pool if needed
  function acquireOsc(ctx: any): number {
    const pool = poolRef.current;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].inUse) {
        pool[i].inUse = true;
        return i;
      }
    }
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    osc.connect(gain);
    gain.connect(masterRef.current);
    osc.start();
    pool.push({ osc, gain, inUse: true, baseFreq: 440 });
    return pool.length - 1;
  }

  function releaseOsc(idx: number) {
    if (poolRef.current[idx]) poolRef.current[idx].inUse = false;
  }

  const startNote = useCallback((touchId: number, frequency: number) => {
    const ctx = getContext();
    if (voicesRef.current.has(touchId)) return;

    const idx = acquireOsc(ctx);
    const p   = poolRef.current[idx];
    p.baseFreq = frequency;
    p.osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    p.gain.gain.setValueAtTime(0, ctx.currentTime);
    p.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + ATTACK_TIME);

    voicesRef.current.set(touchId, idx);
  }, []);

  const bendNote = useCallback((touchId: number, deltaPixels: number) => {
    const idx = voicesRef.current.get(touchId);
    if (idx === undefined || !ctxRef.current) return;
    const p = poolRef.current[idx];
    if (!p) return;

    const semitones = Math.max(
      -MAX_BEND_SEMITONES,
      Math.min(MAX_BEND_SEMITONES, (deltaPixels / BEND_PX_RANGE) * MAX_BEND_SEMITONES)
    );
    p.osc.frequency.setTargetAtTime(
      p.baseFreq * semitoneRatio(semitones),
      ctxRef.current.currentTime,
      0.015
    );
  }, []);

  const stopNote = useCallback((touchId: number) => {
    const idx = voicesRef.current.get(touchId);
    if (idx === undefined || !ctxRef.current) return;
    const p   = poolRef.current[idx];
    if (!p) return;
    const ctx = ctxRef.current;

    p.gain.gain.setTargetAtTime(0, ctx.currentTime, RELEASE_TIME / 4);

    const capturedIdx = idx;
    setTimeout(() => releaseOsc(capturedIdx), (RELEASE_TIME + 0.05) * 1000);

    voicesRef.current.delete(touchId);
  }, []);

  const stopAll = useCallback(() => {
    for (const id of Array.from(voicesRef.current.keys())) {
      stopNote(id);
    }
  }, [stopNote]);

  return { startNote, bendNote, stopNote, stopAll };
}
