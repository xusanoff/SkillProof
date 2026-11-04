/** A short two-tone beep for the inactivity warning. Fails silently when audio is not allowed yet. */
export function playBeep(): void {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.14);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 700);
  } catch {
    // No audio output: the visible alert is still there.
  }
}
