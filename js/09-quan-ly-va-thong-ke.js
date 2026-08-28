/* 09-quan-ly-va-thong-ke.js — Tab Thẻ ghi nhớ (danh sách/tìm/sửa/xoá thẻ) và tab Thống kê (XP, streak, huy hiệu)
   (Phần 1590-1751 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- MANAGE ---------------- */
function renderManage(){
  const wrap = document.createElement('div');
  wrap.style.display='contents';

  const header = document.createElement('header');
  header.className='topbar';
  header.innerHTML = `<h1 class="display">Thẻ ghi nhớ</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');

  if(manageFilterSubjectId){
    const s = subjectById(manageFilterSubjectId);
    if(!s){ manageFilterSubjectId = null; }
    else{
      const chip = document.createElement('div');
      chip.style.cssText = 'display:inline-flex; align-items:center; gap:8px; background:var(--bg-elev); border:1px solid var(--line); border-radius:20px; padding:8px 8px 8px 14px; font-size:13px; margin-bottom:14px;';
      chip.innerHTML = `<span>Đang xem: <strong>${escapeHtml(s.name)}</strong></span><button style="background:none;border:none;color:var(--ink-faint);font-size:16px;cursor:pointer;padding:2px 6px;">✕</button>`;
      chip.querySelector('button').onclick = ()=>{ manageFilterSubjectId = null; render(); };
      main.appendChild(chip);
    }
  }

  const search = document.createElement('input');
  search.className='search-box';
  search.placeholder = 'Tìm kiếm thẻ...';
  search.value = manageSearch;
  search.oninput = (e)=>{ manageSearch = e.target.value; renderManageList(list); };
  main.appendChild(search);

  const list = document.createElement('div');
  main.appendChild(list);
  renderManageList(list);

  wrap.appendChild(main);
  return wrap;
}

function renderManageList(list){
  list.innerHTML = '';
  const q = manageSearch.trim().toLowerCase();
  let cards = DATA.cards.slice().sort((a,b)=>a.due-b.due);
  if(manageFilterSubjectId){
    const set = new Set(subtreeIds(manageFilterSubjectId));
    cards = cards.filter(c=>set.has(c.subjectId));
  }
  if(q) cards = cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));

  if(cards.length===0){
    list.appendChild(emptyState('🔍', q ? 'Không tìm thấy thẻ nào phù hợp.' : 'Chưa có thẻ nào. Nhấn + để tạo bộ thẻ rồi thêm thẻ đầu tiên.'));
    return;
  }

  cards.forEach(c=>{
    const s = subjectById(c.subjectId);
    const item = document.createElement('div');
    item.className='manage-item';
    item.innerHTML = `
      <div class="mi-top">
        <div>
          <span class="subject-dot" style="background:${s?s.color:'#888'};display:inline-block;margin-right:6px;"></span>
          <span style="font-size:11px;color:var(--ink-faint)">${s?escapeHtml(s.name):''}</span>
          <div class="mi-front">${escapeHtml(c.front)}</div>
          <div class="mi-back">${escapeHtml(c.back)}</div>
        </div>
        <button class="mi-del">✕</button>
      </div>
    `;
    item.querySelector('.mi-del').onclick = ()=>{ deleteCardId = c.id; render(); };
    list.appendChild(item);
  });
}

/* ---------------- STATS ---------------- */
function renderStats(){
  const wrap = document.createElement('div');
  wrap.style.display='contents';

  const header = document.createElement('header');
  header.className='topbar';
  header.innerHTML = `<h1 class="display">Thống kê</h1>`;
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

  const total = DATA.cards.length;
  const due = dueCards().length;
  const mastered = DATA.cards.filter(c=>c.interval>=21).length;
  const learning = DATA.cards.filter(c=>c.reps>0 && c.interval<21).length;

  main.appendChild(buildProgressBar());

  const p = DATA.progress;
  const badgeLabel = document.createElement('div');
  badgeLabel.className = 'section-label';
  badgeLabel.style.marginTop = '18px';
  badgeLabel.textContent = `Huy hiệu (${p.badges.length}/${Object.keys(BADGE_DEFS).length}) · 🔥 Kỷ lục ${p.bestStreak} ngày · ❄️ ${p.streakFreezes} lượt đóng băng`;
  main.appendChild(badgeLabel);

  const badgeGrid = document.createElement('div');
  badgeGrid.className = 'badge-grid';
  Object.entries(BADGE_DEFS).forEach(([id, def])=>{
    const unlocked = p.badges.includes(id);
    const item = document.createElement('div');
    item.className = 'badge-item' + (unlocked ? ' unlocked' : '');
    item.innerHTML = `
      <div class="badge-icon">${unlocked ? def.icon : '🔒'}</div>
      <div class="badge-title">${unlocked ? escapeHtml(def.title) : '???'}</div>
      <div class="badge-desc">${escapeHtml(def.desc)}</div>
    `;
    badgeGrid.appendChild(item);
  });
  main.appendChild(badgeGrid);

  const grid = document.createElement('div');
  grid.className='stat-grid';
  grid.innerHTML = `
    <div class="stat-box"><div class="val">${total}</div><div class="lab">Tổng số thẻ</div></div>
    <div class="stat-box"><div class="val">${due}</div><div class="lab">Đến hạn hôm nay</div></div>
    <div class="stat-box"><div class="val">${mastered}</div><div class="lab">Đã thuộc lâu (≥21 ngày)</div></div>
    <div class="stat-box"><div class="val">${learning}</div><div class="lab">Đang học</div></div>
  `;
  main.appendChild(grid);

  const label = document.createElement('div');
  label.className='section-label';
  label.textContent = 'Theo bộ thẻ';
  main.appendChild(label);

  DATA.subjects.forEach(s=>{
    const c = subtreeCardCount(s.id);
    const d = dueCards(s.id).length;
    const pathLabel = subjectPath(s.id).map(x=>x.name).join(' › ');
    const row = document.createElement('div');
    row.className='subject-row';
    row.innerHTML = `
      <span class="subject-dot" style="background:${s.color}"></span>
      <div class="subject-info">
        <div class="subject-name">${escapeHtml(pathLabel)}</div>
        <div class="subject-meta">${c} thẻ</div>
      </div>
      <div class="subject-due ${d===0?'zero':''}" style="cursor:default;">${d>0? d+' đến hạn':'✓'}</div>
      <button class="subject-del" title="Xoá" aria-label="Xoá">🗑</button>
    `;
    row.querySelector('.subject-del').onclick = ()=>{ deleteSubjectId = s.id; render(); };
    main.appendChild(row);
  });

  wrap.appendChild(main);
  return wrap;
}

