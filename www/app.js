// app.js
// URLs for Essentia.js modules
const ESSENTIA_WASM_URL =
  "https://cdn.jsdelivr.net/npm/essentia.js@0.1.0/dist/essentia-wasm.web.js";
const ESSENTIA_EXTRACTOR_URL =
  "https://cdn.jsdelivr.net/npm/essentia.js@0.1.0/dist/essentia.js-extractor.js";

// Utility function to dynamically load external scripts.
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script ${url}`));
    document.head.appendChild(script);
  });
}

// Helper function to shift (rotate) an HPCP vector by a given number of semitones.
function shiftHPCP(hpcp, shift = -1) {
  const len = hpcp.length;
  let shifted = new Array(len);
  for (let i = 0; i < len; i++) {
    shifted[(i + shift + len) % len] = hpcp[i];
  }
  return shifted;
}

// Generate a chord template vector for a given chord type.
function generateChordTemplate(rootIndex, intervals) {
  const template = new Array(12).fill(0);
  intervals.forEach(interval => {
    template[(rootIndex + interval) % 12] = 1.0;
  });
  return template;
}

// Generate chord templates for all 12 roots and several chord types.
function generateChordTemplates() {
  const noteNames = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
  ];
  const chordTypes = {
    "maj": [0, 4, 7],
    "min": [0, 3, 7],
    "dim": [0, 3, 6],
    "aug": [0, 4, 8],
    "7": [0, 4, 7, 10],
    // "maj7": [0, 4, 7, 11],
    // "min7": [0, 3, 7, 10]
  };

  const templates = {};
  for (let i = 0; i < 12; i++) {
    for (const [type, intervals] of Object.entries(chordTypes)) {
      templates[`${noteNames[i]}:${type}`] = generateChordTemplate(i, intervals);
    }
  }
  return templates;
}

// Calculate cosine similarity between two vectors.
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Given an HPCP vector, detect the chord by comparing to our templates.
function detectChord(hpcpVector, chordTemplates) {
  let bestChord = null, bestScore = -Infinity;
  for (const chord in chordTemplates) {
    const score = cosineSimilarity(hpcpVector, chordTemplates[chord]);
    if (score > bestScore) {
      bestScore = score;
      bestChord = chord;
    }
  }
  return bestChord;
}

// Extract and rank note strengths from the HPCP vector.
function detectNotes(hpcpVector, threshold = 0.12) {
  const noteNames = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
  ];
  let notes = [];
  for (let i = 0; i < hpcpVector.length; i++) {
    notes.push({ note: noteNames[i], value: hpcpVector[i] });
  }
  // Filter notes above threshold and sort descending.
  notes = notes.filter(n => n.value >= threshold).sort((a, b) => b.value - a.value);
  return notes;
}

// Global variables.
let essentiaExtractor = null;
let audioCtx = null;
let gumStream = null;
let audioWorkletNode = null;
let gainNode = null;
const BUFFER_SIZE = 8192; // Desired number of samples per processing block.
const HOP_SIZE = 512;
const chordTemplates = generateChordTemplates();
let isRecording = false;

// Variables for smoothing.
let hpcpAccumulation = [];
const SMOOTHING_INTERVAL = 250; // milliseconds
let lastSmoothingTime = performance.now();

// To store last valid result.
let lastChordResult = "None";
let lastNotesResult = "None";

// Accumulator for incoming audio samples.
let sampleAccumulator = [];

// Set up microphone input using AudioWorklet.
async function startAudioWorkletStream() {
  await loadScript(ESSENTIA_WASM_URL);
  await loadScript(ESSENTIA_EXTRACTOR_URL);

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    alert("Could not instantiate AudioContext: " + e.message);
    return;
  }

  EssentiaWASM().then((essentiaWasmModule) => {
    essentiaExtractor = new EssentiaExtractor(essentiaWasmModule);
    essentiaExtractor.frameSize = BUFFER_SIZE;
    essentiaExtractor.hopSize = HOP_SIZE;
    essentiaExtractor.sampleRate = audioCtx.sampleRate;
  });

  try {
    gumStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    alert("Could not access microphone: " + e.message);
    return;
  }

  const micSource = audioCtx.createMediaStreamSource(gumStream);

  try {
    await audioCtx.audioWorklet.addModule("audio-processor.js");
  } catch (e) {
    alert("AudioWorklet module failed to load: " + e.message);
    return;
  }

  audioWorkletNode = new AudioWorkletNode(audioCtx, "audio-processor");

  audioWorkletNode.port.onmessage = (event) => {
    sampleAccumulator.push(event.data);
    let totalSamples = sampleAccumulator.reduce((sum, arr) => sum + arr.length, 0);
    if (totalSamples >= BUFFER_SIZE) {
      let buffer = new Float32Array(totalSamples);
      let offset = 0;
      for (const arr of sampleAccumulator) {
        buffer.set(arr, offset);
        offset += arr.length;
      }
      if (buffer.length > BUFFER_SIZE) {
        buffer = buffer.subarray(0, BUFFER_SIZE);
      }
      sampleAccumulator = [];

      const rmsResult = essentiaExtractor.RMS(essentiaExtractor.arrayToVector(buffer));
      if (rmsResult.rms < 0.05) {
        return;
      }

      let hpcp = essentiaExtractor.hpcpExtractor(buffer);
      hpcp = shiftHPCP(hpcp, -3);

      hpcpAccumulation.push(hpcp);

      const now = performance.now();
      if (now - lastSmoothingTime >= SMOOTHING_INTERVAL) {
        const avgHPCP = hpcpAccumulation.reduce((acc, curr) => {
          return acc.map((val, i) => val + curr[i]);
        }, new Array(12).fill(0)).map(val => val / hpcpAccumulation.length);

        hpcpAccumulation = [];
        lastSmoothingTime = now;

        const detectedChord = detectChord(avgHPCP, chordTemplates);
        const detectedNotes = detectNotes(avgHPCP, 0.1);
        const topNotes = detectedNotes.map(n => `${n.note} (${n.value.toFixed(2)})`).join(", ");

        lastChordResult = detectedChord;
        lastNotesResult = topNotes;
        document.getElementById("chord-display").innerHTML =
          "Detected Chord: " + lastChordResult + "<br>Notes: " + lastNotesResult;
      }
    }
  };

  gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

  micSource.connect(audioWorkletNode);
  audioWorkletNode.connect(gainNode);
  gainNode.connect(audioCtx.destination);
}

function stopAudioWorkletStream() {
  if (gumStream) {
    gumStream.getAudioTracks().forEach(track => track.stop());
  }
  if (audioWorkletNode) audioWorkletNode.disconnect();
  if (gainNode) gainNode.disconnect();
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
  }
  essentiaExtractor = null;
  audioCtx = null;
  gumStream = null;
  audioWorkletNode = null;
  gainNode = null;
  document.getElementById("chord-display").innerHTML =
    "Last Detected Chord: " + lastChordResult + "<br>Notes: " + lastNotesResult;
  document.getElementById("start-btn").innerHTML = '🎤 Start Listening';
  isRecording = false;
  hpcpAccumulation = [];
  sampleAccumulator = [];
}

document.getElementById("start-btn").addEventListener("click", function () {
  if (!isRecording) {
    this.disabled = true;
    this.innerHTML = 'Initializing...';
    startAudioWorkletStream().then(() => {
      isRecording = true;
      this.disabled = false;
      this.innerHTML = '⏹ Stop Listening';
    });
  } else {
    stopAudioWorkletStream();
  }
});
