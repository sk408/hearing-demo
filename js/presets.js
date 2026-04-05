// Preset Audiograms — Factory configurations for common loss patterns

const PRESETS = {
  mild: {
    name: 'Mild Hearing Loss',
    description: 'Slight difficulty with soft speech',
    thresholds: {
      125: 25,
      250: 25,
      500: 30,
      1000: 35,
      2000: 40,
      4000: 45,
      8000: 40
    }
  },
  moderate: {
    name: 'Moderate Hearing Loss',
    description: 'Difficulty with normal conversation',
    thresholds: {
      125: 30,
      250: 35,
      500: 45,
      1000: 55,
      2000: 60,
      4000: 65,
      8000: 60
    }
  },
  severe: {
    name: 'Severe Hearing Loss',
    description: 'Loud speech only, misses consonants',
    thresholds: {
      125: 50,
      250: 55,
      500: 65,
      1000: 75,
      2000: 80,
      4000: 85,
      8000: 80
    }
  },
  profound: {
    name: 'Profound Hearing Loss',
    description: 'Very loud sounds or vibration only',
    thresholds: {
      125: 70,
      250: 75,
      500: 85,
      1000: 90,
      2000: 95,
      4000: 100,
      8000: 95
    }
  }
};

// Flat audiogram (normal hearing) for reference
const NORMAL = {
  125: 0,
  250: 0,
  500: 0,
  1000: 0,
  2000: 0,
  4000: 0,
  8000: 0
};

// Typical presbycusis (age-related, high-frequency loss)
const PRESBYCUSIS = {
  name: 'Typical Age-Related Loss',
  description: 'High frequencies affected, speech clarity reduced',
  thresholds: {
    125: 15,
    250: 15,
    500: 20,
    1000: 25,
    2000: 40,
    4000: 60,
    8000: 70
  }
};

// Noise-induced (4kHz notch)
const NOISE_INDUCED = {
  name: 'Noise-Induced (4kHz Notch)',
  description: 'Common in industrial/military exposure',
  thresholds: {
    125: 10,
    250: 10,
    500: 15,
    1000: 20,
    2000: 35,
    4000: 55,  // The notch
    8000: 45
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PRESETS, NORMAL, PRESBYCUSIS, NOISE_INDUCED };
}
