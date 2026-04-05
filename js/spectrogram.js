// Spectrogram — Horizontal-scrolling waterfall display
// X-axis: time (scrolls left), Y-axis: frequency (low at bottom, high at top)

class Spectrogram {
  constructor(canvasId, overlayId) {
    this.canvas = document.getElementById(canvasId);
    this.overlay = document.getElementById(overlayId);
    this.ctx = this.canvas.getContext('2d');
    this.octx = this.overlay.getContext('2d');

    this.frequencyMin = 50;
    this.frequencyMax = 8500;
    this.scrollSpeed = 10;
    this.sampleRate = 44100;
    this.width = 0;
    this.height = 0;
    this.dataBuffer = [];
    this.savedThresholds = null;

    this.initColorLUT();
    this.resize = this.resize.bind(this);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  initColorLUT() {
    // Pre-compute 256-entry color table [r, g, b]
    // Dark -> deep blue -> teal -> green -> yellow -> white
    this.colorLUT = new Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let r, g, b;
      if (t < 0.05) {
        const s = t / 0.05;
        r = Math.floor(s * 10);
        g = Math.floor(s * 5);
        b = Math.floor(s * 30);
      } else if (t < 0.25) {
        const s = (t - 0.05) / 0.2;
        r = Math.floor(10 + s * 30);
        g = Math.floor(5 + s * 20);
        b = Math.floor(30 + s * 120);
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        r = Math.floor(40 - s * 15);
        g = Math.floor(25 + s * 145);
        b = Math.floor(150 + s * 30);
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        r = Math.floor(25 + s * 200);
        g = Math.floor(170 + s * 60);
        b = Math.floor(180 - s * 130);
      } else {
        const s = (t - 0.75) / 0.25;
        r = Math.floor(225 + s * 30);
        g = Math.floor(230 + s * 25);
        b = Math.floor(50 + s * 200);
      }
      this.colorLUT[i] = [
        Math.min(255, Math.max(0, r)),
        Math.min(255, Math.max(0, g)),
        Math.min(255, Math.max(0, b))
      ];
    }
  }

  resize() {
    const container = this.canvas.parentElement;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    if (this.width === 0 || this.height === 0) return;

    // Spectrogram canvas: no DPR scaling (pixel-level manipulation)
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';

    // Overlay canvas: DPR scaled for crisp text
    const dpr = window.devicePixelRatio || 1;
    this.overlay.width = this.width * dpr;
    this.overlay.height = this.height * dpr;
    this.overlay.style.width = this.width + 'px';
    this.overlay.style.height = this.height + 'px';
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.scale(dpr, dpr);

    // Reset
    this.dataBuffer = [];
    this.ctx.fillStyle = '#0a0a12';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Redraw overlay if we have thresholds
    if (this.savedThresholds) {
      this.drawAudiogramOverlay(this.savedThresholds);
    } else {
      this.drawFrequencyLabels();
    }
  }

  setSampleRate(rate) {
    this.sampleRate = rate;
  }

  addData(frequencyData) {
    if (!frequencyData || this.width === 0 || this.height === 0) return;
    const bins = frequencyData.length;
    const nyquist = this.sampleRate / 2;
    const column = new Uint8Array(this.height);

    for (let y = 0; y < this.height; y++) {
      // y=0 is top (high freq), y=height-1 is bottom (low freq)
      const freqRatio = 1 - (y / this.height);
      const freq = this.frequencyMin + freqRatio * (this.frequencyMax - this.frequencyMin);
      const binIndex = Math.round((freq / nyquist) * bins);
      column[y] = (binIndex >= 0 && binIndex < bins) ? frequencyData[binIndex] : 0;
    }

    this.dataBuffer.push(column);
    // Cap buffer size
    while (this.dataBuffer.length > 120) {
      this.dataBuffer.shift();
    }
  }

