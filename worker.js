// worker.js — runs Whisper (via Transformers.js) off the main thread.
// Loaded as a module worker from index.html.

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4';

// Let the library manage its own WASM/WebGPU backend selection + caching.
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;
let currentModelId = null;

const MODELS = {
  // Multilingual Whisper models, hosted as ONNX by Xenova for Transformers.js.
  // We default to 'base' for accuracy on whispers/noise; 'tiny' is offered
  // as a faster/lighter fallback for weak phones.
  tiny: 'Xenova/whisper-tiny',
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
};

async function ensureModel(modelKey, dtype) {
  const modelId = MODELS[modelKey] || MODELS.base;
  if (transcriber && currentModelId === modelId) return transcriber;

  postMessage({ type: 'status', status: 'loading', message: `Loading ${modelId}...` });

  const progressCallback = (p) => {
    if (p.status === 'progress') {
      postMessage({
        type: 'progress',
        file: p.file,
        progress: p.progress,
        loaded: p.loaded,
        total: p.total,
      });
    }
  };

  postMessage({ type: 'status', status: 'loading', message: 'Loading on CPU (WASM); GPU is not required.' });
  transcriber = await pipeline('automatic-speech-recognition', modelId, {
    dtype: dtype || 'q8',
    device: 'wasm',
    progress_callback: progressCallback,
  });

  currentModelId = modelId;
  postMessage({ type: 'status', status: 'ready', message: `${modelId} ready` });
  return transcriber;
}

self.onmessage = async (e) => {
  const { type } = e.data;

  if (type === 'load') {
    try {
      await ensureModel(e.data.modelKey, e.data.dtype);
    } catch (err) {
      postMessage({ type: 'error', message: 'Model load failed: ' + err.message });
    }
    return;
  }

  if (type === 'transcribe') {
    const { audio, id, translateToEnglish, sourceLanguage } = e.data;
    try {
      if (!transcriber) {
        postMessage({ type: 'error', message: 'Model not loaded yet.' });
        return;
      }

      // task: 'translate' makes Whisper output English text regardless of
      // the spoken language (Hindi/Bengali -> English), which is what the
      // user asked for. task: 'transcribe' keeps the original language.
      const opts = {
        task: translateToEnglish ? 'translate' : 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      };
      if (sourceLanguage && sourceLanguage !== 'auto') {
        opts.language = sourceLanguage;
      }

      const result = await transcriber(audio, opts);
      postMessage({
        type: 'result',
        id,
        text: (result && result.text ? result.text : '').trim(),
      });
    } catch (err) {
      postMessage({ type: 'error', id, message: 'Inference error: ' + err.message });
    }
  }
};