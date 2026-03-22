# Roadmap: Job Autofill Chrome Extension

## Overview

Three phases take a Chrome extension from empty repo to a fully working autofill tool. Phase 1 wires together the auth and parse pipeline — the prerequisite every other feature depends on. Phase 2 delivers the core product loop: a populated profile editor and reliable form fill on the three ATS platforms that cover most tech job applications. Phase 3 extends coverage to Workday's shadow DOM, iframe-embedded forms, and multi-step wizards, completing the "works anywhere" promise.

## Phases

- [ ] **Phase 1: Foundation + Auth + Parse Pipeline** - Extension scaffold, Google OAuth, PDF → Gemini parse → local cache
- [ ] **Phase 2: Profile Editor + Core Form Fill** - Cached profile view/edit, content script field fill on Greenhouse, Lever, LinkedIn Easy Apply
- [ ] **Phase 3: Extended Coverage** - Workday shadow DOM, same-origin iframes, multi-step paginated forms

## Phase Details

### Phase 1: Foundation + Auth + Parse Pipeline
**Goal**: User can authenticate with Google, upload a resume PDF, and have structured answers cached locally — ready for fill
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05
**Success Criteria** (what must be TRUE):
  1. User can click the extension icon, sign in with Google via an in-browser OAuth popup, and remain signed in across browser restarts without re-authenticating
  2. User can upload a resume PDF from the extension popup and see a spinner while Gemini processes it
  3. After parse completes, all structured fields are visible in the popup (name, email, phone, address, LinkedIn, GitHub, portfolio, current title, current company, years of experience, education, skills, salary expectation)
  4. Closing and reopening the browser shows the same cached answers — no re-upload needed
  5. User can trigger a re-parse by uploading a new PDF, and the cached answers update to reflect the new resume
**Plans**: TBD

Plans:
- [ ] 01-01: Extension scaffold — Vite + @crxjs/vite-plugin, TypeScript, manifest.json (MV3), popup/service worker/content script entrypoints, chrome.storage wired up
- [ ] 01-02: Google OAuth via chrome.identity — launchWebAuthFlow, token storage + silent refresh, sign out from settings
- [ ] 01-03: PDF parse pipeline — FileReader in popup, base64 to service worker, Gemini multimodal call, flat cache write, keepAlive port during SW call

### Phase 2: Profile Editor + Core Form Fill
**Goal**: User can review and edit their cached profile, then fill a Greenhouse, Lever, or LinkedIn Easy Apply form in one click
**Depends on**: Phase 1
**Requirements**: PROF-01, PROF-02, PROF-03, FILL-01, FILL-02, FILL-03, FILL-04, FILL-05, FILE-01
**Success Criteria** (what must be TRUE):
  1. User can open the popup on any page, view all cached Q&A pairs, edit any field inline, and see edits persist immediately after closing and reopening the popup
  2. Clicking "Fill this form" on a Greenhouse application page fills all recognizable fields (name, email, phone, address, LinkedIn, GitHub, current title, current company, years experience, education, skills) and leaves custom fields blank
  3. The same fill action works correctly on Lever and LinkedIn Easy Apply — filled fields commit to the framework state and do not submit as empty
  4. The popup shows a summary ("12 of 14 fields filled") after every fill action
  5. File upload inputs (resume attachment) are skipped, and the user sees a prompt to attach manually
**Plans**: TBD

Plans:
- [ ] 02-01: Profile editor UI — React popup with view/edit mode for all cached fields, immediate chrome.storage write on change
- [ ] 02-02: Content script fill engine — multi-strategy label resolver (aria-label → aria-labelledby → label[for] → placeholder → name), native value setter + synthetic input/change event dispatch, all_frames injection, fill summary response

### Phase 3: Extended Coverage
**Goal**: The extension reliably fills Workday forms and handles iframe-embedded and multi-step application flows
**Depends on**: Phase 2
**Requirements**: FILL-06, FILL-07, FILL-08
**Success Criteria** (what must be TRUE):
  1. Clicking "Fill this form" on a Workday application page fills all fillable fields — fields behind closed shadow roots are explicitly skipped with a visible indicator rather than silently failing
  2. When a job application form is embedded in a same-origin iframe, the fill action reaches fields inside the iframe and fills them correctly
  3. On a multi-step application (e.g., page 1 of 3), "Fill this form" fills all visible fields on the current page; advancing to the next page and clicking again fills the new fields
**Plans**: TBD

Plans:
- [ ] 03-01: Shadow DOM + iframe traversal — recursive queryShadowDOM helper, allFrames: true injection, closed shadow root detection with skip indicator
- [ ] 03-02: Multi-step form handling — MutationObserver for new fields after page transitions, re-fill on demand per visible page

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Auth + Parse Pipeline | 0/3 | Not started | - |
| 2. Profile Editor + Core Form Fill | 0/2 | Not started | - |
| 3. Extended Coverage | 0/2 | Not started | - |
