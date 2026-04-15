import { useRef, useCallback } from 'react'

// Fade time in seconds to prevent clicks on note start/stop
const ATTACK_TIME = 0.01
const RELEASE_TIME = 0.06
const MASTER_GAIN = 0.18

// Max pitch bend in semitones (±2 semitones over ±120px lateral movement)
const MAX_BEND_SEMITONES = 2
const BEND_PX_RANGE = 120

function semitoneRatio(semitones) {
  return Math.pow(2, semitones / 12)
}

export function useAudioEngine() {
  const ctxRef = useRef(null)
  const masterRef = useRef(null)
  // Map of touchId -> { oscillator, gain, baseFreq, bendOffset }
  const voicesRef = useRef(new Map())

  function getContext() {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      masterRef.current = ctxRef.current.createGain()
      masterRef.current.gain.setValueAtTime(MASTER_GAIN, ctxRef.current.currentTime)
      masterRef.current.connect(ctxRef.current.destination)
    }
    // Resume if suspended (required after user gesture on some browsers)
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
    return ctxRef.current
  }

  const startNote = useCallback((touchId, frequency) => {
    const ctx = getContext()
    if (voicesRef.current.has(touchId)) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'square'
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)

    // Attack envelope
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + ATTACK_TIME)

    osc.connect(gain)
    gain.connect(masterRef.current)
    osc.start()

    voicesRef.current.set(touchId, { osc, gain, baseFreq: frequency, bendOffset: 0 })
  }, [])

  const bendNote = useCallback((touchId, deltaX) => {
    const voice = voicesRef.current.get(touchId)
    if (!voice) return
    const ctx = ctxRef.current
    if (!ctx) return

    // Map deltaX to semitone bend
    const semitones = (deltaX / BEND_PX_RANGE) * MAX_BEND_SEMITONES
    const clampedSemitones = Math.max(-MAX_BEND_SEMITONES, Math.min(MAX_BEND_SEMITONES, semitones))
    const newFreq = voice.baseFreq * semitoneRatio(clampedSemitones)

    voice.osc.frequency.setTargetAtTime(newFreq, ctx.currentTime, 0.015)
    voice.bendOffset = clampedSemitones
  }, [])

  const stopNote = useCallback((touchId) => {
    const voice = voicesRef.current.get(touchId)
    if (!voice) return
    const ctx = ctxRef.current

    const { osc, gain } = voice
    const t = ctx.currentTime

    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.linearRampToValueAtTime(0, t + RELEASE_TIME)

    setTimeout(() => {
      try { osc.stop() } catch (_) {}
      osc.disconnect()
      gain.disconnect()
    }, (RELEASE_TIME + 0.05) * 1000)

    voicesRef.current.delete(touchId)
  }, [])

  const stopAll = useCallback(() => {
    voicesRef.current.forEach((_, id) => stopNote(id))
  }, [stopNote])

  return { startNote, bendNote, stopNote, stopAll }
}
