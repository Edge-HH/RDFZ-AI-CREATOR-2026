/** Original synthetic interface sounds. Audio is created only after a user gesture. */
export class Sound {
  muted = true;
  private context?: AudioContext;
  toggle(): void {
    this.muted = !this.muted;
    if (!this.muted) this.play("confirm");
  }
  play(kind: "confirm" | "feedback" | "ending"): void {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
      const ctx = this.context;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const at = ctx.currentTime;
      osc.type = "sine";
      osc.frequency.setValueAtTime(
        kind === "ending" ? 160 : kind === "feedback" ? 620 : 340,
        at,
      );
      osc.frequency.exponentialRampToValueAtTime(
        kind === "ending" ? 480 : 220,
        at + 0.25,
      );
      gain.gain.setValueAtTime(0.04, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
      osc.start(at);
      osc.stop(at + 0.32);
    } catch {
      /* Autoplay restrictions cannot prevent gameplay. */
    }
  }
}
