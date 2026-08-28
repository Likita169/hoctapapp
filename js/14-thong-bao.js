/* 14-thong-bao.js — Hệ thống thông báo (chuông 🔔): tải danh sách, đánh dấu đã đọc, mở đúng bài/lớp liên quan
   (Phần 2897-3026 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---- notifications (chuông 🔔: bài mới / đã chấm xong) ---- */
function loadNotifications(){
  if(!AUTH.token) return;
  authorizedGet('/notifications/list')
    .then(res=>{ NOTIFICATIONS = res.notifications||[]; notificationsUnreadCount = res.unreadCount||0; notificationsLoadedOnce = true; render(); })
    .catch(()=>{ /* im lặng — chuông không quan trọng bằng nội dung chính của app */ });
}

function markNotificationRead(id){
  const n = NOTIFICATIONS.find(x=>x.id===id);
  if(n && !n.read){ n.read = true; notificationsUnreadCount = Math.max(0, notificationsUnreadCount-1); render(); }
  authorizedRequest('/notifications/read', { id }).catch(()=>{});
}

function markAllNotificationsRead(){
  if(notificationsUnreadCount===0) return;
  NOTIFICATIONS.forEach(n=> n.read = true);
  notificationsUnreadCount = 0;
  render();
  authorizedRequest('/notifications/read', { all:true }).catch(()=>{});
}

// Điều hướng khi bấm vào 1 thông báo cụ thể — mở đúng lớp/bài liên quan
// nếu lớp đó đã có sẵn trong danh sách lớp học (CLASSROOMS) trên máy.
function openNotificationTarget(n){
  markNotificationRead(n.id);
  notificationsPanelOpen = false;
  setView('classroom');
  if(n.classroomId){
    ensureClassroomsLoaded();
    const classroom = CLASSROOMS.find(c=>c.id===n.classroomId);
    if(classroom){
      if(AUTH.role === 'teacher') openTestManager(classroom.id, classroom.name);
      else openStudentTestList(classroom);
    }
  }
  render();
}

function timeAgoLabel(ts){
  const diffSec = Math.max(0, Math.round((Date.now()-ts)/1000));
  if(diffSec < 60) return 'vừa xong';
  const diffMin = Math.round(diffSec/60);
  if(diffMin < 60) return diffMin + ' phút trước';
  const diffHour = Math.round(diffMin/60);
  if(diffHour < 24) return diffHour + ' giờ trước';
  const diffDay = Math.round(diffHour/24);
  if(diffDay < 7) return diffDay + ' ngày trước';
  return new Date(ts).toLocaleDateString('vi-VN');
}

function renderBellButton(){
  const btn = document.createElement('button');
  btn.className = 'gear-btn bell-btn';
  btn.setAttribute('aria-label','Thông báo'); btn.setAttribute('title','Thông báo');
  btn.innerHTML = '🔔' + (notificationsUnreadCount>0 ? `<span class="bell-badge">${notificationsUnreadCount>9?'9+':notificationsUnreadCount}</span>` : '');
  btn.onclick = (e)=>{
    e.stopPropagation();
    notificationsPanelOpen = !notificationsPanelOpen;
    if(notificationsPanelOpen){ notificationsPanelFresh = true; loadNotifications(); }
    render();
  };
  return btn;
}

function renderNotificationsPanel(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop settings-overlay' + (notificationsPanelFresh ? ' animate-in' : '');
  overlay.onclick = (e)=>{ if(e.target===overlay){ notificationsPanelOpen=false; render(); } };

  const panel = document.createElement('div');
  panel.className = 'settings-panel' + (notificationsPanelFresh ? ' animate-in' : '');

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display">🔔 Thông báo</h1>`;
  const headerActions = document.createElement('div');
  headerActions.style.cssText = 'display:flex; align-items:center; gap:14px;';
  if(notificationsUnreadCount>0){
    const markAllBtn = document.createElement('button');
    markAllBtn.textContent = 'Đọc hết';
    markAllBtn.style.cssText = 'background:none; border:none; color:var(--teal); font-size:12.5px; font-weight:600; cursor:pointer; padding:0;';
    markAllBtn.onclick = markAllNotificationsRead;
    headerActions.appendChild(markAllBtn);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'review-close'; closeBtn.setAttribute('aria-label','Đóng'); closeBtn.textContent = '✕';
  closeBtn.onclick = ()=>{ notificationsPanelOpen = false; render(); };
  headerActions.appendChild(closeBtn);
  header.appendChild(headerActions);
  panel.appendChild(header);

  const main = document.createElement('main');

  if(!notificationsLoadedOnce){
    const loading = document.createElement('div'); loading.className='tr-sub'; loading.style.padding='20px 0'; loading.style.textAlign='center';
    loading.textContent = 'Đang tải…';
    main.appendChild(loading);
  } else if(NOTIFICATIONS.length===0){
    const empty = document.createElement('div'); empty.style.textAlign='center'; empty.style.padding='28px 0 8px';
    empty.innerHTML = `<div style="font-size:32px; margin-bottom:8px;">🔔</div><div class="tr-sub">Chưa có thông báo nào.</div>`;
    main.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
    NOTIFICATIONS.forEach(n=>{
      const item = document.createElement('div');
      item.style.cssText = `display:flex; gap:10px; padding:12px; border-radius:12px; cursor:pointer; background:${n.read?'transparent':'var(--bg-elev)'}; border:1px solid ${n.read?'transparent':'var(--line)'};`;
      const icon = n.type==='essay_graded' ? '✅' : '📝';
      item.innerHTML = `
        <div style="font-size:20px; flex-shrink:0;">${icon}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13.5px; font-weight:${n.read?'500':'700'};">${escapeHtml(n.title)}</div>
          ${n.body ? `<div class="tr-sub" style="margin-top:2px;">${escapeHtml(n.body)}</div>` : ''}
          <div class="tr-sub" style="margin-top:3px; font-size:11px;">${timeAgoLabel(n.createdAt)}</div>
        </div>
        ${n.read ? '' : '<div style="width:8px; height:8px; border-radius:50%; background:var(--teal); flex-shrink:0; margin-top:5px;"></div>'}
      `;
      item.onclick = ()=> openNotificationTarget(n);
      list.appendChild(item);
    });
    main.appendChild(list);
  }

  panel.appendChild(main);
  overlay.appendChild(panel);
  notificationsPanelFresh = false;
  return overlay;
}

