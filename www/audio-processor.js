// audio-processor.js
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      // Send a copy of the audio data to the main thread.
      this.port.postMessage(input[0]);
    }
    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
