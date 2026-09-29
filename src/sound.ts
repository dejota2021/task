// Synthesized Sound Effects using Web Audio API
// Absolutely zero static assets or HTTP requests required, 100% reliable and instantaneous.

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

/**
 * Play a cute bubble pop sound for task creation or UI selection (50% softer volume)
 */
export function playPop() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  // Fast frequency sweep up to make a sweet gentle "pop"
  osc.frequency.setValueAtTime(160, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.07);

  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.09);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

/**
 * Play a slick whoosh sound when shifting tasks between columns (50% softer volume)
 */
export function playWoosh() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'triangle';
  // Fast slide down frequency
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.2);

  gain.gain.setValueAtTime(0.04, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.2);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.21);
}

/**
 * Play a rich success chime (pentatonic major scale arpeggio) when completing a task (50% softer volume)
 */
export function playSuccess() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [329.63, 392.00, 523.25, 659.25, 783.99]; // E4, G4, C5, E5, G5
  const duration = 0.12;

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.05);

    gain.gain.setValueAtTime(0.0, now + idx * 0.05);
    gain.gain.linearRampToValueAtTime(0.04, now + idx * 0.05 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + duration);

    osc.start(now + idx * 0.05);
    osc.stop(now + idx * 0.05 + duration);
  });
}

/**
 * Play a grand level-up fanfare for special milestones like creating a board (50% softer volume)
 */
export function playFanfare() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // A triumphant major triad progression
  const steps = [
    { freq: 261.63, start: 0 },      // C4
    { freq: 329.63, start: 0.07 },   // E4
    { freq: 392.00, start: 0.14 },   // G4
    { freq: 523.25, start: 0.21 },   // C5
    { freq: 659.25, start: 0.28 },   // E5
    { freq: 1046.50, start: 0.38 },  // C6 (Triumphant final note!)
  ];

  steps.forEach((step) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(step.freq, now + step.start);

    const isLast = step.freq > 1000;
    const dur = isLast ? 0.5 : 0.25;

    gain.gain.setValueAtTime(0.0, now + step.start);
    gain.gain.linearRampToValueAtTime(isLast ? 0.05 : 0.03, now + step.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + step.start + dur);

    osc.start(now + step.start);
    osc.stop(now + step.start + dur);
  });
}

/**
 * Play a mega celebration sound (fireworks/payout cascade)
 */
export function playMegaCelebration() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  const notes = [
    261.63, 329.63, 392.00, 523.25, // C4, E4, G4, C5
    392.00, 523.25, 659.25, 783.99, // G4, C5, E5, G5
    523.25, 659.25, 783.99, 1046.50, // C5, E5, G5, C6
    783.99, 1046.50, 1318.51, 1567.98, // G5, C6, E6, G6
    2093.00 // C7 (Grand finale!)
  ];

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    
    osc.frequency.setValueAtTime(freq, now + idx * 0.04);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + idx * 0.04 + 0.12);

    gain.gain.setValueAtTime(0.0, now + idx * 0.04);
    gain.gain.linearRampToValueAtTime(0.04, now + idx * 0.04 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.15);

    osc.start(now + idx * 0.04);
    osc.stop(now + idx * 0.04 + 0.16);
  });
}

