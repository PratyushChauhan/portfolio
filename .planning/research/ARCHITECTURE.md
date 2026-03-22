# Architecture Patterns: Chrome MV3 Job Autofill Extension

**Domain:** Chrome Extension (Manifest V3) — resume parse + form autofill
**Researched:** 2026-03-22
**Confidence:** HIGH (Chrome MV3 APIs are stable and well-documented; knowledge cutoff August 2025 is sufficient)

---

## MV3 Component Model

Chrome MV3 provides three isolated execution contexts. Each has distinct capabilities and lifetimes.

```
┌─────────────────────────────────────────────────────────────┐
│  CHROME EXTENSION PROCESS                                   │
│                                                             │
│  ┌─────────────┐         ┌──────────────────────────────┐  │
│  │   POPUP     │◄───────►│      SERVICE WORKER          │  │
│  │  (popup.js) │  msg    │     (background.js)          │  │
│  │             │  passing│                              │  │
│  │ - PDF upload│         │ - Gemini API calls           │  │
│  │ - Fill btn  │         │ - chrome.storage R/W         │  │
│  │ - Q&A view  │         │ - Tab management             │  │
│  │ - Edit cache│         │ - Content script injection   │  │
│  └─────────────┘         └──────────────┬───────────────┘  │
│                                         │                   │
│                          chrome.scripting│.executeScript     │
│                                         │                   │
└─────────────────────────────────────────┼───────────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │  TAB CONTENT SCRIPT           │
                          │  (content.js — injected)      │
                          │                               │
                          │ - DOM form scanning           │
                          │ - Field label extraction      │
                          │ - Field value setting         │
                          │ - sendResponse with results   │
                          └───────────────────────────────┘
                                 (job application page)
```

### Component Responsibilities

| Component | Runs In | Lifetime | Key Capabilities |
|-----------|---------|----------|-----------------|
| `popup.js` | Popup window | While popup is open | DOM, fetch, FileReader API, chrome.* APIs |
| `background.js` (service worker) | Extension process | Event-driven, terminates after ~30s idle | fetch, chrome.* APIs, alarms; NO DOM |
| `content.js` | Active tab page | While tab is open (if declared) or per-injection | DOM of the page; no direct chrome.storage |

**Critical MV3 constraints:**
- Service worker has NO persistent state between invocations — do not store data in JS module-level variables
- Service worker terminates when idle; use `chrome.storage` or `chrome.alarms` to keep state alive across terminations
- Popup closes when the user clicks away — any async work started in popup that needs to outlive it must be handed off to the service worker

---

## Message Passing Patterns

### Pattern 1: Popup → Service Worker (one-shot request)

Used for: "parse this PDF", "get cached answers"

```javascript
// popup.js
const response = await chrome.runtime.sendMessage({
  type: 'PARSE_RESUME',
  pdfBase64: base64Data
});
// response = { ok: true, cache: {...} } or { ok: false, error: '...' }

// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PARSE_RESUME') {
    handleParseResume(msg.pdfBase64).then(sendResponse);
    return true; // keep channel open for async response
  }
});
```

**Rule:** Always `return true` from `onMessage` listener when the response is async. Forgetting this silently drops the response.

### Pattern 2: Service Worker → Content Script (tab-targeted)

Used for: triggering form fill on the active tab

```javascript
// background.js
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

// Inject if not already present (safe to call multiple times)
await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ['content.js']
});

// Then message the content script
const result = await chrome.tabs.sendMessage(tab.id, {
  type: 'FILL_FORM',
  answers: cachedAnswers
});
```

### Pattern 3: Popup → Content Script (direct, for simple reads)

Popup can message the content script directly via `chrome.tabs.sendMessage` — no need to route through service worker for lightweight operations like "how many fields did you find?".

```javascript
// popup.js
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const { fieldCount } = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FIELDS' });
```

### Pattern 4: Content Script → Any (sends up)

Content scripts use `chrome.runtime.sendMessage` which lands in the service worker's `onMessage` listener.

---

## Content Script Injection Strategy

**Approach: Programmatic injection on demand** (do NOT use `content_scripts` in manifest with `"matches": ["<all_urls>"]`).

