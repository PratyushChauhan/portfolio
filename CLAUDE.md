# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static HTML portfolio site for Pratyush Chauhan. No build system, no framework, no dependencies — everything is in `index.html` with assets in the root directory.

**Stack:** Vanilla HTML5/CSS3/JS · Bootstrap 5.3.2 (CDN) · Font Awesome 6.4.2 (CDN) · Google Fonts (Outfit)

**To view locally:** open `index.html` in a browser (or use `python3 -m http.server`).

## Architecture

Everything lives in a single `index.html` (~615 lines):

- **Navbar** — fixed glassmorphic bar with links to `#home`, `#projects`, resume, and a calendar booking link
- **Hero section** (`#home`) — profile image with rotating border animation, gradient title, CTA buttons, social links
- **Projects section** (`#projects`) — responsive CSS grid of project cards (each with image, tags, description, links)
- **Footer** — copyright

**Styling:** CSS variables define the dark theme with cyan/blue accents (`--primary`, `--accent`, etc.). Glassmorphism pattern (`backdrop-filter: blur`) is used throughout. Animations use cubic-bezier easing.

**JS:** Minimal — only a scroll-based `.reveal` fade-in for elements with that class.

## Adding a Project

Add a card inside the `.projects-grid` div following the existing pattern:

```html
<div class="project-card reveal">
  <div class="project-image">
    <img src="yourimage.png" alt="Project Name" loading="lazy">
  </div>
  <div class="project-content">
    <div class="project-tags">
      <span class="tag">Tech</span>
    </div>
    <h3>Project Name</h3>
    <p>Description.</p>
    <div class="project-links">
      <a href="..." class="btn-project" target="_blank" rel="noopener noreferrer">
        <i class="fab fa-github"></i> Code
      </a>
    </div>
  </div>
</div>
```

Place the project image (PNG) in the repo root alongside the other `*.png` files.

## Design Conventions

- Dark theme: `#0a0a0f` background, `#00d4ff` primary cyan, `#a855f7` accent purple
- Font: Outfit (Google Fonts) — already loaded in `<head>`
- All text containing apostrophes or quotes must be in JS expressions to avoid HTML encoding issues: `{"User's text"}`
- Keep animations purposeful — existing reveal/hover patterns should be reused, not invented anew

## Code Style & Syntax Rules

### Coding advice
- Implement features in as few lines of code as possible.
- Bonus points if an implementation removes more lines of code than it adds.

### Comments
- Brief inline comments where intent isn't obvious

### Frontend Aesthetics
- Avoid generic "AI slop" design: no Inter/Roboto/Arial, no purple-gradient-on-white
- Use distinctive typography, cohesive color themes via CSS variables, and purposeful animation
