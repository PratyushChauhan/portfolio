# Requirements: Job Autofill Extension

**Defined:** 2026-03-22
**Core Value:** One resume upload fills any job form, instantly, on any site — no repeated copy-paste, no per-form configuration.

## v1 Requirements

### Auth

- [ ] **AUTH-01**: User authenticates with Google via in-extension OAuth (chrome.identity) on first use
- [ ] **AUTH-02**: OAuth token is stored in chrome.storage and refreshed silently on subsequent uses
- [ ] **AUTH-03**: User can sign out and re-authenticate from extension settings

### Resume Parse

- [ ] **PARSE-01**: User can upload a resume PDF from the extension popup
- [ ] **PARSE-02**: Extension sends PDF to Gemini API (multimodal) and receives structured Q&A data
- [ ] **PARSE-03**: Parse results are cached in chrome.storage.local — persists across browser restarts
- [ ] **PARSE-04**: User can trigger a re-parse to update cached data when resume changes
- [ ] **PARSE-05**: Cached profile covers all common fields: name, email, phone, address, current company, job title, years of experience, education history, skills, LinkedIn URL, GitHub URL, portfolio URL, salary expectations

### Profile Editor

- [ ] **PROF-01**: User can view all cached Q&A pairs in the extension popup
- [ ] **PROF-02**: User can manually edit any cached answer
- [ ] **PROF-03**: Edited values are persisted immediately to chrome.storage

### Form Fill — Core ATS

- [ ] **FILL-01**: Clicking "Fill this form" in the popup triggers autofill on the current page
- [ ] **FILL-02**: Extension detects form fields by scanning labels, placeholders, name attributes, and aria-labels
- [ ] **FILL-03**: Matched fields are filled using synthetic React-compatible events (works on Greenhouse, Lever, LinkedIn Easy Apply)
- [ ] **FILL-04**: Unrecognized and custom fields are left blank — no guessing
- [ ] **FILL-05**: User sees a summary of how many fields were filled vs skipped

### Form Fill — Extended Coverage

- [ ] **FILL-06**: Extension handles Workday forms (shadow DOM traversal, ARIA widget pattern)
- [ ] **FILL-07**: Extension handles forms in iframes (same-origin only — cross-origin is blocked by browser)
- [ ] **FILL-08**: Extension handles multi-step / paginated application forms (fills current visible page)

### File Upload

- [ ] **FILE-01**: Extension skips file upload inputs (resume attachment) — browser security prevents programmatic file injection; user is prompted to attach manually

## v2 Requirements

### Extended ATS

- **EXT-01**: Ashby support
- **EXT-02**: iCIMS support
- **EXT-03**: SmartRecruiters support

### Smart Fill

- **SMART-01**: AI-generated draft answers for custom questions ("why this company?") — optional, user-triggered per field
- **SMART-02**: Job description context — user pastes JD, extension tailors fill to match job keywords

### Quality of Life

- **QOL-01**: Fill history — log of forms filled with timestamps and sites
- **QOL-02**: Per-site overrides — different answers for specific employers
- **QOL-03**: Firefox support

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-submit forms | Trust-destroying; universally hated in competing tools |
| Auto-detect and fill without user trigger | Removes user control; could mis-fill sensitive fields |
| Cover letter generation | Different product; out of scope for v1 |
| AI answers for custom questions | Deferred to v2 (SMART-01) |
| Cross-origin iframe fill | Browser security invariant — cannot be worked around |
| File/resume attachment autofill | Browser security invariant — file inputs cannot be set programmatically |
| Firefox/Safari | MV3 implementation differences; separate effort |
| Storing resume data on external servers | Privacy requirement — everything stays local |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| PARSE-01 | Phase 1 | Pending |
| PARSE-02 | Phase 1 | Pending |
| PARSE-03 | Phase 1 | Pending |
| PARSE-04 | Phase 1 | Pending |
| PARSE-05 | Phase 1 | Pending |
| PROF-01 | Phase 2 | Pending |
| PROF-02 | Phase 2 | Pending |
| PROF-03 | Phase 2 | Pending |
| FILL-01 | Phase 2 | Pending |
| FILL-02 | Phase 2 | Pending |
| FILL-03 | Phase 2 | Pending |
| FILL-04 | Phase 2 | Pending |
| FILL-05 | Phase 2 | Pending |
| FILE-01 | Phase 2 | Pending |
| FILL-06 | Phase 3 | Pending |
| FILL-07 | Phase 3 | Pending |
| FILL-08 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
