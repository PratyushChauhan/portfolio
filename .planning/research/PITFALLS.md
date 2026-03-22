# Domain Pitfalls: Chrome MV3 Job Autofill Extension

**Domain:** Browser extension — universal job application autofill
**Researched:** 2026-03-22
**Note on sources:** Web search unavailable. Findings drawn from Chrome extension developer documentation (training knowledge, HIGH confidence for MV3 spec), community-known ATS platform behavior (MEDIUM confidence), and Gemini API documentation (MEDIUM confidence). Flag items marked LOW for independent verification before building.

---

## Critical Pitfalls

Mistakes that cause rewrites or completely broken fill behavior.

---

### Pitfall 1: React/Angular SPA — Native Input Value Setter Bypass

**What goes wrong:** Setting `input.value = 'foo'` directly on a React-controlled input does nothing visible to the application. React tracks a synthetic event system and internal fiber state. The DOM value changes, but React's reconciler immediately overwrites it on the next render cycle. The field appears filled but the form submits empty strings.

**Why it happens:** React wraps native DOM inputs with a synthetic event layer. It stores the "real" value internally. Direct `.value =` assignment bypasses React's `onChange` handler entirely. Angular uses a similar zone.js-based change detection that also won't fire on raw DOM assignment.

**Consequences:** Autofill appears to work visually, but the site's submit handler reads stale React state. The user thinks the form is filled; submitting sends blank fields. Silent failure — very hard to debug without understanding the framework internals.

**Prevention:** Use the React internal value setter trick:

```js
// Works for React 16+ controlled inputs
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
).set;
nativeInputValueSetter.call(inputEl, 'your value');
inputEl.dispatchEvent(new Event('input', { bubbles: true }));
inputEl.dispatchEvent(new Event('change', { bubbles: true }));
```

For textareas, use `HTMLTextAreaElement.prototype`. For `<select>`, dispatch a `change` event after setting `.value`. Always dispatch both `input` and `change` events with `bubbles: true`.

**Detection:** Fill a field, then read its value back via the framework's devtools (React DevTools component inspector). If it shows empty while the DOM shows filled, you're hitting this pitfall.

**ATS platforms affected:** Greenhouse (React), Lever (React), LinkedIn Easy Apply (React), Ashby (React).

---

### Pitfall 2: Workday Shadow DOM — Forms Are Completely Isolated

**What goes wrong:** Workday application forms are rendered inside Shadow DOM trees (`attachShadow({ mode: 'open' })`). `document.querySelector('input[name="firstName"]')` returns `null` — not because the field doesn't exist, but because standard DOM queries don't pierce shadow roots.

**Why it happens:** Workday builds its UI as Web Components with shadow roots. Each component creates an isolated DOM subtree. Content scripts can access `document`, but `querySelector` only traverses the light DOM.

**Consequences:** The extension finds zero fields on Workday. Fill button does nothing. This affects one of the most common enterprise ATS platforms.

**Prevention:** Recursively traverse shadow roots:

```js
function queryShadowDOM(root, selector) {
  const results = [...root.querySelectorAll(selector)];
  root.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) results.push(...queryShadowDOM(el.shadowRoot, selector));
  });
  return results;
}
```

After finding shadow-DOM inputs, still apply the React synthetic event dispatch — Workday's Web Components use event listeners that expect proper bubbling.

**Detection:** Open DevTools on a Workday form. Inspect the DOM — you'll see `#shadow-root (open)` nodes attached to custom elements like `<wd-input>`.

**Note (LOW confidence):** Some Workday fields use `mode: 'closed'` shadow roots, which are inaccessible from content scripts entirely. This cannot be reliably worked around from a content script without injecting script into the page context via `chrome.scripting.executeScript`. Closed shadow roots may simply not be fillable.

---

### Pitfall 3: iFrame-Embedded Forms — Content Script Isolation

**What goes wrong:** Several ATS platforms embed their form in a cross-origin `<iframe>`. The content script running on `company.com` cannot access the DOM inside an iframe loaded from `greenhouse.io` or `lever.co`. Reading or writing anything inside the iframe throws a cross-origin security exception.

**Why it happens:** Browser security model: cross-origin iframes are isolated. Content scripts injected at the top-level frame do not automatically run inside child frames.

**Consequences:** The fill button does nothing; the extension can't see the form fields at all. This affects common embed patterns where companies put their Greenhouse/Lever form in an iframe on their careers page.

