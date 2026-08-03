'use client'

import { Howl } from 'howler'

// ── Web Audio synthesis helpers ───────────────────────────────────────────────
// These run immediately without asset files, giving immediate sonic feedback.

let _ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch { return null }
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function synthHit(weight: 'heavy' | 'medium' | 'light') {
  const ctx = getCtx(); if (!ctx) return
  const now = ctx.currentTime
  const freq = weight === 'heavy' ? 75 : weight === 'medium' ? 130 : 200
  const dur  = weight === 'heavy' ? 0.22 : weight === 'medium' ? 0.14 : 0.08

  const osc = ctx.createOscillator()
  const g   = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, now)
  osc.frequency.exponentialRampToValueAtTime(25, now + dur)
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(weight === 'heavy' ? 0.65 : weight === 'medium' ? 0.4 : 0.22, now + 0.006)
  g.gain.exponentialRampToValueAtTime(0.001, now + dur)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(now); osc.stop(now + dur + 0.05)

  const bufLen = Math.floor(ctx.sampleRate * 0.04)
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate)
  const data   = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1
  const ns  = ctx.createBufferSource()
  const ng  = ctx.createGain()
  const nf  = ctx.createBiquadFilter()
  nf.type  = 'lowpass'
  nf.frequency.value = weight === 'heavy' ? 700 : 1400
  ns.buffer = buf
  ng.gain.setValueAtTime(0, now)
  ng.gain.linearRampToValueAtTime(0.28, now + 0.003)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.055)
  ns.connect(nf); nf.connect(ng); ng.connect(ctx.destination)
  ns.start(now)
}

function synthRing(freq: number, duration: number) {
  const ctx = getCtx(); if (!ctx) return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const g   = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.3, now + 0.004)
  g.gain.exponentialRampToValueAtTime(0.001, now + duration)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(now); osc.stop(now + duration + 0.05)
}

function synthWhoosh(freq: number) {
  const ctx = getCtx(); if (!ctx) return
  const now   = ctx.currentTime
  const bufLen = Math.floor(ctx.sampleRate * 0.08)
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate)
  const data   = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1
  const ns  = ctx.createBufferSource()
  const nf  = ctx.createBiquadFilter()
  const ng  = ctx.createGain()
  nf.type  = 'bandpass'
  nf.frequency.setValueAtTime(freq, now)
  nf.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.08)
  nf.Q.value = 1.2
  ns.buffer  = buf
  ng.gain.setValueAtTime(0, now)
  ng.gain.linearRampToValueAtTime(0.22, now + 0.01)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
  ns.connect(nf); nf.connect(ng); ng.connect(ctx.destination)
  ns.start(now)
}

function synthButtonTap() {
  const ctx = getCtx(); if (!ctx) return
  const now    = ctx.currentTime
  const bufLen = Math.floor(ctx.sampleRate * 0.012)
  const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate)
  const data   = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1
  const ns  = ctx.createBufferSource()
  const nf  = ctx.createBiquadFilter()
  const ng  = ctx.createGain()
  nf.type  = 'highpass'
  nf.frequency.value = 5000
  ns.buffer = buf
  ng.gain.setValueAtTime(0.12, now)
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.012)
  ns.connect(nf); nf.connect(ng); ng.connect(ctx.destination)
  ns.start(now)
}

function synthButtonConfirm() {
  const ctx = getCtx(); if (!ctx) return
  const now = ctx.currentTime
  ;[0, 0.08].forEach((delay, i) => {
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = i === 0 ? 660 : 880
    g.gain.setValueAtTime(0, now + delay)
    g.gain.linearRampToValueAtTime(0.14, now + delay + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12)
    osc.connect(g); g.connect(ctx.destination)
    osc.start(now + delay); osc.stop(now + delay + 0.15)
  })
}

function synthVictory() {
  const ctx = getCtx(); if (!ctx) return
  const now   = ctx.currentTime
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = now + i * 0.09
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.2, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    osc.connect(g); g.connect(ctx.destination)
    osc.start(t); osc.stop(t + 0.4)
  })
}

function synthDefeat() {
  const ctx = getCtx(); if (!ctx) return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const g   = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(330, now)
  osc.frequency.exponentialRampToValueAtTime(165, now + 0.8)
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.22, now + 0.04)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.85)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(now); osc.stop(now + 0.9)
}

