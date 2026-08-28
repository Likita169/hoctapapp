/* 24-khoi-dong.js — Điểm khởi động app: tải dữ liệu, áp dụng giao diện, vẽ màn hình đầu tiên, bật kiểm tra cập nhật & đồng bộ nền
   (Phần 5963-5980 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- INIT ---------------- */
(async function init(){
  $app.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#7b7a8c;font-family:Inter,sans-serif;font-size:14px;">Đang tải...</div>';
  loadAuth();
  await loadData();
  applyTheme();
  watchSystemTheme();
  render();
  initServiceWorkerUpdates();
  silentInitialSync();
  if(AUTH.token){
    loadNotifications();
    setInterval(()=>{ if(AUTH.token) loadNotifications(); }, 60000);
  }
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible' && AUTH.token) loadNotifications();
  });
})();