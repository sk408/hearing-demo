// Filter Bank — Per-frequency band attenuation based on audiogram
// Uses 6 bandpass filters with gains modulated by threshold values

class FilterBank {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.bands = [];
    this.input = null;
    this.output = null;
    this.isEnabled = false;
    
    // Band center frequencies
    this.frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
    
    this.init();
  }
  
  init() {
    // Create input/output nodes
    this.input = this.ctx.createGain();
    this.output = this.ctx.createGain();
    
    // Create bandpass filters and gains for each frequency
    this.frequencies.forEach((freq, index) => {
      // Bandpass filter - Q of 2 gives reasonable bandwidth
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 2;
      
      // Gain node for this band (controlled by audiogram)
      const gain = this.ctx.createGain();
      gain.gain.value = 1; // Default: no attenuation
      
      // Store reference
      this.bands.push({
        frequency: freq,
        filter: filter,
        gain: gain,
        attenuationDb: 0
      });
      
      // Connect: input -> filter -> gain -> output
      this.input.connect(filter);
      filter.connect(gain);
      gain.connect(this.output);
    });
    
    // Also create a bypass path (low-pass for <100Hz, not affected by hearing loss)
    this.bypass = this.ctx.createBiquadFilter();
    this.bypass.type = 'lowpass';
    this.bypass.frequency.value = 100;
    this.input.connect(this.bypass);
    this.bypass.connect(this.output);
  }
  
  // Apply audiogram thresholds as attenuation
  // threshold: dB HL at each frequency
  // We attenuate by (threshold / 2) to approximate the perceptual effect
  // (this is a simplification - real hearing loss is more complex)
  applyAudiogram(thresholds) {
    this.bands.forEach((band, index) => {
      const freq = band.frequency;
      const threshold = thresholds[freq] || 0;
      
      // Convert dB HL to gain factor
      // 0 dB HL = no attenuation (gain = 1)
      // 60 dB HL = significant attenuation (gain ≈ 0.001)
      // We use a gentler slope for demo purposes
      const attenuationDb = threshold * 0.6; // Scale factor for demo
      const gainFactor = Math.pow(10, -attenuationDb / 20);
      
      // Smooth transition
      band.gain.gain.setTargetAtTime(gainFactor, this.ctx.currentTime, 0.05);
      band.attenuationDb = attenuationDb;
    });
  }
  
  // Enable/disable individual bands
  setBandEnabled(frequency, enabled) {
    const band = this.bands.find(b => b.frequency === frequency);
    if (band) {
      const targetGain = enabled ? Math.pow(10, -band.attenuationDb / 20) : 0;
      band.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    }
  }
  
  // Enable/disable the entire filter bank
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (enabled) {
      // When enabled, bands use their calculated gains
      this.bands.forEach(band => {
        const targetGain = Math.pow(10, -band.attenuationDb / 20);
        band.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
      });
    } else {
      // When disabled (bypass), all bands at full volume
      this.bands.forEach(band => {
        band.gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
      });
    }
  }
  
  // Get current attenuation values for display
  getAttenuations() {
    return this.bands.reduce((acc, band) => {
      acc[band.frequency] = {
        enabled: band.gain.gain.value > 0.01,
        attenuationDb: band.attenuationDb
      };
      return acc;
    }, {});
  }
  
  // Connect to another node
  connect(destination) {
    this.output.connect(destination);
  }
  
  // Disconnect
  disconnect() {
    this.output.disconnect();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FilterBank;
}
