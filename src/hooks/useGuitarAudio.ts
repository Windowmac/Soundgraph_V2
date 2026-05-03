import { useRef, useCallback } from 'react';
import { AudioContext } from 'react-native-audio-api';

const GUITAR_MASTER_GAIN = 0.175;  // +25% from 0.14
const ATTACK_TIME        = 0.008;  // 8 ms chord attack
const PLUCK_ATTACK       = 0.003;  // 3 ms pluck attack — crisp
const RELEASE_TIME       = 0.18;   // 180 ms chord release
const PLUCK_FADE_TC      = 0.25;   // time constant for plucked string fade (~1s natural decay)
const STRUM_STAGGER_S    = 0.003;  // 3 ms stagger between chord notes

interface PooledOsc {
  osc:   any;
  gain:  any;
  inUse: boolean;
}

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
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

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
    // Small lookahead avoids scheduling events in the past when JS is briefly busy
    const t   = ctx.currentTime + 0.002;

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

  // Single string pluck — fast attack then slow natural fade; no explicit stop needed.
  // The caller should NOT call stopChord on touch-end for these voices.
  const pluckString = useCallback((pluckId: number, frequency: number) => {
    // Clear any previous voice on this ID first
    const prev = voicesRef.current.get(pluckId);
    if (prev && ctxRef.current) {
      const ctx = ctxRef.current;
      prev.forEach(idx => {
        const p = poolRef.current[idx];
        if (p) p.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        const ci = idx;
        setTimeout(() => releaseOsc(ci), 100);
      });
      voicesRef.current.delete(pluckId);
    }

    const ctx = getContext();
    const t   = ctx.currentTime + 0.002;
    const idx = acquireOsc(ctx);
    const p   = poolRef.current[idx];

    p.osc.frequency.setValueAtTime(frequency, t);
    p.gain.gain.setValueAtTime(0, t);
    p.gain.gain.linearRampToValueAtTime(0.7, t + PLUCK_ATTACK);
    // Begin slow natural fade immediately after attack
    p.gain.gain.setTargetAtTime(0, t + PLUCK_ATTACK + 0.04, PLUCK_FADE_TC);

    voicesRef.current.set(pluckId, [idx]);

    // Return oscillator to pool after the note fully decays
    const capturedIdx = idx;
    const capturedId  = pluckId;
    const decayMs = Math.round((PLUCK_ATTACK + 0.04 + PLUCK_FADE_TC * 5) * 1000) + 200;
    setTimeout(() => {
      const current = voicesRef.current.get(capturedId);
      if (current && current[0] === capturedIdx) {
        voicesRef.current.delete(capturedId);
        releaseOsc(capturedIdx);
      }
    }, decayMs);
  }, []);

  const stopAll = useCallback(() => {
    for (const id of Array.from(voicesRef.current.keys())) {
      stopChord(id);
    }
  }, [stopChord]);

  // Pre-create oscillators so the first chord has zero creation latency.
  const prewarm = useCallback((count: number) => {
    const ctx = getContext();
    const pool = poolRef.current;
    while (pool.length < count) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      gain.gain.setValueAtTime(0, ctx.currentTime);
      osc.connect(gain);
      gain.connect(masterRef.current);
      osc.start();
      pool.push({ osc, gain, inUse: false });
    }
  }, []);

  return { strumChord, stopChord, pluckString, stopAll, prewarm };
}
