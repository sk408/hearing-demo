# Hearing Demo — Technical Specification

## Purpose
Educational tool for audiologists and hearing aid dispensers. Demonstrates to clients (and staff) exactly what frequency content they're missing due to their hearing loss.

## Core Concept
**Two-phase revelation:**
1. **Normal hearing** — Audio plays at comfortable volume, spectrogram shows full frequency content
2. **Client's reality** — Same audio, frequencies attenuated per their audiogram thresholds, visual overlay shows what's removed

## Target Users
- Hearing aid dispensers demonstrating loss to clients
- Staff training (understanding what clients actually hear)
- Engineer-type clients who want to audit the visual evidence

## Safety Requirements (Non-negotiable)
- Hard limiter at 85 dB SPL equivalent
- Compression ratio 10:1 above 70 dB
- Visual level meter with yellow/red warnings
- Operator confirmation for output >80 dB
- Auto-reset if audio engine drops (prevents stuck output)

## Functional Spec

### Phase 1: Setup
1. **Load audio** — Drag-and-drop or file picker (WAV, MP3, OGG)
2. **Audiogram input** — Manual entry or preset selection (mild/mod/severe/profound patterns)
3. **Operator calibration** — Operator listens, adjusts master volume to "comfortable/understandable"
4. **System locks** — Maximum output capped at operator's selected level + 6 dB safety margin

### Phase 2: Normal Demo
- Spectrogram displays full audio signal in full color
- Client hears audio at calibrated volume
- Family member / dispenser: "I can understand this clearly"

### Phase 3: Reality Demo (The Reveal)
- Toggle switch: "Show what reaches your ears"
- Filter bank applies per-frequency attenuation based on audiogram
- Spectrogram overlay: 
  - Normal signal: desaturated/ghosted background
  - Filtered signal: active colored foreground
- Client hears attenuated version
- Visual makes the gap undeniable

### Phase 4: Recovery (Optional)
- Per-band sliders allow operator to restore specific frequencies
- "Let's bring back just the 3-4kHz range" — client hears consonants return
- Leads naturally to "hearing aids do this automatically"

## Technical Architecture

### Audio Engine
- **Web Audio API** — AnalyserNode for spectrogram, DynamicsCompressorNode for safety
- **Filter Bank** — 6 overlapping bands (125, 250, 500, 1000, 2000, 4000, 8000 Hz)
- **Gain Staging** — Per-band gain nodes modulated by audiogram thresholds
- **Source** — AudioBufferSourceNode for file playback, looped for continuous demo

### Visual Engine
- **Spectrogram** — Canvas-based waterfall display
  - FFT size: 2048 (balance of resolution/latency)
  - Colormap: Inferno or Viridis (perceptually uniform, colorblind-safe)
  - Frequency axis: Linear or Mel scale (toggle)
- **Overlay System** — Dual-layer canvas
  - Background layer: Full signal (ghosted, 30% opacity)
  - Foreground layer: Filtered signal (full color)
- **Audiogram Display** — Overlay curve showing thresholds on frequency axis

### Safety Chain
```
[AudioBuffer] → [Per-Band Gain] → [Compressor (10:1, -70dB)] → [Limiter (-85dB)] → [Master Gain] → [Destination]
```

### Data Model
```typescript
interface Audiogram {
  ear: 'left' | 'right' | 'both';
  thresholds: {
    125: number;   // dB HL
    250: number;
    500: number;
    1000: number;
    2000: number;
    4000: number;
    8000: number;
  };
}

interface DemoState {
  audioFile: AudioBuffer | null;
  operatorMaxLevel: number;  // dB
  isPlaying: boolean;
  showFiltered: boolean;
  activeBands: number[];     // Which frequencies are attenuated
}
```

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Load Audio]  [Audiogram ▼]  [Play/Stop]  [Mode: Full ▼]│  ← Toolbar
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    SPECTROGRAM                          │
│              (waterfall visualization)                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  [Full] ←─────Toggle─────→ [Your Hearing]    │   │  ← Mode Switch
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  [■] 125Hz  [■] 250Hz  [■] 500Hz  [■] 1k  [■] 2k ... │  ← Per-band toggles
│     ↓30dB      ↓40dB      ↓50dB ...                   │
├─────────────────────────────────────────────────────────┤
│  Level: ████████░░░░░░  [   72 dB   ] ⚠️              │  ← Safety meter
└─────────────────────────────────────────────────────────┘
```

## Milestones

### MVP (Week 1) ✅ Complete
- [x] Audio file loading (WAV/MP3)
- [x] Basic spectrogram display
- [x] Master volume control
- [x] Manual audiogram entry
- [x] Filter bank application
- [x] Toggle: Full vs Filtered

### V2 Improvements (Just Shipped)
- [x] Speech banana overlay — shows where speech sounds live on spectrogram
- [x] Smoother filter bank — peaking EQ instead of bandpass, eliminates artifacts
- [x] Hold-to-compare — spacebar or click-and-hold for momentary A/B
- [x] Correct scroll direction — left-to-right (matches clinical speech software)
- [x] Better attenuation curve — more realistic simulation
- [x] GitHub Pages deployment — live demo ready

### V1 (Week 2)
- [ ] Safety chain (limiter + compressor)
- [ ] Level meter with warnings
- [ ] Per-band toggles
- [ ] Audiogram overlay on spectrogram
- [ ] Preset audiograms (mild/mod/severe)

### V1.1 (Week 3)
- [ ] Drag-and-drop file loading
- [ ] Keyboard shortcuts (space = play/pause, F = toggle mode)
- [ ] Screenshot button
- [ ] Presentation mode (hides controls, fullscreen spectrogram)

### V1.2 (Future)
- [ ] Record and save audio from mic
- [ ] A/B comparison with recorded speech
- [ ] Export demo video/GIF
- [ ] Multiple audiogram profiles (compare mild vs severe)

## File Structure

```
hearing-demo/
├── index.html          # Main entry
├── css/
│   └── demo.css        # Styles
├── js/
│   ├── app.js          # Top-level controller
│   ├── audio-engine.js # Web Audio API setup
│   ├── filter-bank.js  # Per-band attenuation
│   ├── spectrogram.js  # Canvas visualization
│   ├── safety-chain.js # Limiter/compressor
│   ├── audiogram-ui.js # Input/management
│   └── presets.js      # Factory audiograms
├── assets/
│   └── sample-speech/  # Demo audio files
└── README.md
```

## Open Questions
1. Should we include sample audio files (fair use speech clips) or require user to load their own?
2. Do we need speech-in-noise scenario, or just clean speech?
3. Export functionality — video or just audio comparison?

## Risks
- Browser autoplay restrictions require user gesture to start audio
- Mobile Safari Web Audio API limitations
- Client recruitment means even "safe" levels can be uncomfortable — need client feedback loop

## Success Criteria
- Demo loads in <3 seconds on modern browser
- Spectrogram renders at 30fps minimum
- Audio playback has <50ms latency
- Safety chain prevents any output >85 dB SPL equivalent
- Client can understand the visual within 30 seconds of first toggle
