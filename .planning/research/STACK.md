# Technology Stack

**Project:** Job Autofill Chrome Extension
**Researched:** 2026-03-22
**Confidence Note:** All search tools blocked in this environment. Research draws from training knowledge (cutoff August 2025). The MV3 ecosystem was stable by mid-2025 — these recommendations reflect community consensus at that time.

---

## Recommended Stack

### Build Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vite | 5.x | Bundler + dev server | Fastest HMR, native ESM, tiny config, ideal for popup UI. Webpack is heavyweight and slow — Vite is the community default for new extensions in 2025. |
| @crxjs/vite-plugin | 2.x (beta) | MV3-aware Vite integration | Auto-generates manifest entries, handles HMR for content scripts and popup, injects correct CSP headers. Without this, manually wiring Vite output to manifest.json is error-prone. |
| TypeScript | 5.x | Type safety | chrome.* APIs have excellent TS types via `@types/chrome`. Catches content-script/service-worker boundary mistakes at compile time. |

**Note on @crxjs/vite-plugin:** The v2 branch targets MV3 and is actively used in production but was still in beta/RC as of mid-2025. The alternative is manual Vite config (splitting entrypoints for popup, content script, service worker) — more work but zero external dependency. Recommendation: use @crxjs/vite-plugin for DX; if it causes issues, fall back to manual entrypoint config.

**Alternative considered — WXT (webextension-tools):** WXT is a newer meta-framework for browser extensions that gained traction in 2024-2025. It wraps Vite, auto-discovers entrypoints by folder convention, and handles cross-browser compatibility. For a Chrome-only personal tool, WXT adds abstraction overhead that isn't warranted. Vite + @crxjs/vite-plugin gives the same DX with less magic.

### Frontend (Popup UI)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 18.x | Popup UI | The popup is a small SPA (~3-4 views: upload, review answers, status). React's component model is well-suited. Preact (3KB) is a valid lighter alternative but the ecosystem for form handling and state is smaller. Vanilla JS is viable but tedious for multi-view state management. |
| Tailwind CSS | 3.x | Styling | Utility-first, no stylesheet import issues in extension context. Avoid CSS-in-JS (emotion, styled-components) — they rely on runtime style injection which can conflict with extension CSP. Plain CSS modules work too but Tailwind is faster to iterate. |

**Why not Vue or Svelte:** Both are fine technically, but React has the most Chrome extension tutorial ecosystem and the most StackOverflow/GitHub issues coverage. For a solo project, pick React and never think about it again.

**Popup size constraint:** The extension popup window is max ~800×600px in practice. Keep the React bundle lean. No heavy UI libraries (MUI, Ant Design). Tailwind + headlessui for any dropdown/modal is sufficient.

### Chrome Extension APIs (MV3 Specifics)

| API | Purpose | MV3 Constraint |
|-----|---------|----------------|
| `chrome.storage.local` | Cache resume answers | Unlimited storage (user-granted), survives service worker restart. Do NOT use `localStorage` — it is inaccessible from service workers and unreliable from content scripts. |
| `chrome.storage.session` | Ephemeral state (fill status per tab) | New in MV3 — cleared when browser closes. Good for tracking whether a tab has been autofilled. |
| `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` | Popup ↔ content script communication | Standard message passing. Works reliably in MV3. |
| `chrome.scripting.executeScript` | Inject content script on demand | MV3 replaces `chrome.tabs.executeScript`. Requires `scripting` permission in manifest. |
| `chrome.action.onClicked` | Respond to toolbar icon click | Wakes service worker. Keep handlers fast — SW has no persistent state. |

### Background (Service Worker)

MV3 replaces persistent background pages with service workers. Key constraints:

- **No DOM access.** Service workers cannot access `document` or `window`.
- **No persistent state.** The SW can be terminated at any time. All state must be in `chrome.storage` or passed via messages.
- **No `XMLHttpRequest`.** Use `fetch()` only.
- **Activation on events only.** The SW wakes on chrome API events (message, alarm, etc.) and sleeps when idle.
- **5-minute idle timeout** (approximate). Do not design long-running processes in the SW.

For this project the SW's role is minimal: receive the PDF bytes from the popup, call the Gemini API, write results to `chrome.storage.local`. This is a single async operation, well within SW lifetime.

### PDF Handling

| Approach | Rationale |
|----------|-----------|
| `FileReader` API in popup context | The popup runs in a browser window context (not a SW), so it has full DOM/FileReader access. Read the PDF as `ArrayBuffer`, convert to base64, send to Gemini as a Part with `inlineData`. No separate PDF parsing library needed — Gemini handles multimodal PDF input natively. |

