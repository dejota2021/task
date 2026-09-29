// Synthesized Sound Effects using Web Audio API representing the uploaded assets.
// Extremely reliable, fast, zero-latency, and operates 100% offline.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Procedural Sound A: Retro Bubble Pop (fast frequency sweep up)
function playSoundA() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);

  gain.gain.setValueAtTime(0.85, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.11);
}

// Procedural Sound B: Laser Slide (smooth pitch slide down)
function playSoundB() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(450, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0.7, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.17);
}

// Procedural Sound C: Metallic Sci-Fi Chirp (fast pitch modulation)
function playSoundC() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'square';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.04);
  osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 0.08);

  gain.gain.setValueAtTime(0.35, ctx.currentTime); // square waves are louder naturally
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

// Procedural Sound D: Cute Sparkle Blip (fast double-tone pitch bounce)
function playSoundD() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.type = 'sine';
  osc2.type = 'sine';

  osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
  osc1.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.06); // C6

  osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
  osc2.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.06); // E6

  gain.gain.setValueAtTime(0.65, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

  osc1.start(ctx.currentTime);
  osc2.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 0.09);
  osc2.stop(ctx.currentTime + 0.09);
}

/**
 * Triggers one of the 4 interaction audio effects completely at random.
 */
export function playRandomInteractionSound() {
  const choice = Math.floor(Math.random() * 4);
  if (choice === 0) playSoundA();
  else if (choice === 1) playSoundB();
  else if (choice === 2) playSoundC();
  else playSoundD();
}

/**
 * Play a highly triumphant, beautiful 5-note retro arpeggio sequence representing "happy.wav"
 * Triggered whenever a task is completed/finalized!
 */
export function playHappy() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Upbeat, happy retro major scale melody (C5 -> E5 -> G5 -> C6 -> E6 -> G6)
  const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
  const duration = 0.16;

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Mix sine and triangle for a warm, sweet, retro feel
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now + idx * 0.045);

    gain.gain.setValueAtTime(0.0, now + idx * 0.045);
    gain.gain.linearRampToValueAtTime(0.8, now + idx * 0.045 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.002, now + idx * 0.045 + duration);

    osc.start(now + idx * 0.045);
    osc.stop(now + idx * 0.045 + duration);
  });
}

// Map standard sound function names to trigger our random or dedicated sounds backwards-compatibly:
export function playPop() {
  playRandomInteractionSound();
}

export function playWoosh() {
  playRandomInteractionSound();
}

export function playSuccess() {
  playHappy();
}

export function playFanfare() {
  playHappy();
}

export function playMegaCelebration() {
  playHappy();
}