**Prevention:** In `manifest.json`, set `"all_frames": true` in the content script declaration:

```json
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": ["content.js"],
  "all_frames": true,
  "run_at": "document_idle"
}]
```

This injects the content script into every frame on the page, including iframes. Cross-origin iframes will have their own isolated content script instance that can access its own `document`. Use `chrome.runtime.sendMessage` to communicate between the frame content script and the extension popup.

**Detection:** On a careers page, check if the form is inside an `<iframe src="https://boards.greenhouse.io/...">` — that's a cross-origin embed. `document.querySelector('iframe')` in the console will show it.

---

### Pitfall 4: MV3 Service Worker Lifecycle — Gets Killed Mid-Operation

**What goes wrong:** In Manifest V3, background pages no longer exist. The background service worker is ephemeral — Chrome kills it after ~30 seconds of inactivity, or after a network request completes. Any in-memory state (variables, partial parse results, pending operations) is lost silently.

**Why it happens:** MV3 made this architectural change to improve browser performance and battery life. Service workers are designed to be stateless between activations.

**Consequences:** If the Gemini API call takes more than 30 seconds (large PDF), the service worker may be killed before the response arrives. Any state stored in `let cachedData = {}` at the module level vanishes between popup opens and content script messages.

**Prevention:**
1. Never store application state in service worker module-level variables. Use `chrome.storage.local` exclusively for persistence.
2. For the Gemini PDF parse call: use `chrome.storage.local.set({ parseStatus: 'pending' })` before the fetch, and write results immediately upon response. If the worker wakes up again, check storage first.
3. Use `chrome.storage.session` (MV3 addition) for ephemeral but session-persistent state that survives service worker restarts within a browser session.
4. Keep the service worker alive during long operations using `chrome.runtime.connect` from the popup (maintaining an open port prevents sleep while the port is open).

**Detection:** Add `console.log('SW init')` at the top of your service worker. If it logs multiple times during a single user session, the worker is being recycled.

---

### Pitfall 5: Content Security Policy Blocking Inline Scripts and External Fetches

**What goes wrong:** Some job sites have a strict `Content-Security-Policy` header that blocks `eval`, inline scripts, and connections to external origins. A content script that tries to dynamically create and execute script elements, or that uses `fetch()` to call the Gemini API directly from the page context, will be blocked.

**Why it happens:** CSP is enforced by the browser at the page level. Content scripts run in an isolated world but `fetch()` calls made from a content script that use the page's network context can be subject to the page's CSP.

**Consequences:** Fetch calls to `generativelanguage.googleapis.com` from a content script may be blocked by the site's CSP. The extension silently fails to make API calls.

**Prevention:** Never make external API calls (Gemini, etc.) from content scripts. Route all network requests through the service worker:
```js
// content.js — send message, don't fetch directly
chrome.runtime.sendMessage({ type: 'PARSE_RESUME', pdfBytes: bytes });

// service_worker.js — make the actual fetch here
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PARSE_RESUME') {
    fetch('https://generativelanguage.googleapis.com/...', ...)
      .then(r => r.json()).then(sendResponse);
    return true; // keep channel open
  }
});
```

Service workers are not subject to the page's CSP. They operate under the extension's own CSP, which you control in `manifest.json`.

**Detection:** Open DevTools console on the page where the extension runs. CSP violations appear as red console errors with "Content Security Policy" in the message.

---

### Pitfall 6: Form Field Detection Heuristics That Commonly Fail

**What goes wrong:** The heuristic matching logic (check `name`, `id`, `placeholder`, `aria-label`, associated `<label>` text) frequently fails in production because:

1. **Programmatically associated labels:** `<label for="field_3847291">First Name</label>` — the `for` attribute links to the input by ID, but many ATS platforms generate random numeric IDs that change per session. The label text "First Name" is never on the input itself.

2. **Aria-labelledby pointing to a separate element:** `<input aria-labelledby="lbl_abc123">` — you must look up `document.getElementById('lbl_abc123').textContent` to find the label, not query the input's own attributes.

3. **Placeholder text only, no label:** Common in minimalist form designs. "Enter your first name" is the only clue, but the field has `name="field_001"` and no `aria-label`.

