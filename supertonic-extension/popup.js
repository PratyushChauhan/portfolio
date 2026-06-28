/* popup.js — v3: Stream status controller */
const statusEl = document.getElementById('status');
const metaEl   = document.getElementById('meta');
const playBtn  = document.getElementById('play');
const pauseBtn = document.getElementById('pause');
const stopBtn  = document.getElementById('stop');
const voiceSel = document.getElementById('voice');
const speedIn  = document.getElementById('speed');

let state = 'idle';

function setStatus(s, meta = {}) {
  state = s;
  statusEl.className = 'status';

  if (s === 'buffering') {
    statusEl.textContent = 'Buffering...';
    statusEl.classList.add('buffering');
    metaEl.textContent = meta.format ? `format: ${meta.format}` : '';
  } else if (s === 'playing') {
    statusEl.textContent = 'Playing';
    statusEl.classList.add('playing');
    if (meta.bytesReceived) {
      const kb = (meta.bytesReceived / 1024).toFixed(1);
      metaEl.textContent = `received: ${kb} KB${meta.complete ? ' (complete)' : ''}`;
    } else {
      metaEl.textContent = '';
    }
  } else if (s === 'paused') {
    statusEl.textContent = 'Paused';
  } else if (s === 'error') {
    statusEl.textContent = meta.error || 'Error';
    statusEl.classList.add('error');
    metaEl.textContent = '';
  } else {
    statusEl.textContent = 'Idle';
    metaEl.textContent = '';
  }

  playBtn.textContent = s === 'playing' ? '⏸' : '▶';
}

// Restore settings
chrome.storage.local.get(['voice', 'speed'], (r) => {
  if (r.voice) voiceSel.value = r.voice;
  if (r.speed) speedIn.value = r.speed;
});

voiceSel.addEventListener('change', () => chrome.storage.local.set({ voice: voiceSel.value }));
speedIn.addEventListener('input', () => chrome.storage.local.set({ speed: parseFloat(speedIn.value) }));

// Button handlers
playBtn.addEventListener('click', () => {
  if (state === 'playing') {
    chrome.runtime.sendMessage({ action: 'pause' });
    setStatus('paused');
  } else {
    if (state === 'idle' || state === 'error') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extract' }, (resp) => {
          if (chrome.runtime.lastError) {
            setStatus('error', { error: 'No text found' });
            return;
          }
          chrome.runtime.sendMessage({
            action: 'speak',
            text: resp.text,
            voice: voiceSel.value,
            speed: parseFloat(speedIn.value),
          });
        });
      });
    } else {
      chrome.runtime.sendMessage({ action: 'resume' });
    }
    setStatus('buffering');
  }
});

pauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'pause' });
  setStatus('paused');
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
  setStatus('idle');
});

// Listen for state broadcasts from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'state') {
    setStatus(msg.state, msg.meta || {});
  }
});

// Load current state on open
chrome.runtime.sendMessage({ action: 'getState' }, (r) => {
  if (chrome.runtime.lastError) return;
  if (r.speaking) setStatus('playing', { bytesReceived: r.bytesReceived });
  else if (r.paused) setStatus('paused');
});
