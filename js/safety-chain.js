// Safety Chain — Compressor + limiter to prevent hearing damage
// Uses dBFS (digital full-scale) — no calibrated mic so SPL is unknown

class SafetyChain {
  constructor(audioContext) {
    this.ctx = audioContext;

    this.userThreshold = -20;      // Compressor kicks in (user adjustable)
    this.LIMITER_CEILING = -10;    // Hard digital ceiling, never exceeded

    this.input = this.ctx.createGain();
    this.output = this.ctx.createGain();

    // Compressor — tames peaks before limiter
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

    // Analyser for level metering (separate from spectrogram analyser)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.9;

    // Chain: input -> compressor -> limiter -> analyser -> output
    this.input.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.output);
  }

  getLevel() {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);

    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) sumSquares += data[i] * data[i];
    const rms = Math.sqrt(sumSquares / data.length);
    const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;

    return {
      dbfs,
      isWarning: dbfs > (this.userThreshold + 6),
      isDanger: dbfs > this.LIMITER_CEILING
    };
  }

  setUserThreshold(dbfs) {
    this.userThreshold = Math.max(-40, Math.min(-10, dbfs));
    this.compressor.threshold.setTargetAtTime(this.userThreshold, this.ctx.currentTime, 0.05);
  }

  connect(destination) { this.output.connect(destination); }
  disconnect() { this.output.disconnect(); }

  emergencyStop() {
    this.output.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
  }
}
