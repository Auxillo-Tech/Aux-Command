'use strict';

// Text that Aux Command itself shows in a prompt window. The main process
// writes English only: a message is an English source string with numbered
// placeholders, plus the values to put in them. The window looks the source
// up in its message catalog and shows it in the user's language; english()
// gives the wording used when the window does not know the source.

function message(text, params = {}) {
  return { text, params };
}

function english({ text, params = {} }) {
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu, (token, name) => (Object.hasOwn(params, name) ? String(params[name]) : token));
}

module.exports = { english, message };