// ── Sound file paths (drop .ogg files in /public/sounds/ to activate) ─────────

const SOUND_PATHS = {
  hitBerserker:     '/sounds/hit-berserker.ogg',
  hitSentinel:      '/sounds/hit-sentinel.ogg',
  hitPhantom:       '/sounds/hit-phantom.ogg',
  specialBerserker: '/sounds/special-berserker.ogg',
  specialSentinel:  '/sounds/special-sentinel.ogg',
  specialPhantom:   '/sounds/special-phantom.ogg',
  victory:          '/sounds/victory.ogg',
  defeat:           '/sounds/defeat.ogg',
  arena:            '/sounds/arena-ambient.ogg',
  buttonTap:        '/sounds/button-tap.ogg',
  buttonConfirm:    '/sounds/button-confirm.ogg',
} as const

type SoundKey = keyof typeof SOUND_PATHS

// ── AudioManager ──────────────────────────────────────────────────────────────

class AudioManager {
  private sounds = new Map<SoundKey, Howl>()
  private loaded = new Set<SoundKey>()
  muted = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.init()
    }
  }

  private init() {
    ;(Object.keys(SOUND_PATHS) as SoundKey[]).forEach(key => {
      const howl = new Howl({
        src: [SOUND_PATHS[key]],
        volume: key === 'arena' ? 0.08 : 0.45,
        loop:   key === 'arena',
        html5:  key === 'arena',
        onload: () => this.loaded.add(key),
        onloaderror: () => { /* silent — fall back to synthesis */ },
      })
      this.sounds.set(key, howl)
    })
  }

  private play(key: SoundKey) {
    if (this.muted) return
    if (this.loaded.has(key)) {
      this.sounds.get(key)?.play()
    }
  }

  setMuted(v: boolean) {
    this.muted = v
    if (v) this.sounds.get('arena')?.pause()
    else if (this.loaded.has('arena')) this.sounds.get('arena')?.play()
  }

  playHit(characterClass: string, damage: number) {
    if (this.muted) return
    const weight = damage >= 16 ? 'heavy' : damage >= 9 ? 'medium' : 'light'
    const cls = characterClass.toLowerCase()
    const key: SoundKey = cls === 'berserker' ? 'hitBerserker' : cls === 'sentinel' ? 'hitSentinel' : 'hitPhantom'
    if (this.loaded.has(key)) { this.play(key); return }
    if (cls === 'sentinel') synthRing(1200, 0.15)
    else if (cls === 'phantom') synthWhoosh(3500)
    else synthHit(weight)
  }

  playSpecial(characterClass: string) {
    if (this.muted) return
    const cls = characterClass.toLowerCase()
    const key: SoundKey = cls === 'berserker' ? 'specialBerserker' : cls === 'sentinel' ? 'specialSentinel' : 'specialPhantom'
    if (this.loaded.has(key)) { this.play(key); return }
    if (cls === 'sentinel') synthRing(800, 0.25)
    else if (cls === 'phantom') synthWhoosh(2000)
    else { synthHit('heavy'); setTimeout(() => synthHit('heavy'), 60) }
  }

  playVictory() {
    if (this.muted) return
    if (this.loaded.has('victory')) { this.play('victory'); return }
    synthVictory()
  }

  playDefeat() {
    if (this.muted) return
    if (this.loaded.has('defeat')) { this.play('defeat'); return }
    synthDefeat()
  }

  playButtonTap() {
    if (this.muted) return
    if (this.loaded.has('buttonTap')) { this.play('buttonTap'); return }
    synthButtonTap()
  }

  playButtonConfirm() {
    if (this.muted) return
    if (this.loaded.has('buttonConfirm')) { this.play('buttonConfirm'); return }
    synthButtonConfirm()
  }

  startAmbient() {
    if (!this.loaded.has('arena') || this.muted) return
    this.sounds.get('arena')?.play()
  }

  stopAmbient() {
    this.sounds.get('arena')?.pause()
  }
}

// Singleton — one audio manager across the app
let _manager: AudioManager | null = null

export function getAudioManager(): AudioManager {
  if (!_manager) _manager = new AudioManager()
  return _manager
}
