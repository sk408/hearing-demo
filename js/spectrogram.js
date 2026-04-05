// Spectrogram — Canvas-based waterfall visualization
// Shows frequency content over time

class Spectrogram {
  constructor(canvasId, overlayId) {
    this.canvas = document.getElementById(canvasId);
    this.overlay = document.getElementById(overlayId);
    this.ctx = this.canvas.getContext('2d');
    this.octx = this.overlay.getContext('2d');
    
    // Configuration
    this.fftSize = 2048;
    this.frequencyMin = 0;
    this.frequencyMax = 8000;
    this.colormap = 'inferno';
    this.useMelScale = false;
    this.scrollSpeed = 2; // pixels per frame
    
    // State
    this.width = 0;
    this.height = 0;
    this.isRunning = false;
    this.dataBuffer = [];
    this.maxBufferSize = 0; // Calculated from height
    
    // Animation
    this.animationId = null;
    
    // Bind methods
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    
    // Initial setup
    this.resize();
    window.addEventListener('resize', this.resize);
  }
  
  resize() {
    const container = this.canvas.parentElement;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    
    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.overlay.width = this.width * dpr;
    this.overlay.height = this.height * dpr;
    
    this.ctx.scale(dpr, dpr);
    this.octx.scale(dpr, dpr);
    
    // CSS size
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.overlay.style.width = this.width + 'px';
    this.overlay.style.height = this.height + 'px';
    
    // Reset buffer
    this.dataBuffer = [];
    this.maxBufferSize = Math.ceil(this.height / this.scrollSpeed);
    
    // Clear canvases
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  
  // Add frequency data to buffer
  addData(frequencyData) {
    // frequencyData is Uint8Array from AnalyserNode (0-255)
    // We need to map to our frequency range and resample
    const bins = frequencyData.length;
    const nyquist = 22050; // Assuming 44.1kHz sample rate
    
    // Create mapped data for our display range
    const mappedData = new Uint8Array(this.width);
    
    for (let x = 0; x < this.width; x++) {
      // Map x position to frequency
      const freqRatio = x / this.width;
      let freq;
      
      if (this.useMelScale) {
        // Mel scale mapping
        const melMin = 2595 * Math.log10(1 + this.frequencyMin / 700);
        const melMax = 2595 * Math.log10(1 + this.frequencyMax / 700);
        const mel = melMin + freqRatio * (melMax - melMin);
        freq = 700 * (Math.pow(10, mel / 2595) - 1);
      } else {
        // Linear mapping
        freq = this.frequencyMin + freqRatio * (this.frequencyMax - this.frequencyMin);
      }
      
      // Map frequency to bin index
      const bin = Math.round((freq / nyquist) * bins);
      mappedData[x] = bin < bins ? frequencyData[bin] : 0;
    }
    
    this.dataBuffer.unshift(mappedData);
    
    // Trim buffer
    if (this.dataBuffer.length > this.maxBufferSize) {
      this.dataBuffer.pop();
    }
  }
  
  // Get color from value (0-255)
  getColor(value) {
    // Simple heatmap colormap (can be replaced with more sophisticated ones)
    const t = value / 255;
    
    // Inferno-like colormap
    const r = Math.min(255, Math.max(0, t < 0.5 ? t * 2 * 255 : 255));
    const g = Math.min(255, Math.max(0, t < 0.3 ? 0 : t < 0.7 ? (t - 0.3) * 2.5 * 255 : 255));
    const b = Math.min(255, Math.max(0, t < 0.5 ? t * 1.5 * 255 : (1 - t) * 2 * 255));
    
    return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
  }
  
  draw() {
    if (!this.isRunning) return;
    
    // Shift existing image down
    const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    this.ctx.putImageData(imageData, 0, this.scrollSpeed);
    
    // Draw new data at top
    if (this.dataBuffer.length > 0) {
      const row = this.dataBuffer[0];
      for (let x = 0; x < this.width; x++) {
        const value = row[x];
        this.ctx.fillStyle = this.getColor(value);
        this.ctx.fillRect(x, 0, 1, this.scrollSpeed);
      }
    }
    
    this.animationId = requestAnimationFrame(() => this.draw());
  }
  
  start() {
    this.isRunning = true;
    this.draw();
  }
  
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
  
  clear() {
    this.dataBuffer = [];
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  
  // Draw audiogram overlay
  drawAudiogramOverlay(thresholds) {
    const frequencies = [125, 250, 500, 1000, 2000, 4000, 8000];
    
    this.octx.clearRect(0, 0, this.width, this.height);
    
    // Draw grid lines at test frequencies
    this.octx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.octx.lineWidth = 1;
    
    frequencies.forEach(freq => {
      const x = this.frequencyToX(freq);
      this.octx.beginPath();
      this.octx.moveTo(x, 0);
      this.octx.lineTo(x, this.height);
      this.octx.stroke();
      
      // Label
      this.octx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.octx.font = '12px sans-serif';
      this.octx.textAlign = 'center';
      const label = freq >= 1000 ? (freq / 1000) + 'k' : freq;
      this.octx.fillText(label + 'Hz', x, 20);
    });
    
    // Draw threshold line if provided
    if (thresholds) {
      this.octx.strokeStyle = '#ff6b6b';
      this.octx.lineWidth = 3;
      this.octx.beginPath();
      
      let first = true;
      frequencies.forEach(freq => {
        const thr = thresholds[freq] || 0;
        const x = this.frequencyToX(freq);
        // Map threshold (0-120 dB) to y position (inverse, 0 at top)
        const y = (thr / 120) * this.height;
        
        if (first) {
          this.octx.moveTo(x, y);
          first = false;
        } else {
          this.octx.lineTo(x, y);
        }
        
        // Draw point
        this.octx.fillStyle = '#ff6b6b';
        this.octx.beginPath();
        this.octx.arc(x, y, 4, 0, Math.PI * 2);
        this.octx.fill();
      });
      
      this.octx.stroke();
    }
  }
  
  frequencyToX(freq) {
    if (this.useMelScale) {
      const melMin = 2595 * Math.log10(1 + this.frequencyMin / 700);
      const melMax = 2595 * Math.log10(1 + this.frequencyMax / 700);
      const mel = 2595 * Math.log10(1 + freq / 700);
      return ((mel - melMin) / (melMax - melMin)) * this.width;
    } else {
      return ((freq - this.frequencyMin) / (this.frequencyMax - this.frequencyMin)) * this.width;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Spectrogram;
}
