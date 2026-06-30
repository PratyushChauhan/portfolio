/* popup.js — Minimal v1 controller */
const statusEl = document.getElementById('status');
const playBtn  = document.getElementById('play');
const pauseBtn = document.getElementById('pause');
const stopBtn  = document.getElementById('stop');

let state = 'idle'; // idle | playing | paused

function setStatus(s) {
  state = s;
  statusEl.textContent = s[0].toUpperCase() + s.slice(1);
  statusEl.style.color = s === 'playing' ? '#00f2fe' : s === 'paused' ? '#ffc107' : '#888';
  playBtn.textContent  = s === 'playing' ? '⏸' : '▶';
}

// Load current state on open
chrome.runtime.sendMessage({ action: 'getState' }, (r) => {
  if (chrome.runtime.lastError) return;
  if (r.speaking) setStatus('playing');
  else if (r.paused) setStatus('paused');
});

// Button handlers
playBtn.addEventListener('click', () => {
  if (state === 'playing') {
    chrome.runtime.sendMessage({ action: 'pause' });
    setStatus('paused');
  } else {
    if (state === 'idle') {
      // Request text extraction from current tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extract' }, (resp) => {
          if (chrome.runtime.lastError) {
            setStatus('error: no text');
            return;
          }
          chrome.runtime.sendMessage({
            action: 'speak',
            text: resp.text,
            rate: 1.0,
            pitch: 1.0,
            lang: 'en-US',
          });
        });
      });
    } else {
      chrome.runtime.sendMessage({ action: 'resume' });
    }
    setStatus('playing');
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

// Listen for background state broadcasts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'state') {
    setStatus(msg.state);
  }
});
