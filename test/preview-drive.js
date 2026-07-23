'use strict';

window.addEventListener('load', () => {
  setTimeout(() => {
    const production = [...document.querySelectorAll('.profile-item')].find((item) => item.textContent.includes('Production Gateway'));
    production?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  }, 180);
  setTimeout(() => document.querySelector('#sftp-toggle')?.click(), 620);
});
