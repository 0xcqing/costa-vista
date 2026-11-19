let audioContext = null;
let masterGain = null;
let noiseBuffer = null;
let engineOsc = null;
let engineSub = null;
let engineGain = null;
let engineFilter = null;
let sirenOsc = null;
let sirenGain = null;
let surfSource = null;
let surfGain = null;
let muted = false;
let ready = false;

function makeNoise(context) {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function initAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = muted ? 0 : 0.55;
    masterGain.connect(audioContext.destination);
    noiseBuffer = makeNoise(audioContext);

    engineFilter = audioContext.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = audioContext.createGain();
    engineGain.gain.value = 0;
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc = audioContext.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc.connect(engineFilter);
    engineOsc.start();
    engineSub = audioContext.createOscillator();
    engineSub.type = 'triangle';
    engineSub.frequency.value = 28;
    engineSub.connect(engineFilter);
    engineSub.start();

    const sirenFilter = audioContext.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.value = 760;
    sirenFilter.Q.value = 2.2;
    sirenGain = audioContext.createGain();
    sirenGain.gain.value = 0;
    sirenFilter.connect(sirenGain);
    sirenGain.connect(masterGain);
    sirenOsc = audioContext.createOscillator();
    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.value = 660;
    sirenOsc.connect(sirenFilter);
    sirenOsc.start();

    const surfFilter = audioContext.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 680;
    surfGain = audioContext.createGain();
    surfGain.gain.value = 0;
    surfFilter.connect(surfGain);
    surfGain.connect(masterGain);
    surfSource = audioContext.createBufferSource();
    surfSource.buffer = noiseBuffer;
    surfSource.loop = true;
    surfSource.connect(surfFilter);
    surfSource.start();

    ready = true;
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  } catch {
    audioContext = null;
    masterGain = null;
    ready = false;
    return null;
  }
}

export function setMuted(value) {
  muted = Boolean(value);
  if (masterGain && audioContext) {
    try {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.55, audioContext.currentTime, 0.025);
    } catch {
      masterGain.gain.value = muted ? 0 : 0.55;
    }
  }
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  setMuted(muted);
  return muted;
}

function activeContext() {
  if (!audioContext) return null;
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function noiseBurst(duration, gain, frequency = 1000, type = 'lowpass') {
  const context = activeContext();
  if (!context || !ready || muted) return;
  try {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = context.createGain();
    const now = context.currentTime;
    envelope.gain.setValueAtTime(Math.max(0.001, gain), now);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);
    source.start(now);
    source.stop(now + duration + 0.02);
  } catch {
    // Audio is optional; a failed node must not affect play.
  }
}

function tone(frequency, duration, gain = 0.06, type = 'sine', delay = 0) {
  const context = activeContext();
  if (!context || !ready || muted) return;
  try {
    const osc = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(envelope);
    envelope.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  } catch {
    // Ignore a missing audio node.
  }
}

export function updateAudio(dt, options = {}) {
  const context = activeContext();
  if (!context || !ready) return;
  const now = context.currentTime;
  const driving = Boolean(options.driving);
  const speed = Number.isFinite(options.speed) ? options.speed : 0;
  const sirenLevel = Math.max(0, Math.min(1, options.sirenLevel ?? 0));
  const surfLevel = Math.max(0, Math.min(1, options.surfLevel ?? 0));

  try {
    const engineTarget = driving ? 0.055 + Math.min(0.06, speed / 7000) : 0;
    engineGain.gain.setTargetAtTime(engineTarget, now, 0.08);
    const hz = 46 + Math.min(190, speed * 0.46);
    engineOsc.frequency.setTargetAtTime(hz, now, 0.08);
    engineSub.frequency.setTargetAtTime(hz * 0.5, now, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + speed * 1.8, now, 0.1);
  } catch {
    // Ignore parameter automation failures.
  }

  try {
    const sirenTarget = sirenLevel * 0.055;
    sirenGain.gain.setTargetAtTime(sirenTarget, now, 0.14);
    if (sirenLevel > 0.01) {
      const toneSwitch = Math.floor((now * 2.4) % 2);
      sirenOsc.frequency.setTargetAtTime(toneSwitch ? 840 : 610, now, 0.035);
    }
  } catch {
    // Ignore siren automation failures.
  }

  try {
    surfGain.gain.setTargetAtTime(surfLevel * 0.045, now, 0.5);
  } catch {
    // Ignore surf automation failures.
  }
}

export function playShoot() {
  noiseBurst(0.075, 0.15, 1750, 'highpass');
  tone(105, 0.11, 0.07, 'square');
}

export function playExplosion() {
  noiseBurst(0.7, 0.28, 520, 'lowpass');
  tone(52, 0.75, 0.16, 'sine');
  tone(88, 0.38, 0.1, 'triangle');
}

export function playPickup() {
  tone(660, 0.12, 0.055, 'sine');
  tone(990, 0.18, 0.045, 'sine', 0.08);
}

export function playMissionPassed() {
  const notes = [523, 659, 784, 1046];
  for (let i = 0; i < notes.length; i++) tone(notes[i], 0.28, 0.06, 'triangle', i * 0.13);
}

export function playSiren() {
  tone(610, 0.22, 0.045, 'sawtooth');
  tone(840, 0.22, 0.04, 'sawtooth', 0.24);
}

export function playEngine(speed = 0, active = true) {
  updateAudio(1 / 60, { driving: active, speed });
}

export function playUiClick() {
  tone(880, 0.045, 0.025, 'triangle');
}

export function playTireScreech() {
  noiseBurst(0.22, 0.055, 2350, 'bandpass');
}
