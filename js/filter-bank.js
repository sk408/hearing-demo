// Filter Bank — Per-frequency band attenuation based on audiogram
// Uses FFT-based smoothing for natural hearing loss simulation

class FilterBank {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
    this.isEnabled = false;
    this.currentAttenuations = {};

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

    // Use wider overlapping filters for smoother frequency response
    // Q values tuned for 1-octave spacing with minimal ripple
    this.bands = this.frequencies.map(freq => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking'; // Peaking EQ for smoother response
      filter.frequency.value = freq;
      // Q of 0.7 gives smooth overlap, minimal ripple between bands
      filter.Q.value = 0.7;
      filter.gain.value = 0; // Start flat

      const enabled = true;
      const attenuationDb = 0;

      this.input.connect(filter);
      filter.connect(this.wetGain);

      return { frequency: freq, filter, enabled, attenuationDb };
    });

    // Low-frequency content (<100 Hz) - typically not affected by HL
    // Let it pass through on wet path too for naturalness
    this.lowShelf = this.ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 80;
    this.lowShelf.gain.value = 0;
    this.input.connect(this.lowShelf);
    this.lowShelf.connect(this.wetGain);
  }

  // Apply audiogram thresholds as attenuation
  // Uses a more gradual mapping: threshold -> attenuation with headroom
  applyAudiogram(thresholds) {
    this.frequencies.forEach((freq, i) => {
      const threshold = thresholds[freq] || 0;
      // More gradual attenuation curve
      // 60 dB HL -> ~25 dB actual attenuation (speakers are close, not far)
      // This accounts for the fact that the user is listening at elevated volume
      const attenuation = threshold * 0.45;
      
      this.bands[i].attenuationDb = attenuation;
      
      if (this.isEnabled && this.bands[i].enabled) {
        // Peaking filter with negative gain = attenuation
        this.bands[i].filter.gain.setTargetAtTime(-attenuation, this.ctx.currentTime, 0.05);
      }
      
      this.currentAttenuations[freq] = attenuation;
    });

    // Also apply slight low-freq reduction if severe loss above 1k
    // (simulates the " Recruitment" effect where low freqs seem louder)
    const highFreqLoss = Math.max(
      thresholds[2000] || 0,
      thresholds[4000] || 0,
      thresholds[8000] || 0
    );
    if (highFreqLoss > 60 && this.isEnabled) {
      this.lowShelf.gain.setTargetAtTime(-3, this.ctx.currentTime, 0.1);
    } else {
      this.lowShelf.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  // Toggle individual band
  setBandEnabled(frequency, enabled) {
    const band = this.bands.find(b => b.frequency === frequency);
    if (!band) return;
    band.enabled = enabled;
    if (this.isEnabled) {
      const gain = enabled ? -band.attenuationDb : 0;
      band.filter.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
    }
  }

  // Switch between dry (full signal) and wet (filtered)
  setEnabled(enabled) {
    this.isEnabled = enabled;
    const t = this.ctx.currentTime;
    
    if (enabled) {
      // Fade to filtered
      this.dryGain.gain.setTargetAtTime(0, t, 0.08);
      this.wetGain.gain.setTargetAtTime(1, t, 0.08);
      
      // Apply current attenuations
      this.bands.forEach(band => {
        const gain = band.enabled ? -band.attenuationDb : 0;
        band.filter.gain.setTargetAtTime(gain, t, 0.05);
      });
    } else {
      // Fade back to clean
      this.dryGain.gain.setTargetAtTime(1, t, 0.08);
      this.wetGain.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  // Momentary bypass (for A/B comparison)
  momentaryBypass(bypass) {
    const t = this.ctx.currentTime;
    if (bypass) {
      this.dryGain.gain.setTargetAtTime(1, t, 0.02);
      this.wetGain.gain.setTargetAtTime(0, t, 0.02);
    } else if (this.isEnabled) {
      this.dryGain.gain.setTargetAtTime(0, t, 0.02);
      this.wetGain.gain.setTargetAtTime(1, t, 0.02);
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