Do NOT use `pdf.js` or similar client-side PDF parsers. The whole point of the Gemini integration is to extract structured information from an unstructured PDF — letting Gemini read the PDF directly is both simpler and more accurate than text extraction + prompt.

### Gemini API Integration

| Component | Decision | Rationale |
|-----------|----------|-----------|
| API client | `@google/generative-ai` SDK (npm) | Official SDK, typed, handles streaming and multimodal Parts. Version 0.21+ supports file uploads and inline data. |
| Auth approach | User-provided API key stored in `chrome.storage.local` | **Gemini-cli OAuth is not usable from a Chrome extension.** See detailed note below. |
| Model | `gemini-1.5-flash` | Best cost/performance for structured extraction. Flash handles PDF multimodal input. Pro is overkill and slower for this task. |
| Call pattern | Single call at parse time (not per-field at fill time) | Pre-generate all Q&A pairs in one shot. Costs one API call total. No latency at fill time. |

#### Critical: gemini-cli OAuth Cannot Be Used From a Chrome Extension

The PROJECT.md states "Gemini via gemini-cli OAuth credentials — no separate API key setup needed." This assumption needs to be revised.

**Why gemini-cli OAuth does not work from a Chrome extension:**

1. **gemini-cli stores credentials on the filesystem** (typically `~/.config/google-gemini-cli/` or `~/.gemini/`). Chrome extensions have no filesystem access — they are sandboxed.

2. **OAuth tokens are bound to the local user agent session.** The token flow initiated by gemini-cli is a desktop application flow (auth code + PKCE or device flow), not a web application flow. The Chrome extension would need to re-initiate its own OAuth flow from scratch.

3. **Chrome extension OAuth is a different flow.** Extensions use `chrome.identity.launchWebAuthFlow` or `chrome.identity.getAuthToken` (for Google accounts). This requires the extension to be registered as an OAuth client in Google Cloud Console with a Chrome Extension redirect URI.

4. **Token storage isolation.** Even if you could read `~/.gemini/` tokens, they would be for gemini-cli's registered OAuth client (a desktop app client ID), not for the extension's client ID. Google OAuth tokens are client-ID-scoped.

**Practical resolution options (in order of simplicity):**

| Option | Complexity | User Experience |
|--------|------------|-----------------|
| User enters Gemini API key directly in popup (stored in `chrome.storage.local`) | LOW | One-time setup, same as any API key. Not zero-config but a 30-second task. |
| `chrome.identity.getAuthToken` with Google OAuth | MEDIUM | Seamless Google sign-in via Chrome identity, but requires OAuth client registration in Google Cloud Console. |
| Native messaging to a local proxy that reads gemini-cli credentials | HIGH | Zero config for user, but requires a native host installer + manifest — significant distribution complexity. |

**Recommendation: User-provided API key.** It is the only option requiring no OAuth client registration, no native messaging host, and no Google Cloud Console setup. The UX is one text field in the popup on first run. Store the key in `chrome.storage.local` (not `sync` — API keys should not sync across devices).

### Storage Architecture

```
chrome.storage.local = {
  apiKey: string,                    // Gemini API key (user-entered)
  resumeData: {                      // Set after parse
    raw: string,                     // Original extracted text (for debugging)
    answers: {                       // Pre-generated Q&A pairs
      fullName: string,
      email: string,
      phone: string,
      address: string,
      city: string,
      state: string,
      zipCode: string,
      country: string,
      linkedinUrl: string,
      githubUrl: string,
      portfolioUrl: string,
      currentTitle: string,
      currentCompany: string,
      yearsOfExperience: string,
      skills: string[],
      education: { degree, field, school, year }[],
      summary: string,
    },
    parsedAt: number,                // Unix timestamp
  } | null,
}

chrome.storage.session = {
  filledTabs: number[],              // Tab IDs that have been filled this session
}
```

### Content Script

No framework needed in the content script. Vanilla JS only.

**Why no React in content scripts:**
- Content scripts run in the context of the host page. Injecting React into a job application page adds ~40KB and risks class name collisions with host page styles.
- The content script's job is simple: receive a `{field: value}` map from the popup, scan `document.querySelectorAll('input, select, textarea')`, match by label/placeholder/aria, and set values.
- This is 100-150 lines of vanilla JS.

