// Audio Engine — Web Audio API setup and management

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.audioBuffer = null;
    this.onError = null;
  }

  async init() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      
      // Analyser for spectrogram
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      
      // Master gain (will be controlled by safety chain)
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      
      return true;
    } catch (err) {
      console.error('Audio init failed:', err);
      if (this.onError) this.onError('Could not initialize audio');
      return false;
    }
  }

  async loadFile(file) {
    if (!this.ctx) await this.init();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          resolve(this.audioBuffer);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  play(startOffset = 0, duration = null) {
    if (!this.ctx || !this.audioBuffer) return false;
    
    // Resume context if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    this.stop();
    
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.loop = true;
    
    // Connect: source -> filter bank (external) -> safety chain (external) -> master -> destination
    // The filter bank and safety chain will be connected by app.js
    
    this.source.start(0, startOffset, duration);
    this.isPlaying = true;
    
    return true;
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
  }

  getAnalyserData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  // Generate a built-in demo sample (frequency sweep + speech-like tones, ~4 seconds)
  generateDemoSample() {
    const sampleRate = this.ctx.sampleRate;
    const duration = 4;
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Layer 1: slow frequency sweep 200 Hz -> 4000 Hz
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const sweepFreq = 200 * Math.pow(20, t / duration);
      data[i] += 0.15 * Math.sin(2 * Math.PI * sweepFreq * t);
    }

    // Layer 2: speech-like formant bursts (vowel approximation)
    const formants = [
      { f1: 270, f2: 2300, start: 0.0, end: 0.6 },   // "ee"
      { f1: 730, f2: 1090, start: 0.8, end: 1.4 },   // "ah"
      { f1: 300, f2: 870,  start: 1.6, end: 2.2 },   // "oo"
      { f1: 660, f2: 1720, start: 2.4, end: 3.0 },   // "eh"
      { f1: 520, f2: 1190, start: 3.2, end: 3.8 },   // "uh"
    ];

    for (const f of formants) {
      const startSample = Math.floor(f.start * sampleRate);
      const endSample = Math.floor(f.end * sampleRate);
      for (let i = startSample; i < endSample && i < length; i++) {
        const t = i / sampleRate;
        // Envelope: fade in/out over 50ms
        const elapsed = (i - startSample) / sampleRate;
        const remaining = (endSample - i) / sampleRate;
        const env = Math.min(1, elapsed / 0.05) * Math.min(1, remaining / 0.05);
        // Fundamental (voice pitch ~120Hz) + formants
        const fundamental = Math.sin(2 * Math.PI * 120 * t);
        const harm1 = 0.5 * Math.sin(2 * Math.PI * f.f1 * t);
        const harm2 = 0.3 * Math.sin(2 * Math.PI * f.f2 * t);
        data[i] += 0.15 * env * (fundamental + harm1 + harm2);
      }
    }

    // Normalize to -6 dBFS peak
    let peak = 0;
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    const targetPeak = Math.pow(10, -6 / 20); // -6 dBFS
    const scale = peak > 0 ? targetPeak / peak : 1;
    for (let i = 0; i < length; i++) {
      data[i] *= scale;
    }

    this.audioBuffer = buffer;
    return buffer;
  }

  getFloatTimeData() {
    if (!this.analyser) return null;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return data;
  }

  setVolume(value) {
    if (this.masterGain) {
      // value 0-1, but we'll use logarithmic scaling for perceptual match
      const logVolume = value === 0 ? 0 : Math.pow(value, 2);
      this.masterGain.gain.setTargetAtTime(logVolume, this.ctx.currentTime, 0.1);
    }
  }

  getCurrentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioEngine;
}
