/* Accesso con password (verifica lato client, PBKDF2-SHA256). */
(function () {
  'use strict';
  const cfg = window.APP_CONFIG, $ = s => document.querySelector(s);
  const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  async function derive(pw) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(cfg.salt), iterations: cfg.iterations, hash: 'SHA-256' }, key, 256));
  }
  function start() {
    $('#login').hidden = true; $('#app').hidden = false;
    if (!window.__started) { window.__started = true; window.App.init(); }
  }
  let fails = 0;
  async function tryLogin(e) {
    e.preventDefault();
    const msg = $('#loginmsg'), pw = $('#pw').value;
    if (!window.crypto || !crypto.subtle) { msg.textContent = 'Il browser richiede HTTPS o localhost per la verifica della password.'; return; }
    msg.textContent = 'Verifica…';
    if (fails) await new Promise(r => setTimeout(r, Math.min(fails * 800, 5000)));
    const h = await derive(pw);
    if (h === cfg.hash) { sessionStorage.setItem('auth', cfg.hash.slice(0, 16)); start(); }
    else { fails++; msg.textContent = 'Password errata.'; $('#pw').select(); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('auth') === cfg.hash.slice(0, 16)) return start();
    $('#loginform').addEventListener('submit', tryLogin);
    $('#pw').focus();
  });
})();