4. **Select dropdowns for country/state:** ATS platforms frequently use custom `<div>`-based dropdowns (not native `<select>`) styled to look like dropdowns. `querySelectorAll('select')` won't find them.

5. **Multi-page forms:** Workday and Taleo advance through form sections without a full page reload. Fields not yet rendered on the current step can't be filled.

**Prevention:**
- Build a label-resolution helper that checks (in order): `aria-label`, `aria-labelledby` → resolved text, `<label for=id>` → text, `placeholder`, `name`, `id`. Walk all inputs through this to build a `{label: element}` map.
- For custom dropdowns: look for `role="combobox"`, `role="listbox"`, `role="option"` attributes in addition to native `<select>`.
- For multi-step forms: fill what's visible, detect "next" button clicks, and re-trigger fill on the new step. Listen for DOM mutations with `MutationObserver` to detect when new fields appear.
- Normalize labels: lowercase, strip punctuation, collapse whitespace before matching.

**Detection:** Log every field found and its resolved label before attempting to fill. Compare logged labels against what you see visually — gaps reveal missed fields.

---

### Pitfall 7: Gemini API — PDF Size Limits and Token Constraints

**What goes wrong:** Gemini's file API has upload size limits. Inline base64 PDF in the request body is capped at ~20MB for the inline approach. More critically, very long resumes or PDFs with embedded images (scanned resumes) consume large numbers of tokens and may hit the model's context window or timeout.

**Why it happens:** Gemini processes PDFs as a sequence of images (one per page) when using the vision modality. A 5-page resume with a fancy layout renders as 5 images, consuming far more tokens than plain text.

**Consequences:** Parse call fails with a 400 or 429 error. Extension shows an error and never caches data. User is stuck.

**Prevention:**
- Use the Gemini File API (upload the PDF as a file object, get a file URI back, reference that URI in the generation request) rather than inline base64. This supports up to 2GB and is the correct approach for binary files.
- Cap accepted PDF size to 10MB in the popup UI with a clear error message.
- Handle 429 rate limit errors with exponential backoff (max 3 retries).
- Prompt Gemini to extract text-only structured data (JSON), not to describe images — this keeps token usage lower.

**Detection:** Test with a visually complex resume (multi-column, logos, profile photo) and observe token usage and response time vs. a plain text resume.

---

### Pitfall 8: Chrome Web Store Review — Dangerous Permissions Rejections

**What goes wrong:** The extension requires `<all_urls>` host permission (to inject content scripts on every job site) and potentially `tabs` and `storage`. The Web Store review team flags extensions requesting broad host access for additional scrutiny, often requiring a detailed justification video or written explanation. Extensions that fail to justify broad permissions are rejected or limited to requiring user permission per site.

**Why it happens:** Google's post-2019 policy changes tightened review of extensions with `<all_urls>` or `*://*/*` permissions after malicious extensions were caught harvesting data. Extensions in the "job tools" category are actively watched.

**Consequences:** Months-long review delay, rejection, or forced migration to "optional host permissions" which requires the user to manually grant access on each new job site — significantly worse UX.

**Prevention:**
- Use `"optional_host_permissions": ["<all_urls>"]` instead of declaring it in `"host_permissions"` directly. This satisfies the reviewer while still allowing the extension to work everywhere (user grants on first use).
- Alternatively: declare only known ATS domains upfront (`greenhouse.io`, `lever.co`, `myworkdayjobs.com`, etc.) and request `<all_urls>` as optional.
- Write a clear privacy policy before submitting (required for any extension touching personal data).
- The privacy policy must state: resume data stays in `chrome.storage.local`, only the Gemini API call sends data externally, no third-party sharing.

**Detection:** Pre-submission: use the Chrome Extension Store Developer Checklist and run the CRXcavator tool against your built extension.

---

### Pitfall 9: gemini-cli OAuth Token Access From Extension Context

**What goes wrong:** The extension needs to call the Gemini API using the user's existing `gemini-cli` OAuth token. That token is stored on the filesystem (likely `~/.config/gemini/` or similar). Chrome extensions run in a sandboxed browser context with no filesystem access. `fs.readFile` does not exist in an extension service worker.

**Why it happens:** Chrome extensions are sandboxed — no Node.js APIs, no filesystem. The `chrome.*` APIs are available, but there is no API to read arbitrary files from the user's home directory.

**Consequences:** The entire "reuse gemini-cli credentials" approach is architecturally incompatible with a pure Chrome extension. The extension cannot read the OAuth token file. This is a fundamental design mismatch.

