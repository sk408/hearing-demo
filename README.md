# Hearing Demo

Visual demonstration tool for hearing loss. Shows clients exactly what frequency content they're missing — and what hearing aids could restore.

## What It Does

**For Clients in Denial:**
1. Play speech at comfortable volume
2. Show the full spectrogram — "This is what's in the room"
3. Toggle to "Your hearing" — frequencies fade out based on their audiogram
4. The gap becomes visible and audible. Undeniable.

**For Staff Training:**
- Understand frequency-specific loss
- Practice explaining hearing to clients
- Learn why "I hear fine" and "I miss words" coexist

## Live Demo
**[Try it now →](https://sk408.github.io/hearing-demo/)**

No install needed — works in any modern browser. Use headphones for best results.

## Quick Start

```bash
git clone https://github.com/sk408/hearing-demo.git
cd hearing-demo
# Open index.html in browser
# Or serve locally:
python -m http.server 8000
```

## Usage

1. **Load audio** — Your own file or sample speech
2. **Enter audiogram** — Frequencies and thresholds (or pick a preset)
3. **Set comfortable level** — Operator listens, adjusts volume
4. **Demo** — Toggle between Full and Client modes

## Safety

- Hard limiter: 85 dB SPL max
- Compression: 10:1 above 70 dB
- Visual meter with warnings
- Client feedback required for >80 dB

## Tech Stack

- Vanilla JS (no framework, loads fast)
- Web Audio API
- Canvas 2D spectrogram
- No build step — works from `file://` or any server

## Spec

See [SPEC.md](SPEC.md) for full technical specification.

## License

MIT
