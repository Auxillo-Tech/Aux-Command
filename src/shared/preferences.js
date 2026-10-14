(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.AuxPreferences = value;
})(typeof window === 'undefined' ? globalThis : window, () => {
  'use strict';
  const ACTIONS = [
    ['local', 'Local shell', 'T'], ['palette', 'Command palette', 'P'], ['connections', 'Find connection', 'E'],
    ['duplicate', 'Duplicate session', 'D'], ['reconnect', 'Reconnect session', 'R'], ['files', 'File browser', 'F'],
    ['layout', 'Tiled layout', 'L'], ['broadcast', 'Broadcast input', 'B'], ['snippets', 'Command snippets', 'S'],
    ['highlight', 'Log highlighting', 'H'], ['history', 'Session history', 'Y'], ['multiRun', 'Run on multiple sessions', 'M'],
    ['ai', 'AI assist', 'A'], ['workspaces', 'Named workspaces', 'W']
  ];
  const DEFAULT_SHORTCUTS = Object.fromEntries(ACTIONS.map(([id, , key]) => [id, `Ctrl+Shift+${key}`]));
  function shortcuts(input = {}, strict = false) {
    const result = { ...DEFAULT_SHORTCUTS }, used = new Set();
    for (const [id] of ACTIONS) {
      const combo = String(input?.[id] || DEFAULT_SHORTCUTS[id]).trim();
      if (!/^Ctrl\+Shift\+[A-BD-UW-Z]$/u.test(combo) || used.has(combo)) {
        if (strict) throw new Error('Shortcuts must be unique Ctrl+Shift+letter combinations; C and V are reserved for copy and paste');
        return { ...DEFAULT_SHORTCUTS };
      }
      used.add(combo); result[id] = combo;
    }
    return result;
  }
  function matches(event, combo) {
    return Boolean((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.code === `Key${String(combo).at(-1)}`);
  }
  return { ACTIONS, DEFAULT_SHORTCUTS, shortcuts, matches };
});