**Prevention (options, in order of preference):**
1. **Require the user to paste their Gemini API key into the extension popup once.** Store it in `chrome.storage.local`. This is the simplest and most standard approach — abandon the gemini-cli integration entirely.
2. **Use a native messaging host:** Build a small local companion app/script that the extension talks to via `chrome.runtime.connectNative`. The companion script reads the token file and returns it. Requires the user to install the companion and register it. High friction.
3. **Re-authenticate in the popup using OAuth:** Implement a proper OAuth flow using `chrome.identity.launchWebAuthFlow` to get a Gemini token directly, independent of gemini-cli. Clean but requires setting up a Google Cloud OAuth client ID.

**This pitfall invalidates the current KEY DECISION in PROJECT.md.** The "Gemini via gemini-cli OAuth" approach needs to be revisited before building Phase 1.

**Detection:** Attempt `fs.readFile` in a service worker — it will throw `ReferenceError: fs is not defined` immediately.

---

### Pitfall 10: File Upload Input Fields — Never Fillable

**What goes wrong:** Most job applications include a "Upload Resume" file input (`<input type="file">`). It is a browser security invariant: JavaScript cannot programmatically set the value of a file input. Attempting to do so throws a security error. This is intentional and unfixable.

**Why it happens:** Allowing scripts to set file input values would let malicious pages silently exfiltrate files from the user's system.

**Consequences:** The one field that would be most useful to autofill (the resume upload itself) cannot be automated. The user will always need to manually upload their PDF.

**Prevention:** Explicitly skip `<input type="file">` fields in the fill logic. Optionally: after filling all other fields, highlight the file input with a visual indicator (colored border, tooltip) telling the user "Please attach your resume here."

**Detection:** Attempt `fileInput.files = new FileList()` — throws immediately.

---

### Pitfall 11: Autofill Interfering With Password Managers and Browser Autofill

**What goes wrong:** Chrome has its own autofill for forms. Some password managers (1Password, Bitwarden) also inject into forms. If your extension fires `input` and `change` events on fields, it can trigger or conflict with browser autofill, causing fields to be overwritten after your extension fills them, or causing browser autofill dropdowns to appear and block the form visually.

**Why it happens:** Browsers monitor `focus`, `input`, and `change` events to show autofill suggestions. Programmatically dispatched events can trigger this monitoring.

**Prevention:** Dispatch events with `{ bubbles: true }` but also `{ cancelable: false }` to signal they're not user-initiated where possible. More practically: fill fields in a single synchronous pass rather than with delays, so browser autofill logic doesn't activate between fills. Test with Chrome autofill enabled.

**Detection:** Fill a form and observe whether Chrome's autofill dropdown appears after your extension fires. Watch for fields being overwritten by browser autofill 100–500ms after your extension fills them.

---

## Moderate Pitfalls

### Pitfall 12: `<select>` Dropdowns for Country/State/Province

**What goes wrong:** Setting `select.value = 'United States'` fails if the option's value attribute is `'US'` or `'1'` or some opaque internal ID. Each ATS platform uses different option values for the same semantic data.

**Prevention:** Match by option text content, not value attribute. Iterate `select.options` and find the option whose `.textContent.trim()` fuzzy-matches the desired value. Use a small lookup table for common aliases ('US' → 'United States', 'USA' → 'United States').

### Pitfall 13: Phone Number Format Mismatch

**What goes wrong:** The cached phone number is `+1-555-867-5309`. The form has three separate fields (area code, exchange, number) or uses a masked input (`(___) ___-____`) that requires specific keystrokes to fill correctly.

**Prevention:** Store phone number as digits only. Detect masked inputs by checking for `inputmode="tel"` plus a `pattern` attribute or known masking library class names (`iti__` prefix from intl-tel-input). For three-field splits, detect by proximity and label pattern matching. For masked inputs, simulate individual character input events if needed or use the native value setter with the unmasked digit string.

### Pitfall 14: Dynamic Forms That Fetch New Questions Based on Previous Answers

**What goes wrong:** Some Workday and iCIMS forms conditionally render new questions when you answer previous ones (e.g., selecting "Yes" for "Do you require visa sponsorship?" reveals a new field). Filling everything in one pass misses conditionally revealed fields.

