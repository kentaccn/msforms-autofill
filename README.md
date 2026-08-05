# MS Forms Autofill

Fill in a Microsoft Form once. Every time after that, it fills itself.

It leaves the date blank on purpose — that's the one thing that changes each time, so you still type it yourself.

![The autofill panel on a filled Microsoft Form](docs/screenshot.png)

---

## The problem

Some forms you submit over and over. A parking request. A visitor pass. A weekly report. Same name, same phone number, same car plate, typed out again every single time.

Your browser's normal autofill doesn't help here. Microsoft Forms builds its boxes in a way that gives Chrome nothing to recognise, so Chrome leaves them all empty.

This fixes that. You fill the form once and press Save. After that it remembers.

---

## Part 1 — Install it

You don't need to know any coding for this. It takes about two minutes.

**Step 1.** Download the code. Click the green **Code** button at the top of this page, choose **Download ZIP**, then unzip the file. You'll get a folder called `msforms-autofill-main`.

**Step 2.** Open Chrome and type `chrome://extensions` in the address bar, then press Enter.

**Step 3.** Turn on **Developer mode**. It's the switch in the top right corner.

**Step 4.** Click **Load unpacked**, then choose the folder you unzipped.

**Step 5.** Open your form. A small box saying **AUTOFILL** appears in the bottom right corner.

That's it. Chrome keeps the extension after you restart it.

> **Is "Developer mode" safe?** It just lets Chrome run an extension from a folder on your computer instead of from the Chrome Web Store. Nothing here connects to the internet — you can check that yourself, the whole thing is five short files.

---

## Part 2 — Use it

**The first time:**

1. Fill the form in by hand, like normal. Skip the date.
2. Click **Save these answers** in the panel.
3. Tick **Fill automatically on load** if you want it to happen by itself from now on.

**Every time after that,** open the form and it's already filled in. Type the date, check everything looks right, press submit.

The buttons:

| Button | What it does |
|---|---|
| **Fill form** | Fills the form now. `⌥F` on Mac, `Alt+F` on Windows, does the same thing. |
| **Save these answers** | Replaces what's saved with whatever is on screen right now |
| **Fill automatically on load** | Fills the form the moment you open it, no clicking |
| **Clear saved answers** | Deletes what's saved for this form |
| **−** | Folds the panel away if it's in the way |

It never presses submit for you. You always do that yourself.

---

## Part 3 — What it can and can't fill

| Kind of question | Does it work? |
|---|---|
| Typing boxes, short or long | Yes |
| Choose one (circles) | Yes |
| Choose several (tick boxes) | Yes, including the "Other" box you type into |
| Rating grids | Yes, each row separately |
| Date | Left blank on purpose |
| Ranking, dropdown menus, file upload, star ratings | Not supported |

If a form has something it can't fill, the panel tells you how many it skipped. It won't quietly pretend it did everything.

Forms split across several pages work too. It fills each page as you press Next, and saving on page 2 doesn't wipe what you saved on page 1.

You can use it on as many different forms as you like. Each one remembers its own answers separately.

---

## Part 4 — Your privacy

Your answers never leave your computer. There's no account, no sign-in, no analytics, and no code in here that talks to the internet at all.

They're saved in Chrome's own storage, unencrypted, the same way Chrome saves your normal autofill details. Depending on the form that might include your phone number, email, ID or car plate. Anyone with access to your computer and your Chrome profile could read it.

**Clear saved answers** deletes it for that form.

---

## Part 5 — Which tool should you use?

There are a few other Microsoft Forms fillers on GitHub. They're built for genuinely different jobs, so here's an honest comparison rather than a sales pitch.

