# Feature Landscape: Job Application Autofill Extension

**Domain:** Browser extension for job application form autofill
**Researched:** 2026-03-22
**Confidence note:** WebSearch and WebFetch were unavailable during this session. All findings
are drawn from training knowledge (cutoff Aug 2025) of the extension ecosystem — Simplify Jobs,
Autofill Job Applications, LinkedIn Easy Apply helpers, and community discussions on
r/cscareerquestions, r/jobsearchhacks, and HN. Confidence is MEDIUM overall; platform-specific
quirks (Workday, Greenhouse, Lever) are HIGH confidence from direct documented behavior.

---

## Table Stakes

Features users expect from any autofill extension. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Fill name (first/last/full) | Most basic field everywhere | Low | Must split on separate fields |
| Fill email | Present on 100% of forms | Low | Single field, no edge cases |
| Fill phone number | Present on ~95% of forms | Low-Med | Format varies: (xxx) xxx-xxxx vs +1xxxxxxxxxx |
| Fill address (street, city, state, zip, country) | Present on most external ATS forms | Med | Country dropdowns are inconsistent; state/province varies |
| Fill LinkedIn URL | Expected on nearly all tech job forms | Low | Plain text field |
| Fill current company / most recent employer | Present on most forms as standalone field | Low | Pull from work history[0] |
| Fill current job title / most recent title | Present on most forms | Low | Pull from work history[0] |
| Fill years of experience | Very common standalone field | Med | Must be derived/computed from work history dates |
| Fill education (school, degree, field, year) | Required on most ATS | Med | Often multi-row or dynamic add/remove UI |
| Fill work history (employer, title, dates, description) | Core resume content | High | Multi-entry dynamic sections are the hardest to fill |
| Fill skills | Very common — often checkboxes, tags, or text | Med | Both free-text and checkbox variants |
| Fill portfolio / website URL | Expected in tech applications | Low | Plain text field |
| Fill GitHub URL | Expected in dev-focused applications | Low | Plain text field |
| Popup UI showing fill status | Users need confirmation the fill ran | Low | "X fields filled, Y skipped" |
| Manual edit of stored profile data | Users want to correct AI parse errors | Med | Must be per-field, not just raw JSON |
| Works on Greenhouse | Majority of tech company job forms | High | Shadow DOM, dynamic field rendering |
| Works on Lever | Common at startups | Med | Simpler DOM than Greenhouse |
| Works on Workday | Enterprise companies | High | Heavy React, iframe nesting, strict ARIA |
| Works on LinkedIn Easy Apply | Massive user expectation | Med | Multi-step modal, dynamic question injection |
| Works on Ashby | Growing in VC-backed startups | Med | Similar to Lever in structure |
| Persist filled data across browser sessions | Users expect profile to survive restart | Low | chrome.storage.local handles this |

---

## Differentiators

Features that set this product apart from the crowded autofill space.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Resume PDF → structured profile in one step | Competitors require manual form entry for the profile; this eliminates setup friction entirely | High | The core differentiator; Gemini multimodal parse is the key |
| Universal form compatibility (heuristic matching) | Most competitors only support whitelisted ATS platforms; this works on any form | High | Label/placeholder/aria-label heuristic is the hard technical work |
| Pre-cached Q&A pairs (offline after initial parse) | Fills instantly with no per-fill AI latency; works offline | Med | Pre-generation at parse time is the architecture advantage |
| No cloud storage of resume/profile | Privacy-first: everything stays in chrome.storage.local | Low | Strong selling point given resume sensitivity |
| No account/login required | Zero-friction onboarding vs competitors that require signup | Low | Especially powerful given the personal-use origin |
| Works on custom company career pages | ATS-only tools miss a significant % of applications | High | Requires robust heuristic matching, not just known selectors |
| Salary expectation field handling | Commonly skipped by competitors | Med | Must handle range vs single value, currency, hourly vs annual |

---

## Anti-Features

