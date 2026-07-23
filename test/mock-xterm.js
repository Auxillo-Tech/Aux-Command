'use strict';

(() => {
  class Terminal {
    constructor(options = {}) {
      this.options = options;
      this.cols = 120;
      this.rows = 34;
      this.dataListeners = [];
      this.resizeListeners = [];
      this.titleListeners = [];
      this.selection = '';
      this.pre = null;
    }
    loadAddon(addon) { addon.terminal = this; }
    open(container) {
      container.classList.add('mock-terminal');
      this.pre = document.createElement('pre');
      this.pre.className = 'mock-terminal-screen';
      this.pre.textContent = '';
      container.append(this.pre);
    }
    write(data) {
      if (!this.pre) return;
      this.pre.textContent += String(data).replace(/\x1b\[[0-9;]*m/gu, '').replaceAll('\r', '');
    }
    onData(callback) { this.dataListeners.push(callback); return { dispose() {} }; }
    onResize(callback) { this.resizeListeners.push(callback); return { dispose() {} }; }
    onTitleChange(callback) { this.titleListeners.push(callback); return { dispose() {} }; }
    attachCustomKeyEventHandler() { return true; }
    focus() {}
    dispose() { this.pre?.remove(); }
    getSelection() { return this.selection; }
    hasSelection() { return Boolean(this.selection); }
    paste(text) { this.dataListeners.forEach((callback) => callback(text)); }
  }

  class FitAddon {
    fit() {
      if (!this.terminal) return;
      this.terminal.resizeListeners.forEach((callback) => callback({ cols: 120, rows: 34 }));
    }
  }

  window.Terminal = Terminal;
  window.FitAddon = { FitAddon };
})();
