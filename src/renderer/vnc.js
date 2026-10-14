import RFB from '../../node_modules/@novnc/novnc/core/rfb.js';

const params = new URLSearchParams(window.location.search);
const wsUrl = params.get('url');
const host = params.get('host') || 'unknown';
const port = params.get('port') || '5900';
const screen = document.getElementById('vnc-screen');
const status = document.getElementById('vnc-status');
const connectingOverlay = document.getElementById('connecting-overlay');
const credentialsOverlay = document.getElementById('credentials-overlay');
const credentialsForm = document.getElementById('credentials-form');
const passwordInput = document.getElementById('vnc-password');
const errorOverlay = document.getElementById('error-overlay');
const errorDetail = document.getElementById('error-detail');
let rfb = null;

function setStatus(message) {
  status.textContent = `VNC | ${host}:${port} | ${message}`;
}

function showError(message) {
  connectingOverlay.hidden = true;
  credentialsOverlay.hidden = true;
  errorOverlay.hidden = false;
  errorDetail.textContent = String(message || 'Unknown connection error');
  setStatus('Failed');
}

function validatedBridgeUrl(value) {
  if (!value) throw new Error('No VNC bridge URL was provided');
  const parsed = new URL(value);
  if (parsed.protocol !== 'ws:' || parsed.hostname !== '127.0.0.1') {
    throw new Error('The VNC bridge URL is not a local WebSocket');
  }
  return parsed.toString();
}

credentialsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!rfb) return;
  const password = passwordInput.value;
  passwordInput.value = '';
  credentialsOverlay.hidden = true;
  connectingOverlay.hidden = false;
  setStatus('Authenticating');
  rfb.sendCredentials({ password });
});

try {
  rfb = new RFB(screen, validatedBridgeUrl(wsUrl), {
    shared: true,
    showDotCursor: true,
    wsProtocols: ['binary']
  });
  rfb.scaleViewport = true;
  rfb.resizeSession = true;
  rfb.background = '#050b10';

  rfb.addEventListener('connect', () => {
    connectingOverlay.hidden = true;
    credentialsOverlay.hidden = true;
    errorOverlay.hidden = true;
    setStatus('Connected');
  });
  rfb.addEventListener('disconnect', (event) => {
    if (event.detail?.clean) {
      showError('The VNC session was disconnected');
    } else {
      showError(event.detail?.reason || 'The VNC connection was lost');
    }
  });
  rfb.addEventListener('credentialsrequired', () => {
    connectingOverlay.hidden = true;
    errorOverlay.hidden = true;
    credentialsOverlay.hidden = false;
    setStatus('Password required');
    passwordInput.focus();
  });
  rfb.addEventListener('securityfailure', (event) => {
    showError(event.detail?.reason || event.detail?.status || 'The VNC security handshake failed');
  });
  setStatus('Connecting');
} catch (error) {
  showError(error.message);
}

window.addEventListener('beforeunload', () => {
  try { rfb?.disconnect(); } catch { /* already disconnected */ }
  rfb = null;
});

const clipboardText=document.getElementById('clipboard-text');
document.getElementById('desktop-fit').onclick=event=>{if(!rfb)return;rfb.scaleViewport=!rfb.scaleViewport;screen.classList.toggle('actual-size',!rfb.scaleViewport);event.target.textContent=rfb.scaleViewport?'Actual size':'Fit to pane';};
document.getElementById('desktop-cad').onclick=()=>rfb?.sendCtrlAltDel();
document.getElementById('desktop-clipboard').onclick=()=>{document.getElementById('clipboard-panel').hidden=false;clipboardText.focus();};
document.getElementById('clipboard-close').onclick=()=>{document.getElementById('clipboard-panel').hidden=true;rfb?.focus();};
document.getElementById('clipboard-send').onclick=()=>{rfb?.clipboardPasteFrom(clipboardText.value.slice(0,1048576));};
document.getElementById('desktop-viewonly').onclick=event=>{if(!rfb)return;rfb.viewOnly=!rfb.viewOnly;event.target.textContent=rfb.viewOnly?'Enable control':'View only';};
rfb?.addEventListener('clipboard',event=>{clipboardText.value=String(event.detail.text||'').slice(0,1048576);});
window.addEventListener('keydown',event=>{if(event.ctrlKey&&event.altKey&&event.shiftKey){rfb?.blur();document.getElementById('desktop-viewonly').focus();event.preventDefault();}},true);
