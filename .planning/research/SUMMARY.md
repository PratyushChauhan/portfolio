# Project Research Summary

**Project:** Job Autofill Chrome Extension
**Domain:** Chrome MV3 browser extension — AI-powered resume parse + job form autofill
**Researched:** 2026-03-22
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a Chrome Manifest V3 extension with three isolated execution contexts (popup, service worker, content script) that must collaborate via message passing. The core product loop is: user uploads resume PDF once → Gemini parses it into a flat key-value cache → content script fills any job form on demand using heuristic label matching. The architecture is well-understood and MV3 APIs are stable. The implementation risk is not the happy path — it is the hostile DOM environments found in production job sites (React synthetic events, Workday shadow DOM, iframe-embedded ATS forms) that will break naive fill implementations.

The auth decision is resolved: Google OAuth in-extension via `chrome.identity.launchWebAuthFlow`. The original PROJECT.md assumption of reusing gemini-cli filesystem tokens is architecturally impossible from a sandboxed extension — both STACK.md and PITFALLS.md independently confirmed this. `chrome.identity` OAuth (one Google sign-in, stored token) satisfies the original user requirement (no API key management) without native host complexity. The manifest needs `"identity"` permission and an `"oauth2"` block with a Google Cloud OAuth client ID registered for the Chrome Extension client type.

The biggest implementation risks are: (1) React/Angular controlled inputs that ignore direct `.value` assignment — requires the native input value setter trick plus synthetic event dispatch on every fill; (2) Workday's shadow DOM requiring recursive traversal; (3) `<all_urls>` host permission triggering Chrome Web Store review scrutiny. All three have known mitigations. Phase these risks by deferring Workday to its own phase and using optional host permissions from the start.

## Key Findings

### Recommended Stack

Build with Vite 5.x + `@crxjs/vite-plugin` 2.x (MV3-aware) for the build pipeline. TypeScript throughout — `@types/chrome` catches boundary mistakes at compile time. React 18 in the popup only (multi-view state justifies it); vanilla TypeScript in the content script (no framework overhead injected into host pages). Tailwind CSS 3.x for popup styling — avoid CSS-in-JS which conflicts with extension CSP.

Auth: `chrome.identity.launchWebAuthFlow` with Google OAuth 2.0 implicit flow. Gemini client: `@google/generative-ai` SDK (official, typed). PDF handling: `FileReader.readAsArrayBuffer` in popup context, passed as base64 to service worker for inline Gemini multimodal call — no pdf.js needed. All persistent state in `chrome.storage.local`; ephemeral tab state in `chrome.storage.session`.

**Core technologies:**
- **Vite 5.x + @crxjs/vite-plugin 2.x**: build pipeline — MV3-aware HMR, auto-generates manifest entries, eliminates manual entrypoint wiring
- **TypeScript 5.x**: type safety — `@types/chrome` enforces extension API boundaries at compile time
- **React 18.x**: popup UI only — multi-view state (setup, answers editor, fill status) justifies component model
- **Tailwind CSS 3.x**: popup styling — utility-first, no runtime style injection, no CSP conflicts
- **@google/generative-ai SDK**: Gemini API client — official, typed, handles multimodal PDF parts
- **chrome.identity (built-in)**: OAuth — `launchWebAuthFlow` gives one-click Google login with no API key management
- **chrome.storage.local**: all persistence — survives service worker restarts, sandboxed per extension
- **gemini-1.5-flash**: AI model — best cost/performance for structured extraction from PDFs

### Expected Features

**Must have (table stakes):**
- Fill name (first/last/full), email, phone — present on 100% of forms
- Fill address fields (street, city, state, zip, country) — present on most ATS forms
- Fill LinkedIn, GitHub, portfolio URLs — expected on all tech job forms
- Fill current title, current company, years of experience — common standalone fields
- Fill education (school, degree, field, graduation year)
- Fill skills (free-text and checkbox variants)
- Works on Greenhouse — largest share of tech company ATS
- Works on Lever — common at startups, simpler DOM
- Works on LinkedIn Easy Apply — massive user base expectation
- Popup showing fill status ("12 of 14 fields filled")
- Manual edit of cached profile fields — correct AI parse errors

**Should have (differentiators):**
- Resume PDF → structured cache in one step (core differentiator vs. competitors requiring manual form entry)
- Universal heuristic matching — fills custom company career pages, not just whitelisted ATS
- Pre-cached answers with zero fill latency (offline-capable after initial parse)
- No cloud storage — privacy-first, everything in chrome.storage.local
- Works on Ashby — growing in VC-backed startups
- Salary expectation field handling

