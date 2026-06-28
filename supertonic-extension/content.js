/* content.js — v3: Narrator controls + text extraction */

(() => {
  'use strict';
  const ID = 'stn-narrator';
  if (document.getElementById(ID)) return;

  function extractText() {
    const article = document.querySelector('article, main, [role="main"]');
    if (article) return article.innerText.trim();

    const blobs = [...document.querySelectorAll('div, section')]
      .filter(el => el.innerText.length > 500)
      .sort((a, b) => b.innerText.length - a.innerText.length);
    if (blobs.length) return blobs[0].innerText.trim();

    const body = document.body.cloneNode(true);
    body.querySelectorAll('nav, footer, aside, header, script, style, noscript, iframe, [role="banner"], [role="complementary"]').forEach(el => el.remove());
    return body.innerText.trim().slice(0, 30000);
  }

  // --- UI ---
  const container = document.createElement('div');
  container.id = 'stn-container';

  const progress = document.createElement('div');
  progress.id = 'stn-progress';
  progress.style.display = 'none';

  const btnPlay = document.createElement('button');
  btnPlay.id = ID;
  btnPlay.innerHTML = `
    <svg id="stn-icon-play" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    <svg id="stn-icon-pause" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
    <span class="stn-label">Narrate</span>
  `;

  const btnStop = document.createElement('button');
  btnStop.id = 'stn-stop';
  btnStop.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"/></svg>
  `;
  btnStop.title = 'Stop';
  btnStop.style.display = 'none';

  container.appendChild(progress);
  container.appendChild(btnPlay);
  container.appendChild(btnStop);
  document.documentElement.appendChild(container);

  // --- Actions ---
  function updateState(state, meta) {
    if (state === 'buffering') {
      btnPlay.querySelector('#stn-icon-play').style.display = 'none';
      btnPlay.querySelector('#stn-icon-pause').style.display = 'inline';
      btnPlay.querySelector('.stn-label').textContent = 'Buffering';
      btnPlay.classList.add('stn-playing');
      btnStop.style.display = 'flex';
      progress.style.display = 'block';
      progress.style.background = 'linear-gradient(90deg, #ffc107 30%, #1a1a1a 30%)';
    } else if (state === 'playing') {
      btnPlay.querySelector('#stn-icon-play').style.display = 'none';
      btnPlay.querySelector('#stn-icon-pause').style.display = 'inline';
      btnPlay.querySelector('.stn-label').textContent = meta?.bytesReceived
        ? `${(meta.bytesReceived / 1024).toFixed(0)} KB`
        : 'Playing';
      btnPlay.classList.add('stn-playing');
      btnStop.style.display = 'flex';
      progress.style.display = 'block';
      if (meta?.bytesReceived) {
        // Animate progress based on download progress (rough estimate)
        progress.style.background = `linear-gradient(90deg, #00f2fe 60%, #1a1a1a 60%)`;
      }
    } else if (state === 'paused') {
      btnPlay.querySelector('#stn-icon-play').style.display = 'inline';
      btnPlay.querySelector('#stn-icon-pause').style.display = 'none';
      btnPlay.classList.remove('stn-playing');
    } else {
      btnPlay.querySelector('#stn-icon-play').style.display = 'inline';
      btnPlay.querySelector('#stn-icon-pause').style.display = 'none';
      btnPlay.classList.remove('stn-playing');
      btnPlay.querySelector('.stn-label').textContent = 'Narrate';
      btnStop.style.display = 'none';
      progress.style.display = 'none';
      progress.style.background = '#1a1a1a';
    }
  }

  btnPlay.addEventListener('click', () => {
    const text = extractText();
    if (!text || text.length < 20) {
      btnPlay.querySelector('.stn-label').textContent = 'No text';
      setTimeout(() => btnPlay.querySelector('.stn-label').textContent = 'Narrate', 1500);
      return;
    }
    chrome.runtime.sendMessage({ action: 'speak', text });
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop' });
  });

  // Listen for state updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'state') {
      updateState(msg.state, msg.meta);
    }
    if (msg.action === 'extract') {
      // Respond to popup's extract request
      const text = extractText();
      if (msg && typeof msg === 'object' && msg._sendResponse) {
        // Not how it works — sendResponse is separate
      }
    }
  });

  // Handle direct extract requests from popup
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'extract') {
      sendResponse({ text: extractText() });
    }
  });
})();
