---
trigger: glob
globs: "frontend/src/**/*.tsx, frontend/src/**/*.ts, frontend/src/**/*.css"
description: "Frontend UX, accessibility, responsiveness and design-system rules for the React application."
---

# Frontend UX Policy

## 1. Design system first

- Reuse the existing Tailwind tokens, components and layout patterns before adding new ones.
- Do not introduce a UI framework, icon set or animation library without a concrete justification.
- Prefer small reusable components over duplicated markup.
- Preserve the established visual language unless a redesign is explicitly requested.

## 2. Required states

Every data-driven view must handle:

- loading (skeleton or clear progress, no layout shift);
- empty (useful explanation and next action);
- success;
- error (actionable message, retry where safe);
- permission-denied and not-found without leaking private existence;
- disabled/submitting states that prevent duplicate actions.

Never show a success state before the server confirms success.

## 3. Accessibility

- All interactive elements are reachable and operable by keyboard.
- Focus is visible and moves logically; dialogs trap and restore focus.
- Inputs have programmatic labels; errors are associated and announced.
- Images have meaningful alt text or are marked decorative.
- Contrast meets WCAG AA for text and meaningful UI.
- Touch targets are at least ~44×44 px where practical.
- Respect `prefers-reduced-motion`; avoid gratuitous animation.
- Do not remove native semantics to satisfy a visual design.

## 4. Responsive behaviour

- Verify mobile (~375 px), tablet (~768 px) and desktop (~1280 px) layouts.
- Avoid horizontal scrolling, clipped controls and overlapping content.
- Long paste content, filenames and error messages must wrap or truncate safely.
- Sticky headers, dialogs and menus must remain usable on small screens.

## 5. Forms and destructive actions

- Validate on the client for feedback and on the server for truth.
- Show field-level messages and a summary for multiple errors.
- Never clear user input on a failed submit.
- Confirm destructive actions (delete, revoke, burn, overwrite) and make the consequence explicit.
- Do not use fake social proof, fabricated metrics or placeholder testimonials in shipped UI.

## 6. Security in the frontend

- Never use `dangerouslySetInnerHTML` with paste content or user input.
- Never place secrets in `VITE_*` variables; they are embedded in the public bundle.
- Do not put tokens or private content in URLs, analytics, error reports or `localStorage` unless the existing design explicitly requires it and it is reviewed.
- Treat server Problem Details as the source of truth; do not hide authorization failures.

## 7. Performance and quality

- Avoid unnecessary re-renders, unbounded lists and large synchronous work on the main thread.
- Lazy-load heavy editors/highlighters; keep the fallback usable.
- Verify real interactions with component tests or a browser, not only screenshots.
- Preserve existing tests and add coverage for new states and keyboard paths.

## 8. Review output

The UX reviewer reports: affected screens, viewports checked, keyboard/a11y findings, state coverage, design consistency, and a `PASS` / `CONDITIONAL` / `BLOCK` verdict with exact locations.