**Defer (v2+):**
- Workday support — shadow DOM + multi-step wizard + iframe; high enough complexity to deserve its own phase
- Multi-entry work history automation (add-row triggering) — complex dynamic UI
- AI-generated answers for custom open-text questions ("why us?") — out of scope per PROJECT.md
- Firefox/Safari support — separate effort

**Anti-features (never build):**
- Auto-submit, auto-detect without user click, server-side resume storage, password field interaction, file input fill (browser security invariant: cannot be automated)

### Architecture Approach

Three isolated execution contexts communicate via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`. The popup handles all user interaction and file reading (has DOM and FileReader access). The service worker handles all network calls (Gemini API, OAuth) and chrome.storage writes — it is event-driven and stateless between activations, so no module-level variables. The content script is injected on demand via `chrome.scripting.executeScript` when the user clicks "Fill this form" — vanilla TypeScript, no framework, idempotent (guard with `window.__autofillInjected`).

**Major components:**

1. **Popup (React + Tailwind)** — PDF upload via FileReader, send base64 to SW for parse; display Q&A cache for review/edit; "Fill" button triggers SW; shows fill result count. Closes when user clicks away — all state lives in chrome.storage, never popup JS variables.
2. **Service Worker (vanilla TS)** — receives PARSE_RESUME message, calls Gemini multimodal API, writes structured cache to chrome.storage.local; handles OAuth token lifecycle (get/refresh via chrome.identity); receives TRIGGER_FILL, injects content script, messages it with cached answers, forwards result back to popup. Keep alive during Gemini call via open `chrome.runtime.connect` port from popup.
3. **Content Script (vanilla TS)** — injected per-fill into active tab; recursively scans DOM (including shadow roots for Workday); builds label index from aria-label, aria-labelledby, label[for], placeholder, name attr; fuzzy-matches against answer keys; sets values using native input value setter + dispatches `input` + `change` events with `bubbles: true`; returns `{filled, total}` to SW.

**Storage schema (flat, not nested — simplifies field matching iteration):**
```
chrome.storage.local: { geminiToken, resumeCache: { full_name, email, phone, ... flat fields }, parsedAt, resumeFileName }
chrome.storage.session: { filledTabs: number[] }
```

**Manifest permissions:** `storage`, `scripting`, `activeTab`, `identity` + `"oauth2"` block. Use `"optional_host_permissions": ["<all_urls>"]` (not required) to avoid Web Store review friction.

### Critical Pitfalls

1. **React/Angular controlled inputs ignore `.value =` assignment** — Use `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)` then dispatch `new Event('input', { bubbles: true })` and `new Event('change', { bubbles: true })`. This affects Greenhouse, Lever, LinkedIn Easy Apply, Ashby. Do this on every fill, not just some fields.

2. **Workday shadow DOM — `querySelector` returns null** — Standard DOM queries don't pierce shadow roots. Implement recursive shadow traversal: for each element, check `.shadowRoot`, recurse. `queryShadowDOM(document, 'input, textarea, select')`. Workday may also use `mode: 'closed'` roots on some fields — those are not fillable from a content script.

3. **iFrame-embedded ATS forms — content script can't see iframe DOM** — Many companies embed Greenhouse/Lever forms in a cross-origin iframe on their careers page. Fix: `"all_frames": true` in content script declaration (or programmatic injection targeting `allFrames: true`). Each frame gets its own content script instance.

4. **Service worker killed during Gemini API call** — SW terminates after ~30s idle. If parse takes longer, the response is lost. Mitigation: maintain an open `chrome.runtime.connect` port from the popup while the call is in flight (prevents SW sleep). Also write `parseStatus: 'pending'` to storage before the call so state survives a restart.

5. **`<all_urls>` permission triggers Chrome Web Store rejection scrutiny** — Use `"optional_host_permissions": ["<all_urls>"]` from day one. The extension still works everywhere (user grants on first use), but the Web Store review sees optional rather than required broad access. Also write the privacy policy before submitting — required for any extension touching personal data.

6. **Label heuristic gaps** — Many ATS platforms use `aria-labelledby` pointing to a separate element (not `aria-label` on the input), or `<label for="random-id-4728">` with session-randomized IDs. Build a multi-strategy label resolver that checks in order: `aria-label` → `aria-labelledby` → `label[for=id]` text → `placeholder` → `name` attr. Log every resolved label during development to catch gaps.

## Implications for Roadmap

### Phase 1: Foundation + PDF Parse Pipeline

**Rationale:** Nothing else can be built until the core value loop exists end to end. Auth, PDF upload, Gemini parse, and local cache are the dependency for every subsequent phase. Establishing the 3-component architecture correctly here prevents rewrites later.

**Delivers:** Working extension skeleton with popup, service worker, content script. Google OAuth via chrome.identity (one-time setup). PDF upload → Gemini multimodal call → structured JSON written to chrome.storage.local. Popup displays cached answers for review.

**Features from FEATURES.md:** Resume PDF → structured profile (core differentiator), manual edit of cached answers, persist data across sessions.

**Pitfalls to avoid:**
- Do not attempt gemini-cli token reuse — use chrome.identity from the start (Pitfall 9)
- Keep SW alive during Gemini call with open port (Pitfall 4)
- Use flat storage schema from the start — nested objects complicate field matching later

**Research flag:** Standard patterns — MV3 service worker + chrome.identity is well-documented. No additional research phase needed.

---

### Phase 2: Core Form Fill — Greenhouse, Lever, LinkedIn Easy Apply

**Rationale:** These three platforms cover the majority of tech job applications. Lever has the simplest DOM (quick win), Greenhouse has the largest market share (highest priority), and LinkedIn Easy Apply has the most user expectation. Solving React synthetic events here (the universal challenge across all three) gives a reusable pattern for every subsequent platform.

**Delivers:** Content script with multi-strategy label resolver, native input value setter + synthetic event dispatch, fill status reporting back to popup. Works reliably on Greenhouse, Lever, and LinkedIn Easy Apply. User sees "X of Y fields filled" in popup.

**Features from FEATURES.md:** All table-stakes fill fields (name, email, phone, address, LinkedIn, GitHub, current title/company, years of experience, education, skills). Popup fill status display.

**Pitfalls to avoid:**
- React synthetic events (Pitfall 1) — native value setter + input+change dispatch is mandatory here
- iFrame embeds on Greenhouse (Pitfall 3) — `all_frames: true` from the start
- Label heuristic gaps (Pitfall 6) — multi-strategy resolver, log everything
- `<select>` option value mismatch (Pitfall 12) — match by text content, not value attribute

**Research flag:** Standard patterns well-documented. React synthetic event fix is a known community solution. No additional research phase needed.

---

### Phase 3: Extended Coverage — Workday + Custom Company Forms

**Rationale:** Workday is the hardest platform (shadow DOM, multi-step wizard, ARIA-only widgets) and warrants isolation from Phase 2 to avoid contaminating the simpler fill logic with Workday-specific hacks. Custom forms complete the "works anywhere" promise. These are deferred from MVP but needed before Web Store submission.

**Delivers:** Recursive shadow DOM traversal for Workday. `MutationObserver`-based re-fill for multi-step forms (fills what's visible, detects new fields as pages advance). Custom form heuristic matching with `name` attribute fallback. Ashby coverage.

**Features from FEATURES.md:** Universal form compatibility (heuristic matching), works on Workday, works on Ashby, works on custom company career pages.

**Pitfalls to avoid:**
- Shadow DOM traversal (Pitfall 2) — `queryShadowDOM` recursive helper
- Dynamic conditional fields (Pitfall 14) — MutationObserver after initial fill
- run_at document_idle timing for React SPAs (Pitfall 16) — MutationObserver on body

**Research flag:** Workday internals (shadow root modes, ARIA widget patterns) are MEDIUM confidence. Plan for discovery during implementation — closed shadow roots on some fields may not be fillable and need to be explicitly skipped with a user-visible indicator.

---

### Phase 4: Polish + Chrome Web Store Submission

**Rationale:** Web Store submission has specific requirements (privacy policy, permission justification, review process) that need deliberate preparation rather than being bolted on. Edge case hardening (phone format, country/state dropdowns, file input highlighting) completes the user experience.

**Delivers:** Optional host permissions migration (from required to optional `<all_urls>`). Privacy policy written and hosted. Edge case fixes: phone number format normalization (Pitfall 13), country/state select matching by text content, file input skip + visual highlight (Pitfall 10), browser autofill conflict mitigation (Pitfall 11). Extension icon, store listing assets, description.

**Features from FEATURES.md:** Salary field handling. Complete browser-compatible behavior on phone fields and address dropdowns.

**Pitfalls to avoid:**
- Web Store broad permission rejection (Pitfall 8) — optional host permissions, clear privacy policy, no inline eval
- Storage quota (Pitfall 17) — never store raw PDF bytes, only parsed JSON

**Research flag:** Chrome Web Store review policies change frequently. Verify current policy requirements at developer.chrome.com/docs/webstore/program-policies at submission time.

---

### Phase Ordering Rationale

- Phase 1 must come first — auth + parse pipeline is the prerequisite for all fill logic
- Phase 2 before Phase 3 — solve React synthetic events on simpler DOM (Lever) before tackling Workday shadow DOM complexity; reuse the pattern, don't discover it mid-Workday
- Phases 2 and 3 are decoupled — content script from Phase 2 is additive; Workday shadow traversal is a separate helper, not a rewrite
- Phase 4 is explicitly last — Web Store prep requires a stable, tested extension; premature permission restructuring wastes effort

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Workday):** Shadow DOM `mode: 'closed'` behavior, current ARIA widget event requirements — live Workday form testing required to confirm what is and is not fillable. Plan for some fields being intentionally unfillable.
- **Phase 4 (Web Store):** Review policy details — check current policy page at submission time; requirements have changed before and may again.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Chrome MV3 service worker + chrome.identity OAuth is thoroughly documented. Standard patterns apply.
- **Phase 2:** React synthetic event fix is a community-standard known solution. Greenhouse/Lever/LinkedIn DOM structures are well-understood.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | MV3 APIs stable since Chrome 112. @crxjs/vite-plugin v2 beta but widely used. Vite + React + Tailwind is low-risk. Only uncertainty: @crxjs v2 beta status. |
| Features | MEDIUM-HIGH | Greenhouse/Lever/Workday/LinkedIn behavior is HIGH confidence from documentation and community. Ashby and custom forms are MEDIUM. Platform-specific quirks may have changed since training cutoff (Aug 2025). |
| Architecture | HIGH | 3-component MV3 model is definitive Chrome extension architecture. Message passing patterns, storage model, and security boundaries are stable API facts. |
| Pitfalls | HIGH (critical) / MEDIUM (platform-specific) | React synthetic event behavior and SW lifecycle are HIGH confidence — fundamental browser invariants. Workday shadow DOM specifics and Web Store review policies are MEDIUM — verify at implementation time. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Gemini API endpoint and model name:** Verify `gemini-1.5-flash` availability and the current multimodal PDF REST endpoint at implementation time (`ai.google.dev/gemini-api/docs`). Model names and endpoints have changed between releases.
- **Google Cloud OAuth client registration:** Must register a Chrome Extension OAuth client in Google Cloud Console before Phase 1 can be completed. This is a 10-minute task but requires a GCP project and is a hard dependency for the auth flow.
- **Workday closed shadow roots:** Training data suggests some Workday fields use `mode: 'closed'` shadow roots. Verify on a live Workday form in Phase 3 — if confirmed, those fields must be explicitly skipped with a user-visible indicator rather than silently failing.
- **@crxjs/vite-plugin v2 stability:** The plugin was in beta as of mid-2025. Check for a stable release or known breaking issues before starting Phase 1. Fallback: manual Vite entrypoint config (documented in STACK.md).
- **Chrome Web Store review policies:** Policies for extensions requesting `<all_urls>` have tightened repeatedly. Read the current policy page before Phase 4 — do not rely on research findings from prior to submission.

## Sources

### Primary (HIGH confidence)
- Chrome Extension MV3 documentation — service worker lifecycle, content script isolation, chrome.identity, chrome.storage APIs (training knowledge; MV3 stable since Chrome 112, 2023)
- Chrome security model — cross-origin iframe isolation, file input security invariants (fundamental browser security, unchanged)
- React controlled input behavior — synthetic event system, internal fiber state (well-documented React behavior, HIGH confidence)

### Secondary (MEDIUM confidence)
- @crxjs/vite-plugin v2 — https://crxjs.dev/ (beta status as of mid-2025; verify current release)
- Workday shadow DOM and ARIA widget patterns — widely reported in developer/scraping communities; not officially documented by Workday
- Gemini multimodal PDF API — `ai.google.dev`; verify current endpoint and model names at implementation
- Greenhouse/Lever/LinkedIn Easy Apply DOM structures — ATS integration guides and community documentation
- Chrome Web Store review policies — `developer.chrome.com/docs/webstore/program-policies`; check at submission time

### Tertiary (LOW confidence)
- Ashby form structure — newer platform, limited documentation in training data; assume Lever-like until live testing confirms
- gemini-cli OAuth token storage path — `~/.gemini/` or `~/.config/gemini/`; irrelevant now that chrome.identity is the chosen approach, but noted for completeness

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
