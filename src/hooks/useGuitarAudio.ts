import { useRef, useCallback } from 'react';
import { AudioContext } from 'react-native-audio-api';

const GUITAR_MASTER_GAIN = 0.14;
const ATTACK_TIME        = 0.008;  // 8 ms
const RELEASE_TIME       = 0.18;   // 180 ms
const STRUM_STAGGER_S    = 0.003;  // 3 ms (reduced — no longer masking startup latency)
const POOL_SIZE          = 18;     // 6 strings × 3 simultaneous strums

interface PooledOsc {
  osc:   any;
  gain:  any;
  inUse: boolean;
}

// Maps strumId → array of pool indices currently in use for that strum
type VoiceMap = Map<number, number[]>;

export function useGuitarAudio() {
  const ctxRef    = useRef<any>(null);
  const masterRef = useRef<any>(null);
  const poolRef   = useRef<PooledOsc[]>([]);
  const voicesRef = useRef<VoiceMap>(new Map());

  function getContext(): any {
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      ctxRef.current    = ctx;
      masterRef.current = ctx.createGain();
      masterRef.current.gain.setValueAtTime(GUITAR_MASTER_GAIN, ctx.currentTime);
      masterRef.current.connect(ctx.destination);

      // Pre-create always-on oscillators at zero gain — eliminates startup latency
      poolRef.current = Array.from({ length: POOL_SIZE }, () => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.type = 'triangle';
        osc.connect(gain);
        gain.connect(masterRef.current);
        osc.start();
        return { osc, gain, inUse: false };
      });
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  function acquireOsc(): number {
    const pool = poolRef.current;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].inUse) {
        pool[i].inUse = true;
        return i;
      }
    }
    // Pool exhausted — return least-recently-acquired (index 0 as fallback)
    return 0;
  }

  function releaseOsc(idx: number) {
    const pool = poolRef.current;
    if (!pool[idx]) return;
    pool[idx].inUse = false;
  }

  const stopChord = useCallback((strumId: number) => {
    const indices = voicesRef.current.get(strumId);
    if (!indices || !ctxRef.current) return;
    const ctx = ctxRef.current;

    indices.forEach(idx => {
      const p = poolRef.current[idx];
      if (!p) return;
      p.gain.gain.cancelScheduledValues(ctx.currentTime);
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
      const idx = acquireOsc();
      const p   = poolRef.current[idx];
      const st  = t + i * STRUM_STAGGER_S;

      p.osc.frequency.setValueAtTime(freq, st);
      p.gain.gain.cancelScheduledValues(t);
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
