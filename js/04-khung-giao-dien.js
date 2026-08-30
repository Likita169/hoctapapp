/* 04-khung-giao-dien.js — Khung giao diện dùng chung: bottom sheet (menu bấm giữ), hàm render() điều phối vẽ từng tab, thanh tab dưới, thanh streak/cấp độ đầu Trang chủ
   (Phần 425-622 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- ACTION SHEET (bottom slide-up menu) ---------------- */
function renderActionSheet(){
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.onclick = (e)=>{ if(e.target===backdrop){ actionSheetItems=null; render(); } };

  const sheet = document.createElement('div');
  sheet.className = 'action-sheet';
  actionSheetItems.forEach(item=>{
    const btn = document.createElement('button');
    btn.className = 'sheet-item' + (item.danger ? ' danger' : '');
    btn.innerHTML = `<span class="sheet-icon">${item.icon||''}</span><span>${escapeHtml(item.label)}</span>`;
    btn.onclick = ()=>{ actionSheetItems=null; item.onClick(); };
    sheet.appendChild(btn);
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'sheet-item sheet-cancel';
  cancelBtn.textContent = 'Huỷ';
  cancelBtn.onclick = ()=>{ actionSheetItems=null; render(); };
  sheet.appendChild(cancelBtn);

  backdrop.appendChild(sheet);
  requestAnimationFrame(()=> sheet.classList.add('show'));
  return backdrop;
}

// Long-press menu for a specific deck (subject) row.
function openDeckActionSheet(s){
  actionSheetItems = [
    { icon:'➕', label:'Thêm', onClick: ()=>{ addSubjectChoice = s.id; setView('add'); } },
    { icon:'📄', label:'Xem tất cả thẻ', onClick: ()=>{ manageFilterSubjectId = s.id; setView('manage'); } },
    { icon:'🧩', label:'Trò chơi ghép thẻ', onClick: ()=> startMatchGame(s.id) },
    { icon:'🧠', label:'Trắc nghiệm nhanh', onClick: ()=>{
        setReviewInputMode('quiz');
        sessionSubjectFilter = s.id;
        startReview();
      } },
    { icon:'✏️', label:'Đổi tên bộ thẻ', onClick: ()=>{
        editSubjectId = s.id; newSubjectParentId = s.parentId||null; subjectModalColor = s.color;
        subjectModalCountdownEnabled = !!s.countdownEnabled;
        subjectModalCountdownSeconds = s.countdownSeconds || 15;
        subjectModalOpen = true; render();
      } },
    { icon:'📁', label:'Tạo bộ thẻ phụ', onClick: ()=>{
        editSubjectId = null; newSubjectParentId = s.id; subjectModalColor = COLORS[DATA.subjects.length % COLORS.length];
        subjectModalCountdownEnabled = false;
        subjectModalCountdownSeconds = 15;
        subjectModalOpen = true; render();
      } },
    { icon:'🗑', label:'Xoá bộ thẻ', danger:true, onClick: ()=>{ deleteSubjectId = s.id; render(); } },
  ];
  render();
}

// Attaches press-and-hold detection to a deck row without hijacking the
// normal tap (which drills into the deck).
function attachDeckLongPress(row, subject){
  let timer = null, fired = false;
  row.addEventListener('pointerdown', ()=>{
    fired = false;
    timer = setTimeout(()=>{
      fired = true;
      if(navigator.vibrate) navigator.vibrate(12);
      openDeckActionSheet(subject);
    }, 480);
  });
  const cancel = ()=>{ if(timer){ clearTimeout(timer); timer=null; } };
  row.addEventListener('pointerup', cancel);
  row.addEventListener('pointerleave', cancel);
  row.addEventListener('pointercancel', cancel);
  return ()=> fired;
}

function setView(v){ VIEW = v; render(); }

let _prevRenderSig = null; // used to decide whether to preserve scroll position across a re-render

function currentRenderSig(){
  return [
    VIEW, questionEditorOpen, testSubmissionsOpen, testEditorOpen, testManagerClassroom,
    takeTestOpen, studentTestDetailOpen, testReviewOpen, studentTestListClassroom,
    manageFilterSubjectId
  ];
}

function render(){
  const prevMainEl = $app.querySelector('main');
  const prevScrollTop = prevMainEl ? prevMainEl.scrollTop : 0;
  const newSig = currentRenderSig();
  const samePage = _prevRenderSig && _prevRenderSig.length===newSig.length && _prevRenderSig.every((v,i)=>v===newSig[i]);

  $app.innerHTML = '';
  const main = document.createElement('div');
  main.className = samePage ? 'view-root no-replay' : 'view-root view-enter';

  try{
    if(VIEW==='home') main.appendChild(renderHome());
    else if(VIEW==='add') main.appendChild(renderAdd());
    else if(VIEW==='review') main.appendChild(renderReview());
    else if(VIEW==='manage') main.appendChild(renderManage());
    else if(VIEW==='classroom') main.appendChild(renderClassroomView());
    else if(VIEW==='stats') main.appendChild(renderStats());
    else if(VIEW==='match') main.appendChild(renderMatchGame());
  }catch(e){
    // Never let a rendering bug in one tab take the whole app (and the
    // tabbar) down with it — fall back to Home so the person isn't stuck.
    console.error('Lỗi khi vẽ giao diện:', e);
    VIEW = 'home';
    subjectModalOpen = false;
    deleteSubjectId = null;
    deleteCardId = null;
    timeModalOpen = false;
    settingsPanelOpen = false;
    main.innerHTML = '';
    try{ main.appendChild(renderHome()); }catch(e2){ /* give up gracefully */ }
  }

  $app.appendChild(main);

  if(subjectModalOpen) $app.appendChild(renderSubjectModal());
  if(deleteSubjectId) $app.appendChild(renderDeleteSubjectModal());
  if(deleteCardId) $app.appendChild(renderDeleteCardModal());
  if(timeModalOpen) $app.appendChild(renderTimeModal());
  if(themeModalOpen) $app.appendChild(renderThemeModal());
  if(settingsPanelOpen) $app.appendChild(renderSettingsPanel());
  if(pendingSyncChoice) $app.appendChild(renderSyncChoiceModal());
  if(authModalOpen) $app.appendChild(renderAuthModal());
  if(notificationsPanelOpen) $app.appendChild(renderNotificationsPanel());
  if(renameModalOpen) $app.appendChild(renderRenameModal());
  if(testConfirm) $app.appendChild(renderTestConfirmModal());
  if(bulkImportOpen) $app.appendChild(renderBulkImportModal());
  if(filePreviewOpen) $app.appendChild(renderFilePreviewModal());
  if(classroomConfirm) $app.appendChild(renderClassroomConfirmModal());
  if(classroomMembersView) $app.appendChild(renderClassroomMembersModal());
  if(actionSheetItems) $app.appendChild(renderActionSheet());

  if(VIEW!=='review' && VIEW!=='match' && !takeTestOpen){
    $app.appendChild(renderTabbar());
    if(VIEW==='home' || VIEW==='manage'){
      const fab = document.createElement('button');
      fab.className='fab'; fab.textContent='+';
      fab.onclick = ()=>{
        // Nút + luôn tạo bộ thẻ ở cấp cao nhất — muốn tạo bộ thẻ phụ bên
        // trong 1 bộ thẻ cụ thể thì bấm giữ vào bộ thẻ đó → "Tạo bộ thẻ phụ".
        actionSheetItems = [
          { icon:'📚', label:'Tạo bộ thẻ', onClick: ()=>{
              editSubjectId = null; newSubjectParentId = null;
              subjectModalColor = COLORS[DATA.subjects.length % COLORS.length];
              subjectModalCountdownEnabled = false;
              subjectModalCountdownSeconds = 15;
              subjectModalOpen = true; render();
            } },
        ];
        render();
      };
      $app.appendChild(fab);
    }
  }

  const newMainEl = $app.querySelector('main');
  if(newMainEl && samePage) newMainEl.scrollTop = prevScrollTop;
  _prevRenderSig = newSig;

  // Vẽ lại mọi công thức toán ($...$) xuất hiện trong khung nhìn vừa dựng
  // (câu hỏi/đáp án của thẻ, danh sách quản lý, hộp xác nhận xoá...).
  renderMathIn($app);
}

function renderTabbar(){
  const nav = document.createElement('nav');
  nav.className='tabbar';
  const tabs = [
    {id:'home', icon:'◐', label:'Trang chủ'},
    {id:'manage', icon:'▤', label:'Thẻ ghi nhớ'},
    {id:'classroom', icon:'🏫', label:'Lớp học'},
    {id:'stats', icon:'✦', label:'Thống kê'},
  ];
  tabs.forEach(t=>{
    const b = document.createElement('button');
    b.className = VIEW===t.id ? 'active' : '';
    b.innerHTML = `<span class="icon">${t.icon}</span><span>${t.label}</span>`;
    b.onclick = ()=>{ if(t.id==='manage') manageFilterSubjectId = null; setView(t.id); };
    nav.appendChild(b);
  });
  return nav;
}

// Thanh streak + cấp độ nhỏ gọn hiện ở đầu trang chủ, bấm vào mở tab Thống
// kê để xem chi tiết huy hiệu.
function buildProgressBar(){
  normalizeProgress();
  const p = DATA.progress;
  const lvl = computeLevel(p.xp);
  const studiedToday = p.lastStudyDate === todayKey();
  const pct = Math.round((lvl.xpIntoLevel / lvl.xpForThisLevel) * 100);

  const bar = document.createElement('div');
  bar.className = 'progress-bar-card';
  bar.innerHTML = `
    <div class="pb-streak ${studiedToday ? 'pb-streak-active' : ''}">
      <span class="pb-flame">🔥</span><span class="pb-streak-num">${p.streak}</span>
    </div>
    <div class="pb-level">
      <div class="pb-level-row"><span>Cấp ${lvl.level}</span><span class="pb-xp">${lvl.xpIntoLevel}/${lvl.xpForThisLevel} XP</span></div>
      <div class="pb-track"><div class="pb-fill" style="width:${pct}%"></div></div>
    </div>
  `;
  bar.onclick = ()=> setView('stats');
  return bar;
}

