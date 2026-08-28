/* 13-lop-hoc.js — Tab Lớp học: danh sách lớp (giáo viên/học sinh), modal danh sách học sinh trong lớp, đổi tên hiển thị, modal xác nhận xoá/rời lớp
   (Phần 2494-2896 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- LỚP HỌC (tab riêng, không nằm trong Cài đặt) ---------------- */
function renderClassroomView(){
  if(AUTH.token && questionEditorOpen) return renderQuestionEditor();
  if(AUTH.token && essayGradeOpen) return renderEssayGrade();
  if(AUTH.token && submissionDetailOpen) return renderSubmissionDetail();
  if(AUTH.token && testSubmissionsOpen) return renderTestSubmissions();
  if(AUTH.token && testEditorOpen) return renderTestEditor();
  if(AUTH.token && testManagerClassroom) return renderTestManager();
  if(AUTH.token && takeTestOpen) return renderTakeTest();
  if(AUTH.token && studentTestDetailOpen && testReviewOpen) return renderTestReview();
  if(AUTH.token && studentTestDetailOpen) return renderStudentTestDetail();
  if(AUTH.token && studentTestListClassroom) return renderStudentTestList();

  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display">Lớp học</h1>`;
  const headerActions = document.createElement('div');
  headerActions.style.cssText = 'display:flex; align-items:center; gap:12px;';
  if(AUTH.token) headerActions.appendChild(renderBellButton());
  const gearBtn = document.createElement('button');
  gearBtn.className = 'gear-btn'; gearBtn.setAttribute('aria-label','Cài đặt'); gearBtn.setAttribute('title','Cài đặt');
  gearBtn.textContent = '⚙';
  gearBtn.onclick = ()=>{ settingsPanelOpen = true; settingsPanelFresh = true; render(); };
  headerActions.appendChild(gearBtn);
  header.appendChild(headerActions);
  wrap.appendChild(header);

  const main = document.createElement('main');

  if(!AUTH.token){
    const empty = document.createElement('div');
    empty.style.textAlign = 'center';
    empty.style.padding = '48px 12px 12px';
    empty.innerHTML = `
      <div style="font-size:40px; margin-bottom:14px;">🏫</div>
      <div class="display" style="font-size:18px; font-weight:700; margin-bottom:8px;">Chưa đăng nhập</div>
      <div class="tr-sub" style="margin-bottom:20px;">Đăng nhập để tạo hoặc vào lớp học, và soạn bài kiểm tra.</div>
    `;
    const loginBtn = document.createElement('button');
    loginBtn.className = 'save-btn';
    loginBtn.style.maxWidth = '240px';
    loginBtn.style.marginLeft = 'auto';
    loginBtn.style.marginRight = 'auto';
    loginBtn.textContent = 'Đăng nhập / Đăng ký';
    loginBtn.onclick = ()=>{ authMode='login'; authError=''; authModalOpen=true; authModalFresh=true; render(); };
    empty.appendChild(loginBtn);
    main.appendChild(empty);
  } else {
    ensureClassroomsLoaded();
    main.appendChild(renderClassroomsSection());
  }

  wrap.appendChild(main);
  return wrap;
}

