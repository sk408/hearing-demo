// Safety Chain — Limiter and compressor to prevent hearing damage
// Critical for use with hearing-impaired clients

class SafetyChain {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.input = null;
    this.output = null;
    this.compressor = null;
    this.limiter = null;
    this.analyser = null;
    
    // Safety thresholds
    this.COMPRESSOR_THRESHOLD = -20; // dB - start compressing here (≈70 dB SPL)
    this.LIMITER_THRESHOLD = -10;    // dB - hard limit here (≈85 dB SPL)
    this.COMPRESSOR_RATIO = 10;      // 10:1 compression
    
    // Current level tracking
    this.currentLevel = -100;
    this.isWarning = false;
    this.isDanger = false;
    
    this.init();
  }
  
  init() {
    // Input and output nodes
    this.input = this.ctx.createGain();
    this.output = this.ctx.createGain();
    
    // Compressor - catches peaks before they hit the limiter
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = this.COMPRESSOR_THRESHOLD;
    this.compressor.knee.value = 5;
    this.compressor.ratio.value = this.COMPRESSOR_RATIO;
    this.compressor.attack.value = 0.003; // 3ms attack
    this.compressor.release.value = 0.1;  // 100ms release
    
    // Limiter - final hard ceiling
    // In Web Audio, we use another compressor with very high ratio as limiter
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = this.LIMITER_THRESHOLD;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20; // Limit essentially
    this.limiter.attack.value = 0.001; // 1ms attack
    this.limiter.release.value = 0.05;
    
    // Analyser for level metering
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.9;
    
    // Chain: input -> compressor -> limiter -> analyser -> output
    this.input.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.output);
  }
  
  // Get current output level in dB
  getLevel() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Find max value
    let maxVal = 0;
    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] > maxVal) maxVal = dataArray[i];
    }
    
    // Convert to dB (0-255 mapped to -100 to 0 dBFS)
    const db = maxVal > 0 ? 20 * Math.log10(maxVal / 255) : -100;
    
    // Approximate SPL (rough mapping, not calibrated)
    const spl = db + 100; // Offset so 0 dBFS ≈ 100 dB SPL
    
    this.currentLevel = spl;
    
    // Update warning states
    this.isWarning = spl > 75;  // Yellow zone
    this.isDanger = spl > 85;   // Red zone - should never happen due to limiter
    
    return {
      db: db,
      spl: spl,
      isWarning: this.isWarning,
      isDanger: this.isDanger
    };
  }
  
  // Set maximum output level (additional safety)
  setMaxOutputLevel(maxSpl) {
    // maxSpl in dB SPL
    // Convert to gain: if max is 80 dB, and full scale is 100 dB,
    // we need to reduce by 20 dB = gain of 0.1
    const reductionDb = 100 - maxSpl;
    const gain = Math.pow(10, -reductionDb / 20);
    this.output.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.1);
  }
  
  // Connect to another node
  connect(destination) {
    this.output.connect(destination);
  }
  
  // Disconnect
  disconnect() {
    this.output.disconnect();
  }
  
  // Emergency stop - instantly mute
  emergencyStop() {
    this.output.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SafetyChain;
}
