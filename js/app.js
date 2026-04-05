// App.js — Main controller for Hearing Demo
// Orchestrates audio engine, filter bank, safety chain, and spectrogram

(function () {
  'use strict';

  let audioEngine = null;
  let filterBank = null;
  let safetyChain = null;
  let spectrogram = null;
  let currentAudiogram = null;
  let isFiltered = false;
  let audioInitialized = false;

  let els = {};
  let freqInputs = {};
  let bandChecks = {};
  let attDisplays = {};

  // --- Initialization ---

  async function init() {
    cacheDOMElements();

    // Create spectrogram immediately (visual only, no audio context needed)
    spectrogram = new Spectrogram('spectrogram', 'overlay');

    // Initialize audio eagerly so demo sample is ready
    await initAudio();

    setupEventListeners();
    startAnimationLoop();
  }

  function cacheDOMElements() {
    els = {
      btnLoad: document.getElementById('btn-load'),
      btnMic: document.getElementById('btn-mic'),
      audioInput: document.getElementById('audio-input'),
      btnPlay: document.getElementById('btn-play'),
      btnStop: document.getElementById('btn-stop'),
      btnFull: document.getElementById('btn-full'),
      btnFiltered: document.getElementById('btn-filtered'),
      audiogramPanel: document.getElementById('audiogram-panel'),
      masterVolume: document.getElementById('master-volume'),
      volumeValue: document.getElementById('volume-value'),
      levelFill: document.getElementById('level-fill'),
      levelValue: document.getElementById('level-value'),
      levelWarning: document.getElementById('level-warning'),
      dropZone: document.getElementById('drop-zone'),
      fileName: document.getElementById('file-name'),
      presetDesc: document.getElementById('preset-description'),
      safetyThreshold: document.getElementById('safety-threshold'),
      thresholdValue: document.getElementById('threshold-value')
    };

    [125, 250, 500, 1000, 2000, 4000, 8000].forEach(f => {
      freqInputs[f] = document.getElementById('thr-' + f);
      bandChecks[f] = document.getElementById('band-' + f);
      attDisplays[f] = document.getElementById('att-' + f);
    });
  }

  async function initAudio() {
    if (audioInitialized) return;

    audioEngine = new AudioEngine();
    await audioEngine.init();

    filterBank = new FilterBank(audioEngine.ctx);
    safetyChain = new SafetyChain(audioEngine.ctx);

    // Audio chain: source -> filterBank -> safetyChain -> analyser -> masterGain -> destination
    filterBank.connect(safetyChain.input);
    safetyChain.connect(audioEngine.analyser);
    audioEngine.analyser.connect(audioEngine.masterGain);
    audioEngine.masterGain.connect(audioEngine.ctx.destination);

    spectrogram.setSampleRate(audioEngine.getSampleRate());

    // Set initial volume
    const vol = parseInt(els.masterVolume.value) / 100;
    audioEngine.setVolume(vol);

    // Generate built-in demo sample so it works without loading a file
    audioEngine.generateDemoSample();
    els.btnPlay.disabled = false;

    audioInitialized = true;
  }

  // --- Event Listeners ---

  function setupEventListeners() {
    // File loading
    els.btnLoad.addEventListener('click', () => els.audioInput.click());
    els.audioInput.addEventListener('change', (e) => {
      if (e.target.files[0]) loadAudioFile(e.target.files[0]);
    });

    setupDragDrop();

    // Preset buttons
    document.querySelectorAll('.btn-preset').forEach(btn => {
      btn.addEventListener('click', () => selectPreset(btn.dataset.preset));
    });

    // Custom threshold inputs
    Object.values(freqInputs).forEach(input => {
      if (input) input.addEventListener('change', updateAudiogramFromInputs);
    });

    // Microphone
    els.btnMic.addEventListener('click', handleMicToggle);

    // Playback
    els.btnPlay.addEventListener('click', handlePlay);
    els.btnStop.addEventListener('click', handleStop);

    // Mode toggle
    els.btnFull.addEventListener('click', () => setMode(false));
    els.btnFiltered.addEventListener('click', () => setMode(true));

    // Band toggles
    Object.keys(bandChecks).forEach(freq => {
      if (bandChecks[freq]) {
        bandChecks[freq].addEventListener('change', (e) => {
          if (filterBank) filterBank.setBandEnabled(parseInt(freq), e.target.checked);
        });
      }
    });

    // Volume
    els.masterVolume.addEventListener('input', handleVolumeChange);

    // Safety threshold
    if (els.safetyThreshold) {
      els.safetyThreshold.addEventListener('input', handleThresholdChange);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
  }

  function setupDragDrop() {
    const zone = els.dropZone;
    if (!zone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
      document.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
    });

    zone.addEventListener('dragenter', () => zone.classList.add('drag-over'));
    zone.addEventListener('dragover', () => zone.classList.add('drag-over'));
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) loadAudioFile(file);
    });

    zone.addEventListener('click', () => els.audioInput.click());
  }

  // --- Audio Loading ---

  async function loadAudioFile(file) {
    try {
      await initAudio();
      await audioEngine.loadFile(file);
      els.btnPlay.disabled = false;
      if (els.fileName) els.fileName.textContent = file.name;
      if (els.dropZone) els.dropZone.classList.add('hidden');
      spectrogram.resize();
    } catch (err) {
      if (els.fileName) els.fileName.textContent = 'Error loading file';
      console.error('Audio load failed:', err);
    }
  }

  // --- Audiogram ---

  function selectPreset(presetKey) {
    document.querySelectorAll('.btn-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });

    if (presetKey === 'custom') {
      if (els.audiogramPanel) els.audiogramPanel.classList.remove('hidden');
      if (els.presetDesc) els.presetDesc.textContent = 'Enter custom thresholds below';
      return;
    }

    const preset = PRESETS[presetKey];
    if (!preset) return;

    if (els.audiogramPanel) els.audiogramPanel.classList.remove('hidden');
    if (els.presetDesc) els.presetDesc.textContent = preset.description;

    currentAudiogram = { ...preset.thresholds };
    updateInputsFromAudiogram(currentAudiogram);
    applyAudiogram();
  }

  function updateInputsFromAudiogram(thresholds) {
    Object.keys(freqInputs).forEach(freq => {
      if (freqInputs[freq]) freqInputs[freq].value = thresholds[freq] || 0;
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

    const atts = filterBank.getAttenuations();
    Object.keys(attDisplays).forEach(freq => {
      if (!attDisplays[freq]) return;
      const info = atts[freq];
      if (info.attenuationDb > 0) {
        attDisplays[freq].textContent = '-' + Math.round(info.attenuationDb) + ' dB';
        attDisplays[freq].classList.add('has-loss');
      } else {
        attDisplays[freq].textContent = '0 dB';
        attDisplays[freq].classList.remove('has-loss');
      }
    });

    spectrogram.drawAudiogramOverlay(currentAudiogram);
  }

  // --- Mode Toggle ---

  function setMode(filtered) {
    if (filtered && !currentAudiogram) {
      if (els.presetDesc) {
        els.presetDesc.textContent = 'Select a hearing profile first to hear the difference';
        els.presetDesc.classList.add('hint');
        setTimeout(() => els.presetDesc.classList.remove('hint'), 2000);
      }
      return;
    }

    isFiltered = filtered;
    els.btnFull.classList.toggle('active', !filtered);
    els.btnFiltered.classList.toggle('active', filtered);
    if (filterBank) filterBank.setEnabled(filtered);
  }

  // --- Playback ---

  async function handlePlay() {
    try { await initAudio(); } catch (err) { console.error('Audio init failed:', err); return; }
    if (!audioEngine || !audioEngine.audioBuffer) return;

    // Stop mic if active
    if (audioEngine.isMicActive) {
      audioEngine.stopMic();
      els.btnMic.textContent = '\u{1F3A4} Use Microphone';
      els.btnMic.classList.remove('active');
      els.btnLoad.disabled = false;
    }

    // Resume context if suspended by browser autoplay policy
    if (audioEngine.ctx.state === 'suspended') {
      await audioEngine.ctx.resume();
    }

    audioEngine.play(filterBank.input);
    els.btnPlay.disabled = true;
    els.btnStop.disabled = false;

    // Hide drop zone when playing
    if (els.dropZone) els.dropZone.classList.add('hidden');
  }

  function handleStop() {
    if (audioEngine) audioEngine.stop();
    els.btnPlay.disabled = false;
    els.btnStop.disabled = true;
  }

  async function handleMicToggle() {
    await initAudio();

    if (audioEngine.isMicActive) {
      // Stop mic
      audioEngine.stopMic();
      els.btnMic.textContent = '\u{1F3A4} Use Microphone';
      els.btnMic.classList.remove('active');
      if (els.fileName) els.fileName.textContent = audioEngine.audioBuffer ? 'File loaded' : 'Built-in demo sample';
      els.btnPlay.disabled = !audioEngine.audioBuffer;
      els.btnLoad.disabled = false;
      return;
    }

    try {
      // Stop file playback if active
      handleStop();

      await audioEngine.startMic(filterBank.input);

      els.btnMic.textContent = '\u{1F534} Stop Mic';
      els.btnMic.classList.add('active');
      if (els.fileName) els.fileName.textContent = 'Listening...';
      els.btnPlay.disabled = true;
      els.btnStop.disabled = true;
      els.btnLoad.disabled = true;
      if (els.dropZone) els.dropZone.classList.add('hidden');
    } catch (err) {
      console.error('Microphone access denied:', err);
      if (els.fileName) els.fileName.textContent = 'Mic access denied';
    }
  }

  // --- Volume & Safety ---

  function handleVolumeChange(e) {
    const value = parseInt(e.target.value);
    els.volumeValue.textContent = value + '%';
    if (audioEngine) audioEngine.setVolume(value / 100);
  }

  function handleThresholdChange(e) {
    const dbfs = parseInt(e.target.value);
    if (els.thresholdValue) els.thresholdValue.textContent = dbfs + ' dBFS';
    if (safetyChain) safetyChain.setUserThreshold(dbfs);
  }

  // --- Animation Loop ---

  function startAnimationLoop() {
    function tick() {
      // Feed spectrogram (file playback or mic input)
      const isActive = audioEngine && (audioEngine.isPlaying || audioEngine.isMicActive);
      if (isActive) {
        const freqData = audioEngine.getAnalyserData();
        if (freqData) spectrogram.addData(freqData);
      }

      spectrogram.draw();

      // Update level meter
      if (safetyChain && isActive) {
        const level = safetyChain.getLevel();
        const percent = Math.min(100, Math.max(0, (level.dbfs + 100)));
        els.levelFill.style.width = percent + '%';
        els.levelValue.textContent = Math.round(level.dbfs) + ' dBFS';
        els.levelFill.classList.toggle('warning', level.isWarning);
        els.levelFill.classList.toggle('danger', level.isDanger);
        els.levelWarning.classList.toggle('hidden', !level.isWarning && !level.isDanger);
      }

      requestAnimationFrame(tick);
    }
    tick();
  }

  // --- Keyboard Shortcuts ---

  function handleKeydown(e) {
    // Don't trigger when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (audioEngine && audioEngine.isPlaying) handleStop();
      else handlePlay();
    } else if (e.code === 'KeyF') {
      e.preventDefault();
      setMode(!isFiltered);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
