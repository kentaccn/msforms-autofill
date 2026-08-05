/* MS Forms Autofill — save answers once, replay them with one click.
 *
 * Works by reading/writing the rendered Microsoft Forms DOM. Every question is
 * keyed by its stable QuestionId (the `QuestionId_rXXXX` element Forms renders),
 * so answers survive question reordering and title edits.
 *
 * Date questions are deliberately never filled — that's the one field that
 * changes every submission, so it stays the user's to type.
 */
(() => {
  'use strict';

  if (window.__msFormsAutofillLoaded) return;
  window.__msFormsAutofillLoaded = true;

  const aid = (a) => `[data-automation-id="${a}"]`;
  const SKIP_TEXT_LABELS = ['Other answer'];

  // ---------------------------------------------------------------- reading

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function questionItems() {
    return Array.from(document.querySelectorAll(aid('questionItem')));
  }

  function questionId(item) {
    const holder = item.querySelector('[id^="QuestionId_"]');
    return holder ? holder.id.slice('QuestionId_'.length) : null;
  }

  function questionTitle(item) {
    const t = item.querySelector(aid('questionTitle'));
    if (!t) return '';
    const clone = t.cloneNode(true);
    clone
      .querySelectorAll(`${aid('requiredStar')}, [id^="QuestionInfo_"]`)
      .forEach((n) => n.remove());
    return norm(clone.textContent);
  }

  /** Radio/checkbox inputs Forms renders with role= attributes. */
  const radiosIn = (item) => Array.from(item.querySelectorAll('input[role="radio"]'));
  const checksIn = (item) => Array.from(item.querySelectorAll('input[role="checkbox"]'));

  /* A plain single-choice question has one radio group; a Likert grid has one
     per row. Prefer the structural [role="radiogroup"] container, since `name`
     can be reused or omitted across rows of the same grid, which would collapse
     every row into one group and lose all but the first answer. */
  function radioGroups(item) {
    const groups = new Map();
    const containers = Array.from(item.querySelectorAll('[role="radiogroup"]'));
    const structural = containers.length > 1;
    for (const el of radiosIn(item)) {
      let key;
      if (structural) {
        const box = el.closest('[role="radiogroup"]');
        const idx = containers.indexOf(box);
        key = 'g:' + (box ? box.getAttribute('aria-label') || box.id || idx : '?');
      } else {
        key = 'n:' + (el.name || '');
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    }
    return groups;
  }

  /* Roles that mean "not a plain text box". Excluding *any* role was too broad —
     a legitimate input can carry role="textbox". */
  const NON_TEXT_ROLES = ['combobox', 'listbox', 'checkbox', 'radio', 'button', 'spinbutton'];
  const isNonTextControl = (el) => NON_TEXT_ROLES.includes(el.getAttribute('role'));

  /** The main free-text input, excluding the "Other" box and any dropdown. */
  function textInputIn(item) {
    const all = Array.from(
      item.querySelectorAll(
        `input${aid('textInput')}, textarea${aid('textInput')}, textarea`
      )
    );
    return (
      all.find(
        (el) =>
          !isNonTextControl(el) &&
          !SKIP_TEXT_LABELS.includes(el.getAttribute('aria-label'))
      ) || null
    );
  }

  /* The "Other" CHECKBOX carries the same aria-label as its text box, so pin
     the text one by element shape rather than by the label alone. */
  function otherInputIn(item) {
    return (
      Array.from(item.querySelectorAll('input, textarea')).find(
        (el) =>
          el.getAttribute('aria-label') === 'Other answer' &&
          !isNonTextControl(el) &&
          el.type !== 'checkbox' &&
          el.type !== 'radio'
      ) || null
    );
  }

  const isDate = (item) =>
    !!item.querySelector(aid('dateContainer')) ||
    !!item.querySelector('input[id^="DatePicker"]');

  const isChecked = (el) => el.getAttribute('aria-checked') === 'true' || el.checked === true;

  function questionType(item) {
    if (isDate(item)) return 'date';
    if (radiosIn(item).length) return 'radio';
    if (checksIn(item).length) return 'checkbox';
    if (textInputIn(item)) return 'text';
    return 'unknown';
  }

  /** Snapshot everything currently answered on the page. */
  function readAnswers() {
    const out = {};
    const unsupported = [];
    // Only questions we fully recognise on THIS page are authoritative. An
    // unsupported or half-mounted question must NOT count, or saving would
    // delete its stored answer just because we couldn't read it.
    const authoritative = [];
    for (const item of questionItems()) {
      const id = questionId(item);
      if (!id) continue;
      const type = questionType(item);
      if (type === 'unknown') {
        // Ranking / dropdown / rating — say so rather than silently drop.
        unsupported.push(questionTitle(item));
        continue;
      }
      if (type === 'date') continue;
      authoritative.push(id);

      const record = { title: questionTitle(item), type };

      if (type === 'text') {
        const el = textInputIn(item);
        if (!el || !el.value) continue;
        record.value = el.value;
      } else if (type === 'radio') {
        const groups = radioGroups(item);
        if (groups.size > 1) {
          // Likert: each row is its own radio group and its own answer.
          const rows = {};
          for (const [name, els] of groups) {
            const picked = els.find(isChecked);
            if (picked) rows[name] = picked.value;
          }
          if (!Object.keys(rows).length) continue;
          record.type = 'radioRows';
          record.value = rows;
        } else {
          const picked = radiosIn(item).find(isChecked);
          if (!picked) continue;
          record.value = picked.value;
          const other = otherInputIn(item);
          if (picked.value === '' && other) record.other = other.value;
        }
      } else if (type === 'checkbox') {
        const picked = checksIn(item).filter(isChecked);
        if (!picked.length) continue;
        record.value = picked.map((el) => el.value);
        const other = otherInputIn(item);
        if (picked.some((el) => el.value === '') && other) record.other = other.value;
      }

      out[id] = record;
    }
    return { answers: out, unsupported, authoritative };
  }

  // ---------------------------------------------------------------- writing

  /** Set an input's value the way React notices it. */
  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  /** Toggle a choice input; falls back to its label if React ignored the click. */
  function toggleChoice(el) {
    const before = isChecked(el);
    el.click();
    if (isChecked(el) === before) {
      const label = el.closest('label') || el.parentElement;
      if (label) label.click();
    }
  }

  /** Poll for an element React has not mounted yet. */
  function waitFor(get, timeoutMs = 2000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (teardown.signal.aborted) return resolve(null);
        const found = get();
        if (found) return resolve(found);
        if (Date.now() - started > timeoutMs) return resolve(null);
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  /* A saved record may only be applied to a question that still has the same
     shape. Forms authors can repurpose a question and keep its QuestionId, and
     writing an old answer into it would silently submit something wrong. */
  const RECORD_FITS = {
    text: (t) => t === 'text',
    radio: (t) => t === 'radio',
    radioRows: (t) => t === 'radio',
    checkbox: (t) => t === 'checkbox',
  };

  async function fillAnswers(saved) {
    let filled = 0;
    const skipped = [];
    const mismatched = [];
    const pendingOther = [];

    for (const item of questionItems()) {
      const id = questionId(item);
      const type = questionType(item);

      if (type === 'date') {
        skipped.push(questionTitle(item));
        continue;
      }
      const record = id && saved[id];
      if (!record) continue;

      const fits = RECORD_FITS[record.type];
      if (!fits || !fits(type)) {
        mismatched.push(questionTitle(item));
        continue;
      }

      let changed = false;

      if (record.type === 'text') {
        const el = textInputIn(item);
        if (el && el.value !== record.value) {
          setNativeValue(el, record.value);
          changed = true;
        }
      } else if (record.type === 'radio') {
        const target = radiosIn(item).find((el) => el.value === record.value);
        if (target && !isChecked(target)) {
          toggleChoice(target);
          changed = true;
        }
      } else if (record.type === 'radioRows') {
        const groups = radioGroups(item);
        for (const [name, value] of Object.entries(record.value)) {
          const target = (groups.get(name) || []).find((el) => el.value === value);
          if (target && !isChecked(target)) {
            toggleChoice(target);
            changed = true;
          }
        }
      } else if (record.type === 'checkbox') {
        const want = new Set(Array.isArray(record.value) ? record.value : [record.value]);
        for (const el of checksIn(item)) {
          if (want.has(el.value) !== isChecked(el)) {
            toggleChoice(el);
            changed = true;
          }
        }
      }

      if (changed) filled++;
      // Ticking "Other" makes React mount its text box a beat later, so the
      // free-text write has to wait for that box to actually exist. Test for
      // presence, not truthiness, so a saved empty string clears stale text.
      if ('other' in record) pendingOther.push({ id, text: record.other || '' });
    }

    // Re-look-up by question id on each poll: React can replace the question
    // node, which would leave us writing into a detached subtree. Waiting in
    // parallel keeps several missing boxes from costing 2s each.
    await Promise.all(
      pendingOther.map(async ({ id, text }) => {
        const el = await waitFor(() => {
          const item = questionItems().find((q) => questionId(q) === id);
          return item ? otherInputIn(item) : null;
        });
        if (el && el.value !== text) setNativeValue(el, text);
      })
    );

    return { filled, skipped, mismatched };
  }

  // ---------------------------------------------------------------- storage

  const storageKey = () => {
    const id = new URLSearchParams(location.search).get('id');
    return 'msforms:' + (id || location.pathname);
  };

  /* chrome.storage reports failures (quota, disabled) through runtime.lastError
     rather than throwing. Ignoring it meant reporting "Saved" after a failure. */
  const lastError = () =>
    (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) || null;

  const load = () =>
    new Promise((resolve, reject) =>
      chrome.storage.local.get([storageKey()], (r) => {
        const err = lastError();
        if (err) return reject(new Error(err.message || 'storage read failed'));
        resolve(r[storageKey()] || null);
      })
    );

  const save = (data) =>
    new Promise((resolve, reject) =>
      chrome.storage.local.set({ [storageKey()]: data }, () => {
        const err = lastError();
        if (err) return reject(new Error(err.message || 'storage write failed'));
        resolve();
      })
    );

  const wipe = () =>
    new Promise((resolve, reject) =>
      chrome.storage.local.remove([storageKey()], () => {
        const err = lastError();
        if (err) return reject(new Error(err.message || 'storage clear failed'));
        resolve();
      })
    );

  // ------------------------------------------------------------------- UI

  const CSS = `
    :host { all: initial; }
    .panel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 232px; padding: 12px; border-radius: 12px;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fff; color: #1a1a1a;
      border: 1px solid rgba(0,0,0,.12);
      box-shadow: 0 6px 24px rgba(0,0,0,.16);
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
    }
    .panel[data-collapsed="true"] { width: auto; padding: 8px 12px; }
    .panel[data-collapsed="true"] .body { display: none; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .title { font-weight: 600; font-size: 12px; letter-spacing: .02em; text-transform: uppercase; opacity: .65; }
    .collapse {
      all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 6px;
      display: grid; place-items: center; font-size: 15px; opacity: .55;
    }
    .collapse:hover { background: rgba(0,0,0,.06); opacity: 1; }
    .body { margin-top: 10px; display: grid; gap: 8px; }
    button.act {
      all: unset; box-sizing: border-box; cursor: pointer;
      min-height: 40px; padding: 0 12px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      font-size: 13px; font-weight: 600; text-align: center;
      border: 1px solid rgba(0,0,0,.14); background: #fff;
    }
    button.act:hover { background: rgba(0,0,0,.04); }
    button.act.primary { background: #0f6cbd; border-color: #0f6cbd; color: #fff; }
    button.act.primary:hover { background: #115ea3; }
    button.act:disabled { opacity: .45; cursor: not-allowed; }
    .hint { opacity: .7; font-weight: 400; }
    .row { display: flex; align-items: center; gap: 8px; font-size: 12px; opacity: .8; }
    .row input { margin: 0; width: 15px; height: 15px; accent-color: #0f6cbd; }
    .status { font-size: 11.5px; opacity: .65; min-height: 15px; }
    .link { all: unset; cursor: pointer; font-size: 11.5px; text-decoration: underline; opacity: .55; }
    .link:hover { opacity: 1; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #242424; color: #f2f2f2; border-color: rgba(255,255,255,.14); }
      button.act { background: #333; border-color: rgba(255,255,255,.18); color: #f2f2f2; }
      button.act:hover { background: #3d3d3d; }
      .collapse:hover { background: rgba(255,255,255,.1); }
    }
  `;

  /* Built with DOM calls, not innerHTML: Microsoft Forms ships
     `require-trusted-types-for 'script'` plus a default policy that mangles any
     HTML string we hand it, which silently produced an empty panel. */
  function el(tag, props = {}, kids = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    }
    for (const kid of kids) node.appendChild(kid);
    return node;
  }

  const host = document.createElement('div');
  host.id = 'msforms-autofill-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = CSS;

  const panel = el('div', { class: 'panel', part: 'panel' }, [
    el('div', { class: 'head' }, [
      el('span', { class: 'title', text: 'Autofill' }),
      el('button', { class: 'collapse', 'aria-label': 'Collapse autofill panel', text: '−' }),
    ]),
    el('div', { class: 'body' }, [
      el('button', { class: 'act primary', id: 'fill' }, [
        document.createTextNode('Fill form '),
        el('span', { class: 'hint', text: '⌥F' }),
      ]),
      el('button', { class: 'act', id: 'save', text: 'Save these answers' }),
      el('label', { class: 'row' }, [
        el('input', { type: 'checkbox', id: 'auto' }),
        document.createTextNode(' Fill automatically on load'),
      ]),
      el('div', { class: 'status', id: 'status', role: 'status', 'aria-live': 'polite' }),
      el('button', { class: 'link', id: 'clear', text: 'Clear saved answers' }),
    ]),
  ]);

  shadow.appendChild(style);
  shadow.appendChild(panel);

  const $ = (sel) => shadow.querySelector(sel);
  const setStatus = (msg) => { $('#status').textContent = msg; };

  function describe(saved) {
    if (!saved) return 'Nothing saved yet — fill the form once, then hit Save.';
    const n = Object.keys(saved.answers || {}).length;
    const when = saved.savedAt ? new Date(saved.savedAt).toLocaleDateString() : '';
    return `${n} field${n === 1 ? '' : 's'} saved${when ? ' · ' + when : ''}`;
  }

  let filling = false;
  let refillWanted = false;

  /* Serialised rather than dropped: a fill requested while another is running
     used to be discarded, and since the page watcher had already marked that
     page handled, nothing ever retried it. */
  async function doFill(auto) {
    if (filling) {
      refillWanted = true;
      return;
    }
    filling = true;
    try {
      do {
        refillWanted = false;
        await runFill(auto);
      } while (refillWanted && !teardown.signal.aborted);
    } finally {
      filling = false;
    }
  }

  async function runFill(auto) {
    let saved;
    try {
      saved = await load();
    } catch (e) {
      setStatus(`Couldn't read saved answers: ${e.message}`);
      return;
    }
    if (teardown.signal.aborted) return;
    {
      if (!saved || !Object.keys(saved.answers || {}).length) {
        setStatus('Nothing saved for this form yet.');
        return;
      }
      const { filled, skipped, mismatched } = await fillAnswers(saved.answers);
      if (auto && !filled && !mismatched.length) return; // nothing to restore here
      const tail = skipped.length
        ? ` · ${skipped.length} date field${skipped.length === 1 ? '' : 's'} left for you`
        : '';
      const warn = mismatched.length
        ? ` · ${mismatched.length} question${mismatched.length === 1 ? '' : 's'} changed, skipped`
        : '';
      setStatus(
        `${auto ? 'Auto-filled' : 'Filled'} ${filled} question${filled === 1 ? '' : 's'}${tail}${warn}`
      );
    }
  }

  $('#fill').addEventListener('click', () => doFill(false));

  $('#save').addEventListener('click', async () => {
    const { answers, unsupported, authoritative } = readAnswers();
    if (!authoritative.length) {
      setStatus('Nothing to save — no fillable questions on this page.');
      return;
    }
    try {
      const prev = await load();
      // Keep answers from pages not currently in the DOM (multi-page forms), but
      // let this page win outright, so clearing a field really clears it — including
      // the case where every field on the page was cleared.
      const merged = Object.assign({}, prev && prev.answers);
      for (const id of authoritative) delete merged[id];
      Object.assign(merged, answers);
      const n = Object.keys(answers).length;
      const total = Object.keys(merged).length;
      await save({ answers: merged, savedAt: Date.now(), auto: prev ? prev.auto : false });
      const extra = unsupported.length ? ` · ${unsupported.length} unsupported skipped` : '';
      setStatus(`Saved ${n} field${n === 1 ? '' : 's'} (${total} total, date not saved)${extra}`);
    } catch (e) {
      setStatus(`Save failed: ${e.message}`);
    }
  });

  $('#clear').addEventListener('click', async () => {
    try {
      await wipe();
      $('#auto').checked = false;
      setStatus('Cleared.');
    } catch (e) {
      setStatus(`Clear failed: ${e.message}`);
    }
  });

  $('#auto').addEventListener('change', async (e) => {
    try {
      const prev = (await load()) || { answers: {}, savedAt: null };
      prev.auto = e.target.checked;
      await save(prev);
      setStatus(e.target.checked ? 'Will fill on load.' : 'Auto-fill off.');
    } catch (err) {
      setStatus(`Couldn't save that setting: ${err.message}`);
    }
  });

  $('.collapse').addEventListener('click', (e) => {
    const panel = $('.panel');
    const collapsed = panel.getAttribute('data-collapsed') === 'true';
    panel.setAttribute('data-collapsed', String(!collapsed));
    e.currentTarget.textContent = collapsed ? '−' : '+';
    e.currentTarget.setAttribute('aria-label', collapsed ? 'Collapse autofill panel' : 'Expand autofill panel');
  });

  const teardown = new AbortController();

  document.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.code !== 'KeyF') return;
      if (e.repeat || e.isComposing) return;
      // On macOS Option+F types "ƒ" — don't steal it mid-sentence in a form field.
      // composedPath() is needed because document.activeElement only reports the
      // shadow host when focus is inside a shadow tree.
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
      const typing = path.some(
        (el) =>
          el &&
          el.nodeType === 1 &&
          (el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.tagName === 'SELECT' ||
            el.isContentEditable)
      );
      if (typing) return;
      e.preventDefault();
      doFill(false);
    },
    { signal: teardown.signal }
  );

  // ---------------------------------------------------------------- startup

  /* Forms renders async — wait until the question COUNT holds steady. Watching
     for "no mutations" never settles: the page mutates continuously. */
  function whenQuestionsReady(timeoutMs = 20000, settleMs = 600) {
    return new Promise((resolve) => {
      const started = Date.now();
      let lastCount = -1;
      let stableSince = started;
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        obs.disconnect();
        clearInterval(poll);
        resolve(ok);
      };

      const check = () => {
        const n = questionItems().length;
        if (n !== lastCount) {
          lastCount = n;
          stableSince = Date.now();
        }
        if (n > 0 && Date.now() - stableSince >= settleMs) return finish(true);
        if (Date.now() - started > timeoutMs) return finish(n > 0);
      };

      const obs = new MutationObserver(check);
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const poll = setInterval(check, 200);
      // Disposing mid-wait has to stop this too, or a console re-paste during
      // the first seconds leaves the old copy polling and it appends its panel
      // after being torn down.
      teardown.signal.addEventListener('abort', () => finish(false));
      check();
    });
  }

  const pageSignature = () =>
    questionItems()
      .map(questionId)
      .join('|');

  /* Multi-page forms swap the question set in place when you hit Next, so
     auto-fill has to re-run on each new page, not just once at load. */
  function watchForPageChange() {
    // Adding an abort listener to an already-aborted signal never fires, which
    // would leave this observer running forever after a dispose.
    if (teardown.signal.aborted) return;

    let last = pageSignature();
    let timer;
    let firstSeen = 0;

    const settle = () => {
      timer = null;
      firstSeen = 0;
      const sig = pageSignature();
      if (sig === last || !sig) return;
      load()
        .then((saved) => {
          if (teardown.signal.aborted) return;
          // Mark handled only once the fill has actually been requested and
          // finished, otherwise a dropped fill is never retried.
          if (saved && saved.auto) return doFill(true).then(() => { last = sig; });
          last = sig;
        })
        .catch(() => {});
    };

    const obs = new MutationObserver(() => {
      const now = Date.now();
      if (!firstSeen) firstSeen = now;
      clearTimeout(timer);
      // Forms mutates continuously, so a plain resettable debounce can be pushed
      // back indefinitely. Cap the total wait.
      if (now - firstSeen >= 2000) return settle();
      timer = setTimeout(settle, 500);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    teardown.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      obs.disconnect();
    });
  }

  /* Re-pasting the console build must not leave the old copy's listeners and
     observers running — the wrapper calls this before loading a new one. */
  window.__msFormsAutofillDispose = () => {
    teardown.abort();
    host.remove();
    delete window.__msFormsAutofillLoaded;
    delete window.__msFormsAutofillDispose;
  };

  (async () => {
    // Only surface the panel once this really is a form with questions —
    // the match patterns also cover dashboards and the form editor.
    const ready = await whenQuestionsReady();
    if (!ready || teardown.signal.aborted) return;

    document.documentElement.appendChild(host);

    let saved = null;
    try {
      saved = await load();
    } catch (e) {
      setStatus(`Couldn't read saved answers: ${e.message}`);
    }
    if (teardown.signal.aborted) return;

    $('#auto').checked = !!(saved && saved.auto);
    setStatus(describe(saved));

    // Watch BEFORE the first fill: pressing Next while that fill is still
    // waiting on an Other box would otherwise leave the new page unfilled.
    watchForPageChange();
    if (saved && saved.auto) await doFill(true);
  })();
})();
