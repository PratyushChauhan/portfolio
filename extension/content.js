/* content.js — v1: inject button, handle extract request from popup */

(() => {
  'use strict';

  const ID = 'stn-narrator';
  if (document.getElementById(ID)) return;

  function extractText() {
    const article = document.querySelector('article, main, [role="main"]');
    if (article) return article.innerText.trim();

    const blobs = [...document.querySelectorAll('div, section')]
      .filter(el => el.innerText.length > 500);
    if (blobs.length) {
      blobs.sort((a, b) => b.innerText.length - a.innerText.length);
      return blobs[0].innerText.trim();
    }

    const body = document.body.cloneNode(true);
    body.querySelectorAll('nav, footer, aside, header, script, style, noscript, iframe, [role="banner"], [role="complementary"]').forEach(el => el.remove());
    return body.innerText.trim().slice(0, 30000);
  }

  // --- Injected floating button ---
  const btn = document.createElement('button');
  btn.id = ID;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    <span class="stn-label">Narrate</span>
  `;
  btn.title = 'Narrate this page';
  btn.addEventListener('click', () => {
    const text = extractText();
    if (!text || text.length < 20) {
      btn.querySelector('.stn-label').textContent = 'No text';
      setTimeout(() => btn.querySelector('.stn-label').textContent = 'Narrate', 1500);
      return;
    }
    chrome.runtime.sendMessage({ action: 'speak', text });
  });
  document.documentElement.appendChild(btn);

  // --- Listen for popup extraction request ---
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'extract') {
      sendResponse({ text: extractText() });
    }
    if (req.action === 'state') {
      if (req.state === 'stopped' || req.state === 'error') {
        btn.classList.remove('stn-playing');
        btn.querySelector('.stn-label').textContent = 'Narrate';
      } else if (req.state === 'playing') {
        btn.classList.add('stn-playing');
        btn.querySelector('.stn-label').textContent = 'Playing';
      }
    }
    return true;
  });
})();
