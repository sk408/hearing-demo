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