function renderClassroomsSection(){
  const wrap = document.createElement('div');

  if(classroomError){
    const errBox = document.createElement('div');
    errBox.style.color = 'var(--coral)';
    errBox.style.fontSize = '12px';
    errBox.style.margin = '0 0 10px';
    errBox.textContent = classroomError;
    wrap.appendChild(errBox);
  }

  if(AUTH.role === 'teacher'){
    // --- create-classroom mini form ---
    const formRow = document.createElement('div');
    formRow.style.display = 'flex';
    formRow.style.gap = '8px';
    formRow.style.marginBottom = '16px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Tên lớp, ví dụ: Lớp 10A1';
    input.style.flex = '1';
    input.style.background = 'var(--bg-elev)';
    input.style.border = '1px solid var(--line)';
    input.style.color = 'var(--white)';
    input.style.borderRadius = '10px';
    input.style.padding = '11px 12px';
    input.style.fontSize = '14px';
    input.onkeydown = (e)=>{ if(e.key==='Enter'){ createClassroom(input.value); } };

    const btn = document.createElement('button');
    btn.className = 'save-btn';
    btn.style.width = 'auto'; btn.style.margin = '0'; btn.style.padding = '11px 16px'; btn.style.fontSize = '14px';
    btn.textContent = classroomBusy ? '…' : '+ Tạo lớp';
    btn.disabled = classroomBusy;
    btn.onclick = ()=> createClassroom(input.value);

    formRow.appendChild(input);
    formRow.appendChild(btn);
    wrap.appendChild(formRow);

    if(classroomsLoading && !classroomsLoaded){
      const loading = document.createElement('div');
      loading.className = 'tr-sub';
      loading.textContent = 'Đang tải danh sách lớp…';
      wrap.appendChild(loading);
    } else if(CLASSROOMS.length === 0){
      const empty = document.createElement('div');
      empty.className = 'tr-sub';
      empty.textContent = 'Chưa có lớp nào — tạo lớp rồi gửi mã cho học sinh.';
      wrap.appendChild(empty);
    }

    const grid = document.createElement('div');
    grid.className = 'classroom-grid';

    CLASSROOMS.forEach((c,i)=>{
      const color = COLORS[i % COLORS.length];
      const card = document.createElement('div');
      card.className = 'classroom-card';
      card.onclick = ()=> openTestManager(c.id, c.name);

      const banner = document.createElement('div');
      banner.className = 'classroom-banner';
      banner.style.background = `linear-gradient(135deg, ${color}, ${color}99)`;
      const delBtn = document.createElement('button');
      delBtn.className = 'cb-del';
      delBtn.textContent = '🗑'; delBtn.title = 'Xoá lớp'; delBtn.setAttribute('aria-label','Xoá lớp');
      delBtn.onclick = (e)=>{ e.stopPropagation(); classroomConfirm = {type:'delete', id:c.id, name:c.name}; render(); };
      banner.appendChild(document.createElement('span'));
      banner.appendChild(delBtn);
      card.appendChild(banner);

      const body = document.createElement('div');
      body.className = 'classroom-body';

      const nameEl = document.createElement('div');
      nameEl.className = 'classroom-name';
      nameEl.textContent = c.name;
      body.appendChild(nameEl);

      const chipRow = document.createElement('div');
      chipRow.className = 'classroom-chip-row';

      const codeChip = document.createElement('button');
      codeChip.className = 'classroom-chip mono';
      codeChip.title = 'Chạm để sao chép mã lớp';
      codeChip.textContent = c.code;
      codeChip.onclick = (e)=>{ e.stopPropagation(); copyClassCode(c.code); };

      const membersChip = document.createElement('button');
      membersChip.className = 'classroom-chip';
      membersChip.textContent = '👥 ' + c.members.length;
      membersChip.onclick = (e)=>{ e.stopPropagation(); classroomMembersView = c; render(); };

      chipRow.appendChild(codeChip);
      chipRow.appendChild(membersChip);
      body.appendChild(chipRow);

      card.appendChild(body);
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
  } else {
    // --- student: join-by-code form ---
    const formRow = document.createElement('div');
    formRow.style.display = 'flex';
    formRow.style.gap = '8px';
    formRow.style.marginBottom = '16px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nhập mã lớp';
    input.style.flex = '1';
    input.style.background = 'var(--bg-elev)';
    input.style.border = '1px solid var(--line)';
    input.style.color = 'var(--white)';
    input.style.borderRadius = '10px';
    input.style.padding = '11px 12px';
    input.style.fontSize = '14px';
    input.style.textTransform = 'uppercase';
    input.onkeydown = (e)=>{ if(e.key==='Enter'){ joinClassroom(input.value); } };

    const btn = document.createElement('button');
    btn.className = 'save-btn';
    btn.style.width = 'auto'; btn.style.margin = '0'; btn.style.padding = '11px 16px'; btn.style.fontSize = '14px';
    btn.textContent = classroomBusy ? '…' : 'Vào lớp';
    btn.disabled = classroomBusy;
    btn.onclick = ()=> joinClassroom(input.value);

    formRow.appendChild(input);
    formRow.appendChild(btn);
    wrap.appendChild(formRow);

    if(classroomsLoading && !classroomsLoaded){
      const loading = document.createElement('div');
      loading.className = 'tr-sub';
      loading.textContent = 'Đang tải danh sách lớp…';
      wrap.appendChild(loading);
    } else if(CLASSROOMS.length === 0){
      const empty = document.createElement('div');
      empty.className = 'tr-sub';
      empty.textContent = 'Chưa vào lớp nào — nhập mã lớp giáo viên gửi cho bạn.';
      wrap.appendChild(empty);
    }

    const grid = document.createElement('div');
    grid.className = 'classroom-grid';

    CLASSROOMS.forEach((c,i)=>{
      const color = COLORS[i % COLORS.length];
      const card = document.createElement('div');
      card.className = 'classroom-card';
      card.onclick = ()=> openStudentTestList(c);

      const banner = document.createElement('div');
      banner.className = 'classroom-banner';
      banner.style.background = `linear-gradient(135deg, ${color}, ${color}99)`;
      const leaveBtn = document.createElement('button');
      leaveBtn.className = 'cb-del';
      leaveBtn.textContent = '🗑'; leaveBtn.title = 'Rời lớp'; leaveBtn.setAttribute('aria-label','Rời lớp');
      leaveBtn.onclick = (e)=>{ e.stopPropagation(); classroomConfirm = {type:'leave', id:c.id, name:c.name}; render(); };
      banner.appendChild(document.createElement('span'));
      banner.appendChild(leaveBtn);
      card.appendChild(banner);

      const body = document.createElement('div');
      body.className = 'classroom-body';
      const nameEl = document.createElement('div');
      nameEl.className = 'classroom-name';
      nameEl.textContent = c.name;
      body.appendChild(nameEl);
      const chipRow = document.createElement('div');
      chipRow.className = 'classroom-chip-row';
      chipRow.innerHTML = `<span class="classroom-chip" style="cursor:default;">👤 ${escapeHtml(personLabel({name:c.teacherName, email:c.teacherEmail}))}</span>`;
      body.appendChild(chipRow);
      card.appendChild(body);
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
  }

  return wrap;
}

function renderClassroomMembersModal(){
  const c = classroomMembersView;
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ classroomMembersView=null; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<div class="modal-title display">Học sinh — ${escapeHtml(c.name)}</div>`;

  if(c.members.length === 0){
    const empty = document.createElement('div');
    empty.className = 'tr-sub';
    empty.textContent = 'Chưa có học sinh nào vào lớp.';
    card.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.style.maxHeight = '50vh';
    list.style.overflowY = 'auto';
    list.innerHTML = c.members.map(m=>
      `<div class="tr-sub" style="padding:8px 0; border-bottom:1px solid var(--line);">${escapeHtml(personLabel(m))}</div>`
    ).join('');
    card.appendChild(list);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'save-btn';
  closeBtn.style.marginTop = '18px';
  closeBtn.textContent = 'Đóng';
  closeBtn.onclick = ()=>{ classroomMembersView=null; render(); };
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  return overlay;
}

async function updateDisplayName(newName){
  newName = (newName||'').trim();
  if(!newName){ renameError = 'Nhập tên hiển thị'; render(); return; }
  renameBusy = true; renameError = ''; render();
  try{
    const res = await authorizedRequest('/account/name', { name: newName });
    AUTH.name = res.name;
    saveAuth();
    renameModalOpen = false;
    toast('Đã đổi tên hiển thị ✓');
  }catch(e){
    renameError = e.message || 'Đổi tên thất bại';
  }
  renameBusy = false; render();
}

function renderRenameModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay && !renameBusy){ renameModalOpen=false; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<div class="modal-title display">Đổi tên hiển thị</div>`;

  const field = document.createElement('div');
  field.className = 'field';
  field.style.marginTop = '14px';
  field.innerHTML = `<input type="text" id="renameInput" placeholder="Tên hiển thị" value="${escapeHtml(AUTH.name||'')}">`;
  card.appendChild(field);
  const input = field.querySelector('#renameInput');
  input.onkeydown = (e)=>{ if(e.key==='Enter') updateDisplayName(input.value); };

  if(renameError){
    const errBox = document.createElement('div');
    errBox.style.color = 'var(--coral)';
    errBox.style.fontSize = '12px';
    errBox.style.margin = '-8px 0 4px';
    errBox.textContent = renameError;
    card.appendChild(errBox);
  }

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '10px';
  btnRow.style.marginTop = '18px';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'save-btn';
  cancelBtn.style.background = 'var(--bg-elev)';
  cancelBtn.style.color = 'var(--white)';
  cancelBtn.style.border = '1px solid var(--line)';
  cancelBtn.textContent = 'Huỷ';
  cancelBtn.disabled = renameBusy;
  cancelBtn.onclick = ()=>{ renameModalOpen=false; render(); };

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.textContent = renameBusy ? 'Đang lưu…' : 'Lưu';
  saveBtn.disabled = renameBusy;
  saveBtn.onclick = ()=> updateDisplayName(input.value);

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);

  setTimeout(()=> input.focus(), 0);
  return overlay;
}

function renderClassroomConfirmModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ classroomConfirm=null; render(); } };

  const info = classroomConfirm;
  const isDelete = info.type === 'delete';
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div class="modal-title display">${isDelete ? 'Xoá' : 'Rời'} lớp "${escapeHtml(info.name)}"?</div>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin:0 0 4px;">
      ${isDelete
        ? 'Toàn bộ danh sách học sinh của lớp sẽ mất. Mã lớp cũ sẽ không dùng được nữa. Hành động này không thể hoàn tác.'
        : 'Bạn có thể vào lại lớp này sau bằng mã lớp nếu cần.'}
    </p>
  `;

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '10px';
  btnRow.style.marginTop = '22px';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'save-btn';
  cancelBtn.style.background = 'var(--bg-elev)';
  cancelBtn.style.color = 'var(--white)';
  cancelBtn.style.border = '1px solid var(--line)';
  cancelBtn.textContent = 'Huỷ';
  cancelBtn.onclick = ()=>{ classroomConfirm=null; render(); };

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'save-btn';
  confirmBtn.style.background = 'var(--coral)';
  confirmBtn.style.color = '#3a0d13';
  confirmBtn.textContent = isDelete ? 'Xoá lớp' : 'Rời lớp';
  confirmBtn.onclick = async ()=>{
    const id = info.id;
    classroomConfirm = null;
    if(isDelete) await deleteClassroom(id); else await leaveClassroom(id);
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  return overlay;
}

