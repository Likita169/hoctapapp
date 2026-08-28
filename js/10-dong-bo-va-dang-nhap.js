/* 10-dong-bo-va-dang-nhap.js — Modal chọn giữ dữ liệu máy nào khi đăng nhập bị lệch, phần tài khoản trong Cài đặt, và màn hình Đăng nhập/Đăng ký
   (Phần 1752-2017 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- SYNC CONFLICT MODAL ---------------- */
function renderSyncChoiceModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div class="modal-title display">Có dữ liệu ở cả 2 nơi</div>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin:0 0 4px;">
      Tài khoản này đã có dữ liệu lưu trên máy chủ, còn máy hiện tại cũng đang có dữ liệu
      riêng. Chọn một bên để giữ lại — bên còn lại sẽ bị ghi đè.
    </p>
  `;

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.flexDirection = 'column';
  btnRow.style.gap = '10px';
  btnRow.style.marginTop = '20px';

  const useRemote = document.createElement('button');
  useRemote.className = 'save-btn';
  useRemote.style.background = 'var(--teal)';
  useRemote.textContent = 'Dùng dữ liệu trên máy chủ';
  useRemote.onclick = ()=>{
    const remote = pendingSyncChoice;
    pendingSyncChoice = null;
    applyRemoteData(remote);
    toast('Đã dùng dữ liệu từ máy chủ ✓');
    render();
  };

  const useLocal = document.createElement('button');
  useLocal.className = 'save-btn';
  useLocal.style.background = 'var(--bg-elev)';
  useLocal.style.color = 'var(--white)';
  useLocal.style.border = '1px solid var(--line)';
  useLocal.textContent = 'Dùng dữ liệu trên máy này';
  useLocal.onclick = async ()=>{
    pendingSyncChoice = null;
    await pushSync(true);
    toast('Đã đẩy dữ liệu máy này lên máy chủ ✓');
    render();
  };

  btnRow.appendChild(useRemote);
  btnRow.appendChild(useLocal);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  return overlay;
}

function renderAccountSection(){
  const wrap = document.createElement('div');

  if(AUTH.token){
    const box = document.createElement('div');
    box.className = 'toggle-row';
    box.style.flexDirection = 'column';
    box.style.alignItems = 'stretch';
    box.style.gap = '10px';

    const statusLabel = { idle:'', syncing:'Đang đồng bộ…', synced:'Đã đồng bộ ✓', error:'Lỗi đồng bộ, thử lại' }[syncStatus] || '';
    const statusColor = syncStatus==='error' ? 'var(--coral)' : (syncStatus==='synced' ? 'var(--teal)' : 'var(--ink-faint)');

    const roleLabel = AUTH.role === 'teacher' ? 'Giáo viên' : 'Học sinh';
    const displayName = AUTH.name ? AUTH.name : AUTH.email;
    const nameLine = document.createElement('div');
    nameLine.style.display = 'flex';
    nameLine.style.alignItems = 'center';
    nameLine.style.gap = '6px';
    nameLine.innerHTML = `<div class="tr-title">${escapeHtml(displayName)} <span class="tr-sub" style="font-weight:600;">· ${roleLabel}</span></div>`;
    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.title = 'Đổi tên hiển thị';
    editBtn.setAttribute('aria-label', 'Đổi tên hiển thị');
    editBtn.style.background = 'none'; editBtn.style.border = 'none'; editBtn.style.color = 'var(--ink-faint)';
    editBtn.style.fontSize = '14px'; editBtn.style.cursor = 'pointer'; editBtn.style.padding = '2px 4px';
    editBtn.onclick = ()=>{ renameError=''; renameModalOpen = true; render(); };
    nameLine.appendChild(editBtn);

    const textBox = document.createElement('div');
    textBox.appendChild(nameLine);
    const subLine = document.createElement('div');
    subLine.className = 'tr-sub';
    subLine.textContent = AUTH.name ? AUTH.email : '';
    textBox.appendChild(subLine);
    const statusLine = document.createElement('div');
    statusLine.className = 'tr-sub';
    statusLine.style.color = statusColor;
    statusLine.textContent = statusLabel || 'Dữ liệu tự đồng bộ mỗi khi bạn sửa thẻ';
    textBox.appendChild(statusLine);
    box.appendChild(textBox);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex'; btnRow.style.gap = '8px';

    const syncBtn = document.createElement('button');
    syncBtn.className = 'save-btn';
    syncBtn.style.background = 'var(--bg-elev)'; syncBtn.style.color = 'var(--white)'; syncBtn.style.border = '1px solid var(--line)';
    syncBtn.style.marginTop = '0'; syncBtn.style.flex = '1'; syncBtn.style.fontSize = '13px'; syncBtn.style.padding = '11px';
    syncBtn.textContent = '⟳ Đồng bộ ngay';
    syncBtn.onclick = manualSync;

    const outBtn = document.createElement('button');
    outBtn.className = 'save-btn';
    outBtn.style.background = 'var(--bg-elev)'; outBtn.style.color = 'var(--coral)'; outBtn.style.border = '1px solid var(--line)';
    outBtn.style.marginTop = '0'; outBtn.style.flex = '1'; outBtn.style.fontSize = '13px'; outBtn.style.padding = '11px';
    outBtn.textContent = 'Đăng xuất';
    outBtn.onclick = ()=> logout(false);

    btnRow.appendChild(syncBtn);
    btnRow.appendChild(outBtn);
    box.appendChild(btnRow);
    wrap.appendChild(box);
    return wrap;
  }

  // Not logged in — just a prompt + button that opens the dedicated login/register screen.
  if(!syncServerReady()){
    const note = document.createElement('div');
    note.className = 'tr-sub';
    note.style.marginBottom = '10px';
    note.textContent = 'Chưa thiết lập máy chủ đồng bộ — xem mục "Tài khoản & đồng bộ" trong HUONG-DAN.md.';
    wrap.appendChild(note);
  }

  const box = document.createElement('div');
  box.className = 'toggle-row';
  box.innerHTML = `
    <div class="tr-text">
      <div class="tr-title">Chưa đăng nhập</div>
      <div class="tr-sub">Đăng nhập để đồng bộ dữ liệu qua nhiều máy và dùng lớp học.</div>
    </div>
  `;
  const openBtn = document.createElement('button');
  openBtn.className = 'save-btn';
  openBtn.style.width = 'auto'; openBtn.style.margin = '0'; openBtn.style.padding = '11px 16px'; openBtn.style.fontSize = '13px'; openBtn.style.flexShrink = '0';
  openBtn.textContent = 'Đăng nhập';
  openBtn.onclick = ()=>{ authMode = 'login'; authError = ''; authModalOpen = true; authModalFresh = true; render(); };
  box.appendChild(openBtn);
  wrap.appendChild(box);

  return wrap;
}

/* ---------------- ĐĂNG NHẬP / ĐĂNG KÝ (cửa sổ riêng) ---------------- */
function renderAuthModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop settings-overlay' + (authModalFresh ? ' animate-in' : '');
  overlay.onclick = (e)=>{ if(e.target===overlay && !authBusy){ authModalOpen=false; render(); } };

  const panel = document.createElement('div');
  panel.className = 'settings-panel' + (authModalFresh ? ' animate-in' : '');

  const isRegister = authMode === 'register';

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `
    <h1 class="display">${isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
    <button class="review-close" aria-label="Đóng">✕</button>
  `;
  header.querySelector('.review-close').onclick = ()=>{ if(!authBusy){ authModalOpen=false; render(); } };
  panel.appendChild(header);

  const main = document.createElement('main');

  if(isRegister){
    const fName = document.createElement('div');
    fName.className = 'field';
    fName.innerHTML = `<label>Tên hiển thị</label><input type="text" id="authName" placeholder="Ví dụ: Nguyễn Văn A" autocomplete="name">`;
    main.appendChild(fName);
  }

  const fEmail = document.createElement('div');
  fEmail.className = 'field';
  fEmail.innerHTML = `<label>Email</label><input type="email" id="authEmail" placeholder="ban@vidu.com" autocomplete="username">`;
  main.appendChild(fEmail);

  const fPass = document.createElement('div');
  fPass.className = 'field';
  fPass.innerHTML = `<label>Mật khẩu</label>
    <div class="pw-wrap">
      <input type="password" id="authPassword" placeholder="Ít nhất 6 ký tự" autocomplete="${isRegister?'new-password':'current-password'}">
      <button type="button" class="pw-toggle" aria-label="Hiện mật khẩu">👁</button>
    </div>`;
  main.appendChild(fPass);
  const pwInput = fPass.querySelector('#authPassword');
  const pwToggle = fPass.querySelector('.pw-toggle');
  pwToggle.onclick = ()=>{
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    pwToggle.textContent = showing ? '👁' : '🙈';
    pwToggle.setAttribute('aria-label', showing ? 'Hiện mật khẩu' : 'Ẩn mật khẩu');
    pwInput.focus();
  };

  // Role picker — only relevant when creating a new account. Login doesn't
  // need it since the role is already stored on the account.
  if(isRegister){
    const fRole = document.createElement('div');
    fRole.className = 'field';
    fRole.innerHTML = `<label>Bạn là</label>`;
    const roleRow = document.createElement('div');
    roleRow.style.display = 'flex'; roleRow.style.gap = '8px';
    [['student','Học sinh'],['teacher','Giáo viên']].forEach(([val,label])=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.flex = '1';
      btn.style.padding = '11px';
      btn.style.borderRadius = '10px';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '600';
      btn.style.border = registerRole===val ? '1px solid var(--teal)' : '1px solid var(--line)';
      btn.style.background = registerRole===val ? 'var(--teal)' : 'var(--bg-elev)';
      btn.style.color = registerRole===val ? 'var(--bg)' : 'var(--white)';
      btn.onclick = ()=>{ registerRole = val; render(); };
      roleRow.appendChild(btn);
    });
    fRole.appendChild(roleRow);
    main.appendChild(fRole);
  }

  if(authError){
    const errBox = document.createElement('div');
    errBox.style.color = 'var(--coral)';
    errBox.style.fontSize = '12px';
    errBox.style.margin = '-8px 0 14px';
    errBox.textContent = authError;
    main.appendChild(errBox);
  }

  const submitBtn = document.createElement('button');
  submitBtn.className = 'save-btn';
  submitBtn.disabled = authBusy;
  submitBtn.textContent = authBusy ? 'Đang xử lý…' : (isRegister ? 'Tạo tài khoản' : 'Đăng nhập');
  submitBtn.onclick = ()=>{
    const email = main.querySelector('#authEmail').value.trim();
    const password = main.querySelector('#authPassword').value;
    if(isRegister){
      const name = main.querySelector('#authName').value.trim();
      doRegister(email, password, name, registerRole);
    } else {
      doLogin(email, password);
    }
  };
  main.appendChild(submitBtn);

  const switchLink = document.createElement('button');
  switchLink.className = 'back-link';
  switchLink.style.width = '100%';
  switchLink.style.justifyContent = 'center';
  switchLink.style.padding = '12px 0 4px';
  switchLink.textContent = isRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo tài khoản mới';
  switchLink.onclick = ()=>{ authMode = isRegister ? 'login' : 'register'; authError=''; render(); };
  main.appendChild(switchLink);

  panel.appendChild(main);
  overlay.appendChild(panel);
  authModalFresh = false;
  return overlay;
}

