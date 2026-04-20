import { useRef, useCallback } from 'react';
import { AudioContext } from 'react-native-audio-api';

const GUITAR_MASTER_GAIN = 0.14;
const ATTACK_TIME        = 0.008;  // 8 ms
const RELEASE_TIME       = 0.18;   // 180 ms — guitar sustain
const STRUM_STAGGER_S    = 0.012;  // 12 ms per note

interface GuitarNote {
  osc:  any;
  gain: any;
}

interface GuitarVoice {
  notes: GuitarNote[];
}

export function useGuitarAudio() {
  const ctxRef    = useRef<any>(null);
  const masterRef = useRef<any>(null);
  const voicesRef = useRef<Map<number, GuitarVoice>>(new Map());

  function getContext(): any {
    if (!ctxRef.current) {
      ctxRef.current    = new AudioContext();
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.setValueAtTime(GUITAR_MASTER_GAIN, ctxRef.current.currentTime);
      masterRef.current.connect(ctxRef.current.destination);
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  const stopChord = useCallback((strumId: number) => {
    const voice = voicesRef.current.get(strumId);
    if (!voice || !ctxRef.current) return;

    const ctx = ctxRef.current;
    voice.notes.forEach(({ osc, gain }) => {
      gain.gain.setTargetAtTime(0, ctx.currentTime, RELEASE_TIME / 4);
      const capturedOsc  = osc;
      const capturedGain = gain;
      setTimeout(() => {
        try { capturedOsc.stop();        } catch (_) {}
        try { capturedOsc.disconnect();  } catch (_) {}
        try { capturedGain.disconnect(); } catch (_) {}
      }, (RELEASE_TIME + 0.05) * 1000);
    });

    voicesRef.current.delete(strumId);
  }, []);

  const strumChord = useCallback((strumId: number, frequencies: number[]) => {
    stopChord(strumId);
    const ctx = getContext();

    const notes: GuitarNote[] = frequencies.map((freq, i) => {
      const t    = ctx.currentTime + i * STRUM_STAGGER_S;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + ATTACK_TIME);

      osc.connect(gain);
      gain.connect(masterRef.current);
      osc.start(t);

      return { osc, gain };
    });

    voicesRef.current.set(strumId, { notes });
  }, [stopChord]);

  const stopAll = useCallback(() => {
    for (const id of Array.from(voicesRef.current.keys())) {
      stopChord(id);
    }
  }, [stopChord]);

  return { strumChord, stopChord, stopAll };
}
