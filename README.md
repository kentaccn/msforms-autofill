# MS Forms Autofill

Fill the PolyU alumni parking form (or any Microsoft Form) in one click instead of
retyping nine fields every time. You fill it once, hit **Save these answers**, and from
then on it's one click — or zero, if you turn on auto-fill.

**The date is never filled.** That's deliberate: it's the one field that changes every
time, so it stays yours to type.

---

## Install (Chrome extension — recommended)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder (the one with `manifest.json` in it)
4. Open the form. A small **AUTOFILL** panel appears bottom-right.

Chrome will keep it after restarts. It only runs on `forms.cloud.microsoft`,
`forms.office.com`, `forms.microsoft.com` and `forms.office365.com` — nowhere else.

## First run

1. Open the form and fill it in by hand, once — everything except the date.
2. Click **Save these answers**.
3. Tick **Fill automatically on load** if you want it to happen with no clicks at all.

Next time you open the form, everything is already there. Type the visit date, check it
over, submit.

- **Fill form** (or `⌥F`) — refill on demand
- **Save these answers** — overwrite what's stored with whatever is on screen now
- **Clear saved answers** — wipe it for this form
- **−** — collapse the panel out of the way

## No-install version

If you'd rather not install anything, open the form, press `⌥⌘J` for the Console, paste
the whole contents of `console-snippet.js`, hit Enter. Same panel, same behaviour —
answers are kept in that site's `localStorage` instead of extension storage.

The tradeoffs: you re-paste it on every page load, clearing browser data wipes it, and
answers are stored per hostname — something saved on `forms.office.com` won't be there on
`forms.cloud.microsoft`. The extension has none of those problems.

---

## What it handles

| Question type | Behaviour |
|---|---|
| Short/long text | Saved and refilled |
| Single choice (radio) | Saved and refilled |
| Multiple choice (checkbox) | Saved and refilled, including the "Other" free text |
| Date | **Never touched** — you type it |
| Likert grids | Saved and refilled per row |
| Ranking, dropdown | Not supported; the panel tells you how many it skipped |

Answers are keyed on each question's internal Forms ID, so renaming or reordering
questions won't break your saved answers. Each form gets its own storage slot, so you can
use this on several different forms without them clashing.

Multi-page forms work too: saving on page 2 merges with page 1 rather than replacing it,
and with auto-fill on it refills each page as you hit **Next**.

## Where your answers live

Locally, nothing leaves the machine — `chrome.storage.local` for the extension,
`localStorage` for the console version. Note this data sits unencrypted on disk, same as
any browser autofill, and includes your alumni ID, phone, email and plate number.

## Editing it

`content.js` is the only real source file. After changing it, regenerate the console
version:

```bash
node build-console.js
```

Don't hand-edit `console-snippet.js` — it's generated and will be overwritten.

## Notes for future me

Two things about Microsoft Forms that cost real time to find:

- The page sends `require-trusted-types-for 'script'` with a default policy that quietly
  mangles any HTML string assigned to `innerHTML`. The panel had to be built with
  `createElement`/`textContent` calls. Anything using `innerHTML` here fails *silently*.
- The **"Other" checkbox and its text box share `aria-label="Other answer"`**, so a naive
  selector grabs the checkbox and the free text never saves. The text box is the one
  without a `role` attribute. Its input is also mounted *after* you tick the box, so the
  write has to wait for it.
