# Live Chord Detector (FIRST DEMO)

This project is a web application that captures live microphone input, extracts audio features using [Essentia.js](https://github.com/MTG/essentia.js), and performs real-time chord and note detection. The app leverages modern browser audio APIs, including AudioWorklet, to capture and process audio in fixed-size buffers. A smoothing mechanism is applied to reduce rapid fluctuations in detection results, and the detected chord and notes remain visible even when the input signal is low.

## Features

- **Live Microphone Capture:**  
  Uses AudioWorklet to capture microphone input in small chunks and accumulates samples until a full processing buffer is reached.

- **Essentia.js Integration:**  
  Utilizes Essentia.js to extract HPCP (Harmonic Pitch Class Profile) features from the audio signal.

- **Real-Time Chord & Note Detection:**  
  Detects chords by comparing the computed HPCP vector against a set of chord templates (major chords by default) and extracts the dominant pitches (notes) with a strength threshold.

- **Smoothing & Stability:**  
  Accumulates multiple HPCP vectors over a smoothing interval (500 ms) to produce stable detection results.

- **Downward Pitch Correction:**  
  Applies a three-semitone downward shift to correct any offset in the detected pitches.

## Getting Started

1. **Clone or Download the Repository:**

    ```bash
    git clone https://github.com/Coin-Gulter/Live_chord.git
    cd live-chord
    ```
Serve the Project:

Since the app uses AudioWorklet and WebAssembly, it must be served over HTTP/HTTPS. For example, using http-server:

    ```bash
    python -m http.server
    ```

Then open your browser to the served URL (e.g., http://localhost:8080)

Usage:

Click the Start Listening button to initialize microphone capture and start real-time chord detection.
The detected chord and dominant notes will update on the screen.
Click the Stop Listening button to stop the audio stream. The last valid result remains visible.
Dependencies
Essentia.js (via CDN)
Browser support for AudioWorklet and WebAssembly
Notes
The default buffer size is 8192 samples, and the hop size is 512 samples.
The app currently detects only major chords. You can extend the chord template definitions to include minor, diminished, or other chord types.
This project is intended as a proof-of-concept and starting point for real-time audio analysis using web technologies.