'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/run-ui-qualification.py'), 'utf8');

// The behaviour itself is proven by scripts/test-tab-rename-focus-ui.py in a real
// window (it fails on the old code and passes on the fix). These checks keep the
// guard and that script from being removed without a failing test.

test('a closing dialog restores focus to its opener only while nothing else holds focus', () => {
  const close = renderer.slice(renderer.indexOf('const close = () => {'), renderer.indexOf('const onClose = (listener)'));
  assert.ok(close.includes('const close = () => {'), 'showModal close() not found');
  assert.match(close, /document\.addEventListener\('focusin', noteFocusClaimed, true\)/u);
  assert.match(close, /document\.removeEventListener\('focusin', noteFocusClaimed, true\)/u);
  assert.match(close, /if \(!focusClaimed && unclaimed && previousFocus\.isConnected\) previousFocus\.focus\(\)/u);
  assert.doesNotMatch(close, /window\.setTimeout\(\(\) => previousFocus\.focus\(\), 0\)/u,
    'an unconditional deferred focus restore steals focus from the tab rename field');
});

test('the tab rename field still commits on blur, so nothing may blur it programmatically', () => {
  const start = renderer.indexOf('function startTabRename(tab)');
  const body = renderer.slice(start, renderer.indexOf('function moveSessionTab', start));
  assert.match(body, /input\.addEventListener\('blur', \(\) => finish\(true\)\)/u);
});

test('the tab rename focus regression runs with the UI qualification', () => {
  assert.ok(fs.existsSync(path.join(root, 'scripts/test-tab-rename-focus-ui.py')));
  assert.match(runner, /test-workspace-ui\.py,test-tab-rename-focus-ui\.py,/u);
});
