// Spectrogram — Left-to-right scrolling waterfall (standard speech display)
// X-axis: time (scrolls right), Y-axis: frequency (low at bottom, high at top)

class Spectrogram {
  constructor(canvasId, overlayId) {
    this.canvas = document.getElementById(canvasId);
    this.overlay = document.getElementById(overlayId);
    this.ctx = this.canvas.getContext('2d');
    this.octx = this.overlay.getContext('2d');

    this.frequencyMin = 50;
    this.frequencyMax = 8500;
    this.scrollSpeed = 4; // Slower for smoother scroll
    this.sampleRate = 44100;
    this.width = 0;
    this.height = 0;
    this.dataBuffer = [];
    this.savedThresholds = null;
    this.showSpeechBanana = true;
    this.showAudiogramCurve = true;

    this.initColorLUT();
    this.resize = this.resize.bind(this);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  initColorLUT() {
    // Inferno colormap - perceptually uniform, better than rainbow
    this.colorLUT = new Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      // Inferno approximated
      let r, g, b;
      if (t < 0.2) {
        r = 0;
        g = t * 3.5;
        b = t * 1.5 + 0.1;
      } else if (t < 0.5) {
        r = (t - 0.2) * 2.5;
        g = 0.7 + (t - 0.2) * 0.8;
        b = 0.4 - (t - 0.2) * 0.8;
      } else if (t < 0.8) {
        r = 0.75 + (t - 0.5) * 0.8;
        g = 0.94 - (t - 0.5) * 0.4;
        b = 0.16 - (t - 0.5) * 0.3;
      } else {
        r = 1;
        g = 0.82 + (t - 0.8) * 0.9;
        b = 0.73 + (t - 0.8) * 1.1;
      }
      this.colorLUT[i] = [
        Math.min(255, Math.max(0, Math.floor(r * 255))),
        Math.min(255, Math.max(0, Math.floor(g * 255))),
        Math.min(255, Math.max(0, Math.floor(b * 255)))
      ];
    }
  }

