// Safety Chain — Limiter and compressor to prevent hearing damage
// Uses dBFS (digital full-scale) — we have no calibrated mic so SPL is unknown

class SafetyChain {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.input = null;
    this.output = null;
    this.compressor = null;
    this.limiter = null;
    this.analyser = null;

    // Safety thresholds (dBFS — digital, not calibrated SPL)
    this.userThreshold = -20;         // User-controlled comfort level
    this.LIMITER_CEILING = -10;       // Hard digital ceiling, never exceeded

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

    // Compressor — starts at user threshold, tames peaks before limiter
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = this.userThreshold;
    this.compressor.knee.value = 5;
    this.compressor.ratio.value = 10;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.1;

    // Limiter — hard digital ceiling
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = this.LIMITER_CEILING;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
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

  // Get current output level in dBFS
  getLevel() {
    const dataArray = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(dataArray);

    // Calculate RMS level
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;

    this.currentLevel = dbfs;

    // Warning: within 6 dB of user threshold; Danger: above limiter ceiling
    this.isWarning = dbfs > (this.userThreshold + 6);
    this.isDanger = dbfs > this.LIMITER_CEILING;

    return {
      dbfs: dbfs,
      isWarning: this.isWarning,
      isDanger: this.isDanger
    };
  }

  // Update user comfort threshold (dBFS, range: -40 to -10)
  setUserThreshold(dbfs) {
    this.userThreshold = Math.max(-40, Math.min(-10, dbfs));
    this.compressor.threshold.setTargetAtTime(this.userThreshold, this.ctx.currentTime, 0.05);
  }

  // Connect to another node
  connect(destination) {
    this.output.connect(destination);
  }

  // Disconnect
  disconnect() {
    this.output.disconnect();
  }

  // Emergency stop — instantly mute
  emergencyStop() {
    this.output.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SafetyChain;
}
