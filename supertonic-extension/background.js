/* background.js — v2: Supertonic TTS via self-hosted API with sentence streaming */

const DEFAULT_SERVER = 'https://ciphersserver.tail667d54.ts.net/tts';

let offscreenDoc = null;
let audioQueue = [];
let currentSentenceIdx = 0;
let isPlaying = false;
let isPaused = false;
let currentUtterance = null;
let fallbackSynth = null;

// Ensure offscreen document exists for Web Audio API
async function ensureOffscreen() {
  if (offscreenDoc) return;
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play synthesized TTS audio',
  });
  offscreenDoc = true;
}

async function hasOffscreen() {
  const docs = await chrome.offscreen?.hasDocument?.() ?? false;
  return docs;
}

function getSynth() {
  if (!fallbackSynth) {
    fallbackSynth = window.speechSynthesis ?? null;
  }
  return fallbackSynth;
}

// Split text into sentences for streaming
function splitSentences(text) {
  return text
    .replace(/([.!?])(\s+)(?=[A-Z])/g, '$1\n')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 3);
}

// Fetch audio blob from Supertonic API
async function fetchAudio(text, config) {
  const server = config.server || DEFAULT_SERVER;
  const voice = config.voice || 'M1';
  const speed = config.speed ?? 1.0;

  const resp = await fetch(`${server}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      speed,
      response_format: 'mp3',
    }),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.blob();
}

// Play blob audio via offscreen document
async function playBlob(blob) {
  await ensureOffscreen();
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'play',
      url,
    }, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (resp?.error) {
        reject(new Error(resp.error));
        return;
      }
      resolve(resp);
    });
  });
}

// Stop offscreen audio
async function stopAudio() {
  if (await hasOffscreen()) {
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' });
  }
}

// Stream play: queue sentences, fetch next while playing current
async function streamPlay(sentences, config) {
  audioQueue = sentences;
  currentSentenceIdx = 0;
  isPlaying = true;
  isPaused = false;

  broadcastState('playing', { total: sentences.length, current: 0 });

  // Pre-fetch first two sentences
  const prefetches = [];
  for (let i = 0; i < Math.min(2, sentences.length); i++) {
    prefetches.push(fetchAudio(sentences[i], config).catch(() => null));
  }
  let blobs = await Promise.all(prefetches);

  while (currentSentenceIdx < sentences.length && isPlaying) {
    if (isPaused) {
      await waitForResume();
      if (!isPlaying) break;
    }

    const blob = blobs[currentSentenceIdx];
    if (!blob) {
      // Fallback to Web Speech API for this sentence
      await speakFallback(sentences[currentSentenceIdx], config);
    } else {
      try {
        await playBlob(blob);
      } catch (e) {
        await speakFallback(sentences[currentSentenceIdx], config);
      }
    }

    currentSentenceIdx++;

    // Prefetch next sentence
    const nextIdx = currentSentenceIdx + 1;
    if (nextIdx < sentences.length && !blobs[nextIdx]) {
      fetchAudio(sentences[nextIdx], config)
        .then(b => { blobs[nextIdx] = b; })
        .catch(() => { blobs[nextIdx] = null; });
    }

    broadcastState('playing', { total: sentences.length, current: currentSentenceIdx });
  }

  isPlaying = false;
  broadcastState('stopped', { total: sentences.length, current: currentSentenceIdx });
}

function waitForResume() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      if (!isPaused || !isPlaying) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
}

function speakFallback(text, config) {
  return new Promise((resolve) => {
    const synth = getSynth();
    if (!synth) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = config.speed ?? 1.0;
    u.pitch = config.pitch ?? 1.0;
    u.onend = resolve;
    u.onerror = resolve;
    synth.speak(u);
  });
}

function broadcastState(state, meta = {}) {
  chrome.runtime.sendMessage({ action: 'state', state, meta }).catch(() => {});
}

// Message router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === 'speak') {
      const sentences = splitSentences(request.text);
      if (!sentences.length) { sendResponse({ ok: false, error: 'No text' }); return; }

      const config = await chrome.storage.local.get(['server', 'voice', 'speed', 'pitch']);
      streamPlay(sentences, config);
      sendResponse({ ok: true, sentences: sentences.length });

    } else if (request.action === 'pause') {
      isPaused = true;
      stopAudio();
      broadcastState('paused');
      sendResponse({ ok: true });

    } else if (request.action === 'resume') {
      isPaused = false;
      broadcastState('playing');
      sendResponse({ ok: true });

    } else if (request.action === 'stop') {
      isPlaying = false;
      isPaused = false;
      stopAudio();
      const synth = getSynth();
      if (synth) synth.cancel();
      broadcastState('stopped');
      sendResponse({ ok: true });

    } else if (request.action === 'skip') {
      stopAudio();
      currentSentenceIdx = Math.min(currentSentenceIdx + 1, audioQueue.length);
      broadcastState('playing', { total: audioQueue.length, current: currentSentenceIdx });
      sendResponse({ ok: true });

    } else if (request.action === 'getState') {
      sendResponse({
        speaking: isPlaying && !isPaused,
        paused: isPaused,
        total: audioQueue.length,
        current: currentSentenceIdx,
      });

    } else if (request.action === 'testServer') {
      try {
        const server = request.server || DEFAULT_SERVER;
        const resp = await fetch(`${server}/v1/voices`, { method: 'GET' });
        const data = await resp.json();
        sendResponse({ ok: resp.ok, voices: data });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }

    } else {
      sendResponse({ ok: false, error: 'Unknown action' });
    }
  })();
  return true;
});