Reason: Declaring a universal content script requires the `"host_permissions": ["<all_urls>"]` permission, which triggers Chrome Web Store warnings and user friction. Programmatic injection via `chrome.scripting.executeScript` is triggered only when the user explicitly clicks "Fill this form" — same net permission but better UX.

### Manifest permissions required

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "scripting", "activeTab"],
  "host_permissions": ["<all_urls>"]
}
```

`activeTab` grants temporary access to the active tab without a persistent host permission grant — but only for the current interaction. `<all_urls>` in `host_permissions` is needed for `chrome.scripting.executeScript` to work on arbitrary domains.

**Alternative (reduces permission surface):** Request `"host_permissions"` dynamically via `chrome.permissions.request` the first time the user tries to fill a specific site. This is more complex to implement and the UX is worse. Not recommended for v1.

### Injection call (idempotent-safe)

```javascript
// background.js — safe to call even if content.js already injected
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {
    // Fails on chrome:// pages, PDF viewer tabs, etc. — expected
    console.warn('Cannot inject into tab:', e.message);
  }
}
```

Content script must be idempotent — use a guard at the top:

```javascript
// content.js
if (window.__autofillInjected) throw new Error('already injected');
window.__autofillInjected = true;
```

---

## PDF Parsing Pipeline (parse-and-cache flow)

```
User selects PDF file in popup
         │
         ▼
  FileReader.readAsArrayBuffer(file)   ← runs in popup
         │
         ▼
  Convert to base64 string
         │
         ▼
  chrome.runtime.sendMessage({ type: 'PARSE_RESUME', pdfBase64 })
         │
         ▼  (service worker receives)
  Decode base64 → Uint8Array
         │
         ▼
  Build multipart request to Gemini API
  POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
  Authorization: Bearer <oauth_token>
  Body: { contents: [{ parts: [{ inline_data: { mime_type: 'application/pdf', data: base64 } }, { text: PROMPT }] }] }
         │
         ▼
  Gemini returns structured JSON (Q&A pairs)
         │
         ▼
  chrome.storage.local.set({ resumeCache: parsedData, parsedAt: Date.now() })
         │
         ▼
  sendResponse({ ok: true, cache: parsedData })
         │
         ▼
  Popup displays Q&A for user review/edit
```

**PDF size consideration:** Chrome's message passing limit is 64MB. A typical resume PDF is under 1MB so base64 encoding (~1.33x size) stays well under the limit. No chunking needed.

**MEDIUM confidence:** Gemini's multimodal PDF support via the REST API is well-established. The exact model name and API endpoint should be verified against current Gemini documentation at implementation time.

---

## Autofill Pipeline (fill flow)

```
User clicks "Fill this form" in popup
         │
         ▼
  popup.js: chrome.runtime.sendMessage({ type: 'TRIGGER_FILL' })
         │
         ▼  (service worker receives)
  Load cached answers from chrome.storage.local
         │
         ▼
  chrome.scripting.executeScript → inject content.js into active tab
         │
         ▼
  chrome.tabs.sendMessage(tabId, { type: 'FILL_FORM', answers })
         │
         ▼  (content.js receives in tab page)
  Scan DOM: querySelectorAll('input, textarea, select')
         │
         ▼
  For each field:
    Extract label text (associated <label>, aria-label, placeholder, name attr)
    Normalize to lowercase, strip punctuation
    Match against answers keys via keyword scoring
         │
         ▼
  Set matched field values
  Dispatch 'input' + 'change' events (required for React/Vue/Angular apps)
         │
         ▼
  Return { filled: N, total: M } to service worker
         │
         ▼
  Service worker forwards result to popup
  Popup shows "Filled 12 of 14 fields"
