/* 23-cap-nhat-va-giao-dien.js — Phát hiện bản cập nhật mới từ service worker và áp dụng, cùng với việc áp dụng giao diện sáng/tối (theme)
   (Phần 5884-5962 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---- service worker update detection ---- */
let waitingWorker = null;
let updateApplyPending = false;

function applyUpdate(worker){
  waitingWorker = worker;
  if(updateApplyPending) return;

  // Guard against a reload loop in case the browser keeps reporting a
  // "waiting" worker right after we already reloaded for one.
  const last = Number(sessionStorage.getItem('srs_last_update_reload') || 0);
  if(Date.now() - last < 8000) return;

  // If the person is actively typing (e.g. writing a new card), wait until
  // they're done instead of yanking the page out from under them.
  const active = document.activeElement;
  const isTyping = active && (active.tagName==='TEXTAREA' || active.tagName==='INPUT') && document.body.contains(active);
  if(isTyping){
    const retry = ()=>{ active.removeEventListener('blur', retry); applyUpdate(worker); };
    active.addEventListener('blur', retry, {once:true});
    return;
  }

  updateApplyPending = true;
  toast('Đang cập nhật app...');
  sessionStorage.setItem('srs_last_update_reload', String(Date.now()));
  setTimeout(()=>{
    showRestartOverlay();
    worker.postMessage('SKIP_WAITING');
  }, 600);
}

function initServiceWorkerUpdates(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('service-worker.js').then(reg=>{
    if(reg.waiting) applyUpdate(reg.waiting);
    reg.addEventListener('updatefound', ()=>{
      const nw = reg.installing;
      nw.addEventListener('statechange', ()=>{
        if(nw.state === 'installed' && navigator.serviceWorker.controller){
          applyUpdate(nw);
        }
      });
    });
    // check for a new version every time the app becomes visible
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'visible') reg.update();
    });
  }).catch(()=>{ /* ignore, e.g. running from file:// */ });
  navigator.serviceWorker.addEventListener('controllerchange', ()=> hardRestart());
}

function applyTheme(){
  const pref = (DATA.settings && DATA.settings.theme) || 'system';
  try{ localStorage.setItem('srs_theme', pref); }catch(e){ /* ignore */ }

  const effective = (pref === 'system')
    ? ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark')
    : pref;

  if(effective === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');

  const metaColor = document.querySelector('meta[name="theme-color"]');
  if(metaColor) metaColor.setAttribute('content', effective==='light' ? '#eae6d9' : '#14151f');
  const metaStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if(metaStatusBar) metaStatusBar.setAttribute('content', effective==='light' ? 'default' : 'black-translucent');
}

let _systemThemeWatching = false;
function watchSystemTheme(){
  if(_systemThemeWatching || !window.matchMedia) return;
  _systemThemeWatching = true;
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = ()=>{ if(((DATA.settings && DATA.settings.theme) || 'system') === 'system') applyTheme(); };
  if(mq.addEventListener) mq.addEventListener('change', handler);
  else if(mq.addListener) mq.addListener(handler); // older Safari
}

