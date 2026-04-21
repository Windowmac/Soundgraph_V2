import { useRef, useCallback } from 'react';
import { AudioContext } from 'react-native-audio-api';

const GUITAR_MASTER_GAIN = 0.14;
const ATTACK_TIME        = 0.008;  // 8 ms
const RELEASE_TIME       = 0.18;   // 180 ms
const STRUM_STAGGER_S    = 0.003;  // 3 ms stagger between chord notes

interface PooledOsc {
  osc:   any;
  gain:  any;
  inUse: boolean;
}

// Maps strumId → array of pool indices currently in use
type VoiceMap = Map<number, number[]>;

export function useGuitarAudio() {
  const ctxRef    = useRef<any>(null);
  const masterRef = useRef<any>(null);
  const poolRef   = useRef<PooledOsc[]>([]);   // grows lazily
  const voicesRef = useRef<VoiceMap>(new Map());

  function getContext(): any {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      ctxRef.current    = ctx;
      masterRef.current = ctx.createGain();
      masterRef.current.gain.setValueAtTime(GUITAR_MASTER_GAIN, ctx.currentTime);
      masterRef.current.connect(ctx.destination);
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  // Return a free oscillator index, creating a new one if pool is exhausted
  function acquireOsc(ctx: any): number {
    const pool = poolRef.current;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].inUse) {
        pool[i].inUse = true;
        return i;
      }
    }
    // Grow pool on demand — one oscillator per need, already started silently
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    osc.connect(gain);
    gain.connect(masterRef.current);
    osc.start();
    pool.push({ osc, gain, inUse: true });
    return pool.length - 1;
  }

  function releaseOsc(idx: number) {
    if (poolRef.current[idx]) poolRef.current[idx].inUse = false;
  }

  const stopChord = useCallback((strumId: number) => {
    const indices = voicesRef.current.get(strumId);
    if (!indices || !ctxRef.current) return;
    const ctx = ctxRef.current;

    indices.forEach(idx => {
      const p = poolRef.current[idx];
      if (!p) return;
      p.gain.gain.setTargetAtTime(0, ctx.currentTime, RELEASE_TIME / 4);
      const capturedIdx = idx;
      setTimeout(() => releaseOsc(capturedIdx), (RELEASE_TIME + 0.05) * 1000);
    });

    voicesRef.current.delete(strumId);
  }, []);

  const strumChord = useCallback((strumId: number, frequencies: number[]) => {
    stopChord(strumId);
    const ctx = getContext();
    const t   = ctx.currentTime;

    const indices = frequencies.map((freq, i) => {
      const idx = acquireOsc(ctx);
      const p   = poolRef.current[idx];
      const st  = t + i * STRUM_STAGGER_S;

      p.osc.frequency.setValueAtTime(freq, st);
      p.gain.gain.setValueAtTime(0, st);
      p.gain.gain.linearRampToValueAtTime(1, st + ATTACK_TIME);

      return idx;
    });

    voicesRef.current.set(strumId, indices);
  }, [stopChord]);

  const stopAll = useCallback(() => {
    for (const id of Array.from(voicesRef.current.keys())) {
      stopChord(id);
    }
  }, [stopChord]);

  return { strumChord, stopChord, stopAll };
}
