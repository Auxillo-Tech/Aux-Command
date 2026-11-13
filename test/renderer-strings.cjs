'use strict';

// Finds text in renderer source that a user will read but that does not go
// through the translation functions. Used by i18n.test.cjs.
//
// It is a small lexer, not a parser: it knows strings, template literals,
// comments and regular expressions well enough to tell which string literal
// sits in which call or property position.

const REGEX_AFTER_WORD = /^(?:return|typeof|case|in|of|delete|void|throw|new|else|do|await|yield)$/u;

function lex(source) {
  const tokens = [];
  let line = 1;
  const push = (type, value, at) => { const token = { type, value, line: at }; tokens.push(token); return token; };
  const regexAllowed = () => {
    const last = tokens.at(-1);
    if (!last) return true;
    if (last.type === 'punct') return !/^[)\]}]$/u.test(last.value);
    if (last.type === 'word') return REGEX_AFTER_WORD.test(last.value);
    return last.type === 'open';
  };
  function readString(start, quote) {
    let index = start + 1;
    let value = '';
    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\') { value += source[index + 1] === 'n' ? '\n' : source[index + 1]; index += 2; continue; }
      value += source[index];
      index += 1;
    }
    push('string', value, line);
    return index + 1;
  }
  // The template token carries only its fixed text; each ${...} is lexed in
  // place between 'open' and 'close' marker tokens.
  function readTemplate(start) {
    const token = push('template', '', line);
    let index = start + 1;
    while (index < source.length && source[index] !== '`') {
      if (source[index] === '\\') { token.value += source[index + 1] === 'n' ? '\n' : source[index + 1]; index += 2; continue; }
      if (source[index] === '$' && source[index + 1] === '{') {
        token.value += '\u0000';
        push('open', '${', line);
        index = run(index + 2, true);
        push('close', '}', line);
        continue;
      }
      if (source[index] === '\n') line += 1;
      token.value += source[index];
      index += 1;
    }
    return index + 1;
  }
  function run(start, untilBrace) {
    let index = start;
    let braces = 0;
    while (index < source.length) {
      const char = source[index];
      if (char === '\n') { line += 1; index += 1; continue; }
      if (/\s/u.test(char)) { index += 1; continue; }
      if (char === '/' && source[index + 1] === '/') { while (index < source.length && source[index] !== '\n') index += 1; continue; }
      if (char === '/' && source[index + 1] === '*') {
        const end = source.indexOf('*/', index + 2);
        line += source.slice(index, end).split('\n').length - 1;
        index = end + 2;
        continue;
      }
      if (char === "'" || char === '"') { index = readString(index, char); continue; }
      if (char === '`') { index = readTemplate(index); continue; }
      if (char === '/' && regexAllowed()) {
        const begin = index;
        let inClass = false;
        index += 1;
        while (index < source.length && (source[index] !== '/' || inClass)) {
          if (source[index] === '\\') index += 1;
          else if (source[index] === '[') inClass = true;
          else if (source[index] === ']') inClass = false;
          index += 1;
        }
        index += 1;
        while (/[a-z]/u.test(source[index] || '')) index += 1;
        push('regex', source.slice(begin, index), line);
        continue;
      }
      if (/[A-Za-z_$#]/u.test(char)) {
        const begin = index;
        while (index < source.length && /[\w$#]/u.test(source[index])) index += 1;
        push('word', source.slice(begin, index), line);
        continue;
      }
      if (/[0-9]/u.test(char)) {
        const begin = index;
        while (index < source.length && /[\w.]/u.test(source[index])) index += 1;
        push('number', source.slice(begin, index), line);
        continue;
      }
      if (untilBrace) {
        if (char === '{') braces += 1;
        else if (char === '}') { if (braces === 0) return index + 1; braces -= 1; }
      }
      push('punct', char, line);
      index += 1;
    }
    return index;
  }
  run(0, false);
  return tokens;
}

// Property names whose value is shown to the user.
const TEXT_PROPERTIES = new Set(['title', 'description', 'label', 'confirmLabel', 'placeholder', 'text', 'detail', 'hint', 'category', 'aria-label']);
// Element properties whose assigned value is shown to the user.
const TEXT_ASSIGNMENTS = new Set(['textContent', 'innerHTML', 'title', 'placeholder']);
// Calls whose listed arguments are shown to the user (0-based positions).
const TEXT_CALLS = new Map([
  ['toast', [0, 1]], ['setStatus', [0]], ['field', [0, 2]], ['checkbox', [1]],
  ['Error', [0]], ['setCustomValidity', [0]], ['confirm', [0]], ['alert', [0]]
]);
// Calls that translate their first argument.
const TRANSLATORS = new Set(['uiText', 't', 'message']);

const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);

function readable(token) {
  const text = token.value.replaceAll('\u0000', '');
  return /\p{L}{3,}/u.test(text);
}

// Returns [{ line, text, where }] for every readable literal in a user-visible
// position that is not passed straight to a translation function.
function findUntranslated(source, { deferredTables = [] } = {}) {
  const tokens = lex(source);
  const found = new Map();
  const skip = new Set();

  // Tables of source strings that are translated where they are used.
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'word' || !deferredTables.includes(tokens[index].value)) continue;
    if (tokens[index - 1]?.value !== 'const' || tokens[index + 1]?.value !== '=') continue;
    let depth = 0;
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (token.type === 'punct' && OPENERS.has(token.value)) depth += 1;
      else if (token.type === 'punct' && CLOSERS.has(token.value)) { depth -= 1; if (depth === 0) break; }
      skip.add(cursor);
    }
  }

  const isComparison = (index) => {
    const before = tokens[index - 1]?.value;
    const after = tokens[index + 1]?.value;
    return (before === '=' && ['=', '!'].includes(tokens[index - 2]?.value)) || (after === '=' && tokens[index + 2]?.value === '=') || (after === '!' && tokens[index + 2]?.value === '=');
  };
  const isTranslated = (index) => tokens[index - 1]?.value === '(' && TRANSLATORS.has(tokens[index - 2]?.value);
  const flag = (index, where) => {
    const token = tokens[index];
    if ((token.type !== 'string' && token.type !== 'template') || skip.has(index)) return;
    if (!readable(token) || isComparison(index) || isTranslated(index)) return;
    found.set(index, { line: token.line, text: token.value.replaceAll('\u0000', '{}'), where });
  };
  // Flags every literal that is part of the expression starting at `start`:
  // the operands of ?: and +, and text inside a template's ${...}, but not
  // the arguments of a call made inside the expression.
  const flagExpression = (start, where) => {
    let depth = 0;
    for (let index = start; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token.type === 'punct') {
        if (OPENERS.has(token.value)) { depth += 1; continue; }
        if (CLOSERS.has(token.value)) { if (depth === 0) return; depth -= 1; continue; }
        if (depth === 0 && (token.value === ',' || token.value === ';')) return;
        continue;
      }
      if (depth === 0) flag(index, where);
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    // { title: '...' } and { 'aria-label': '...' }
    if ((token.type === 'word' || token.type === 'string') && TEXT_PROPERTIES.has(token.value) && next?.value === ':' && tokens[index - 1]?.value !== '?' && tokens[index - 1]?.value !== '.') {
      flagExpression(index + 2, `${token.value}:`);
    }
    // uiText('… {p0}', { p0: '...' }): values substituted into a message.
    if (token.type === 'word' && /^p\d$/u.test(token.value) && next?.value === ':') flagExpression(index + 2, `${token.value}:`);
    // return '...' from a function that builds a label.
    if (token.type === 'word' && token.value === 'return') flagExpression(index + 1, 'return');
    // element.textContent = '...'
    if (token.type === 'word' && TEXT_ASSIGNMENTS.has(token.value) && tokens[index - 1]?.value === '.' && next?.value === '=' && tokens[index + 2]?.value !== '=') {
      flagExpression(index + 2, `.${token.value} =`);
    }
    // function f({ label = '...' }) defaults
    if (token.type === 'word' && TEXT_PROPERTIES.has(token.value) && next?.value === '=' && tokens[index + 2]?.value !== '=' && tokens[index + 2]?.value !== '>' && tokens[index - 1]?.value !== '.' && ['{', ','].includes(tokens[index - 1]?.value)) {
      flagExpression(index + 2, `${token.value} =`);
    }
    // toast('...', '...'), new Error('...')
    if (token.type === 'word' && TEXT_CALLS.has(token.value) && next?.value === '(' && tokens[index - 1]?.value !== 'function') {
      const wanted = TEXT_CALLS.get(token.value);
      let argument = 0;
      let depth = 0;
      if (wanted.includes(0)) flagExpression(index + 2, `${token.value}(`);
      for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
        const inner = tokens[cursor];
        if (inner.type !== 'punct') continue;
        if (OPENERS.has(inner.value)) depth += 1;
        else if (CLOSERS.has(inner.value)) { if (depth === 0) break; depth -= 1; }
        else if (inner.value === ',' && depth === 0) {
          argument += 1;
          if (wanted.includes(argument)) flagExpression(cursor + 1, `${token.value}(… argument ${argument + 1}`);
        }
      }
    }
    // selectInput(name, [['value', 'Label'], ...]): the label of each pair.
    if (token.type === 'punct' && token.value === '[' && tokens[index + 1]?.type === 'string' && tokens[index + 2]?.value === ',' && ['string', 'template'].includes(tokens[index + 3]?.type) && tokens[index + 4]?.value === ']') {
      // The pair must sit in the options array, which is itself an argument.
      let depth = 0;
      let lists = 0;
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const outer = tokens[cursor];
        if (outer.type !== 'punct') continue;
        if (CLOSERS.has(outer.value)) depth += 1;
        else if (OPENERS.has(outer.value)) {
          if (depth > 0) { depth -= 1; continue; }
          if (outer.value === '[') { lists += 1; continue; }
          if (outer.value === '(' && lists === 1 && tokens[cursor - 1]?.value === 'selectInput') flag(index + 3, 'selectInput option');
          break;
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

// Every string literal handed to a translation function as its message,
// including both sides of a ?: choice: uiText(ok ? 'Saved' : 'Not saved').
function translatedSources(source, translators = ['uiText']) {
  const tokens = lex(source);
  const sources = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'word' || !translators.includes(tokens[index].value) || tokens[index + 1]?.value !== '(') continue;
    if (tokens[index - 1]?.value === 'function') continue;
    let depth = 0;
    for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (token.type === 'punct') {
        if (OPENERS.has(token.value)) depth += 1;
        else if (CLOSERS.has(token.value)) { if (depth === 0) break; depth -= 1; }
        else if (token.value === ',' && depth === 0) break;
        continue;
      }
      if (depth !== 0 || token.type !== 'string') continue;
      const before = tokens[cursor - 1]?.value;
      const after = tokens[cursor + 1]?.value;
      // 'upload' in uiText(direction === 'upload' ? … ) is a comparison, not a message.
      if ((before === '=' && ['=', '!'].includes(tokens[cursor - 2]?.value)) || (after === '=' && tokens[cursor + 2]?.value === '=') || (after === '!' && tokens[cursor + 2]?.value === '=')) continue;
      sources.add(token.value);
    }
  }
  return [...sources];
}

module.exports = { lex, findUntranslated, translatedSources };