|  | **This one** | [**saturina0611**](https://github.com/saturina0611/Autofill-Microsoft-Forms) | [**chonghaoooi**](https://github.com/chonghaoooi/auto-fill-forms) | [**Form Filler AI**](https://github.com/chater-marzougui/Form-Filler) |
|---|---|---|---|---|
| **Best for** | Re-submitting the same form | Quizzes with a known answer key | Student forms, standard details | Filling unfamiliar forms |
| **Where the answers come from** | What you typed last time | An answer list you edit into the code | A saved profile — name, ID, phone, class, email | AI guesses from your profile |
| **Setup needed** | Fill the form once | Edit the code | Fill in a profile | Profile + a Google Gemini API key |
| **Works on `forms.cloud.microsoft`** | Yes | Yes | No | No |
| **Leaves the date alone** | Yes, deliberately | No | No | No |
| **Multi-page forms** | Yes | No | No | No |
| **Needs internet / an API key** | No | No | No | Yes |
| **Licence** | MIT | None | None | MIT |
| **Install type** | Chrome extension | Paste into console | Chrome extension | Chrome extension |

In plain terms:

- **Use this one** if you submit the same form again and again and just want it to remember what you typed.
- **Use saturina0611's** if you're filling a quiz from an answer key you already have, especially one that shuffles the questions. Different job, and it does it in a single script.
- **Use chonghaoooi's** if you mostly fill student or admin forms with the same standard details, and you want one profile to work across Google Forms too.
- **Use Form Filler AI** if you fill lots of *different* forms and want AI to work out what goes where. Costs a Gemini API key.

Two practical differences worth knowing:

**`forms.cloud.microsoft`.** Microsoft has been moving Forms to this newer web address. Tools that only know the old `forms.office.com` address simply never switch on. This one covers both.

**"Licence: None"** isn't a small detail. A project with no licence is all-rights-reserved by default — you can read the code but you're not legally allowed to reuse it. This one is MIT, so you can do what you like with it.

Fair warning on all of these, this one included: they're small hobby projects with single-digit star counts. Nobody has really claimed this space.

---

## Part 6 — No-install version

If you'd rather not install an extension, you can paste the code into Chrome's console instead.

1. Open the form
2. Press `⌥⌘J` on Mac, or `Ctrl+Shift+J` on Windows
3. Open [`console-snippet.js`](console-snippet.js), copy all of it, paste it in, press Enter

Same panel, same behaviour. The catch: you re-paste it every time you open the page, clearing your browsing data wipes your answers, and answers saved on one Microsoft address won't show up on another. The extension avoids all three.

---

# For developers

Everything above is all a normal user needs. The rest is for anyone who wants to change it.

## Getting set up

```bash
git clone https://github.com/kentaccn/msforms-autofill.git
cd msforms-autofill
npm install     # puppeteer-core, only needed for tests
npm test
```

| File | What it is |
|---|---|
| `content.js` | Everything — reading the form, writing to it, storage, the panel |
| `manifest.json` | MV3 manifest. Add web addresses here. |
| `build-console.js` | Wraps `content.js` in a localStorage shim to build the console version |
| `console-snippet.js` | Generated. Don't hand-edit it. |
| `test/run.js` | Drives the real code against a local mock form |
| `test/mock-form.html` | Mock Forms markup, including question types the author's own form doesn't have |

`content.js` is the only real source file. After editing it run `npm run build` to regenerate the console version, then `npm test`.

## Common changes

**Add another web address.** Put it in both `host_permissions` and `content_scripts[0].matches` in `manifest.json`, then reload the extension.

**Fill the date too**, if your form's date never changes. Remove the `if (type === 'date')` early return in `fillAnswers()` and the matching `continue` in `readAnswers()`. The date box is a Fluent `DatePicker` combobox, so it needs the same native-setter treatment the text inputs get, plus a `blur` to commit.

**Support a new question type.** Three places, all in `content.js`:

1. `questionType()` — recognise it, return a new type name
2. `readAnswers()` — pull the current answer into a record
3. `fillAnswers()` — put a saved record back

Dropdowns need the combobox opened before the `[role="option"]` elements exist. Ranking needs the move buttons driven in order. That's why neither is supported yet.

**Change the keyboard shortcut.** The `keydown` listener near the bottom of `content.js`.

## Testing

`npm test` serves `test/mock-form.html` locally and drives the real content script against it in headless Chrome. It covers long text, rating grids where both rows share the same option values, tick boxes with "Other", date-skipping, and multi-page saving plus auto-refill after Next.

It deliberately never touches a real Microsoft Form. Set `CHROME_PATH` if Chrome isn't in the usual macOS spot:

```bash
CHROME_PATH=/usr/bin/google-chrome npm test
```

One lesson worth passing on: **Microsoft Forms restores a draft of your answers when you reload.** An early version of this test "passed" because the form was never actually empty, so the fill had nothing to do and matching was trivial. If you write a test like this, clear the draft first and assert the form really is blank before you trust a pass.

## How Microsoft Forms actually works

Three things that cost real time to find, in case you're building anything against Forms.

**Trusted Types silently break `innerHTML`.** The response page sends `require-trusted-types-for 'script'` with a default policy. Assigning an HTML string to `innerHTML` doesn't throw an error — it just produces an empty element. The panel here is built with `createElement` and `textContent` for exactly this reason. If your injected UI renders as nothing at all, this is why.

**The "Other" tick box and its text field share `aria-label="Other answer"`.** A selector on that label grabs the tick box, so the text you typed never saves. The text field is the one *without* a `role` attribute. It's also only added to the page *after* the box is ticked, so writing to it has to wait for it to appear.

**React ignores `element.value = x`.** You need the native prototype setter, then bubbling `input` and `change` events:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(el, value);
el.dispatchEvent(new Event('input', { bubbles: true }));
```

Useful anchors, all stable: `[data-automation-id="questionItem"]`, `questionTitle`, `textInput`, `dateContainer`, and the `QuestionId_r…` element carrying each question's internal id. Matching on that id rather than the question's title text is what makes saved answers survive questions being renamed or reordered.

## Known limits

- Ranking, dropdown, file upload and star-rating questions aren't supported.
- It fills, it never submits.
- Tested on Chrome against a live form and a local mock. Not tested on Edge or Firefox, though nothing in it is Chrome-specific beyond the MV3 manifest.

---

## Licence

MIT — see [LICENSE](LICENSE). Do what you like with it.
