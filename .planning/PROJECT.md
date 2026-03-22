# Job Autofill Extension

## What This Is

A Chrome browser extension that parses a user's resume PDF once using Gemini AI, pre-generates answers to every common job application question, and caches them locally. When the user visits any job application form, they click the extension popup and hit "Fill this form" — the extension matches cached answers to form fields and fills them automatically.

## Core Value

One resume upload fills any job form, instantly, on any site — no repeated copy-paste, no per-form configuration.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can upload a resume PDF in the extension popup
- [ ] Extension parses the PDF and sends it to Gemini (via gemini-cli OAuth) to extract structured data and pre-generate answers to all common application questions
- [ ] Parsed answers are cached locally in Chrome extension storage
- [ ] User can view and manually edit cached answers
- [ ] On any job application form, clicking the extension icon shows a popup with a "Fill this form" button
- [ ] Extension scans the page for form fields and matches them to cached answers using label/heuristic matching
- [ ] Matched fields are filled automatically; unrecognized/custom fields are left blank
- [ ] Extension works on any site — Greenhouse, Lever, Workday, custom company forms, etc.

### Out of Scope

- AI-generated answers for custom questions ("why us?", "describe a challenge") — fills only what the resume contains
- Auto-detecting job forms without user triggering — user explicitly clicks to fill
- Firefox/Safari support — Chrome (Manifest V3) only for v1
- Cover letter generation — out of scope for initial release

## Context

- **Tech stack:** Chrome Extension (Manifest V3), vanilla JS or lightweight framework, chrome.storage for caching
- **AI integration:** Gemini API via the user's existing gemini-cli OAuth credentials — no separate API key setup needed
- **PDF parsing:** Handled by Gemini (multimodal) — send PDF bytes, receive structured JSON of resume data + pre-computed Q&A pairs
- **Field matching:** Heuristic/keyword matching against field labels, placeholders, and aria-labels — covers name, email, phone, address, current company, job title, education, skills, years of experience, LinkedIn URL, GitHub URL, portfolio URL, salary expectations
- **Distribution:** Load unpacked for personal use initially; Chrome Web Store submission later (requires Manifest V3 compliance, privacy policy)

## Constraints

- **Tech:** Chrome Manifest V3 — service workers only, no persistent background pages, strict CSP
- **Auth:** Must integrate with gemini-cli's existing OAuth token storage (likely `~/.gemini/` or similar) — no separate credential setup
- **Privacy:** Resume data stays local (chrome.storage) — nothing sent to external servers except the one-time Gemini parse call
- **Distribution:** Chrome Web Store policies require clear data handling disclosure if published

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pre-cache all common Q&A on parse | Avoids real-time AI calls per form field — faster, works offline after initial parse | — Pending |
| Gemini via gemini-cli OAuth | User already authenticated, no extra API key management | — Pending |
| Heuristic field matching (not per-field AI) | Sufficient for structured fields (name, email, etc.); avoids latency and cost on every fill | — Pending |
| Chrome only (MV3) | Largest market share, required for Web Store; Firefox differs enough to be a separate effort | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-22 after initialization*