  resize() {
    const container = this.canvas.parentElement;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    if (this.width === 0 || this.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    
    // Spectrogram canvas
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';

    // Overlay canvas - DPR scaled for crisp text
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

    this.redrawOverlay();
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
    // Cap buffer to ~3 seconds at 60fps
    const maxColumns = Math.floor(this.width / this.scrollSpeed) + 10;
    while (this.dataBuffer.length > maxColumns) {
      this.dataBuffer.shift();
    }
  }

  draw() {
    if (this.dataBuffer.length === 0 || this.width === 0) return;

    // Standard left-to-right scrolling: newest at RIGHT edge
    // (This matches speech analysis software convention)
    const column = this.dataBuffer[this.dataBuffer.length - 1];

    // Shift existing pixels LEFT (oldest moves left, newest appears at right)
    if (this.width > this.scrollSpeed) {
      const imgData = this.ctx.getImageData(
        0, 0,
        this.width - this.scrollSpeed, this.height
      );
      this.ctx.putImageData(imgData, this.scrollSpeed, 0);
    }

    // Draw new column at RIGHT edge
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

  redrawOverlay() {
    if (this.savedThresholds && this.showAudiogramCurve) {
      this.drawAudiogramOverlay(this.savedThresholds);
    } else {
      this.drawFrequencyLabels();
    }
  }

  toggleSpeechBanana(show) {
    this.showSpeechBanana = show;
    this.redrawOverlay();
  }

  drawSpeechBanana() {
    if (!this.showSpeechBanana) return;

    // Speech banana - the region where speech sounds occur
    // Based on typical speech formants and consonant energy
    const speechSounds = [
      // Vowels (low-mid freq, high intensity)
      { name: 'U', f1: 250, f2: 600, db: 70 },
      { name: 'O', f1: 400, f2: 700, db: 68 },
      { name: 'A', f1: 700, f2: 1200, db: 72 },
      { name: 'E', f1: 500, f2: 1800, db: 68 },
      { name: 'I', f1: 300, f2: 2400, db: 65 },
      // Consonants (mid-high freq)
      { name: 'M', f: 250, db: 65 },
      { name: 'N', f: 500, db: 62 },
      { name: 'NG', f: 300, db: 60 },
      { name: 'S', f: 4500, db: 55, wide: true },
      { name: 'SH', f: 2500, db: 58 },
      { name: 'F', f: 3500, db: 52 },
      { name: 'TH', f: 2500, db: 55 },
      { name: 'K', f: 2000, db: 58 },
      { name: 'T', f: 3500, db: 55 },
      { name: 'P', f: 1500, db: 60 },
      { name: 'B', f: 900, db: 62 },
      { name: 'D', f: 2200, db: 58 },
      { name: 'G', f: 1900, db: 58 },
      { name: 'V', f: 1200, db: 55 },
      { name: 'Z', f: 4000, db: 52 },
    ];

    // Draw shaded banana region
    const bananaPath = new Path2D();
    let first = true;
    
    // Sort by frequency for smooth curve
    const sorted = speechSounds
      .filter(s => s.f || s.f2)
      .map(s => ({ 
        f: s.f || (s.f1 + s.f2) / 2, 
        y: this.frequencyToY(s.f || (s.f1 + s.f2) / 2),
        db: s.db 
      }))
      .sort((a, b) => a.f - b.f);

    // Draw the banana shape
    this.octx.save();
    this.octx.globalAlpha = 0.15;
    this.octx.fillStyle = '#22c55e';
    
    bananaPath.moveTo(60, sorted[0].y);
    sorted.forEach((pt, i) => {
      const x = 60 + (i / (sorted.length - 1)) * 100;
      bananaPath.lineTo(x, pt.y);
    });
    // Bottom curve (lower intensity cutoff)
    for (let i = sorted.length - 1; i >= 0; i--) {
      const pt = sorted[i];
      const x = 60 + (i / (sorted.length - 1)) * 100;
      const spread = 15 + (pt.db / 80) * 20; // Spread based on intensity
      bananaPath.lineTo(x, pt.y + spread);
    }
    bananaPath.closePath();
    this.octx.fill(bananaPath);
    this.octx.restore();

    // Draw key phoneme labels
    this.octx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    this.octx.textAlign = 'center';
    this.octx.textBaseline = 'middle';
    
    const keyLabels = ['M', 'A', 'E', 'SH', 'S'];
    speechSounds.filter(s => keyLabels.includes(s.name)).forEach(s => {
      const f = s.f || (s.f1 + s.f2) / 2;
      const y = this.frequencyToY(f);
      const x = 70;
      
      this.octx.fillStyle = 'rgba(34, 197, 94, 0.9)';
      this.octx.beginPath();
      this.octx.arc(x, y, 12, 0, Math.PI * 2);
      this.octx.fill();
      
      this.octx.fillStyle = '#0a0a12';
      this.octx.fillText(s.name, x, y + 0.5);
    });

    // Legend
    this.octx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    this.octx.fillStyle = 'rgba(34, 197, 94, 0.7)';
    this.octx.textAlign = 'left';
    this.octx.fillText('SPEECH BANANA', 50, this.height - 20);
    this.octx.fillRect(50, this.height - 15, 90, 2);
  }

  drawFrequencyLabels() {
    const freqs = [125, 250, 500, 1000, 2000, 4000, 8000];
    this.octx.clearRect(0, 0, this.width, this.height);

    // Draw speech banana first (behind grid)
    this.drawSpeechBanana();

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

    // Draw speech banana
    this.drawSpeechBanana();

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
      y: this.frequencyToY(freq),
      thr: thresholds[freq] || 0
    })).filter(pt => pt.thr > 0);

    if (points.length > 1) {
      this.octx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      this.octx.lineWidth = 2;
      this.octx.beginPath();
      points.forEach((pt, i) => {
        if (i === 0) this.octx.moveTo(1.5, pt.y);
        else this.octx.lineTo(1.5, pt.y);
      });
      this.octx.stroke();

      // Draw circles at threshold points
      points.forEach(pt => {
        this.octx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        this.octx.beginPath();
        this.octx.arc(1.5, pt.y, 3, 0, Math.PI * 2);
        this.octx.fill();
      });
    }
  }
}
