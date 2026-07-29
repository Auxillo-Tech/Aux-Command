'use strict';

window.addEventListener('load', () => {
  setTimeout(() => {
    const production = [...document.querySelectorAll('.profile-item')].find((item) => item.textContent.includes('Production Gateway'));
    production?.querySelector('.profile-connect')?.click();
  }, 180);
  setTimeout(() => document.querySelector('#sftp-toggle')?.click(), 620);
});