**Prevention:** After filling, use `MutationObserver` on the form container to detect newly added input elements. Re-run the fill pass on any new fields that appear within 2 seconds of the initial fill.

---

## Minor Pitfalls

### Pitfall 15: Extension Popup Closes on Navigation

**What goes wrong:** If the user has to navigate to a new page within the application flow (e.g., Workday's multi-page apply), the popup closes. State in popup JS is lost.

**Prevention:** Store all state in `chrome.storage.local` or `chrome.storage.session`, never in popup JS variables. The content script persists between popup opens.

### Pitfall 16: `run_at: document_idle` May Be Too Late for Dynamically Loaded SPAs

**What goes wrong:** For React SPAs, `document_idle` fires when the initial HTML is parsed, but the React app may render its form 2–5 seconds later via async data fetching. The content script initializes before the form exists.

**Prevention:** Use `MutationObserver` on `document.body` to watch for form elements appearing after initial load, rather than querying once at initialization.

### Pitfall 17: Storage Quota Limits

**What goes wrong:** `chrome.storage.local` has a 10MB default quota (for MV3 extensions without `unlimitedStorage` permission). A large structured JSON of resume Q&A data is unlikely to hit this, but storing the raw PDF bytes (for re-parsing) will.

**Prevention:** Never store the raw PDF in `chrome.storage`. Store only the parsed JSON output. If re-parsing is needed, ask the user to re-upload. Keep the stored JSON lean — avoid redundant fields.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Gemini API integration | gemini-cli token inaccessible from extension (Pitfall 9) | Decide on API key UX before writing any auth code |
| PDF parse call | Service worker killed during long Gemini request (Pitfall 4) | Use open port to keep SW alive; persist status to storage immediately |
| Field filling — React sites | Silent fill failure on React inputs (Pitfall 1) | Use native input value setter + dispatch both `input` and `change` |
| Field filling — Workday | Shadow DOM — fields not found (Pitfall 2) | Recursive shadow root traversal required |
| Field filling — iFrame ATS embeds | Content script can't see iframe DOM (Pitfall 3) | `all_frames: true` in manifest |
| Field detection | Labels not on the input element (Pitfall 6) | Multi-strategy label resolver (aria-labelledby, for/id, placeholder) |
| File upload field | Resume file input cannot be set programmatically (Pitfall 10) | Skip and highlight to user |
| Web Store submission | `<all_urls>` permission triggers review scrutiny (Pitfall 8) | Use optional host permissions; write privacy policy first |

---

## ATS Platform Coverage Summary

| Platform | Primary Challenge | Difficulty |
|----------|------------------|------------|
| Greenhouse | React synthetic events (Pitfall 1), iFrame embed (Pitfall 3) | Medium |
| Lever | React synthetic events (Pitfall 1) | Medium |
| Workday | Shadow DOM (Pitfall 2), multi-step dynamic forms (Pitfall 14) | High |
| LinkedIn Easy Apply | React synthetic events (Pitfall 1), popup-in-page modal | Medium |
| Ashby | React synthetic events (Pitfall 1) | Medium |
| Taleo (Oracle) | Multi-page full reload navigation, legacy DOM | Medium |
| iCIMS | Dynamic conditional fields (Pitfall 14), iFrame embeds (Pitfall 3) | Medium-High |
| Custom company forms | Unpredictable field naming, any combination of above | Variable |

---

## Sources

- Chrome Extension MV3 documentation — service worker lifecycle, content script isolation, storage APIs (training knowledge, HIGH confidence; verify at developer.chrome.com/docs/extensions/mv3)
- Chrome security model — cross-origin iframe isolation, file input security (HIGH confidence; fundamental browser security invariants, unchanged for years)
- React controlled input behavior — synthetic event system, internal fiber state (HIGH confidence; well-documented React behavior)
- Workday Shadow DOM — Web Components pattern (MEDIUM confidence; widely reported in developer communities but Workday internals not publicly documented)
- Gemini API file handling — upload limits, PDF processing (MEDIUM confidence; verify current limits at ai.google.dev/gemini-api/docs/vision)
- Chrome Web Store review policies — permission scrutiny (MEDIUM confidence; policies updated frequently, verify at developer.chrome.com/docs/webstore/program-policies)
- gemini-cli OAuth token storage location (LOW confidence; internal implementation detail, verify by inspecting actual gemini-cli source before building)