**Field matching strategy (content script):**
```
1. Build index: for each input, collect { label text, placeholder, aria-label, name attr, id attr }
2. Normalize: lowercase, strip punctuation
3. Match: fuzzy keyword match against known field names in the answers cache
4. Dispatch: fire both `input` event and `change` event after setting value — required for React/Vue controlled inputs on Greenhouse, Lever, etc.
```

### Manifest V3 Constraints Summary

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| No persistent background page | SW terminates when idle; no long-running state | All state in chrome.storage.local |
| Strict CSP — no inline scripts | Cannot eval() or use innerHTML for script injection | Irrelevant for this project (we don't inject scripts via innerHTML) |
| `fetch()` in SW requires `host_permissions` | Must declare Gemini API host in manifest | Add `"https://generativelanguage.googleapis.com/*"` to host_permissions |
| Content script CSP isolation | Content script runs in isolated world — host page CSS does not affect it | No issue for our use case |
| `remote_code` is banned | Cannot load scripts from external URLs at runtime | All code bundled at build time. No CDN script tags. |
| `web_accessible_resources` required | Any resource accessed by content script from extension package must be declared | Relevant if injecting CSS/images into host page |

### Manifest.json Structure

```json
{
  "manifest_version": 3,
  "name": "Job Autofill",
  "version": "0.1.0",
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://generativelanguage.googleapis.com/*"
  ],
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ]
}
```

Note: `"<all_urls>"` content script match is required to fill forms on any job site. Chrome Web Store review will scrutinize this — the privacy policy must clearly disclose what data is read (none) vs. written (form field values).

### DevDependencies (complete list)

```bash
# Runtime
npm install react react-dom @google/generative-ai

# Build
npm install -D vite @vitejs/plugin-react @crxjs/vite-plugin typescript

# Types
npm install -D @types/chrome @types/react @types/react-dom

# Styling
npm install -D tailwindcss postcss autoprefixer
```

### Project Structure

```
job-autofill-extension/
  manifest.json            # Extension manifest (source of truth for @crxjs)
  src/
    popup/
      index.html           # Popup entry point
      App.tsx              # React root
      views/
        Setup.tsx          # API key + resume upload
        Answers.tsx        # View/edit cached answers
        Fill.tsx           # Fill button + status
    content/
      index.ts             # Content script (vanilla TS, no React)
      matcher.ts           # Field matching logic
    background/
      index.ts             # Service worker
    shared/
      storage.ts           # chrome.storage typed wrappers
      types.ts             # Shared types
  icons/
    icon16.png
    icon48.png
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tool | Vite + @crxjs | Webpack + webpack-extension-reloader | Webpack is ~5x slower cold build, complex config, no native ESM. Community has moved to Vite. |
| Build tool | Vite + @crxjs | WXT framework | WXT adds abstraction layer not warranted for a focused single-browser tool. |
| UI framework | React 18 | Preact | Preact is 3KB vs 40KB but ecosystem gaps for form state. Not worth the tradeoff. |
| UI framework | React 18 | Vanilla JS | Popup has multi-view state (setup, answers editor, fill status). React's component model pays for itself here. |
| Styling | Tailwind | CSS Modules | Both valid. Tailwind is faster to iterate in popup context. |
| Gemini auth | API key in storage | gemini-cli OAuth | gemini-cli OAuth is filesystem-bound; inaccessible from extension sandbox. See detailed note above. |
| Gemini auth | API key in storage | chrome.identity OAuth | Requires Google Cloud Console OAuth client registration — distribution overhead not worth it for personal tool. |
| PDF parsing | Gemini multimodal | pdf.js | pdf.js extracts text; Gemini understands document structure. Gemini multimodal is strictly better for this use case and simpler to implement. |
| Storage | chrome.storage.local | IndexedDB | IDB is overkill for this data volume. chrome.storage.local is sufficient and has simpler async API. |

## Sources

- Training knowledge, cutoff August 2025
- Chrome Extension MV3 migration guide: https://developer.chrome.com/docs/extensions/develop/migrate/mv3 (HIGH confidence — MV3 has been stable since Chrome 112, 2023)
- @crxjs/vite-plugin: https://crxjs.dev/ (MEDIUM confidence — v2 beta status as of mid-2025)
- WXT framework: https://wxt.dev/ (MEDIUM confidence — gained adoption 2024-2025)
- @google/generative-ai SDK: https://www.npmjs.com/package/@google/generative-ai (HIGH confidence — official Google SDK)
- chrome.storage.session (MV3-only API): HIGH confidence — documented in Chrome 102+
- gemini-cli OAuth filesystem storage: MEDIUM confidence — based on open-source gemini-cli repo behavior; verify the exact credentials path before implementing native messaging fallback
