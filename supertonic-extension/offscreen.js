/* offscreen.js — Audio playback handler for Manifest V3 offscreen document */

let currentAudio = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'play') {
    if (currentAudio) {
      currentAudio.pause();
      URL.revokeObjectURL(currentAudio.src);
    }
    currentAudio = new Audio(msg.url);
    currentAudio.play().catch(e => {
      sendResponse({ error: e.message });
    });
    currentAudio.onended = () => {
      URL.revokeObjectURL(msg.url);
      currentAudio = null;
      sendResponse({ done: true });
    };
    currentAudio.onerror = () => {
      sendResponse({ error: 'Audio playback failed' });
    };
    return true; // Keep channel open for async
  }

  if (msg.action === 'stop') {
    if (currentAudio) {
      currentAudio.pause();
      URL.revokeObjectURL(currentAudio.src);
      currentAudio = null;
    }
    sendResponse({ ok: true });
  }
});
