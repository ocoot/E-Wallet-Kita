/**
 * High-Fidelity Web Audio API Sound Synthesizer
 * Provides premium, latency-free mechanical click ticks and success/delete audio feedback cues
 * dynamically without downloading any heavy, external asset audio files.
 *
 * Sejak revisi ini, service ini juga memicu getar (Vibration API) yang
 * selaras dengan tiap jenis bunyi -- getar asli di Android terasa jauh
 * lebih "native" dibanding cuma feedback suara/visual. Dipasang di sini
 * (bukan di tiap komponen satu-satu) supaya otomatis ikut aktif di semua
 * tempat yang sudah memanggil audioFeedback.playClick()/dst. Catatan:
 * iOS Safari/WebKit TIDAK punya Vibration API sama sekali (termasuk saat
 * PWA berjalan standalone) -- makanya di-feature-detect lewat
 * `'vibrate' in navigator`, bukan diasumsikan selalu ada. Dibungkus try/
 * catch & pola gagal-diam yang sama seperti method audio lain di file
 * ini, dan ikut tunduk ke toggle `isMuted` yang sama supaya 1 preference
 * pengguna ("suara & getar mati") konsisten mengontrol keduanya.
 */
class AudioFeedbackService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private initCtx() {
    if (this.isMuted) return;
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    } catch {
      // Browsers often block unsuspended contexts until user gesture, ignore
    }
  }

  private vibrate(pattern: number | number[]) {
    if (this.isMuted) return;
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Sejumlah browser melempar kalau dipanggil di luar user-gesture
      // atau di iframe cross-origin -- gagal diam saja, sama seperti
      // pola audio di atas.
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  getIsMuted() {
    return this.isMuted;
  }

  /**
   * Delicate low-latency micro-haptic mechanical tick click sound
   */
  playClick() {
    if (this.isMuted) return;
    this.vibrate(8);
    try {
      this.initCtx();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio trigger fails gracefully inside blocked container if necessary
    }
  }

  /**
   * Play high pitched gentle double-note chime when transaction saves successfully
   */
  playChime() {
    if (this.isMuted) return;
    this.vibrate([10, 40, 15]);
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.07); // E5

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(783.99, now + 0.07); // G5

      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.07);

      osc1.stop(now + 0.25);
      osc2.stop(now + 0.25);
    } catch {
      // Ignores block
    }
  }

  /**
   * Sound effect suited for deleting, purging, or warning prompts
   */
  playDullPluck() {
    if (this.isMuted) return;
    this.vibrate(20);
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(70, now + 0.1);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + 0.12);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(250, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Ignores block
    }
  }

  /**
   * Dua nada pendek menurun (interval minor) untuk toast error — tegas
   * tapi tetap sopan, tidak mengagetkan (cocok untuk app finansial).
   */
  playAlert() {
    if (this.isMuted) return;
    this.vibrate([15, 60, 15]);
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(392.00, now); // G4
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(311.13, now + 0.09); // Eb4

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.09);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.26);
    } catch {
      // Ignores block
    }
  }
}

export const audioFeedback = new AudioFeedbackService();
