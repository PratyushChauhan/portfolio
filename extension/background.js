/* background.js — Service worker for Supertonic Narrator v1 (Web Speech API) */

let currentUtterance = null;
let synth = null;

function getSynth() {
  if (!synth) synth = window.speechSynthesis;
  return synth;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const s = getSynth();

  if (request.action === 'speak') {
    if (currentUtterance) {
      s.cancel();
    }
    const u = new SpeechSynthesisUtterance(request.text);
    u.rate = request.rate ?? 1.0;
    u.pitch = request.pitch ?? 1.0;
    u.lang = request.lang ?? 'en-US';

    // Try to match voice by name if provided
    if (request.voiceName) {
      const voices = s.getVoices();
      const match = voices.find(v => v.name.includes(request.voiceName));
      if (match) u.voice = match;
    }

    u.onstart = () => {
      chrome.runtime.sendMessage({ action: 'state', state: 'playing' });
    };
    u.onend = () => {
      currentUtterance = null;
      chrome.runtime.sendMessage({ action: 'state', state: 'stopped' });
    };
    u.onerror = (e) => {
      currentUtterance = null;
      chrome.runtime.sendMessage({ action: 'state', state: 'error', error: e.error });
    };

    currentUtterance = u;
    s.speak(u);
    sendResponse({ ok: true });

  } else if (request.action === 'pause') {
    s.pause();
    chrome.runtime.sendMessage({ action: 'state', state: 'paused' });
    sendResponse({ ok: true });

  } else if (request.action === 'resume') {
    s.resume();
    chrome.runtime.sendMessage({ action: 'state', state: 'playing' });
    sendResponse({ ok: true });

  } else if (request.action === 'stop') {
    s.cancel();
    currentUtterance = null;
    chrome.runtime.sendMessage({ action: 'state', state: 'stopped' });
    sendResponse({ ok: true });

  } else if (request.action === 'getVoices') {
    const voices = s.getVoices().map(v => ({
      name: v.name,
      lang: v.lang,
      default: v.default,
      local: v.localService,
    }));
    sendResponse({ voices });

  } else if (request.action === 'getState') {
    sendResponse({
      speaking: s.speaking,
      paused: s.paused,
      pending: s.pending,
    });
  }

  return true; // keep channel open for async
});
