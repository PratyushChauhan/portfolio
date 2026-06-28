/* background.js — v3: Single-stream TTS (one request, progressive playback) */

const DEFAULT_SERVER = 'https://ciphersserver.tail667d54.ts.net/tts';

let currentAudio = null;
let aborted = false;
let isPlaying = false;
let isPaused = false;
let bytesReceived = 0;
let totalDuration = 0;

// Offscreen document for audio playback (required in MV3)
let offscreenReady = false;

async function ensureOffscreen() {
  if (offscreenReady) return;
  if (chrome.offscreen) {
    const hasDoc = await chrome.offscreen.hasDocument?.() ?? false;
    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play streamed TTS audio',
      });
    }
    offscreenReady = true;
  }
}

// Collect stream chunks into a Blob, start playback when ready
async function streamTTS(text, config) {
  const server = config.server || DEFAULT_SERVER;
  const voice = config.voice || 'M1';
  const speed = config.speed ?? 1.0;
  const format = config.format || 'mp3';

  aborted = false;
  bytesReceived = 0;

  broadcastState('buffering', { format });

  try {
    // Single HTTP request for entire text
    const resp = await fetch(`${server}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        speed,
        response_format: format,
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (!resp.body) throw new Error('No response body');

    // Read chunks progressively into a Blob
    const reader = resp.body.getReader();
    const chunks = [];

    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      bytesReceived += value.byteLength;

      // Start playback once we have enough buffered (first ~50KB)
      if (!isPlaying && bytesReceived > 50000) {
        const blob = new Blob(chunks, { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
        startPlayback(blob);
      }

      broadcastState('playing', { bytesReceived, buffered: chunks.length });
    }

    if (aborted) {
      cleanup();
      broadcastState('stopped');
      return;
    }

    // Final blob with complete audio
    const finalBlob = new Blob(chunks, { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });

    if (!isPlaying) {
      await startPlayback(finalBlob);
    } else {
      // Update offscreen with final blob
      await updatePlayback(finalBlob);
    }

    broadcastState('playing', { bytesReceived, complete: true });

  } catch (err) {
    console.error('Stream error:', err);
    broadcastState('error', { error: err.message });
    cleanup();
  }
}

async function startPlayback(blob) {
  await ensureOffscreen();
  const url = URL.createObjectURL(blob);

  await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'play',
    url,
  });

  isPlaying = true;
  isPaused = false;
}

async function updatePlayback(blob) {
  await ensureOffscreen();
  const url = URL.createObjectURL(blob);

  await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'update',
    url,
  });
}

function cleanup() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  isPlaying = false;
  isPaused = false;
  bytesReceived = 0;
}

function broadcastState(state, meta = {}) {
  chrome.runtime.sendMessage({ action: 'state', state, meta }).catch(() => {});
}

// Message router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === 'speak') {
      // Stop any current playback
      aborted = true;
      cleanup();
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' }).catch(() => {});

      aborted = false;
      const config = await chrome.storage.local.get(['server', 'voice', 'speed', 'pitch', 'format']);
      streamTTS(request.text, config);
      sendResponse({ ok: true, mode: 'stream-v3' });

    } else if (request.action === 'pause') {
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'pause' }).catch(() => {});
      isPaused = true;
      broadcastState('paused');
      sendResponse({ ok: true });

    } else if (request.action === 'resume') {
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'resume' }).catch(() => {});
      isPaused = false;
      broadcastState('playing');
      sendResponse({ ok: true });

    } else if (request.action === 'stop') {
      aborted = true;
      cleanup();
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' }).catch(() => {});
      broadcastState('stopped');
      sendResponse({ ok: true });

    } else if (request.action === 'getState') {
      sendResponse({
        speaking: isPlaying && !isPaused,
        paused: isPaused,
        bytesReceived,
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
