// App.js — Main controller for Hearing Demo
// Orchestrates audio engine, filter bank, safety chain, and spectrogram

(function() {
  'use strict';

  // State
  let audioEngine = null;
  let filterBank = null;
  let safetyChain = null;
  let spectrogram = null;
  
  let currentAudiogram = null;
  let isFiltered = false;
  let levelCheckInterval = null;
  
  // DOM elements
  const els = {
    btnLoad: document.getElementById('btn-load'),
    audioInput: document.getElementById('audio-input'),
    audiogramSelect: document.getElementById('audiogram-select'),
    audiogramPanel: document.getElementById('audiogram-panel'),
    btnPlay: document.getElementById('btn-play'),
    btnStop: document.getElementById('btn-stop'),
    btnFull: document.getElementById('btn-full'),
    btnFiltered: document.getElementById('btn-filtered'),
    masterVolume: document.getElementById('master-volume'),
    volumeValue: document.getElementById('volume-value'),
    levelFill: document.getElementById('level-fill'),
    levelValue: document.getElementById('level-value'),
    levelWarning: document.getElementById('level-warning')
  };
  
  // Frequency threshold inputs
  const freqInputs = {
    125: document.getElementById('thr-125'),
    250: document.getElementById('thr-250'),
    500: document.getElementById('thr-500'),
    1000: document.getElementById('thr-1000'),
    2000: document.getElementById('thr-2000'),
    4000: document.getElementById('thr-4000'),
    8000: document.getElementById('thr-8000')
  };
  
  // Frequency band checkboxes
  const bandChecks = {
    125: document.getElementById('band-125'),
    250: document.getElementById('band-250'),
    500: document.getElementById('band-500'),
    1000: document.getElementById('band-1000'),
    2000: document.getElementById('band-2000'),
    4000: document.getElementById('band-4000'),
    8000: document.getElementById('band-8000')
  };
  
  // Attenuation displays
  const attDisplays = {
    125: document.getElementById('att-125'),
    250: document.getElementById('att-250'),
    500: document.getElementById('att-500'),
    1000: document.getElementById('att-1000'),
    2000: document.getElementById('att-2000'),
    4000: document.getElementById('att-4000'),
    8000: document.getElementById('att-8000')
  };

  // Initialization
  async function init() {
    // Initialize modules
    audioEngine = new AudioEngine();
    await audioEngine.init();
    
    filterBank = new FilterBank(audioEngine.ctx);
    safetyChain = new SafetyChain(audioEngine.ctx);
    spectrogram = new Spectrogram('spectrogram', 'overlay');
    
    // Set up audio chain: source -> filterBank -> safetyChain -> masterGain -> destination
    // Note: filterBank and safetyChain connect in their constructors
    // We need to wire them together
    
    // Wire the chain properly
    filterBank.connect(safetyChain.input);
    safetyChain.connect(audioEngine.masterGain);
    audioEngine.masterGain.connect(audioEngine.ctx.destination);
    
    // Also connect analyser for spectrogram
    safetyChain.connect(audioEngine.analyser);
    
    // Set up event listeners
    setupEventListeners();
    
    // Start level monitoring
    startLevelMonitoring();
    
    // Start spectrogram
    spectrogram.start();
    
    console.log('Hearing Demo initialized');
  }
  
  function setupEventListeners() {
    // Load audio button
    els.btnLoad.addEventListener('click', () => els.audioInput.click());
    els.audioInput.addEventListener('change', handleAudioLoad);
    
    // Audiogram selection
    els.audiogramSelect.addEventListener('change', handleAudiogramSelect);
    
    // Threshold inputs
    Object.values(freqInputs).forEach(input => {
      input.addEventListener('change', updateAudiogramFromInputs);
    });
    
    // Playback controls
    els.btnPlay.addEventListener('click', handlePlay);
    els.btnStop.addEventListener('click', handleStop);
    
    // Mode toggle
    els.btnFull.addEventListener('click', () => setMode(false));
    els.btnFiltered.addEventListener('click', () => setMode(true));
    
    // Band toggles
    Object.keys(bandChecks).forEach(freq => {
      bandChecks[freq].addEventListener('change', (e) => {
        filterBank.setBandEnabled(parseInt(freq), e.target.checked);
      });
    });
    
    // Volume control
    els.masterVolume.addEventListener('input', handleVolumeChange);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
  }
  
  async function handleAudioLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      await audioEngine.loadFile(file);
      els.btnPlay.disabled = false;
      console.log('Loaded:', file.name);
    } catch (err) {
      alert('Failed to load audio: ' + err.message);
    }
  }
  
  function handleAudiogramSelect(e) {
    const preset = e.target.value;
    
    if (!preset) {
      els.audiogramPanel.classList.add('hidden');
      return;
    }
    
    if (preset === 'custom') {
      els.audiogramPanel.classList.remove('hidden');
      return;
    }
    
    // Apply preset
    els.audiogramPanel.classList.remove('hidden');
    
    if (PRESETS[preset]) {
      currentAudiogram = PRESETS[preset].thresholds;
      updateInputsFromAudiogram(currentAudiogram);
      applyAudiogram();
    }
  }
  
  function updateInputsFromAudiogram(thresholds) {
    Object.keys(freqInputs).forEach(freq => {
      freqInputs[freq].value = thresholds[freq] || 0;
    });
  }
  
  function updateAudiogramFromInputs() {
    currentAudiogram = {};
    Object.keys(freqInputs).forEach(freq => {
      currentAudiogram[freq] = parseInt(freqInputs[freq].value) || 0;
    });
    applyAudiogram();
  }
  
  function applyAudiogram() {
    if (!currentAudiogram || !filterBank) return;
    
    filterBank.applyAudiogram(currentAudiogram);
    
    // Update attenuation displays
    const atts = filterBank.getAttenuations();
    Object.keys(attDisplays).forEach(freq => {
      const info = atts[freq];
      attDisplays[freq].textContent = info.enabled 
        ? `-${Math.round(info.attenuationDb)} dB` 
        : 'OFF';
    });
    
    // Update spectrogram overlay
    spectrogram.drawAudiogramOverlay(currentAudiogram);
  }
  
  function setMode(filtered) {
    isFiltered = filtered;
    
    // Update button states
    els.btnFull.classList.toggle('active', !filtered);
    els.btnFiltered.classList.toggle('active', filtered);
    
    // Apply to filter bank
    filterBank.setEnabled(filtered);
    
    console.log('Mode:', filtered ? 'filtered' : 'full');
  }
  
  function handlePlay() {
    if (!audioEngine.audioBuffer) return;
    
    // Resume context if needed
    if (audioEngine.ctx.state === 'suspended') {
      audioEngine.ctx.resume();
    }
    
    // Update button states
    els.btnPlay.disabled = true;
    els.btnStop.disabled = false;
    
    // Play
    audioEngine.play();
    
    console.log('Playing');
  }
  
  function handleStop() {
    audioEngine.stop();
    
    els.btnPlay.disabled = false;
    els.btnStop.disabled = true;
    
    console.log('Stopped');
  }
  
  function handleVolumeChange(e) {
    const value = parseInt(e.target.value);
    els.volumeValue.textContent = value + '%';
    
    if (audioEngine) {
      audioEngine.setVolume(value / 100);
    }
  }
  
  function startLevelMonitoring() {
    levelCheckInterval = setInterval(() => {
      if (!safetyChain) return;
      
      const level = safetyChain.getLevel();
      
      // Update level meter UI
      const percent = Math.min(100, Math.max(0, (level.spl / 100) * 100));
      els.levelFill.style.width = percent + '%';
      els.levelValue.textContent = Math.round(level.spl) + ' dB SPL';
      
      // Warning states
      els.levelFill.classList.toggle('warning', level.isWarning);
      els.levelFill.classList.toggle('danger', level.isDanger);
      els.levelWarning.classList.toggle('hidden', !level.isWarning && !level.isDanger);
      
      // Get spectrogram data from analyser
      const freqData = audioEngine.getAnalyserData();
      if (freqData) {
        spectrogram.addData(freqData);
      }
      
    }, 50); // 20fps update
  }
  
  function handleKeydown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      if (audioEngine.isPlaying) {
        handleStop();
      } else {
        handlePlay();
      }
    } else if (e.code === 'KeyF') {
      setMode(!isFiltered);
    }
  }
  
  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', init);
  
})();
