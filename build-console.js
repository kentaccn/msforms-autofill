#!/usr/bin/env node
/* Wraps content.js in a localStorage-backed chrome.storage shim so the exact
 * same logic can be pasted straight into DevTools with no extension install.
 * Run: node build-console.js  ->  writes console-snippet.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');

const shim = `/* MS Forms Autofill — DevTools version. Paste into the Console on the form page.
   Generated from content.js by build-console.js — edit content.js, not this file. */
(() => {
  // Allow re-pasting: fully tear the previous instance down, listeners included.
  if (typeof window.__msFormsAutofillDispose === 'function') {
    try { window.__msFormsAutofillDispose(); } catch {}
  }
  delete window.__msFormsAutofillLoaded;
  const old = document.getElementById('msforms-autofill-host');
  if (old) old.remove();

  if (typeof window.chrome === 'undefined') window.chrome = {};
  if (!window.chrome.storage) {
    const PREFIX = 'msformsAutofill:';
    window.chrome.storage = {
      local: {
        get(keys, cb) {
          const out = {};
          for (const k of [].concat(keys)) {
            const raw = localStorage.getItem(PREFIX + k);
            if (raw !== null) { try { out[k] = JSON.parse(raw); } catch {} }
          }
          cb(out);
        },
        set(obj, cb) {
          for (const [k, v] of Object.entries(obj)) {
            localStorage.setItem(PREFIX + k, JSON.stringify(v));
          }
          if (cb) cb();
        },
        remove(keys, cb) {
          for (const k of [].concat(keys)) localStorage.removeItem(PREFIX + k);
          if (cb) cb();
        },
      },
    };
  }
})();

`;

const out = shim + src;
fs.writeFileSync(path.join(__dirname, 'console-snippet.js'), out);
console.log(`console-snippet.js written (${out.length} bytes)`);
