/* offscreen.js — v3: Audio playback handler for streaming blobs */

let currentAudio = null;
let currentUrl = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'play') {
    cleanup();
    currentUrl = msg.url;
    currentAudio = new Audio(msg.url);
    currentAudio.play().catch(e => sendResponse({ error: e.message }));
    currentAudio.onended = () => {
      URL.revokeObjectURL(msg.url);
      currentAudio = null;
      sendResponse({ done: true });
    };
    currentAudio.onerror = () => {
      URL.revokeObjectURL(msg.url);
      sendResponse({ error: 'Audio playback failed' });
    };
    return true;
  }

  if (msg.action === 'update') {
    // Swap source to larger blob while preserving playback position
    if (currentAudio) {
      const currentTime = currentAudio.currentTime;
      const wasPlaying = !currentAudio.paused;
      cleanup(false); // Don't revoke yet
      currentUrl = msg.url;
      currentAudio = new Audio(msg.url);
      currentAudio.currentTime = currentTime;
      if (wasPlaying) {
        currentAudio.play().catch(() => {});
      }
      sendResponse({ ok: true });
    } else {
      currentUrl = msg.url;
      currentAudio = new Audio(msg.url);
      currentAudio.play().catch(e => sendResponse({ error: e.message }));
      return true;
    }
  }

  if (msg.action === 'pause') {
    currentAudio?.pause();
    sendResponse({ ok: true });
  }

  if (msg.action === 'resume') {
    currentAudio?.play().catch(() => {});
    sendResponse({ ok: true });
  }

  if (msg.action === 'stop') {
    cleanup();
    sendResponse({ ok: true });
  }

  if (msg.action === 'getState') {
    sendResponse({
      currentTime: currentAudio?.currentTime || 0,
      duration: currentAudio?.duration || 0,
      paused: currentAudio?.paused ?? true,
    });
  }

  return true;
});

function cleanup(revoke = true) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (revoke && currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}
