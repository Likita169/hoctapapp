/* 11-giao-dien-cai-dat.js — Modal chọn giao diện sáng/tối và toàn bộ giao diện tab Cài đặt (nút ⚙)
   (Phần 2018-2182 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- THEME MODAL ---------------- */
function renderThemeModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ themeModalOpen=false; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<div class="modal-title display">Giao diện</div>`;

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';

  const THEME_OPTS = [
    { v:'system', label:'📱 Theo thiết bị' },
    { v:'light',  label:'☀️ Sáng' },
    { v:'dark',   label:'🌙 Tối' }
  ];
  const currentTheme = (DATA.settings && DATA.settings.theme) || 'system';

  THEME_OPTS.forEach(opt=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-opt' + (opt.v===currentTheme ? ' active' : '');
    btn.textContent = opt.label;
    btn.onclick = async ()=>{
      themeModalOpen = false;
      if((DATA.settings.theme || 'system') !== opt.v){
        DATA.settings.theme = opt.v;
        await saveData();
        applyTheme();
      }
      render();
    };
    list.appendChild(btn);
  });

  card.appendChild(list);
  overlay.appendChild(card);
  return overlay;
}

/* ---------------- SETTINGS ---------------- */
function renderSettings(){
  const wrap = document.createElement('div');
  wrap.style.display='contents';

  const header = document.createElement('header');
  header.className='topbar';
  header.innerHTML = `
    <h1 class="display">Cài đặt</h1>
    <button class="review-close" aria-label="Đóng">✕</button>
  `;
  header.querySelector('.review-close').onclick = ()=>{ settingsPanelOpen = false; render(); };
  wrap.appendChild(header);

  const main = document.createElement('main');

  const themeLabel = document.createElement('div');
  themeLabel.className='section-label';
  themeLabel.textContent = 'Giao diện';
  main.appendChild(themeLabel);

  const THEME_LABELS = { system:'📱 Theo thiết bị', light:'☀️ Sáng', dark:'🌙 Tối' };
  const currentTheme = (DATA.settings && DATA.settings.theme) || 'system';

  const themeField = document.createElement('div');
  themeField.className = 'field';
  themeField.style.marginBottom = '20px';
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'time-value-btn';
  themeBtn.innerHTML = `<span>${THEME_LABELS[currentTheme]}</span><span class="chev">▾</span>`;
  themeBtn.onclick = ()=>{ themeModalOpen = true; render(); };
  themeField.appendChild(themeBtn);
  main.appendChild(themeField);

  const labelAcc = document.createElement('div');
  labelAcc.className='section-label';
  labelAcc.textContent = 'Tài khoản & đồng bộ';
  main.appendChild(labelAcc);
  main.appendChild(renderAccountSection());

  const labelR = document.createElement('div');
  labelR.className='section-label';
  labelR.textContent = 'Nhắc nhở';
  main.appendChild(labelR);

  const pushOn = !!(DATA.settings && DATA.settings.pushEnabled);
  const pushHour = (DATA.settings && DATA.settings.pushHour != null) ? DATA.settings.pushHour : 20;
  const pushMinute = (DATA.settings && DATA.settings.pushMinute != null) ? DATA.settings.pushMinute : 0;
  const pushTimeVal = String(pushHour).padStart(2,'0') + ':' + String(pushMinute).padStart(2,'0');

  const pushRow = document.createElement('div');
  pushRow.className='toggle-row';
  pushRow.innerHTML = `
    <div class="tr-text">
      <div class="tr-title">Nhắc đúng giờ mỗi ngày</div>
      <div class="tr-sub">Gửi thông báo đúng giờ đã chọn, kể cả khi app đang đóng hẳn.</div>
    </div>
    <label class="switch">
      <input type="checkbox" ${pushOn?'checked':''}>
      <span class="track"></span>
    </label>
  `;
  pushRow.querySelector('input').onchange = (e)=> togglePushReminder(e.target.checked);
  main.appendChild(pushRow);

  if(pushOn){
    const timeField = document.createElement('div');
    timeField.className='field';
    timeField.style.marginTop = '-4px';

    const label = document.createElement('label');
    label.textContent = 'Giờ nhắc';
    timeField.appendChild(label);

    const timeBtn = document.createElement('button');
    timeBtn.type = 'button';
    timeBtn.className = 'time-value-btn';
    timeBtn.innerHTML = `<span>${pushTimeVal}</span><span class="chev">▾</span>`;
    timeBtn.onclick = ()=>{
      timeModalHour = pushHour;
      timeModalMinute = pushMinute;
      timeModalOpen = true;
      render();
    };
    timeField.appendChild(timeBtn);
    main.appendChild(timeField);
  }

  const versionTag = document.createElement('div');
  versionTag.className='mono';
  versionTag.style.textAlign = 'center';
  versionTag.style.color = 'var(--ink-faint)';
  versionTag.style.fontSize = '11px';
  versionTag.style.margin = '22px 0 6px';
  versionTag.textContent = `Ôn Tập v${APP_VERSION}`;
  main.appendChild(versionTag);

  wrap.appendChild(main);
  return wrap;
}

/* Slide-over drawer that hosts renderSettings() — opened via the gear icon,
   closed via the ✕, the backdrop, or picking a theme/toggling a switch. */
function renderSettingsPanel(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop settings-overlay' + (settingsPanelFresh ? ' animate-in' : '');
  overlay.onclick = (e)=>{ if(e.target===overlay){ settingsPanelOpen=false; render(); } };

  const panel = document.createElement('div');
  panel.className = 'settings-panel' + (settingsPanelFresh ? ' animate-in' : '');
  panel.appendChild(renderSettings());

  overlay.appendChild(panel);
  // Any click inside the panel (a toggle, a theme chip...) triggers a full
  // re-render; without this, the panel would replay its intro animation
  // every single time instead of just staying put.
  settingsPanelFresh = false;
  return overlay;
}

