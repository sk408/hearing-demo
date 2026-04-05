// Filter Bank — Per-frequency band attenuation based on audiogram
// Uses dry/wet mixer: dry path is pristine bypass, wet path applies hearing loss

class FilterBank {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.bands = [];
    this.frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
    this.isEnabled = false;

    // Input / output
    this.input = this.ctx.createGain();
    this.output = this.ctx.createGain();

    // Dry path (clean bypass)
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1;
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path (filtered through hearing loss simulation)
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0;
    this.wetGain.connect(this.output);

    // Create bandpass filters for each audiometric frequency
    this.frequencies.forEach(freq => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      // Q adjusted per band for smoother coverage
      filter.Q.value = freq <= 250 ? 1.2 : freq <= 1000 ? 1.5 : 2.0;

      const gain = this.ctx.createGain();
      gain.gain.value = 1;

      this.bands.push({ frequency: freq, filter, gain, attenuationDb: 0, enabled: true });

      this.input.connect(filter);
      filter.connect(gain);
      gain.connect(this.wetGain);
    });

    // Low-frequency bypass (<100 Hz not typically affected by hearing loss)
    this.lowBypass = this.ctx.createBiquadFilter();
    this.lowBypass.type = 'lowpass';
    this.lowBypass.frequency.value = 100;
    this.input.connect(this.lowBypass);
    this.lowBypass.connect(this.wetGain);
  }

  // Apply audiogram thresholds as attenuation
  applyAudiogram(thresholds) {
    this.bands.forEach(band => {
      const threshold = thresholds[band.frequency] || 0;
      // Scale: 60 dB HL threshold -> 36 dB attenuation (0.6 factor)
      band.attenuationDb = threshold * 0.6;
      if (this.isEnabled && band.enabled) {
        const gainFactor = Math.pow(10, -band.attenuationDb / 20);
        band.gain.gain.setTargetAtTime(gainFactor, this.ctx.currentTime, 0.05);
      }
    });
  }

  // Toggle individual band (only affects wet path)
  setBandEnabled(frequency, enabled) {
    const band = this.bands.find(b => b.frequency === frequency);
    if (!band) return;
    band.enabled = enabled;
    if (this.isEnabled) {
      const target = enabled ? Math.pow(10, -band.attenuationDb / 20) : 0;
      band.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  // Switch between dry (full signal) and wet (filtered)
  setEnabled(enabled) {
    this.isEnabled = enabled;
    const t = this.ctx.currentTime;
    if (enabled) {
      this.dryGain.gain.setTargetAtTime(0, t, 0.05);
      this.wetGain.gain.setTargetAtTime(1, t, 0.05);
      // Apply current attenuations to band gains
      this.bands.forEach(band => {
        const target = band.enabled ? Math.pow(10, -band.attenuationDb / 20) : 0;
        band.gain.gain.setTargetAtTime(target, t, 0.05);
      });
    } else {
      this.dryGain.gain.setTargetAtTime(1, t, 0.05);
      this.wetGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  getAttenuations() {
    return this.bands.reduce((acc, band) => {
      acc[band.frequency] = {
        enabled: band.enabled,
        attenuationDb: band.attenuationDb
      };
      return acc;
    }, {});
  }

  connect(destination) { this.output.connect(destination); }
  disconnect() { this.output.disconnect(); }
}
