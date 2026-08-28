/* 05-trang-chu-bo-the.js — Tab Trang chủ: cây bộ thẻ lồng nhau (mở/thu gọn kiểu AnkiDroid), hàm emptyState() và escapeHtml() dùng chung
   (Phần 623-764 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- HOME ---------------- */
function renderHome(){
  const wrap = document.createElement('div');
  wrap.style.display='contents';

  const header = document.createElement('header');
  header.className='topbar';
  header.innerHTML = `
    <h1 class="display">Ôn tập</h1>
    <div style="display:flex; align-items:center; gap:12px;">
      <span class="date">${todayLabel()}</span>
    </div>
  `;
  if(AUTH.token) header.querySelector('div').appendChild(renderBellButton());
  const gearBtn = document.createElement('button');
  gearBtn.className = 'gear-btn'; gearBtn.setAttribute('aria-label','Cài đặt'); gearBtn.setAttribute('title','Cài đặt');
  gearBtn.textContent = '⚙';
  gearBtn.onclick = ()=>{ settingsPanelOpen = true; settingsPanelFresh = true; render(); };
  header.querySelector('div').appendChild(gearBtn);
  wrap.appendChild(header);

  const main = document.createElement('main');
  const totalDue = dueCards().length;

  main.appendChild(buildProgressBar());

  const hero = document.createElement('div');
  hero.className='hero-card';
  hero.innerHTML = `
    <div class="hero-number">${totalDue}</div>
    <div class="hero-label">thẻ đến hạn ôn hôm nay</div>
    <button class="hero-btn" ${totalDue===0?'disabled':''}>${totalDue===0 ? 'Đã ôn hết — quay lại sau' : 'Bắt đầu ôn tập →'}</button>
  `;
  hero.querySelector('button').onclick = ()=>{
    if(totalDue===0) return;
    sessionSubjectFilter = null;
    startReview();
  };
  main.appendChild(hero);

  const label = document.createElement('div');
  label.className='section-label';
  label.textContent = 'Bộ thẻ';
  main.appendChild(label);

  const topLevel = childSubjects(null);
  if(topLevel.length===0){
    main.appendChild(emptyState('📚','Chưa có bộ thẻ nào. Nhấn nút + để tạo bộ thẻ đầu tiên.'));
  } else {
    renderSubjectTree(main, null, 0);
  }

  wrap.appendChild(main);
  return wrap;
}

// Vẽ danh sách bộ thẻ dạng cây lồng nhau (giống AnkiDroid): mỗi bộ thẻ có
// bộ thẻ phụ sẽ có mũi tên ▶ để mở/thu gọn ngay tại chỗ, thay vì bấm vào để
// chuyển sang trang khác. Gọi đệ quy cho các cấp con khi đang mở rộng.
function renderSubjectTree(main, parentId, depth){
  const children = childSubjects(parentId);
  children.forEach(s=>{
    const count = subtreeCardCount(s.id);
    const kids = childSubjects(s.id).length;
    const due = dueCards(s.id).length;
    const isOpen = expandedSubjects.has(s.id);

    const row = document.createElement('div');
    row.className='subject-row';
    row.style.paddingLeft = (6 + depth*20) + 'px';

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    if(kids>0){
      expandBtn.className = 'subject-expand' + (isOpen ? ' open' : '');
      expandBtn.textContent = '▶';
      expandBtn.setAttribute('aria-label', isOpen ? 'Thu gọn bộ thẻ phụ' : 'Mở bộ thẻ phụ');
      expandBtn.onclick = (e)=>{
        e.stopPropagation();
        toggleSubjectExpanded(s.id);
        render();
      };
    } else {
      expandBtn.className = 'subject-expand-spacer';
      expandBtn.tabIndex = -1;
      expandBtn.disabled = true;
    }
    row.appendChild(expandBtn);

    const dot = document.createElement('span');
    dot.className='subject-dot';
    dot.style.background = s.color;
    row.appendChild(dot);

    const info = document.createElement('div');
    info.className='subject-info';
    info.innerHTML = `
      <div class="subject-name">${escapeHtml(s.name)}</div>
      <div class="subject-meta">${count} thẻ${kids>0 ? ' · '+kids+' bộ thẻ phụ' : ''}</div>
    `;
    row.appendChild(info);

    const dueBtn = document.createElement('button');
    dueBtn.type = 'button';
    dueBtn.className = 'subject-due' + (due===0 ? ' zero' : '');
    dueBtn.textContent = due>0 ? due+' đến hạn' : '✓';
    dueBtn.onclick = (e)=>{
      e.stopPropagation();
      if(due===0) return;
      sessionSubjectFilter = s.id;
      startReview();
    };
    row.appendChild(dueBtn);

    const wasLongPress = attachDeckLongPress(row, s);
    row.onclick = ()=>{
      if(wasLongPress()) return;
      // Giống AnkiDroid: bấm vào 1 bộ thẻ là ôn luôn nếu có thẻ đến hạn;
      // nếu không thì mở/thu gọn bộ thẻ phụ bên trong (nếu có).
      if(due>0){ sessionSubjectFilter = s.id; startReview(); }
      else if(kids>0){ toggleSubjectExpanded(s.id); render(); }
    };

    main.appendChild(row);

    if(kids>0 && isOpen){
      renderSubjectTree(main, s.id, depth+1);
    }
  });
}

function emptyState(glyph, text){
  const d = document.createElement('div');
  d.className='empty-state';
  d.innerHTML = `<div class="glyph">${glyph}</div><p>${text}</p>`;
  return d;
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