```

**Event dispatch is critical:** Modern job application frameworks (Greenhouse uses React, Workday uses Angular) use virtual DOM diffing — setting `element.value` directly without firing synthetic events will not update the framework's state and the field will appear filled but submit as empty. Always dispatch:

```javascript
element.value = answer;
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));
```

---

## Storage Schema

Stored in `chrome.storage.local` (up to 10MB by default, expandable to unlimited with permission).

```javascript
{
  // Core resume cache — set once after Gemini parse
  resumeCache: {
    // Structured identity fields
    full_name: 'Pratyush Chauhan',
    email: 'pratyush@example.com',
    phone: '+1-555-0100',
    location: 'San Francisco, CA',
    linkedin_url: 'https://linkedin.com/in/pratyush',
    github_url: 'https://github.com/pratyush',
    portfolio_url: 'https://pratyush.dev',

    // Professional history
    current_title: 'Software Engineer',
    current_company: 'Acme Corp',
    years_experience: '4',
    salary_expectation: '150000',

    // Education
    degree: 'B.S. Computer Science',
    university: 'UC Berkeley',
    graduation_year: '2020',

    // Skills (both as array and comma-joined string for different field types)
    skills_array: ['TypeScript', 'React', 'Node.js'],
    skills_string: 'TypeScript, React, Node.js',

    // Pre-generated short answers for common free-text questions
    qa_pairs: [
      { question_pattern: 'cover letter|why.*company|motivation', answer: '...' },
      // ... (out of scope for v1 per PROJECT.md)
    ]
  },

  // Metadata
  parsedAt: 1711234567890,         // Unix ms timestamp
  resumeFileName: 'resume_2026.pdf',

  // Auth token (if caching — see OAuth section)
  geminiToken: {
    access_token: '...',
    expiry_ms: 1711234567890
  }
}
```

**Schema design notes:**
- Flat key-value for structured fields (not nested objects) makes field matching code simpler — iterate `Object.entries(resumeCache)` and match keys directly
- Store both `skills_array` and `skills_string` because some forms expect comma-separated text, others have multi-select checkboxes
- `qa_pairs` reserved but empty for v1

---

## OAuth / Gemini Authentication Strategy

This is the hardest architectural problem in this extension. There are three possible approaches.

### Option A: Native Messaging to read ~/.gemini/ token (NOT VIABLE)

Chrome extensions cannot access the local filesystem directly. Native Messaging Host (a registered local binary) could read `~/.config/gemini/` or `~/.gemini/oauth_token`, but this requires:
1. A separate native binary installed on the user's machine
2. The binary registered in a system location (`/etc/opt/chrome/native-messaging-hosts/`)
3. Complex install/update lifecycle

**Verdict:** Too much friction for a personal tool. Eliminated.

### Option B: chrome.identity.launchWebAuthFlow — OAuth PKCE in-extension (RECOMMENDED)

Chrome provides `chrome.identity.launchWebAuthFlow` which opens a browser-controlled auth window. For Gemini (Google APIs), this means Google OAuth 2.0 with PKCE.

Steps:
1. Register a Chrome Extension OAuth client in Google Cloud Console (extension client type, no secret needed)
2. Extension calls `chrome.identity.launchWebAuthFlow` with Google's OAuth endpoint
3. Chrome handles the redirect back to the extension's `chrome-extension://` callback URL
4. Extension receives `access_token` or `code` (if PKCE), exchanges for token
5. Store token in `chrome.storage.local` with expiry, refresh when expired

```javascript
// background.js
async function getGeminiToken() {
  const cached = await chrome.storage.local.get('geminiToken');
  if (cached.geminiToken && cached.geminiToken.expiry_ms > Date.now() + 60_000) {
    return cached.geminiToken.access_token;
  }

  // Launch OAuth flow
  const redirectUrl = chrome.identity.getRedirectURL(); // chrome-extension://[id]/
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('response_type', 'token'); // implicit flow for extensions
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/generative-language');

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  });

  const params = new URL(responseUrl).hash; // #access_token=...&expires_in=...
  const token = new URLSearchParams(params.slice(1)).get('access_token');
  const expiresIn = parseInt(new URLSearchParams(params.slice(1)).get('expires_in'));

  await chrome.storage.local.set({
    geminiToken: {
      access_token: token,
      expiry_ms: Date.now() + expiresIn * 1000
    }
  });
  return token;
}
```

**This does NOT reuse gemini-cli tokens.** It creates a new OAuth session in the extension. The user authenticates once in the Chrome auth popup — same Google account, same Gemini API access, but a separate credential from what gemini-cli holds.

**Verdict:** This is the correct approach. The PROJECT.md desire to "reuse gemini-cli OAuth credentials" is not technically achievable without a native host binary. The actual user requirement is "no separate API key management" — `chrome.identity` satisfies that requirement (Google login once, done) without the native host complexity.