  draw() {
    if (this.dataBuffer.length === 0 || this.width === 0) return;
    const column = this.dataBuffer.shift();

    // Shift existing pixels left
    if (this.width > this.scrollSpeed) {
      const imgData = this.ctx.getImageData(
        this.scrollSpeed, 0,
        this.width - this.scrollSpeed, this.height
      );
      this.ctx.putImageData(imgData, 0, 0);
    }

    // Draw new column at right edge using ImageData for performance
    const colImg = this.ctx.createImageData(this.scrollSpeed, this.height);
    for (let y = 0; y < this.height; y++) {
      const rgb = this.colorLUT[column[y]];
      for (let s = 0; s < this.scrollSpeed; s++) {
        const idx = (y * this.scrollSpeed + s) * 4;
        colImg.data[idx] = rgb[0];
        colImg.data[idx + 1] = rgb[1];
        colImg.data[idx + 2] = rgb[2];
        colImg.data[idx + 3] = 255;
      }
    }
    this.ctx.putImageData(colImg, this.width - this.scrollSpeed, 0);
  }

  clear() {
    this.dataBuffer = [];
    this.ctx.fillStyle = '#0a0a12';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  frequencyToY(freq) {
    const ratio = (freq - this.frequencyMin) / (this.frequencyMax - this.frequencyMin);
    return this.height * (1 - ratio);
  }

  drawFrequencyLabels() {
    const freqs = [125, 250, 500, 1000, 2000, 4000, 8000];
    this.octx.clearRect(0, 0, this.width, this.height);

    freqs.forEach(freq => {
      const y = this.frequencyToY(freq);

      // Grid line
      this.octx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      this.octx.lineWidth = 1;
      this.octx.beginPath();
      this.octx.moveTo(44, y);
      this.octx.lineTo(this.width, y);
      this.octx.stroke();

      // Label
      const label = freq >= 1000 ? (freq / 1000) + 'k' : freq.toString();
      this.octx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      this.octx.textAlign = 'right';
      this.octx.textBaseline = 'middle';
      this.octx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      this.octx.fillText(label, 40, y);
    });
  }

  drawAudiogramOverlay(thresholds) {
    this.savedThresholds = thresholds;
    const freqs = [125, 250, 500, 1000, 2000, 4000, 8000];
    this.octx.clearRect(0, 0, this.width, this.height);

    // Frequency grid and labels
    freqs.forEach(freq => {
      const y = this.frequencyToY(freq);

      this.octx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      this.octx.lineWidth = 1;
      this.octx.beginPath();
      this.octx.moveTo(44, y);
      this.octx.lineTo(this.width, y);
      this.octx.stroke();

      const label = freq >= 1000 ? (freq / 1000) + 'k' : freq.toString();
      this.octx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      this.octx.textAlign = 'right';
      this.octx.textBaseline = 'middle';
      this.octx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      this.octx.fillText(label, 40, y);
    });

    if (!thresholds) return;

    // Loss severity indicators on left edge
    freqs.forEach((freq, i) => {
      const thr = thresholds[freq] || 0;
      if (thr <= 0) return;

      const y = this.frequencyToY(freq);
      const severity = Math.min(1, thr / 100);

      // Colored bar on left margin
      this.octx.fillStyle = `rgba(239, 68, 68, ${0.3 + severity * 0.6})`;
      this.octx.fillRect(0, y - 6, 3, 12);

      // dB attenuation label
      this.octx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
      this.octx.textAlign = 'right';
      this.octx.textBaseline = 'middle';
      this.octx.fillStyle = `rgba(239, 68, 68, ${0.5 + severity * 0.4})`;
      this.octx.fillText('-' + Math.round(thr * 0.6) + 'dB', this.width - 6, y);
    });

    // Draw threshold curve connecting the points
    const points = freqs.map(freq => ({
      x: 10,
      y: this.frequencyToY(freq)
    }));

    // Subtle connecting line on left
    this.octx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    this.octx.lineWidth = 1;
    this.octx.beginPath();
    points.forEach((pt, i) => {
      if (thresholds[freqs[i]] <= 0) return;
      if (i === 0) this.octx.moveTo(1.5, pt.y);
      else this.octx.lineTo(1.5, pt.y);
    });
    this.octx.stroke();
  }
}
