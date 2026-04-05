// Audio Engine — Web Audio API setup and management

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.audioBuffer = null;
    this.onPlaybackEnd = null;
    this.micStream = null;
    this.micSource = null;
    this.isMicActive = false;
  }

  async init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();

    // Analyser for spectrogram visualization
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Master gain (end of chain before destination)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
  }

  async loadFile(file) {
    if (!this.ctx) await this.init();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          this.audioBuffer = await this.ctx.decodeAudioData(e.target.result);
          resolve(this.audioBuffer);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // Generate a built-in demo sample (frequency sweep + speech-like formants, ~4s)
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

    // Layer 2: speech-like formant bursts
    const formants = [
      { f1: 270, f2: 2300, start: 0.0, end: 0.6 },
      { f1: 730, f2: 1090, start: 0.8, end: 1.4 },
      { f1: 300, f2: 870,  start: 1.6, end: 2.2 },
      { f1: 660, f2: 1720, start: 2.4, end: 3.0 },
      { f1: 520, f2: 1190, start: 3.2, end: 3.8 },
    ];

    for (const f of formants) {
      const startSample = Math.floor(f.start * sampleRate);
      const endSample = Math.floor(f.end * sampleRate);
      for (let i = startSample; i < endSample && i < length; i++) {
        const t = i / sampleRate;
        const elapsed = (i - startSample) / sampleRate;
        const remaining = (endSample - i) / sampleRate;
        const env = Math.min(1, elapsed / 0.05) * Math.min(1, remaining / 0.05);
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
    const targetPeak = Math.pow(10, -6 / 20);
    const scale = peak > 0 ? targetPeak / peak : 1;
    for (let i = 0; i < length; i++) data[i] *= scale;

    this.audioBuffer = buffer;
    return buffer;
  }

  // Play audio, connecting source to the provided destination node
  play(destination) {
    if (!this.ctx || !this.audioBuffer) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.stop();

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.loop = true;
    this.source.connect(destination);
    this.source.onended = () => {
      this.isPlaying = false;
      if (this.onPlaybackEnd) this.onPlaybackEnd();
    };
    this.source.start(0);
    this.isPlaying = true;
    return true;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch (e) { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
  }

  // Start microphone input, connecting to the provided destination node
  async startMic(destination) {
    if (!this.ctx) await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // Stop any file playback first
    this.stop();

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    this.micSource.connect(destination);
    this.isMicActive = true;
  }

  stopMic() {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    this.isMicActive = false;
  }

  getAnalyserData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  setVolume(value) {
    if (!this.masterGain) return;
    const gain = value === 0 ? 0 : value * value;
    this.masterGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.05);
  }

  getSampleRate() {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }
}