### Option C: User pastes API key manually

Simple input field in the popup for a Gemini API key. Stored in `chrome.storage.local`.

**Verdict:** Works but violates the design intent of not requiring API key setup. Use as fallback if OAuth proves problematic.

### OAuth Recommendation Summary

| Approach | Reuses gemini-cli tokens | Setup friction | Recommended |
|----------|--------------------------|----------------|-------------|
| Native Messaging | YES | Very high (binary install) | No |
| chrome.identity OAuth | No (new session) | Low (one Google login) | **YES** |
| Manual API key | No | Medium (find key, paste) | Fallback only |

**The PROJECT.md assumption that gemini-cli tokens can be accessed from within the extension is incorrect.** The OAuth requirement should be updated to: "User authenticates with Google once via the extension's built-in OAuth flow."

---

## Security Boundaries

```
chrome.storage.local
  ├─ Readable by: popup.js, background.js (service worker)
  ├─ NOT readable by: content.js directly
  └─ content.js receives data only via message passing from service worker

Gemini API calls
  ├─ Initiated by: service worker only (has fetch access)
  ├─ NOT by: content.js (no fetch to external origins without CSP allowance)
  └─ Auth token lives in storage, accessed only by service worker

DOM manipulation
  ├─ Done by: content.js only
  └─ Service worker and popup have NO access to page DOM

PDF file bytes
  ├─ Read by: popup.js (FileReader API)
  ├─ Transferred to: service worker via sendMessage (base64)
  └─ Never persisted to storage — discarded after parse completes
```

**Key security properties:**
- Resume raw bytes are never stored — only the extracted structured data
- The OAuth token is stored in `chrome.storage.local` which is sandboxed per-extension — other extensions cannot read it
- Content script runs in an isolated world by default — page JS cannot access `window.__autofillInjected` or call into content script functions

---

## Manifest Structure

```json
{
  "manifest_version": 3,
  "name": "Job Autofill",
  "version": "0.1.0",
  "description": "Fill job applications from your resume, automatically.",

  "permissions": [
    "storage",
    "scripting",
    "activeTab",
    "identity"
  ],
  "host_permissions": ["<all_urls>"],

  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/generative-language"]
  },

  "background": {
    "service_worker": "background.js"
  },

  "action": {
    "default_popup": "popup.html",
    "default_icon": { "32": "icon32.png" }
  },

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

**Note on `oauth2` key in manifest:** This enables `chrome.identity.getAuthToken` (simpler than `launchWebAuthFlow`) when the extension is published to the Chrome Web Store. For unpacked/dev use, `launchWebAuthFlow` works without this. Include it from the start.

---

## File Structure

```
extension/
├── manifest.json
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic: PDF upload, Q&A display, fill trigger
├── background.js       # Service worker: Gemini API, storage, script injection
├── content.js          # Injected into tab: DOM scanning + field filling
├── icon32.png
└── icon128.png
```

Four JS files. No build system needed for v1 (per PROJECT.md's "vanilla JS" preference).

---

## Architecture Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Service worker terminates mid-Gemini-call | Low (Gemini call < 30s) | High (parse fails silently) | Wrap in keepAlive pattern: send chrome.alarms during the call |
| Content script injection fails (chrome://, PDF viewer, non-http tabs) | Medium | Low (user sees error) | Catch injection errors, show "Cannot fill this page" in popup |
| React/Vue fields not updating | High (major job sites use frameworks) | High (fields appear filled but submit empty) | Always dispatch input+change events; test on Greenhouse/Workday |
| OAuth token expiry during fill session | Low | Medium (fill fails) | Check expiry before each Gemini call; proactively refresh |
| gemini-cli token reuse expectation | Confirmed impossible | Medium (design change needed) | Use chrome.identity instead; update PROJECT.md |

---

## Sources

- Chrome Extension MV3 documentation (training knowledge, HIGH confidence — MV3 reached stable in Chrome 112+)
- chrome.identity API behavior (training knowledge, HIGH confidence — stable API)
- Chrome message passing limits and async patterns (training knowledge, HIGH confidence)
- Gemini multimodal REST API structure (training knowledge, MEDIUM confidence — verify endpoint and model name at implementation)
- `chrome.storage.local` security model (training knowledge, HIGH confidence)