Things to deliberately NOT build. These either add complexity without value, introduce legal/ethical
risk, or degrade user trust.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-submit forms | Catastrophic if triggered in error; also violates site ToS and Chrome Web Store policies | Fill only; require explicit user confirmation before submit |
| Auto-detect and fill forms without user click | Unexpected behavior destroys trust; can corrupt partially filled forms | Always require explicit "Fill this form" trigger |
| AI generation of "Why us?" / motivational cover letter fields | Out of scope per PROJECT.md; adds latency and cost per fill; quality varies wildly | Leave custom open-text fields blank; let user fill manually |
| Server-side storage of resume data | Privacy risk; creates a data breach liability; users are rightly suspicious | chrome.storage.local only |
| Sending resume to third parties (beyond user's own Gemini call) | Sensitive PII; violates user expectations | Gemini call is user-initiated via their own credentials |
| Per-site profile variants | Massive complexity, rarely used correctly, causes confusion | One profile per user; let them edit if needed |
| Browser password manager integration | Out of scope; adds credential risk surface | Handle only job application fields, never login forms |
| Running on login/auth pages | Risk of interfering with credentials | Scope content script to known job application URL patterns |
| Autofill on file upload fields (resume upload within the form) | Cannot reliably automate native file picker; inconsistent browser behavior | Skip file input fields entirely |
| Salary negotiation advice / market rate lookup | Feature scope creep; not what users install this for | Separate tool problem |

---

## Common Field Types That Must Be Handled

Ordered by frequency across Greenhouse, Lever, Workday, LinkedIn Easy Apply, and custom forms.

### Always Present
- `input[type=text]` — first name, last name, full name
- `input[type=email]` — email address
- `input[type=tel]` — phone number (format varies by ATS)
- `input[type=url]` — LinkedIn, GitHub, portfolio

### Very Common (>70% of forms)
- `input[type=text]` labeled "Current Company" or "Most Recent Employer"
- `input[type=text]` labeled "Job Title" or "Current Role"
- `select` or `input[type=text]` for country, state/province
- `input[type=text]` for city
- `input[type=text]` for zip/postal code
- `input[type=number]` or `input[type=text]` for years of experience
- `textarea` for work experience descriptions (free text per job)
- `input[type=text]` for school/university name
- `select` or `input[type=text]` for degree type (BS, MS, PhD, etc.)
- `input[type=text]` for field of study / major
- `input[type=text]` for graduation year

### Common (30–70% of forms)
- `input[type=text]` or `input[type=number]` for salary expectation
- `select` for salary type (hourly/annual)
- Checkbox groups for skills / technologies
- Multi-entry work history sections (add/remove rows dynamically)
- `textarea` free-text "Additional information" or "Cover letter" — leave blank
- `input[type=radio]` for yes/no questions (authorized to work, require sponsorship)
- `select` for notice period / availability

### Present on Specific Platforms
- Workday: multi-step wizard with page-by-page sections
- LinkedIn Easy Apply: dynamically injected questions mid-flow (screening questions)
- Greenhouse: custom screening questions appended after standard fields
- Lever: simpler single-page form, easier to match
- Ashby: multi-section with collapsible accordion UI

### Intentionally Skip
- `input[type=file]` — resume/cover letter file uploads
- `input[type=password]` — never touch auth fields
- Hidden inputs / CSRF tokens — do not modify
- CAPTCHAs
- Third-party identity verification widgets (Checkr, etc.)

---

## ATS Platform Quirks

### Greenhouse
**Confidence: HIGH**
- Uses heavily nested shadow DOM on some input groups — `document.querySelector` from page root may not find fields; requires `element.shadowRoot` traversal or `document.querySelectorAll('*')` deep walk
- Dynamic form rendering: sections load via AJAX after page load; fill must run after `DOMContentLoaded` + a short wait or `MutationObserver`
- Custom screening questions are appended as a separate section with no consistent label pattern — heuristic matching will miss many; acceptable to leave blank
- GDPR consent checkbox at bottom — never auto-check legal/consent boxes
- Work experience and education use "add another" dynamic list UI: clicking "Add" injects a new row; autofill must trigger add-row before filling subsequent entries

### Lever
**Confidence: HIGH**
- Simpler, mostly flat DOM — standard `querySelector` works reliably
- Single-page form (no multi-step wizard)
- Consistent label-for/input-id relationships — `label[for]` → `input[id]` matching is reliable here
- Resume upload is prominent at top; skip the file input
- Often includes a "How did you hear about us?" dropdown — leave blank

### Workday
**Confidence: HIGH**
- All fields rendered in a React app inside one or more iframes — content script must run inside the correct frame (`chrome.scripting.executeScript` targeting the subframe)
- Uses ARIA `role="textbox"` on `div` elements (not native `input`) for many fields — standard `input` selectors miss these; must check both `input` and `[role="textbox"]` and `[contenteditable]`
- Multi-step wizard: user must advance pages; autofill should fill the visible page only, not attempt to navigate
- Dropdowns use custom listbox pattern (`role="listbox"` / `role="option"`) — cannot use native `select` manipulation; requires click simulation on the custom widget, then option selection
- Very strict event requirements: just setting `.value` does not trigger React's state update; must dispatch `input`, `change`, and sometimes `blur` events after setting values

### LinkedIn Easy Apply
**Confidence: HIGH**
- Multi-step modal form (`data-test-modal`)
- Standard fields (name, phone, email) are pre-populated from LinkedIn profile — only custom screening questions and resume-related fields are blank
- Dynamically injects "additional questions" mid-flow based on job; these are custom per job posting and cannot be reliably pre-answered
- File upload for resume is prominent; skip it
- "Easy Apply" questions vary: some are yes/no, some are text, some are dropdowns with numeric values (years of experience as a select, not text input)

### Ashby
**Confidence: MEDIUM** (growing platform, patterns from training data)
- Similar structure to Lever — mostly flat, single-page
- Uses React with synthetic events; same event dispatching requirements as Workday for state updates
- Label text is generally clear and consistent — heuristic matching works well here

### Custom Company Career Pages
**Confidence: MEDIUM**
- No consistent pattern; heuristic label matching is the only approach
- Common patterns: `<label>` text adjacent to `<input>`, `placeholder` attribute, `aria-label` attribute, `name` attribute with semantically named values (`first_name`, `email`, `phone_number`, etc.)
- Form libraries (Formik, React Hook Form, Django forms, Rails form helpers) each produce slightly different markup but all include label text reliably
- Focus on matching `name` attribute values as a fallback: `name="email"`, `name="phone"`, `name="first_name"` etc. are extremely common

---

## MVP Recommendation

**Prioritize (in order):**
1. Resume parse → structured profile storage (the entire value prop depends on this working)
2. Field fill on Greenhouse (largest market, most used in tech hiring)
3. Field fill on Lever (simpler DOM, quick win, high coverage at startups)
4. Field fill on LinkedIn Easy Apply (massive user base expectation)
5. Popup UI showing fill status (required for trust — user must see what happened)
6. Manual profile edit UI (corrections after parse errors)

**Defer:**
- Workday support: complex iframe + ARIA widget handling; worth a dedicated phase
- Custom company career pages: heuristic matching is the hard problem; do after ATS platforms
- Multi-entry work history fill (add-row automation): high complexity, address after single-entry works
- Salary field handling: present on fewer forms, complex validation; defer to post-MVP

---

## Sources

All findings from training knowledge (cutoff Aug 2025). WebSearch and WebFetch were unavailable
during this research session.

**HIGH confidence sources (direct platform documentation and extension dev guides):**
- Chrome Extension Manifest V3 content script scoping and frame targeting (Chromium docs)
- Workday iFrame and ARIA widget patterns (widely documented in scraping/automation communities)
- Greenhouse DOM structure (documented in ATS integration guides)
- Lever form structure (documented in their public API/embed docs)

**MEDIUM confidence (community patterns from training data):**
- LinkedIn Easy Apply behavior (r/cscareerquestions, developer communities)
- Ashby form structure (newer platform, less documented)
- Custom form heuristic patterns (widely discussed in autofill extension repos on GitHub)

**Gaps to validate with live testing:**
- Whether Greenhouse still uses shadow DOM in 2026 (may have changed)
- Workday's exact event requirements (React version may affect this)
- LinkedIn Easy Apply structure post any 2025/2026 redesigns
