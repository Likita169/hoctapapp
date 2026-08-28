/* 22-nhac-nho-day-hoc.js — Đăng ký/huỷ nhận thông báo nhắc ôn tập đúng giờ mỗi ngày (Web Push)
   (Phần 5758-5883 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---- daily push reminder (works even when app is fully closed) ---- */
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for(let i=0; i<raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function pushServerReady(){ return !PUSH_SERVER_URL.includes('YOUR-SUBDOMAIN'); }

async function subscribePush(hour, minute){
  if(!pushServerReady()){
    toast('Chưa thiết lập máy chủ nhắc nhở — xem HUONG-DAN.md');
    return false;
  }
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    toast('Trình duyệt này không hỗ trợ nhắc đúng giờ');
    return false;
  }
  const granted = await requestReminderPermission();
  if(!granted){ toast('Bạn cần cho phép thông báo trong trình duyệt'); return false; }
  try{
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      const res = await fetch(PUSH_SERVER_URL + '/vapid-public-key');
      if(!res.ok) throw new Error('Máy chủ lỗi khi lấy khoá VAPID (HTTP ' + res.status + ')');
      const data = await res.json();
      if(!data.publicKey) throw new Error('Máy chủ chưa có VAPID_PUBLIC_KEY — kiểm tra lại Secrets trong Cloudflare Worker');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey)
      });
    }
    const subRes = await fetch(PUSH_SERVER_URL + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        hour, minute,
        tzOffsetMinutes: -new Date().getTimezoneOffset(),
        label: 'on-tap'
      })
    });
    if(!subRes.ok){
      const body = await subRes.text().catch(()=>'');
      throw new Error('Máy chủ từ chối đăng ký (HTTP ' + subRes.status + ') ' + body);
    }
    return true;
  }catch(e){
    console.error(e);
    toast('Lỗi: ' + (e && e.message ? e.message : String(e)));
    return false;
  }
}

async function unsubscribePush(){
  try{
    if(!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      if(pushServerReady()){
        await fetch(PUSH_SERVER_URL + '/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        }).catch(()=>{});
      }
      await sub.unsubscribe();
    }
  }catch(e){ /* ignore */ }
}

async function togglePushReminder(on){
  if(on){
    const hh = DATA.settings.pushHour ?? 20;
    const mm = DATA.settings.pushMinute ?? 0;
    const ok = await subscribePush(hh, mm);
    if(!ok){ render(); return; }
    DATA.settings.pushEnabled = true;
  } else {
    await unsubscribePush();
    DATA.settings.pushEnabled = false;
  }
  await saveData();
  render();
}

async function updatePushTime(hh, mm){
  DATA.settings.pushHour = hh;
  DATA.settings.pushMinute = mm;
  await saveData();
  if(DATA.settings.pushEnabled){
    const ok = await subscribePush(hh, mm);
    if(ok) toast('Đã cập nhật giờ nhắc ✓');
  }
}

function showRestartOverlay(){
  $app.innerHTML = `
    <div style="position:absolute;inset:0;z-index:999;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:16px;background:var(--bg);">
      <div style="width:56px;height:56px;border-radius:16px;
        background:linear-gradient(155deg,#251f42,#191730 60%);border:1px solid var(--line);
        display:flex;align-items:center;justify-content:center;font-size:26px;">📇</div>
      <div class="display" style="font-size:16px;font-weight:600;color:var(--white);">Đang khởi động lại...</div>
      <div style="font-size:12px;color:var(--ink-faint);">Có bản cập nhật mới</div>
    </div>
  `;
}

async function hardRestart(){
  showRestartOverlay();
  // Close the IndexedDB connection ourselves instead of letting the page
  // teardown do it — an old page silently holding the connection open is
  // what causes the "blocked"/stuck-version bugs after an update.
  try{
    if(_dbPromise){ const db = await _dbPromise; db.close(); }
  }catch(e){ /* ignore */ }
  // A real navigation (not a soft reload) fully tears down and re-fetches
  // the app — the closest a PWA can get to actually exiting and relaunching.
  location.replace(location.pathname + location.search);
}

