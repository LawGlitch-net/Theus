// audio-worklet.js — AudioWorkletProcessor that runs on the audio render
// thread. It just forwards raw Float32 frames (at whatever the context's
// sample rate is) to the main thread in fixed-size blocks; resampling to
// 16kHz and buffering happens on the main thread (cheaper to reason about,
// and avoids doing resampling math on the realtime audio thread).

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = 2048;
    this.buffer = new Float32Array(this.blockSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset >= this.blockSize) {
        // Copy out before posting — the underlying buffer gets reused.
        this.port.postMessage(this.buffer.slice(0));
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);