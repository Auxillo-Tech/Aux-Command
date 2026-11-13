'use strict';

// Titles of the native file choosers, in the language chosen in the window.
// The window's message catalog is plain data keyed by the English source
// text; it is loaded on first use. Anything that is not in it, or an unknown
// language, stays in English.

let catalog = null;

function dialogTitle(source, language) {
  if (typeof language !== 'string' || !/^[a-z]{2}$/u.test(language) || language === 'en') return source;
  try { catalog ||= require('../../renderer/dialog-i18n.js'); } catch { return source; }
  const entry = Object.hasOwn(catalog, source) ? catalog[source] : null;
  const translated = entry && Object.hasOwn(entry, language) ? entry[language] : '';
  return typeof translated === 'string' && translated.trim() ? translated : source;
}

module.exports = { dialogTitle };
