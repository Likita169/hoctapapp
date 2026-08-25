const COLORS = ['#eba53e','#47b9a5','#ef5b73','#9d8ef2','#5aa3e6','#dd94cf'];
const STORE_KEY = 'srs_data_v1';

// Best-guess the theme synchronously, before IndexedDB has loaded the real
// settings, so the page doesn't flash the wrong colors on startup.
(function preApplyTheme(){
  try{
    const cached = localStorage.getItem('srs_theme') || 'system';
    const effective = (cached === 'system')
      ? ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark')
      : cached;
    if(effective === 'light') document.documentElement.setAttribute('data-theme', 'light');
  }catch(e){ /* ignore */ }
})();

// URL của Cloudflare Worker sau khi deploy (xem mục "Nhắc đúng giờ" trong HUONG-DAN.md)
// — cần thay dòng dưới đây bằng URL thật trước khi tính năng nhắc-đúng-giờ hoạt động
const PUSH_SERVER_URL = 'https://on-tap-push.nguyenngochuy8816.workers.dev';
// URL của Cloudflare Worker phụ trách đăng nhập + đồng bộ dữ liệu qua các máy
// (xem mục "Tài khoản & đồng bộ" trong HUONG-DAN.md) — thay bằng URL thật
// sau khi deploy worker trong thư mục sync-server/
const SYNC_SERVER_URL = 'https://on-tap-sync.nguyenngochuy8816.workers.dev/';
const DEFAULT_SETTINGS = { pushEnabled: false, pushHour: 20, pushMinute: 0, theme: 'system' };
// Streak + XP + huy hiệu — tiến trình học tập lâu dài, tách riêng khỏi từng
// thẻ để không ảnh hưởng thuật toán ôn tập ngắt quãng ở trên.
const DEFAULT_PROGRESS = {
  xp: 0, totalReviews: 0,
  streak: 0, bestStreak: 0, lastStudyDate: null,
  streakFreezes: 1,      // số lượt "đóng băng" chuỗi ngày còn lại (bù 1 ngày lỡ quên ôn)
  badges: []             // id các huy hiệu đã mở khoá, xem BADGE_DEFS
};
let DATA = { cards: [], subjects: [], settings: Object.assign({}, DEFAULT_SETTINGS), progress: Object.assign({}, DEFAULT_PROGRESS), updatedAt: 0 };
let VIEW = 'home';
/* ---- account / cross-device sync state ---- */
let AUTH = { token: null, email: null, role: null, name: null }; // loaded from localStorage in loadAuth()
let authMode = 'login';                       // 'login' | 'register'
let authBusy = false;
let authError = '';
let authModalOpen = false;                    // dedicated login/register screen, opened from Settings
let authModalFresh = false;
let registerRole = 'student';                  // 'student' | 'teacher' — chosen on the register form
let syncStatus = 'idle';                      // 'idle' | 'syncing' | 'synced' | 'error'
let pendingSyncChoice = null;                 // {data, updatedAt} — set when both local & remote have data at login
/* ---- classrooms (teacher creates, student joins with a short code) ---- */
let CLASSROOMS = [];                          // teacher: [{id,code,name,members:[{email,joinedAt}]}]  student: [{id,name,teacherEmail}]
let classroomsLoaded = false;
let classroomsLoading = false;
let classroomBusy = false;
let classroomError = '';
let classroomMembersView = null;               // classroom object being viewed in "Học sinh" modal, or null
let classroomConfirm = null;                   // {type:'delete'|'leave', id, name} — drives the confirm modal
let renameModalOpen = false;                    // "Đổi tên hiển thị" modal
let renameBusy = false;
let renameError = '';

/* ---- tests / quizzes (teacher creates, tied to one classroom) ---- */
let testManagerClassroom = null;               // {id, name} of the classroom whose test list is open, or null
let testManagerFresh = false;
let TESTS = [];                                 // [{id,title,questionCount,createdAt,updatedAt}] for the open classroom
let testsLoading = false;
let testBusy = false;
let testError = '';

let testEditorOpen = null;                      // {id,title,classroomId,questions:[...]} of the test being edited, or null
let testEditorFresh = false;
let testTitleEditing = false;                   // inline-editing the test title

let questionEditorOpen = null;                  // {mode:'add'|'edit', id?, type, prompt, imageData, data} while the editor is open
let questionEditorFresh = false;
let questionBusy = false;
let questionError = '';
let questionImageProcessing = false;            // resizing/compressing the picked image, before it's attached to the question

let testConfirm = null;                         // {type:'delete-test'|'delete-question', id, label} — drives the confirm modal
let bulkImportOpen = null;                      // {text, busy, error} while the "Dán nhanh nhiều câu" modal is open
let testAttachmentBusy = false;                 // uploading/removing the PDF/Word đề bài attached to a test
let testAttachmentError = '';
let filePreviewOpen = null;                     // {name, mime, dataUrl, html, loading, error} while the in-app file viewer is open

/* ---- giao bài & xem điểm (giáo viên) ---- */
let publishBusy = false;
let testSubmissionsOpen = null;                 // {testId, title} whose submissions page is open
let TEST_SUBMISSIONS = [];
let testSubmissionsLoading = false;

/* ---- làm bài kiểm tra (học sinh) ---- */
let studentTestListClassroom = null;            // {id, name} whose test list (student view) is open
let studentTests = [];
let studentTestsLoading = false;
let studentTestError = '';

let studentTestDetailOpen = null;               // {id,title,maxAttempts,questions,mySubmission,resultDetail?} landing page for 1 test
let testReviewOpen = false;                     // true while the dedicated "Xem lại bài làm" page is open

let takeTestOpen = null;                        // {id,title,questions} while actively taking a test
let takeTestAnswers = {};                       // {questionId: answer}
let reviewQueue = [];
let sessionHadMiss = false;          // có thẻ nào bị chấm "Quên" trong phiên hiện tại không (huy hiệu Phiên hoàn hảo)
let sessionXpEarned = 0;             // XP kiếm được trong phiên hiện tại, hiện ở màn hoàn thành
let sessionCompletionHandled = false;// tránh cộng huy hiệu/toast lặp lại khi renderReview() gọi lại nhiều lần
let reviewIdx = 0;
let flipped = false;
let reviewHistory = [];  // stack of {cardId, snapshot, idx} — powers the undo button
let reviewMenuOpen = false;
let addSubjectChoice = null;
let subjectModalOpen = false;
let subjectModalColor = COLORS[0];
let newSubjectParentId = null;   // parent for the subject the modal is about to create
let editSubjectId = null;        // if set, the modal edits (renames/recolors) this subject instead of creating one
let folderPath = [];             // stack of subject ids — current drill-down position on Home
let actionSheetItems = null;     // array of {icon,label,onClick,danger} — drives the bottom action sheet
let manageFilterSubjectId = null; // if set, "Thẻ ghi nhớ" tab only shows cards from this subject's subtree
let deleteSubjectId = null;
let deleteCardId = null;
let manageSearch = '';
let sessionSubjectFilter = null;
let timeModalOpen = false;
let themeModalOpen = false;
let settingsPanelOpen = false;
let settingsPanelFresh = false;
let timeModalHour = 20;
let timeModalMinute = 0;
const TIME_ITEM_H = 44;

const $app = document.getElementById('app');

// Long-pressing cards/buttons shouldn't trigger the OS text-selection
// handles or the "Search Google for..." context menu — only real text
// fields (typing a card's front/back, etc.) should still get that.
document.addEventListener('contextmenu', (e)=>{
  const tag = e.target.tagName;
  if(tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
});

function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function dayMs(n){ return n * 86400000; }
function fmtInterval(days){
  if(days < 1) return Math.round(days*1440)+'p';
  if(days < 30) return Math.round(days)+'n';
  if(days < 365) return Math.round(days/30)+'th';
  return (days/365).toFixed(1)+'nă';
}
function todayLabel(){
  const d = new Date();
  const days=['CN','Th 2','Th 3','Th 4','Th 5','Th 6','Th 7'];
  return days[d.getDay()] + ', ' + d.getDate() + '/' + (d.getMonth()+1);
}

/* ---- IndexedDB storage layer (unlimited local storage, fully offline) ---- */
const DB_NAME = 'srs_app_db';
const DB_STORE = 'kv';
let _dbPromise = null;
function openDB(){
  if(_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(DB_STORE); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return _dbPromise;
}
async function idbGet(key){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(DB_STORE, 'readonly');
    const r = tx.objectStore(DB_STORE).get(key);
    r.onsuccess = ()=> resolve(r.result);
    r.onerror = ()=> reject(r.error);
  });
}
async function idbSet(key, value){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

async function loadData(){
  try{
    const val = await idbGet(STORE_KEY);
    if(val){
      DATA = JSON.parse(val);
      DATA.settings = Object.assign({}, DEFAULT_SETTINGS, DATA.settings || {});
      DATA.updatedAt = DATA.updatedAt || 0;
      normalizeSubjects();
      normalizeProgress();
      return;
    }
  }catch(e){ console.error('load failed', e); }
  // start empty — no seed subjects or cards
  DATA = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    progress: Object.assign({}, DEFAULT_PROGRESS),
    subjects: [],
    cards: [],
    updatedAt: 0
  };
  await saveData();
}

async function saveData(){
  DATA.updatedAt = Date.now();
  try{ await idbSet(STORE_KEY, JSON.stringify(DATA)); }
  catch(e){ console.error('save failed', e); toast('Lỗi lưu dữ liệu'); }
  schedulePush(); // no-op if not logged in / server not set up
}

function subjectById(id){ return DATA.subjects.find(s=>s.id===id); }
function childSubjects(parentId){
  return DATA.subjects.filter(s => (s.parentId||null) === (parentId||null));
}
function subtreeIds(id){
  const ids = [id];
  childSubjects(id).forEach(c => ids.push(...subtreeIds(c.id)));
  return ids;
}
function subtreeCardCount(id){
  const set = new Set(subtreeIds(id));
  return DATA.cards.filter(c=>set.has(c.subjectId)).length;
}
function dueCards(subjectId){
  const now = Date.now();
  if(!subjectId) return DATA.cards.filter(c => c.due <= now);
  const set = new Set(subtreeIds(subjectId));
  return DATA.cards.filter(c => c.due <= now && set.has(c.subjectId));
}
function deleteSubjectCascade(id){
  const set = new Set(subtreeIds(id));
  DATA.subjects = DATA.subjects.filter(s=>!set.has(s.id));
  DATA.cards = DATA.cards.filter(c=>!set.has(c.subjectId));
}
function subjectPath(id){
  const path = [];
  let cur = subjectById(id);
  while(cur){ path.unshift(cur); cur = cur.parentId ? subjectById(cur.parentId) : null; }
  return path;
}
// Make sure every subject has a parentId (null = top level) — handles data
// saved before nested subjects existed, whether loaded locally or synced.
function normalizeSubjects(){
  DATA.subjects.forEach(s=>{ if(s.parentId===undefined) s.parentId = null; });
}
// Same idea for progress — fills in the field with sane defaults for data
// saved before the streak/XP/huy hiệu feature existed.
function normalizeProgress(){
  DATA.progress = Object.assign({}, DEFAULT_PROGRESS, DATA.progress || {});
  if(!Array.isArray(DATA.progress.badges)) DATA.progress.badges = [];
}

function grade(card, quality){
  // quality: 0 again, 1 hard, 2 good, 3 easy
  let {ease, interval, reps} = card;
  if(quality===0){
    reps = 0;
    interval = 10/1440;
    ease = Math.max(1.3, ease-0.2);
  } else {
    if(reps===0){
      interval = quality===3 ? 2 : 1;
    } else if(reps===1){
      interval = quality===1 ? 3 : quality===2 ? 6 : 8;
    } else {
      const factor = quality===1 ? 1.2 : quality===2 ? ease : ease*1.3;
      interval = Math.round(interval*factor*10)/10;
    }
    reps += 1;
    if(quality===1) ease = Math.max(1.3, ease-0.15);
    if(quality===3) ease = ease+0.15;
  }
  card.ease = ease;
  card.interval = interval;
  card.reps = reps;
  card.due = Date.now() + dayMs(interval);
  card.lastReview = Date.now();
}

/* ---------------- STREAK + XP + HUY HIỆU ---------------- */
// XP mỗi thẻ tuỳ theo mức nhớ chọn — "Quên" vẫn được tính (khuyến khích cứ
// ôn đều, không phạt nặng), nhớ càng chắc thì XP càng cao.
const XP_PER_GRADE = [1, 2, 3, 4]; // [Quên, Khó, Nhớ, Dễ]

// Level tăng dần độ khó: mức 1→2 cần 50 XP, mỗi mức sau cần thêm 20 XP so
// với mức trước — vừa đủ chậm lại để cảm giác "lên cấp" luôn có ý nghĩa.
function levelGap(level){ return 50 + (level-1)*20; }
function computeLevel(xp){
  let level = 1, threshold = 0, gap = levelGap(1);
  while(xp >= threshold + gap){
    threshold += gap;
    level += 1;
    gap = levelGap(level);
  }
  return { level, xpIntoLevel: xp - threshold, xpForThisLevel: gap };
}

function pad2(n){ return String(n).padStart(2,'0'); }
function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayKey(){ return dateKey(new Date()); }
// Số ngày lịch chênh lệch giữa 2 khoá "YYYY-MM-DD" (so theo ngày, không theo giờ).
function daysBetweenKeys(a, b){
  const [ay,am,ad] = a.split('-').map(Number);
  const [by,bm,bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay,am-1,ad), tb = Date.UTC(by,bm-1,bd);
  return Math.round((tb-ta) / 86400000);
}

const BADGE_DEFS = {
  first_review:  { icon:'🌱', title:'Buổi ôn đầu tiên', desc:'Ôn tập thẻ đầu tiên của bạn' },
  streak_3:      { icon:'🔥', title:'Chuỗi 3 ngày',      desc:'Ôn tập 3 ngày liên tục' },
  streak_7:      { icon:'🔥', title:'Chuỗi 7 ngày',      desc:'Ôn tập 7 ngày liên tục' },
  streak_30:     { icon:'🏆', title:'Chuỗi 30 ngày',     desc:'Ôn tập 30 ngày liên tục' },
  reviews_100:   { icon:'📚', title:'100 thẻ',           desc:'Ôn tổng cộng 100 lượt thẻ' },
  reviews_500:   { icon:'🎓', title:'500 thẻ',           desc:'Ôn tổng cộng 500 lượt thẻ' },
  reviews_1000:  { icon:'👑', title:'1000 thẻ',          desc:'Ôn tổng cộng 1000 lượt thẻ' },
  level_5:       { icon:'⭐', title:'Cấp độ 5',          desc:'Đạt tới cấp độ 5' },
  level_10:      { icon:'🌟', title:'Cấp độ 10',         desc:'Đạt tới cấp độ 10' },
  perfect_session:{ icon:'✨', title:'Phiên hoàn hảo',   desc:'Ôn hết 1 phiên (≥5 thẻ) không "Quên" câu nào' }
};

function unlockBadge(id){
  if(!DATA.progress.badges.includes(id)){
    DATA.progress.badges.push(id);
    const def = BADGE_DEFS[id];
    if(def) toast(`🏅 Mở khoá huy hiệu: ${def.title}`);
  }
}

function evaluateThresholdBadges(){
  const p = DATA.progress;
  if(p.totalReviews>=1) unlockBadge('first_review');
  if(p.bestStreak>=3) unlockBadge('streak_3');
  if(p.bestStreak>=7) unlockBadge('streak_7');
  if(p.bestStreak>=30) unlockBadge('streak_30');
  if(p.totalReviews>=100) unlockBadge('reviews_100');
  if(p.totalReviews>=500) unlockBadge('reviews_500');
  if(p.totalReviews>=1000) unlockBadge('reviews_1000');
  const lvl = computeLevel(p.xp).level;
  if(lvl>=5) unlockBadge('level_5');
  if(lvl>=10) unlockBadge('level_10');
}

// Cập nhật chuỗi ngày ôn tập — gọi mỗi khi có ít nhất 1 thẻ được chấm điểm.
// An toàn khi gọi nhiều lần trong cùng 1 ngày (không cộng streak trùng).
function recordStudyDay(){
  const p = DATA.progress;
  const today = todayKey();
  if(p.lastStudyDate === today) return; // đã tính hôm nay rồi

  if(!p.lastStudyDate){
    p.streak = 1;
  } else {
    const gap = daysBetweenKeys(p.lastStudyDate, today);
    if(gap === 1){
      p.streak += 1;
    } else if(gap === 2 && p.streakFreezes > 0){
      // Lỡ quên đúng 1 ngày — dùng 1 lượt "đóng băng" để nối chuỗi thay vì mất trắng.
      p.streakFreezes -= 1;
      p.streak += 1;
      toast('❄️ Đã dùng 1 lượt đóng băng để giữ chuỗi ngày!');
    } else {
      p.streak = 1;
    }
  }
  p.lastStudyDate = today;
  p.bestStreak = Math.max(p.bestStreak, p.streak);
  // Thưởng thêm 1 lượt đóng băng mỗi mốc 7 ngày liên tục, tối đa giữ 3 lượt.
  if(p.streak > 0 && p.streak % 7 === 0 && p.streakFreezes < 3){
    p.streakFreezes += 1;
    toast('❄️ Nhận thêm 1 lượt đóng băng chuỗi ngày!');
  }
}

// Gọi ngay sau grade(card, quality) mỗi lần học sinh chấm 1 thẻ.
function recordXpAndStreak(quality){
  normalizeProgress();
  const p = DATA.progress;
  const beforeLevel = computeLevel(p.xp).level;
  p.xp += XP_PER_GRADE[quality] || 0;
  p.totalReviews += 1;
  if(quality === 0) sessionHadMiss = true;
  sessionXpEarned += XP_PER_GRADE[quality] || 0;
  recordStudyDay();
  evaluateThresholdBadges();
  const afterLevel = computeLevel(p.xp).level;
  if(afterLevel > beforeLevel) toast(`🎉 Lên cấp ${afterLevel}!`);
}

function toast(msg){
  const t = document.createElement('div');
  t.className='toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, 1600);
}

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
    { icon:'✏️', label:'Đổi tên bộ thẻ', onClick: ()=>{
        editSubjectId = s.id; newSubjectParentId = s.parentId||null; subjectModalColor = s.color;
        subjectModalOpen = true; render();
      } },
    { icon:'📁', label:'Tạo bộ thẻ phụ', onClick: ()=>{
        editSubjectId = null; newSubjectParentId = s.id; subjectModalColor = COLORS[DATA.subjects.length % COLORS.length];
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
    folderPath.length, folderPath[folderPath.length-1], manageFilterSubjectId
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
  if(renameModalOpen) $app.appendChild(renderRenameModal());
  if(testConfirm) $app.appendChild(renderTestConfirmModal());
  if(bulkImportOpen) $app.appendChild(renderBulkImportModal());
  if(filePreviewOpen) $app.appendChild(renderFilePreviewModal());
  if(classroomConfirm) $app.appendChild(renderClassroomConfirmModal());
  if(classroomMembersView) $app.appendChild(renderClassroomMembersModal());
  if(actionSheetItems) $app.appendChild(renderActionSheet());

  if(VIEW!=='review' && !takeTestOpen){
    $app.appendChild(renderTabbar());
    if(VIEW==='home' || VIEW==='manage'){
      const fab = document.createElement('button');
      fab.className='fab'; fab.textContent='+';
      fab.onclick = ()=>{
        const parentId = folderPath.length ? folderPath[folderPath.length-1] : null;
        actionSheetItems = [
          { icon:'📚', label: parentId ? 'Tạo bộ thẻ phụ' : 'Tạo bộ thẻ', onClick: ()=>{
              editSubjectId = null; newSubjectParentId = parentId;
              subjectModalColor = COLORS[DATA.subjects.length % COLORS.length];
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
      <button class="gear-btn" aria-label="Cài đặt" title="Cài đặt">⚙</button>
    </div>
  `;
  header.querySelector('.gear-btn').onclick = ()=>{ settingsPanelOpen = true; settingsPanelFresh = true; render(); };
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

  const currentId = folderPath.length ? folderPath[folderPath.length-1] : null;
  const current = currentId ? subjectById(currentId) : null;

  // If we drilled into a subject that no longer exists (e.g. it was just
  // deleted), fall back to the nearest still-existing ancestor.
  if(currentId && !current){
    while(folderPath.length && !subjectById(folderPath[folderPath.length-1])) folderPath.pop();
    render();
    return wrap;
  }

  if(current){
    const backLink = document.createElement('button');
    backLink.className = 'back-link';
    backLink.style.margin = '18px 0 0';
    backLink.textContent = '← ' + (folderPath.length>1 ? subjectById(folderPath[folderPath.length-2]).name : 'Trang chủ');
    backLink.onclick = ()=>{ folderPath.pop(); render(); };
    main.appendChild(backLink);
  }

  const label = document.createElement('div');
  label.className='section-label';
  label.textContent = current ? current.name : 'Bộ thẻ';
  main.appendChild(label);

  if(current){
    const hereDue = dueCards(current.id).length;
    const actionRow = document.createElement('div');
    actionRow.style.display='flex'; actionRow.style.gap='8px'; actionRow.style.flexWrap='wrap'; actionRow.style.margin='0 0 16px';
    const mkBtn = (text, onClick, danger)=>{
      const b = document.createElement('button');
      b.textContent = text;
      b.style.flex = '1 1 auto'; b.style.padding='10px 12px'; b.style.borderRadius='10px';
      b.style.fontSize='13px'; b.style.fontWeight='600'; b.style.cursor='pointer';
      b.style.border = '1px solid var(--line)';
      b.style.background = danger ? 'transparent' : 'var(--bg-elev)';
      b.style.color = danger ? 'var(--coral)' : 'var(--white)';
      b.onclick = onClick;
      return b;
    };
    if(hereDue>0){
      const reviewBtn = mkBtn(`Ôn ${hereDue} thẻ tại đây`, ()=>{ sessionSubjectFilter = current.id; startReview(); });
      reviewBtn.style.background = 'var(--teal)'; reviewBtn.style.color = '#0a2622'; reviewBtn.style.border='none';
      reviewBtn.style.flexBasis='100%';
      actionRow.appendChild(reviewBtn);
    }
    actionRow.appendChild(mkBtn('+ Bộ thẻ phụ', ()=>{
      editSubjectId = null;
      newSubjectParentId = current.id;
      subjectModalColor = COLORS[DATA.subjects.length % COLORS.length];
      subjectModalOpen = true;
      render();
    }));
    actionRow.appendChild(mkBtn('+ Thẻ', ()=>{ addSubjectChoice = current.id; setView('add'); }));
    actionRow.appendChild(mkBtn('✏️ Đổi tên', ()=>{
      editSubjectId = current.id; newSubjectParentId = current.parentId||null; subjectModalColor = current.color;
      subjectModalOpen = true; render();
    }));
    actionRow.appendChild(mkBtn('🗑 Xoá bộ thẻ này', ()=>{ deleteSubjectId = current.id; render(); }, true));
    main.appendChild(actionRow);
  }

  const children = childSubjects(currentId);

  if(children.length===0 && !current){
    main.appendChild(emptyState('📚','Chưa có bộ thẻ nào. Nhấn nút + để tạo bộ thẻ đầu tiên.'));
  } else if(children.length===0){
    main.appendChild(emptyState('📂','Mục này chưa có bộ thẻ phụ nào. Dùng nút "+ Thẻ" ở trên để thêm thẻ trực tiếp vào đây.'));
  } else {
    children.forEach(s=>{
      const count = subtreeCardCount(s.id);
      const kids = childSubjects(s.id).length;
      const due = dueCards(s.id).length;
      const row = document.createElement('div');
      row.className='subject-row';
      row.innerHTML = `
        <span class="subject-dot" style="background:${s.color}"></span>
        <div class="subject-info">
          <div class="subject-name">${escapeHtml(s.name)}</div>
          <div class="subject-meta">${count} thẻ${kids>0 ? ' · '+kids+' bộ thẻ phụ' : ''}</div>
        </div>
        <button class="subject-due ${due===0?'zero':''}" type="button">${due>0 ? due+' đến hạn' : '✓'}</button>
      `;
      const wasLongPress = attachDeckLongPress(row, s);
      row.onclick = ()=>{
        if(wasLongPress()) return;
        folderPath.push(s.id); render();
      };
      row.querySelector('.subject-due').onclick = (e)=>{
        e.stopPropagation();
        if(due===0) return;
        sessionSubjectFilter = s.id;
        startReview();
      };
      main.appendChild(row);
    });
  }

  wrap.appendChild(main);
  return wrap;
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

// Always prefer a real display name over an email address anywhere a person
// is shown (teacher on a class card, student in a roster/score list...).
// Falls back to email only if the server hasn't sent a name for that person yet.
function personLabel(p){
  if(!p) return '';
  if(p.name) return p.name;
  return p.email || '';
}
// Short initials for a small round avatar chip, from a name or an email.
function initialsOf(p){
  const label = personLabel(p);
  if(!label) return '?';
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if(parts.length>1) return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
  return label.slice(0,2).toUpperCase();
}
// epoch-ms <-> the string format <input type="datetime-local"> needs/gives,
// both always in the browser's local time zone (no explicit TZ in either).
function toDatetimeLocalValue(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDeadline(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
}

/* ---------------- ADD ---------------- */
function renderAdd(){
  const wrap = document.createElement('div');
  wrap.style.display='contents';

  const header = document.createElement('header');
  header.className='topbar';
  header.innerHTML = `<h1 class="display">Thẻ mới</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');

  const back = document.createElement('button');
  back.className='back-link'; back.textContent='← Quay lại';
  back.onclick = ()=> setView('home');
  main.appendChild(back);

  // subject field
  const fSub = document.createElement('div');
  fSub.className='field';
  fSub.innerHTML = `<label>Bộ thẻ</label>`;
  const picker = document.createElement('div');
  picker.className='subject-picker';
  DATA.subjects.forEach(s=>{
    const chip = document.createElement('div');
    chip.className='chip' + (addSubjectChoice===s.id ? ' active':'');
    chip.style.background = addSubjectChoice===s.id ? s.color : 'var(--bg-elev)';
    chip.style.borderColor = s.color;
    chip.textContent = subjectPath(s.id).map(x=>x.name).join(' › ');
    chip.onclick = ()=>{ addSubjectChoice = s.id; render(); };
    picker.appendChild(chip);
  });
  const newChip = document.createElement('div');
  newChip.className='chip chip-new';
  newChip.textContent = '+ Bộ thẻ mới';
  newChip.onclick = ()=>{
    newSubjectParentId = null;
    subjectModalColor = COLORS[DATA.subjects.length % COLORS.length];
    subjectModalOpen = true;
    render();
  };
  picker.appendChild(newChip);
  fSub.appendChild(picker);
  main.appendChild(fSub);

  // front field
  const fFront = document.createElement('div');
  fFront.className='field';
  fFront.innerHTML = `<label>Mặt trước — Câu hỏi / công thức</label>
    <textarea id="frontInput" placeholder="Ví dụ: Định luật II Newton là gì?"></textarea>`;
  main.appendChild(fFront);

  const fBack = document.createElement('div');
  fBack.className='field';
  fBack.innerHTML = `<label>Mặt sau — Đáp án / giải thích</label>
    <textarea id="backInput" placeholder="Ví dụ: F = m.a  (Lực = khối lượng × gia tốc)"></textarea>`;
  main.appendChild(fBack);

  const saveBtn = document.createElement('button');
  saveBtn.className='save-btn';
  saveBtn.textContent = 'Lưu thẻ';
  saveBtn.onclick = async ()=>{
    const front = document.getElementById('frontInput').value.trim();
    const back = document.getElementById('backInput').value.trim();
    if(!addSubjectChoice){ toast('Hãy chọn hoặc tạo một bộ thẻ'); return; }
    if(!front || !back){ toast('Hãy điền cả hai mặt của thẻ'); return; }
    DATA.cards.push({id:uid(), subjectId:addSubjectChoice, front, back, ease:2.5, interval:0, reps:0, due:Date.now()});
    await saveData();
    toast('Đã lưu thẻ ✓');
    document.getElementById('frontInput').value='';
    document.getElementById('backInput').value='';
    render();
  };
  main.appendChild(saveBtn);

  wrap.appendChild(main);
  return wrap;
}

/* ---------------- NEW SUBJECT MODAL ---------------- */
function renderSubjectModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ subjectModalOpen=false; editSubjectId=null; render(); } };

  const editing = !!editSubjectId;
  const editingSubject = editing ? subjectById(editSubjectId) : null;
  const title = editing ? 'Đổi tên bộ thẻ' : (newSubjectParentId ? 'Bộ thẻ phụ mới' : 'Bộ thẻ mới');
  const parentHint = (!editing && newSubjectParentId) ? subjectById(newSubjectParentId) : null;

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div class="modal-title display">${title}</div>
    ${parentHint ? `<p style="color:var(--ink-faint); font-size:12px; margin:-14px 0 16px;">Trong "${escapeHtml(parentHint.name)}"</p>` : ''}
    <div class="field" style="margin-bottom:20px;">
      <label>Tên bộ thẻ</label>
      <input type="text" id="newSubjectInput" placeholder="Ví dụ: Hoá học" value="${editingSubject ? escapeHtml(editingSubject.name) : ''}">
    </div>
    <div class="field" style="margin-bottom:4px;">
      <label>Màu sắc</label>
      <div class="color-picker" id="colorPicker"></div>
    </div>
  `;

  const colorPicker = card.querySelector('#colorPicker');
  COLORS.forEach(c=>{
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'color-dot' + (c===subjectModalColor ? ' active' : '');
    dot.style.background = c;
    dot.onclick = ()=>{
      subjectModalColor = c;
      colorPicker.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('active'));
      dot.classList.add('active');
    };
    colorPicker.appendChild(dot);
  });

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
  cancelBtn.onclick = ()=>{ subjectModalOpen=false; editSubjectId=null; render(); };

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.style.background = 'var(--teal)';
  saveBtn.textContent = editing ? 'Lưu' : (newSubjectParentId ? 'Tạo bộ thẻ phụ' : 'Tạo bộ thẻ');
  saveBtn.onclick = async ()=>{
    const name = card.querySelector('#newSubjectInput').value.trim();
    if(!name){ toast('Hãy nhập tên bộ thẻ'); return; }
    if(editing){
      const s = subjectById(editSubjectId);
      if(s){ s.name = name; s.color = subjectModalColor; }
      editSubjectId = null;
    } else {
      const s = {id:uid(), name, color: subjectModalColor, parentId: newSubjectParentId||null};
      DATA.subjects.push(s);
      addSubjectChoice = s.id;
    }
    subjectModalOpen = false;
    await saveData();
    toast(editing ? 'Đã lưu ✓' : 'Đã tạo bộ thẻ ✓');
    render();
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);

  requestAnimationFrame(()=>{
    const input = card.querySelector('#newSubjectInput');
    if(input) input.focus();
    input.onkeydown = (e)=>{ if(e.key==='Enter') saveBtn.click(); };
  });

  return overlay;
}

/* ---------------- DELETE SUBJECT MODAL ---------------- */
function renderDeleteSubjectModal(){
  const subject = subjectById(deleteSubjectId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ deleteSubjectId=null; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';

  if(!subject){
    deleteSubjectId = null;
    return overlay;
  }

  const cardCount = subtreeCardCount(subject.id);
  const kidsCount = childSubjects(subject.id).length;

  card.innerHTML = `
    <div class="modal-title display">Xoá "${escapeHtml(subject.name)}"?</div>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin:0 0 4px;">
      ${cardCount > 0 || kidsCount > 0
        ? `Mục này có <strong>${cardCount} thẻ</strong>${kidsCount>0 ? ` và <strong>${kidsCount} mục con</strong>` : ''}. Xoá sẽ xoá luôn toàn bộ bên trong (kể cả các mục con lồng bên trong nó). Hành động này không thể hoàn tác.`
        : `Mục này chưa có thẻ hay mục con nào. Hành động này không thể hoàn tác.`}
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
  cancelBtn.onclick = ()=>{ deleteSubjectId=null; render(); };

  const delBtn = document.createElement('button');
  delBtn.className = 'save-btn';
  delBtn.style.background = 'var(--coral)';
  delBtn.style.color = '#3a0d13';
  delBtn.textContent = 'Xoá bộ thẻ';
  delBtn.onclick = async ()=>{
    const id = deleteSubjectId;
    deleteSubjectCascade(id);
    if(addSubjectChoice===id) addSubjectChoice = null;
    if(sessionSubjectFilter===id) sessionSubjectFilter = null;
    const idx = folderPath.indexOf(id);
    if(idx !== -1) folderPath = folderPath.slice(0, idx);
    deleteSubjectId = null;
    await saveData();
    toast('Đã xoá ✓');
    render();
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(delBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  return overlay;
}

/* ---------------- DELETE CARD MODAL ---------------- */
function renderDeleteCardModal(){
  const c = DATA.cards.find(x=>x.id===deleteCardId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ deleteCardId=null; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';

  if(!c){
    deleteCardId = null;
    return overlay;
  }

  card.innerHTML = `
    <div class="modal-title display">Xoá thẻ này?</div>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin:0 0 4px;">
      Hành động này không thể hoàn tác.
    </p>
    <div style="background:var(--bg-elev); border:1px solid var(--line); border-radius:12px; padding:14px; margin-top:14px;">
      <div style="font-size:14px; font-weight:600; line-height:1.4;">${escapeHtml(c.front)}</div>
      <div style="font-size:13px; color:var(--ink-faint); margin-top:6px; line-height:1.4;">${escapeHtml(c.back)}</div>
    </div>
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
  cancelBtn.onclick = ()=>{ deleteCardId=null; render(); };

  const delBtn = document.createElement('button');
  delBtn.className = 'save-btn';
  delBtn.style.background = 'var(--coral)';
  delBtn.style.color = '#3a0d13';
  delBtn.textContent = 'Xoá thẻ';
  delBtn.onclick = async ()=>{
    const id = deleteCardId;
    DATA.cards = DATA.cards.filter(x=>x.id!==id);
    deleteCardId = null;
    await saveData();
    toast('Đã xoá thẻ ✓');
    render();
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(delBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  return overlay;
}

/* ---------------- TIME PICKER MODAL (custom wheel, no native input[type=time]) ---------------- */
function renderTimeModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ timeModalOpen=false; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<div class="modal-title display">Chọn giờ nhắc</div>`;

  const row = document.createElement('div');
  row.className = 'time-picker-row';

  function buildWheel(count){
    const wheel = document.createElement('div');
    wheel.className = 'time-wheel';
    let html = `<div class="time-wheel-pad"></div>`;
    for(let i=0;i<count;i++) html += `<div class="time-wheel-item" data-v="${i}">${String(i).padStart(2,'0')}</div>`;
    html += `<div class="time-wheel-pad"></div>`;
    wheel.innerHTML = html;
    return wheel;
  }

  const hourWheel = buildWheel(24);
  const minuteWheel = buildWheel(60);
  const sep = document.createElement('div');
  sep.className = 'time-wheel-sep';
  sep.textContent = ':';
  const highlight = document.createElement('div');
  highlight.className = 'time-wheel-highlight';

  row.appendChild(hourWheel);
  row.appendChild(sep);
  row.appendChild(minuteWheel);
  row.appendChild(highlight);
  card.appendChild(row);

  let selHour = timeModalHour;
  let selMinute = timeModalMinute;

  function markSelected(wheel, val){
    wheel.querySelectorAll('.time-wheel-item').forEach(el=>{
      el.classList.toggle('selected', Number(el.dataset.v)===val);
    });
  }

  function setupWheel(wheel, initialVal, onChange){
    const maxIdx = wheel.children.length - 3; // exclude the two padding divs
    let settleTimer = null;
    wheel.addEventListener('scroll', ()=>{
      clearTimeout(settleTimer);
      settleTimer = setTimeout(()=>{
        const idx = Math.max(0, Math.min(maxIdx, Math.round(wheel.scrollTop / TIME_ITEM_H)));
        wheel.scrollTo({ top: idx*TIME_ITEM_H, behavior:'smooth' });
        const val = Number(wheel.children[idx+1].dataset.v);
        markSelected(wheel, val);
        onChange(val);
      }, 120);
    });
    requestAnimationFrame(()=>{
      wheel.scrollTop = initialVal * TIME_ITEM_H;
      markSelected(wheel, initialVal);
    });
  }

  setupWheel(hourWheel, selHour, (v)=>{ selHour = v; });
  setupWheel(minuteWheel, selMinute, (v)=>{ selMinute = v; });

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
  cancelBtn.onclick = ()=>{ timeModalOpen=false; render(); };

  const okBtn = document.createElement('button');
  okBtn.className = 'save-btn';
  okBtn.style.background = 'var(--teal)';
  okBtn.textContent = 'Xong';
  okBtn.onclick = async ()=>{
    timeModalHour = selHour;
    timeModalMinute = selMinute;
    timeModalOpen = false;
    render();
    await updatePushTime(selHour, selMinute);
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(okBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);

  return overlay;
}

/* ---------------- REVIEW ---------------- */
function startReview(){
  reviewQueue = dueCards(sessionSubjectFilter).sort((a,b)=>a.due-b.due);
  reviewIdx = 0;
  flipped = false;
  reviewHistory = [];
  reviewMenuOpen = false;
  sessionHadMiss = false;
  sessionXpEarned = 0;
  sessionCompletionHandled = false;
  setView('review');
}

function undoReview(){
  if(reviewHistory.length===0) return;
  const entry = reviewHistory.pop();
  const c = DATA.cards.find(x=>x.id===entry.cardId);
  if(c) Object.assign(c, entry.snapshot);
  // Hoàn lại XP/lượt ôn vừa cộng — tránh việc chấm rồi hoàn tác lặp lại để "cày" XP khống.
  if(typeof entry.xpBefore === 'number'){
    const xpAwarded = DATA.progress.xp - entry.xpBefore;
    sessionXpEarned = Math.max(0, sessionXpEarned - xpAwarded);
    DATA.progress.xp = entry.xpBefore;
    DATA.progress.totalReviews = entry.reviewsBefore;
  }
  reviewIdx = entry.idx;
  flipped = false;
  saveData();
  render();
}

function renderReview(){
  const wrap = document.createElement('div');
  wrap.className='review-wrap';

  if(reviewQueue.length===0 || reviewIdx >= reviewQueue.length){
    if(reviewQueue.length>0 && !sessionCompletionHandled){
      sessionCompletionHandled = true;
      if(!sessionHadMiss && reviewQueue.length>=5) unlockBadge('perfect_session');
      saveData();
    }
    const p = DATA.progress;
    const lvl = computeLevel(p.xp);
    wrap.innerHTML = `<div class="review-done">
      <div class="glyph">🎉</div>
      <h2 class="display">Xong hết rồi!</h2>
      <p>Bạn đã ôn hết các thẻ đến hạn. Quay lại vào ngày mai nhé.</p>
      ${reviewQueue.length>0 ? `
      <div class="session-recap">
        <div class="session-recap-item"><span class="srv">+${sessionXpEarned}</span><span class="srl">XP</span></div>
        <div class="session-recap-item"><span class="srv">🔥 ${p.streak}</span><span class="srl">ngày liên tục</span></div>
        <div class="session-recap-item"><span class="srv">Lv.${lvl.level}</span><span class="srl">${lvl.xpIntoLevel}/${lvl.xpForThisLevel} XP</span></div>
      </div>` : ''}
    </div>`;
    const btn = document.createElement('button');
    btn.className='hero-btn'; btn.style.maxWidth='260px'; btn.textContent='Về trang chủ';
    btn.onclick = ()=> setView('home');
    wrap.querySelector('.review-done').appendChild(btn);
    return wrap;
  }

  const card = reviewQueue[reviewIdx];

  // Counters over the cards still left in this session (from this card on).
  const remaining = reviewQueue.slice(reviewIdx);
  const newCount = remaining.filter(c=>c.reps===0).length;
  const learningCount = remaining.filter(c=>c.reps>0 && c.interval<21).length;
  const masteredCount = remaining.filter(c=>c.interval>=21).length;
  const bucket = card.reps===0 ? 'new' : (card.interval>=21 ? 'mastered' : 'learning');

  const topbar = document.createElement('div');
  topbar.className = 'review-topbar';
  topbar.innerHTML = `
    <button class="review-icon-btn review-back" aria-label="Đóng">←</button>
    <div class="review-counters">
      <span class="rc rc-blue ${bucket==='new'?'active':''}">${newCount}</span>
      <span class="rc rc-red ${bucket==='learning'?'active':''}">${learningCount}</span>
      <span class="rc rc-green ${bucket==='mastered'?'active':''}">${masteredCount}</span>
    </div>
    <div style="display:flex;">
      <button class="review-icon-btn review-undo" aria-label="Hoàn tác" ${reviewHistory.length===0?'disabled':''}>↶</button>
      <button class="review-icon-btn review-menu-btn" aria-label="Thêm">⋮</button>
    </div>
  `;
  topbar.querySelector('.review-back').onclick = ()=> setView('home');
  topbar.querySelector('.review-undo').onclick = ()=> undoReview();
  topbar.querySelector('.review-menu-btn').onclick = (e)=>{ e.stopPropagation(); reviewMenuOpen = !reviewMenuOpen; render(); };
  wrap.appendChild(topbar);

  if(reviewMenuOpen){
    const menu = document.createElement('div');
    menu.className = 'review-menu';
    menu.innerHTML = `
      <button class="review-menu-item" id="shuffleReviewBtn">🔀 Xáo trộn thẻ còn lại</button>
      <button class="review-menu-item" id="endReviewBtn">✕ Kết thúc phiên</button>
    `;
    menu.querySelector('#shuffleReviewBtn').onclick = ()=>{
      const head = reviewQueue.slice(0, reviewIdx);
      const tail = reviewQueue.slice(reviewIdx);
      for(let i=tail.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tail[i],tail[j]]=[tail[j],tail[i]]; }
      reviewQueue = head.concat(tail);
      reviewMenuOpen = false;
      render();
    };
    menu.querySelector('#endReviewBtn').onclick = ()=>{ reviewMenuOpen=false; setView('home'); };
    wrap.appendChild(menu);
    // Tapping anywhere outside the menu closes it.
    setTimeout(()=>{
      document.addEventListener('click', function closeOnce(e){
        if(!menu.contains(e.target)){ reviewMenuOpen=false; render(); }
        document.removeEventListener('click', closeOnce);
      }, {once:true});
    }, 0);
  }

  const stage = document.createElement('div');
  stage.className='card-stage';
  const fc = document.createElement('div');
  fc.className='flashcard flashcard-plain';
  fc.innerHTML = `
    <div class="content">${escapeHtml(card.front)}</div>
    ${flipped ? `<hr class="answer-divider"><div class="answer">${escapeHtml(card.back)}</div>` : ''}
  `;
  stage.appendChild(fc);
  wrap.appendChild(stage);

  if(!flipped){
    const revealBtn = document.createElement('button');
    revealBtn.className = 'reveal-btn';
    revealBtn.textContent = 'Hiện đáp án';
    revealBtn.onclick = ()=>{ flipped = true; render(); };
    wrap.appendChild(revealBtn);
  } else {
    const preview = {
      again: (()=>{ const c={...card}; grade(c,0); return c.interval; })(),
      hard: (()=>{ const c={...card}; grade(c,1); return c.interval; })(),
      good: (()=>{ const c={...card}; grade(c,2); return c.interval; })(),
      easy: (()=>{ const c={...card}; grade(c,3); return c.interval; })(),
    };
    const row = document.createElement('div');
    row.className='grade-row';
    row.innerHTML = `
      <button class="grade-btn grade-again"><span class="label">Quên</span><span class="interval">${fmtInterval(preview.again)}</span></button>
      <button class="grade-btn grade-hard"><span class="label">Khó</span><span class="interval">${fmtInterval(preview.hard)}</span></button>
      <button class="grade-btn grade-good"><span class="label">Nhớ</span><span class="interval">${fmtInterval(preview.good)}</span></button>
      <button class="grade-btn grade-easy"><span class="label">Dễ</span><span class="interval">${fmtInterval(preview.easy)}</span></button>
    `;
    const qualities = [0,1,2,3];
    row.querySelectorAll('.grade-btn').forEach((btn,i)=>{
      btn.onclick = async ()=>{
        const xpBefore = DATA.progress.xp, reviewsBefore = DATA.progress.totalReviews;
        reviewHistory.push({cardId: card.id, snapshot: {...card}, idx: reviewIdx, xpBefore, reviewsBefore});
        grade(card, qualities[i]);
        recordXpAndStreak(qualities[i]);
        await saveData();
        reviewIdx += 1;
        flipped = false;
        render();
      };
    });
    wrap.appendChild(row);
  }

  return wrap;
}

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
  header.innerHTML = `
    <h1 class="display">Thống kê</h1>
    <button class="gear-btn" aria-label="Cài đặt" title="Cài đặt">⚙</button>
  `;
  header.querySelector('.gear-btn').onclick = ()=>{ settingsPanelOpen = true; settingsPanelFresh = true; render(); };
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

/* ---- reminder notifications permission (used by "Nhắc đúng giờ mỗi ngày") ---- */
async function requestReminderPermission(){
  if(!('Notification' in window)) { toast('Trình duyệt này không hỗ trợ thông báo'); return false; }
  let perm = Notification.permission;
  if(perm === 'default') perm = await Notification.requestPermission();
  return perm === 'granted';
}

/* ---- account & cross-device sync (email + password, via Cloudflare Worker + D1) ---- */
function syncServerReady(){ return !SYNC_SERVER_URL.includes('YOUR-SUBDOMAIN'); }
// Joins the base URL with a path safely, even if SYNC_SERVER_URL has a
// trailing slash (avoids accidentally requesting ".../workers.dev//login").
function apiUrl(path){ return SYNC_SERVER_URL.replace(/\/+$/, '') + path; }

function loadAuth(){
  try{
    const raw = localStorage.getItem('srs_auth');
    if(raw) AUTH = JSON.parse(raw);
  }catch(e){ /* ignore */ }
}
function saveAuth(){
  try{ localStorage.setItem('srs_auth', JSON.stringify(AUTH)); }catch(e){ /* ignore */ }
}

async function authRequest(path, body){
  const res = await fetch(apiUrl(path), {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || ('HTTP '+res.status));
  return data;
}

async function doRegister(email, password, name, role){
  if(!syncServerReady()){ authError = 'Chưa thiết lập máy chủ đồng bộ — xem HUONG-DAN.md'; render(); return; }
  if(!email || !password){ authError = 'Nhập đủ email và mật khẩu'; render(); return; }
  if(!name){ authError = 'Nhập tên hiển thị'; render(); return; }
  authBusy = true; authError = ''; render();
  try{
    const res = await authRequest('/register', {email, password, name, role});
    AUTH = {token: res.token, email: res.email, role: res.role, name: res.name};
    saveAuth();
    authModalOpen = false;
    const roleLabel = res.role === 'teacher' ? 'Giáo viên' : 'Học sinh';
    await afterLogin(' — Tài khoản: ' + roleLabel);
  }catch(e){
    authError = e.message || 'Đăng ký thất bại';
  }
  authBusy = false; render();
}

async function doLogin(email, password){
  if(!syncServerReady()){ authError = 'Chưa thiết lập máy chủ đồng bộ — xem HUONG-DAN.md'; render(); return; }
  if(!email || !password){ authError = 'Nhập đủ email và mật khẩu'; render(); return; }
  authBusy = true; authError = ''; render();
  try{
    const res = await authRequest('/login', {email, password});
    AUTH = {token: res.token, email: res.email, role: res.role, name: res.name};
    saveAuth();
    authModalOpen = false;
    await afterLogin();
  }catch(e){
    authError = e.message || 'Đăng nhập thất bại';
  }
  authBusy = false; render();
}

// Right after logging in / registering: figure out which copy of the data
// (this device's, or the one already on the server) should win.
async function afterLogin(suffix){
  suffix = suffix || '';
  try{
    const remote = await fetchSync();
    const localHasContent = DATA.cards.length>0 || DATA.subjects.length>0;
    const remoteHasContent = !!(remote && remote.data);
    if(remoteHasContent && localHasContent){
      // Data exists on both sides — don't silently pick one, ask the person.
      pendingSyncChoice = remote;
    } else if(remoteHasContent){
      applyRemoteData(remote);
      toast('Đăng nhập ✓ — đã tải dữ liệu từ máy chủ' + suffix);
    } else {
      await pushSync(true);
      toast('Đăng nhập ✓ — đã đẩy dữ liệu lên máy chủ' + suffix);
    }
  }catch(e){
    toast('Đăng nhập ✓ nhưng đồng bộ lỗi: ' + (e.message||'') + suffix);
  }
}

async function fetchSync(){
  if(!AUTH.token) return null;
  const res = await fetch(apiUrl('/sync'), { headers:{'Authorization':'Bearer '+AUTH.token} });
  if(res.status===401){ await logout(true); throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'); }
  if(!res.ok) throw new Error('Lỗi tải dữ liệu (HTTP '+res.status+')');
  return await res.json(); // {data, updatedAt}
}

function applyRemoteData(remote){
  try{
    const parsed = JSON.parse(remote.data);
    parsed.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
    parsed.updatedAt = remote.updatedAt || Date.now();
    DATA = parsed;
    normalizeSubjects();
    normalizeProgress();
    idbSet(STORE_KEY, JSON.stringify(DATA)); // write straight to disk, skip re-triggering a push
  }catch(e){ toast('Lỗi khi đọc dữ liệu từ máy chủ'); }
}

let _pushDebounce = null;
function schedulePush(){
  if(!AUTH.token || !syncServerReady()) return;
  clearTimeout(_pushDebounce);
  _pushDebounce = setTimeout(()=> pushSync(false), 1500);
}

async function pushSync(force){
  if(!AUTH.token || !syncServerReady()) return;
  syncStatus = 'syncing';
  try{
    const res = await fetch(apiUrl('/sync'), {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH.token},
      body: JSON.stringify({ data: JSON.stringify(DATA), updatedAt: DATA.updatedAt || Date.now(), force: !!force })
    });
    if(res.status===401){ syncStatus='error'; await logout(true); return; }
    const body = await res.json().catch(()=>({}));
    if(body.conflict){
      // Server has a newer copy than we started from — pull it instead of
      // clobbering someone else's edits from another device.
      const remote = await fetchSync();
      applyRemoteData(remote);
      syncStatus = 'synced';
      render();
    } else if(body.ok){
      syncStatus = 'synced';
    } else {
      syncStatus = 'error';
    }
  }catch(e){ syncStatus = 'error'; }
}

async function manualSync(){
  if(!AUTH.token) return;
  if(!syncServerReady()){ toast('Chưa thiết lập máy chủ đồng bộ — xem HUONG-DAN.md'); return; }
  syncStatus = 'syncing'; render();
  try{
    const remote = await fetchSync();
    if(remote && remote.data && remote.updatedAt > (DATA.updatedAt||0)){
      applyRemoteData(remote);
      toast('Đã tải dữ liệu mới nhất ✓');
    } else {
      await pushSync(true);
      toast('Đã đồng bộ ✓');
    }
  }catch(e){
    toast('Lỗi đồng bộ: ' + (e.message||''));
  }
  render();
}

// Runs once on startup if already logged in — pulls silently if the server
// has something newer, otherwise pushes whatever changed while offline.
async function silentInitialSync(){
  if(!AUTH.token || !syncServerReady()) return;
  try{
    const remote = await fetchSync();
    if(remote && remote.data && remote.updatedAt > (DATA.updatedAt||0)){
      applyRemoteData(remote);
      syncStatus = 'synced';
      render();
    } else {
      schedulePush();
    }
  }catch(e){ /* offline or server down — just skip, next save will retry */ }
}

async function logout(silent){
  AUTH = {token:null, email:null, role:null, name:null};
  saveAuth();
  syncStatus = 'idle';
  clearTimeout(_pushDebounce);
  CLASSROOMS = [];
  classroomsLoaded = false;
  classroomError = '';
  expandedClassroomId = null;
  classroomMembersView = null;
  classroomConfirm = null;
  testManagerClassroom = null;
  TESTS = [];
  testEditorOpen = null;
  questionEditorOpen = null;
  testConfirm = null;
  testSubmissionsOpen = null;
  TEST_SUBMISSIONS = [];
  studentTestListClassroom = null;
  studentTests = [];
  studentTestDetailOpen = null;
  testReviewOpen = false;
  takeTestOpen = null;
  takeTestAnswers = {};
  const staleConfirm = document.getElementById('submitConfirmOverlay');
  if(staleConfirm) staleConfirm.remove();
  if(!silent){ toast('Đã đăng xuất'); render(); }
}

/* ---- classrooms (teacher creates a class, students join with a short code) ---- */
function ensureClassroomsLoaded(){
  if(!AUTH.token || classroomsLoaded || classroomsLoading) return;
  classroomsLoading = true;
  fetchClassrooms()
    .then(list=>{ CLASSROOMS = list; })
    .catch(e=>{ classroomError = e.message || 'Lỗi tải danh sách lớp'; })
    .finally(()=>{ classroomsLoading = false; classroomsLoaded = true; render(); });
}

async function fetchClassrooms(){
  const res = await fetch(apiUrl('/classrooms'), { headers:{'Authorization':'Bearer '+AUTH.token} });
  if(res.status===401){ await logout(true); throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'); }
  const body = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error || ('HTTP '+res.status));
  return body.classrooms || [];
}

async function createClassroom(name){
  name = (name||'').trim();
  if(!name){ classroomError = 'Nhập tên lớp học'; render(); return; }
  classroomBusy = true; classroomError = ''; render();
  try{
    const res = await authorizedRequest('/classrooms', { name });
    CLASSROOMS = [{ id: res.id, code: res.code, name: res.name, members: [] }, ...CLASSROOMS];
    toast('Đã tạo lớp "' + name + '" ✓');
  }catch(e){
    classroomError = e.message || 'Tạo lớp thất bại';
  }
  classroomBusy = false; render();
}

async function joinClassroom(code){
  code = (code||'').trim();
  if(!code){ classroomError = 'Nhập mã lớp'; render(); return; }
  classroomBusy = true; classroomError = ''; render();
  try{
    const res = await authorizedRequest('/classrooms/join', { code });
    if(!CLASSROOMS.some(c=>c.id===res.id)){
      CLASSROOMS = [{ id: res.id, name: res.name, teacherEmail: res.teacherEmail }, ...CLASSROOMS];
    }
    toast('Đã vào lớp "' + res.name + '" ✓');
  }catch(e){
    classroomError = e.message || 'Vào lớp thất bại';
  }
  classroomBusy = false; render();
}

async function leaveClassroom(id){
  classroomBusy = true; render();
  try{
    await authorizedRequest('/classrooms/leave', { classroomId: id });
    CLASSROOMS = CLASSROOMS.filter(c=>c.id!==id);
    toast('Đã rời lớp');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  classroomBusy = false; render();
}

async function deleteClassroom(id){
  classroomBusy = true; render();
  try{
    await authorizedRequest('/classrooms/delete', { classroomId: id });
    CLASSROOMS = CLASSROOMS.filter(c=>c.id!==id);
    if(expandedClassroomId===id) expandedClassroomId = null;
    toast('Đã xoá lớp');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  classroomBusy = false; render();
}

// Like authRequest, but for endpoints that need the login token.
async function authorizedRequest(path, body){
  const res = await fetch(apiUrl(path), {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+AUTH.token},
    body: JSON.stringify(body)
  });
  if(res.status===401){ await logout(true); throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'); }
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || ('HTTP '+res.status));
  return data;
}

function copyClassCode(code){
  const done = ()=> toast('Đã sao chép mã lớp "' + code + '" ✓');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(done).catch(()=> toast('Mã lớp: ' + code));
  } else {
    toast('Mã lớp: ' + code);
  }
}

/* ---------------- LỚP HỌC (tab riêng, không nằm trong Cài đặt) ---------------- */
function renderClassroomView(){
  if(AUTH.token && questionEditorOpen) return renderQuestionEditor();
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
  header.innerHTML = `
    <h1 class="display">Lớp học</h1>
    <button class="gear-btn" aria-label="Cài đặt" title="Cài đặt">⚙</button>
  `;
  header.querySelector('.gear-btn').onclick = ()=>{ settingsPanelOpen = true; settingsPanelFresh = true; render(); };
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

/* ---- tests / quizzes (teacher creates, tied to one classroom) ---- */
async function authorizedGet(path){
  const res = await fetch(apiUrl(path), { headers:{'Authorization':'Bearer '+AUTH.token} });
  if(res.status===401){ await logout(true); throw new Error('Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'); }
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || ('HTTP '+res.status));
  return data;
}

function openTestManager(classroomId, classroomName){
  testManagerClassroom = { id: classroomId, name: classroomName };
  testManagerFresh = true;
  testError = '';
  TESTS = [];
  testsLoading = true;
  render();
  fetchTests(classroomId)
    .then(list=>{ TESTS = list; })
    .catch(e=>{ testError = e.message || 'Lỗi tải bài kiểm tra'; })
    .finally(()=>{ testsLoading = false; render(); });
}

function closeTestManager(){
  testManagerClassroom = null;
  testEditorOpen = null;
  questionEditorOpen = null;
  testSubmissionsOpen = null;
  render();
}

async function fetchTests(classroomId){
  const res = await authorizedGet('/tests/list?classroomId=' + encodeURIComponent(classroomId));
  return res.tests || [];
}

async function createTest(title){
  title = (title||'').trim();
  if(!title){ testError = 'Nhập tên bài kiểm tra'; render(); return; }
  testBusy = true; testError = ''; render();
  try{
    const res = await authorizedRequest('/tests/create', { classroomId: testManagerClassroom.id, title });
    TESTS = [{ id:res.id, title:res.title, questionCount:0, createdAt:res.createdAt, updatedAt:res.updatedAt }, ...TESTS];
    toast('Đã tạo bài kiểm tra "' + title + '" ✓');
  }catch(e){
    testError = e.message || 'Tạo bài kiểm tra thất bại';
  }
  testBusy = false; render();
}

async function deleteTest(id){
  testBusy = true; render();
  try{
    await authorizedRequest('/tests/delete', { testId: id });
    TESTS = TESTS.filter(t=>t.id!==id);
    if(testEditorOpen && testEditorOpen.id===id) testEditorOpen = null;
    toast('Đã xoá bài kiểm tra');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  testBusy = false; render();
}

async function openTestEditor(testId){
  try{
    const detail = await authorizedGet('/tests/get?testId=' + encodeURIComponent(testId));
    detail._deadlineDraftOn = !!detail.deadlineAt;   // UI-only flag, not sent to server
    testEditorOpen = detail;
    testEditorFresh = true;
    testTitleEditing = false;
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  render();
}

async function renameTestTitle(newTitle){
  newTitle = (newTitle||'').trim();
  if(!newTitle) return;
  testBusy = true; render();
  try{
    await authorizedRequest('/tests/rename', { testId: testEditorOpen.id, title: newTitle });
    testEditorOpen.title = newTitle;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].title = newTitle;
    testTitleEditing = false;
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  testBusy = false; render();
}

function defaultDataForType(type){
  if(type==='mcq') return { options:['','','',''], correctIndex:0 };
  if(type==='true_false') return { items:[
    {text:'', correct:true}, {text:'', correct:true}, {text:'', correct:true}, {text:'', correct:true}
  ]};
  return { accepted:[''] };
}

function openQuestionEditor(mode, question, presetType){
  questionError = '';
  if(mode==='add'){
    const type = presetType || 'mcq';
    questionEditorOpen = { mode:'add', type, prompt:'', imageData:null, data: defaultDataForType(type) };
  } else {
    questionEditorOpen = {
      mode:'edit', id: question.id, type: question.type, prompt: question.prompt,
      imageData: question.imageData || null, data: JSON.parse(JSON.stringify(question.data))
    };
  }
  questionEditorFresh = true;
  render();
}

async function compressImageFile(file){
  const dataUrl = await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve,reject)=>{
    const el = new Image();
    el.onload = ()=> resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const MAX_DIM = 1000;
  let width = img.width, height = img.height;
  if(width > MAX_DIM || height > MAX_DIM){
    const scale = MAX_DIM / Math.max(width, height);
    width = Math.round(width*scale);
    height = Math.round(height*scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const outDataUrl = canvas.toDataURL(outMime, 0.8);
  return { mime: outMime, base64: outDataUrl.split(',')[1] };
}

async function uploadQuestionImage(file){
  questionImageProcessing = true; render();
  try{
    const { mime, base64 } = await compressImageFile(file);
    if(base64.length > 1_800_000){
      toast('Ảnh vẫn còn quá lớn sau khi nén, hãy thử ảnh khác');
    } else {
      questionEditorOpen.imageData = 'data:' + mime + ';base64,' + base64;
    }
  }catch(e){
    toast('Lỗi xử lý ảnh: ' + (e.message||''));
  }
  questionImageProcessing = false; render();
}

async function saveQuestion(){
  const q = questionEditorOpen;
  const prompt = (q.prompt||'').trim();
  if(!prompt){ questionError = 'Nhập nội dung câu hỏi'; render(); return; }
  if(q.type==='mcq'){
    const opts = q.data.options.map(o=>(o||'').trim());
    if(opts.some(o=>!o)){ questionError = 'Điền đủ 4 phương án'; render(); return; }
    q.data.options = opts;
  } else if(q.type==='short_answer'){
    const accepted = q.data.accepted.map(a=>(a||'').trim()).filter(Boolean);
    if(accepted.length===0){ questionError = 'Nhập ít nhất 1 đáp án đúng'; render(); return; }
    q.data.accepted = accepted;
  } else if(q.type==='true_false'){
    const items = q.data.items.map(it=>({ text:(it.text||'').trim(), correct: !!it.correct }));
    if(items.some(it=>!it.text)){ questionError = 'Điền đủ nội dung 4 ý a, b, c, d'; render(); return; }
    q.data.items = items;
  }

  questionBusy = true; questionError = ''; render();
  try{
    if(q.mode==='add'){
      const res = await authorizedRequest('/tests/questions/add', {
        testId: testEditorOpen.id, type:q.type, prompt, imageData:q.imageData, data:q.data
      });
      testEditorOpen.questions.push({ id:res.id, type:q.type, prompt, imageData:q.imageData, data:q.data, orderIndex:res.orderIndex });
    } else {
      await authorizedRequest('/tests/questions/update', { questionId: q.id, prompt, imageData:q.imageData, data:q.data });
      const target = testEditorOpen.questions.find(x=>x.id===q.id);
      if(target){ target.prompt=prompt; target.imageData=q.imageData; target.data=q.data; target.type=q.type; }
    }
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].questionCount = testEditorOpen.questions.length;
    questionEditorOpen = null;
    toast('Đã lưu câu hỏi ✓');
  }catch(e){
    questionError = e.message || 'Lưu câu hỏi thất bại';
  }
  questionBusy = false; render();
}

async function deleteQuestion(id){
  testBusy = true; render();
  try{
    await authorizedRequest('/tests/questions/delete', { questionId: id });
    testEditorOpen.questions = testEditorOpen.questions.filter(q=>q.id!==id);
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].questionCount = testEditorOpen.questions.length;
    toast('Đã xoá câu hỏi');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  testBusy = false; render();
}

/* ---- Dán nhanh nhiều câu trắc nghiệm cùng lúc (bulk import) ----
   Nhận dạng văn bản dán vào theo định dạng phổ biến khi soạn đề trên Word:

     Câu 1: Nội dung câu hỏi...
     A. Phương án 1
     B. Phương án 2
     C. Phương án 3
     D. Phương án 4
     Đáp án: A

     Câu 2: ...

   Chấp nhận cả không có chữ "Câu", dấu ")" thay ".", "Đáp án đúng"/"ĐA"/
   "Answer", và số câu không cần liên tục. Bất cứ câu nào thiếu 1 trong 4
   phương án hoặc thiếu đáp án sẽ tự động bị bỏ qua khỏi bản xem trước —
   giáo viên luôn thấy trước số câu nhận diện được trước khi bấm Thêm. */
function parseBulkMCQ(text){
  const lines = (text||'').replace(/\r\n/g,'\n').split('\n');
  const qStartRe = /^\s*(?:Câu|Cau|Question)\s*\d+\s*[:.\)]?\s*(.*)$/i;
  const optRe = /^\s*([A-Da-d])[.\):]\s*(.+)$/;
  const ansRe = /^\s*(Đáp\s*án\s*(?:đúng)?|Dap\s*an|ĐA|DA|Answer|Correct)\b[^A-Da-d]*([A-Da-d])\s*\.?\s*$/i;

  const blocks = [];
  let cur = null;
  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;
    const qm = line.match(qStartRe);
    const om = !qm ? line.match(optRe) : null;
    const am = (!qm && !om) ? line.match(ansRe) : null;
    if(qm){
      cur = { promptLines: qm[1] ? [qm[1]] : [], options:{}, answer:null };
      blocks.push(cur);
    } else if(om && cur && Object.keys(cur.options).length < 4){
      cur.options[om[1].toUpperCase()] = om[2].trim();
    } else if(am && cur){
      cur.answer = am[2].toUpperCase();
    } else if(cur && Object.keys(cur.options).length===0){
      // still part of the question prompt (before any option line appears)
      cur.promptLines.push(line);
    }
  }

  const questions = [];
  const skipped = [];
  blocks.forEach((b,i)=>{
    const prompt = b.promptLines.join('\n').trim();
    const opts = ['A','B','C','D'].map(k=>b.options[k]);
    const complete = prompt && opts.every(Boolean) && b.answer && 'ABCD'.includes(b.answer);
    if(complete){
      questions.push({ prompt, options: opts, correctIndex: 'ABCD'.indexOf(b.answer) });
    } else {
      skipped.push(i+1);
    }
  });
  return { questions, skippedCount: skipped.length };
}

async function submitBulkImport(){
  const parsed = parseBulkMCQ(bulkImportOpen.text);
  if(parsed.questions.length===0){
    bulkImportOpen.error = 'Không nhận diện được câu hỏi nào hợp lệ — kiểm tra lại định dạng bên dưới.';
    render();
    return;
  }
  bulkImportOpen.busy = true; bulkImportOpen.error = ''; render();
  let addedCount = 0;
  try{
    for(const q of parsed.questions){
      const data = { options: q.options, correctIndex: q.correctIndex };
      const res = await authorizedRequest('/tests/questions/add', {
        testId: testEditorOpen.id, type:'mcq', prompt:q.prompt, imageData:null, data
      });
      testEditorOpen.questions.push({ id:res.id, type:'mcq', prompt:q.prompt, imageData:null, data, orderIndex:res.orderIndex });
      addedCount++;
    }
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].questionCount = testEditorOpen.questions.length;
    bulkImportOpen = null;
    toast(`Đã thêm ${addedCount} câu trắc nghiệm ✓` + (parsed.skippedCount ? ` (bỏ qua ${parsed.skippedCount} câu không nhận diện được)` : ''));
  }catch(e){
    bulkImportOpen.error = (addedCount>0 ? `Đã thêm ${addedCount} câu thì gặp lỗi: ` : 'Lỗi: ') + (e.message||'Thêm câu hỏi thất bại');
    bulkImportOpen.busy = false;
  }
  render();
}

function renderBulkImportModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay && !bulkImportOpen.busy){ bulkImportOpen=null; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<div class="modal-title display">⚡ Dán nhanh nhiều câu</div>`;

  const help = document.createElement('div');
  help.className = 'tr-sub';
  help.style.marginBottom = '10px';
  help.innerHTML = `Dán nội dung nhiều câu trắc nghiệm cùng lúc (copy từ Word/Zalo...), mỗi câu theo đúng khuôn:`;
  card.appendChild(help);

  const example = document.createElement('pre');
  example.className = 'mono';
  example.style.cssText = 'font-size:11px; line-height:1.6; background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:10px 12px; white-space:pre-wrap; color:var(--ink-faint); margin-bottom:12px;';
  example.textContent =
`Câu 1: Thủ đô của Việt Nam là gì?
A. Hà Nội
B. TP. Hồ Chí Minh
C. Đà Nẵng
D. Huế
Đáp án: A

Câu 2: 2 + 2 = ?
A. 3
B. 4
C. 5
D. 6
Đáp án: B`;
  card.appendChild(example);

  const field = document.createElement('div');
  field.className = 'field';
  field.innerHTML = `<label>Dán nội dung đề vào đây</label>`;
  const area = document.createElement('textarea');
  area.rows = 10;
  area.placeholder = 'Dán toàn bộ đề trắc nghiệm vào đây…';
  area.value = bulkImportOpen.text;
  area.disabled = bulkImportOpen.busy;
  field.appendChild(area);
  card.appendChild(field);

  const preview = document.createElement('div');
  preview.className = 'tr-sub';
  preview.style.margin = '2px 0 6px';
  const updatePreview = ()=>{
    const p = parseBulkMCQ(area.value);
    if(!area.value.trim()){ preview.textContent = ''; return; }
    preview.innerHTML = p.questions.length
      ? `<span style="color:var(--teal); font-weight:600;">✓ Nhận diện được ${p.questions.length} câu hợp lệ</span>` + (p.skippedCount ? ` · <span style="color:var(--coral);">${p.skippedCount} câu chưa đủ thông tin</span>` : '')
      : `<span style="color:var(--coral);">Chưa nhận diện được câu nào — kiểm tra lại định dạng</span>`;
  };
  area.oninput = ()=>{ bulkImportOpen.text = area.value; updatePreview(); };
  updatePreview();
  card.appendChild(preview);

  if(bulkImportOpen.error){
    const err = document.createElement('div');
    err.style.color = 'var(--coral)'; err.style.fontSize = '12px'; err.style.margin = '4px 0';
    err.textContent = bulkImportOpen.error;
    card.appendChild(err);
  }

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex'; btnRow.style.gap = '8px'; btnRow.style.marginTop = '14px';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'save-btn secondary-btn';
  cancelBtn.style.margin = '0'; cancelBtn.style.flex = '1';
  cancelBtn.textContent = 'Huỷ';
  cancelBtn.disabled = bulkImportOpen.busy;
  cancelBtn.onclick = ()=>{ bulkImportOpen=null; render(); };
  btnRow.appendChild(cancelBtn);

  const addBtn = document.createElement('button');
  addBtn.className = 'save-btn';
  addBtn.style.margin = '0'; addBtn.style.flex = '2';
  addBtn.textContent = bulkImportOpen.busy ? 'Đang thêm…' : '+ Thêm tất cả vào đề';
  addBtn.disabled = bulkImportOpen.busy;
  addBtn.onclick = submitBulkImport;
  btnRow.appendChild(addBtn);

  card.appendChild(btnRow);
  overlay.appendChild(card);
  return overlay;
}

function renderTestManager(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display">Bài kiểm tra</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');

  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← Lớp học';
  backLink.style.marginBottom = '14px';
  backLink.onclick = closeTestManager;
  main.appendChild(backLink);

  const subheading = document.createElement('div');
  subheading.className = 'display';
  subheading.style.fontSize = '19px'; subheading.style.fontWeight = '700'; subheading.style.marginBottom = '16px';
  subheading.textContent = testManagerClassroom.name;
  main.appendChild(subheading);

  if(testError){
    const errBox = document.createElement('div');
    errBox.style.color='var(--coral)'; errBox.style.fontSize='12px'; errBox.style.margin='0 0 10px';
    errBox.textContent = testError;
    main.appendChild(errBox);
  }

  const formRow = document.createElement('div');
  formRow.style.display='flex'; formRow.style.gap='8px'; formRow.style.marginBottom='16px';
  const input = document.createElement('input');
  input.type='text'; input.placeholder='Tên bài kiểm tra, ví dụ: Kiểm tra 15 phút - Chương 1';
  input.style.flex='1'; input.style.background='var(--bg-elev)'; input.style.border='1px solid var(--line)';
  input.style.color='var(--white)'; input.style.borderRadius='10px'; input.style.padding='11px 12px'; input.style.fontSize='14px';
  input.onkeydown = (e)=>{ if(e.key==='Enter') createTest(input.value); };
  const btn = document.createElement('button');
  btn.className='save-btn'; btn.style.width='auto'; btn.style.margin='0'; btn.style.padding='11px 16px'; btn.style.fontSize='14px';
  btn.textContent = testBusy ? '…' : '+ Tạo';
  btn.disabled = testBusy;
  btn.onclick = ()=> createTest(input.value);
  formRow.appendChild(input); formRow.appendChild(btn);
  main.appendChild(formRow);

  if(testsLoading){
    const l = document.createElement('div'); l.className='tr-sub'; l.textContent='Đang tải…';
    main.appendChild(l);
  } else if(TESTS.length===0){
    const e = document.createElement('div'); e.className='tr-sub'; e.textContent='Chưa có bài kiểm tra nào trong lớp này.';
    main.appendChild(e);
  }

  TESTS.forEach(t=>{
    const card = document.createElement('div');
    card.className = 'test-card';
    card.onclick = ()=> openTestEditor(t.id);

    const icon = document.createElement('div');
    icon.className = 'test-icon';
    icon.textContent = '📝';

    const info = document.createElement('div');
    info.className = 'test-info';
    info.innerHTML = `
      <div class="test-title">${escapeHtml(t.title)}</div>
      <div class="test-meta">${t.questionCount} câu hỏi</div>
    `;

    const delBtn = document.createElement('button');
    delBtn.className = 'subject-del'; delBtn.textContent = '🗑'; delBtn.title = 'Xoá bài kiểm tra';
    delBtn.onclick = (e)=>{ e.stopPropagation(); testConfirm = {type:'delete-test', id:t.id, label:t.title}; render(); };

    const chev = document.createElement('span');
    chev.className = 'test-chev';
    chev.textContent = '›';

    card.appendChild(icon);
    card.appendChild(info);
    card.appendChild(delBtn);
    card.appendChild(chev);
    main.appendChild(card);
  });

  wrap.appendChild(main);
  return wrap;
}

function renderTestEditor(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display">Soạn bài kiểm tra</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');

  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← ' + testManagerClassroom.name;
  backLink.style.marginBottom = '14px';
  backLink.onclick = ()=>{ testEditorOpen=null; testTitleEditing=false; render(); };
  main.appendChild(backLink);

  const titleRow = document.createElement('div');
  titleRow.style.display='flex'; titleRow.style.alignItems='center'; titleRow.style.gap='8px'; titleRow.style.marginBottom='18px';
  if(testTitleEditing){
    const tInput = document.createElement('input');
    tInput.type='text'; tInput.value = testEditorOpen.title;
    tInput.style.flex='1'; tInput.style.background='var(--bg-elev)'; tInput.style.border='1px solid var(--line)';
    tInput.style.color='var(--white)'; tInput.style.borderRadius='10px'; tInput.style.padding='10px 12px'; tInput.style.fontSize='16px'; tInput.style.fontWeight='600';
    tInput.onkeydown = (e)=>{ if(e.key==='Enter') renameTestTitle(tInput.value); };
    const saveT = document.createElement('button');
    saveT.className='save-btn'; saveT.style.width='auto'; saveT.style.margin='0'; saveT.style.padding='10px 14px';
    saveT.textContent='Lưu';
    saveT.onclick = ()=> renameTestTitle(tInput.value);
    titleRow.appendChild(tInput); titleRow.appendChild(saveT);
    setTimeout(()=>tInput.focus(), 0);
  } else {
    const h = document.createElement('div');
    h.className='display'; h.style.fontSize='19px'; h.style.fontWeight='700'; h.style.flex='1';
    h.textContent = testEditorOpen.title;
    const editT = document.createElement('button');
    editT.textContent='✎'; editT.title='Đổi tên bài kiểm tra';
    editT.style.background='none'; editT.style.border='none'; editT.style.color='var(--ink-faint)'; editT.style.fontSize='14px'; editT.style.cursor='pointer';
    editT.onclick = ()=>{ testTitleEditing=true; render(); };
    titleRow.appendChild(h); titleRow.appendChild(editT);
  }
  main.appendChild(titleRow);

  // --- publish / attempts / scores ---
  const publishBox = document.createElement('div');
  publishBox.className = 'toggle-row';
  publishBox.style.flexDirection = 'column';
  publishBox.style.alignItems = 'stretch';
  publishBox.style.gap = '12px';

  const publishRow = document.createElement('div');
  publishRow.style.display = 'flex'; publishRow.style.alignItems = 'center'; publishRow.style.justifyContent = 'space-between';
  publishRow.innerHTML = `
    <div class="tr-text">
      <div class="tr-title">${testEditorOpen.published ? 'Đã giao bài' : 'Bản nháp'}</div>
      <div class="tr-sub">${testEditorOpen.published ? 'Học sinh trong lớp đang thấy và làm được bài này.' : 'Chỉ mình bạn thấy — bật lên để học sinh làm bài.'}</div>
    </div>
    <label class="switch">
      <input type="checkbox" ${testEditorOpen.published?'checked':''} ${publishBusy?'disabled':''}>
      <span class="track"></span>
    </label>
  `;
  publishRow.querySelector('input').onchange = (e)=> publishTest(e.target.checked, testEditorOpen.maxAttempts, testEditorOpen.deadlineAt);
  publishBox.appendChild(publishRow);

  const attemptsRow = document.createElement('div');
  attemptsRow.style.display = 'flex'; attemptsRow.style.gap = '8px';
  [[1,'Chỉ 1 lần'],[null,'Không giới hạn']].forEach(([val,label])=>{
    const b = document.createElement('button');
    b.type='button'; b.textContent=label;
    b.style.flex='1'; b.style.padding='9px'; b.style.borderRadius='9px'; b.style.fontSize='12.5px'; b.style.fontWeight='600';
    const active = testEditorOpen.maxAttempts === val;
    b.style.border = active ? '1px solid var(--teal)' : '1px solid var(--line)';
    b.style.background = active ? 'var(--teal)' : 'var(--bg-elev)';
    b.style.color = active ? 'var(--bg)' : 'var(--white)';
    b.disabled = publishBusy;
    b.onclick = ()=> publishTest(!!testEditorOpen.published, val, testEditorOpen.deadlineAt);
    attemptsRow.appendChild(b);
  });
  publishBox.appendChild(attemptsRow);

  // --- hạn chót làm bài: "Không giới hạn" hoặc ngày giờ cụ thể ---
  const deadlineLabel = document.createElement('div');
  deadlineLabel.className = 'tr-sub';
  deadlineLabel.style.fontWeight = '600';
  deadlineLabel.style.margin = '2px 0 -2px';
  deadlineLabel.textContent = 'Hạn chót làm bài';
  publishBox.appendChild(deadlineLabel);

  const deadlineRow = document.createElement('div');
  deadlineRow.style.display = 'flex'; deadlineRow.style.gap = '8px';
  [[false,'Không giới hạn'],[true,'Có hạn chót']].forEach(([wantsDeadline,label])=>{
    const b = document.createElement('button');
    b.type='button'; b.textContent=label;
    b.style.flex='1'; b.style.padding='9px'; b.style.borderRadius='9px'; b.style.fontSize='12.5px'; b.style.fontWeight='600';
    const active = !!testEditorOpen._deadlineDraftOn === wantsDeadline;
    b.style.border = active ? '1px solid var(--amber)' : '1px solid var(--line)';
    b.style.background = active ? 'var(--amber)' : 'var(--bg-elev)';
    b.style.color = active ? 'var(--bg)' : 'var(--white)';
    b.disabled = publishBusy;
    b.onclick = ()=>{
      if(wantsDeadline){
        testEditorOpen._deadlineDraftOn = true;
        render();
      } else {
        testEditorOpen._deadlineDraftOn = false;
        publishTest(!!testEditorOpen.published, testEditorOpen.maxAttempts, null);
      }
    };
    deadlineRow.appendChild(b);
  });
  publishBox.appendChild(deadlineRow);

  if(testEditorOpen._deadlineDraftOn){
    const dlField = document.createElement('div');
    dlField.style.display = 'flex'; dlField.style.gap = '8px'; dlField.style.alignItems = 'center';
    const dlInput = document.createElement('input');
    dlInput.type = 'datetime-local';
    dlInput.value = toDatetimeLocalValue(testEditorOpen.deadlineAt);
    dlInput.min = toDatetimeLocalValue(Date.now());
    dlInput.disabled = publishBusy;
    dlInput.style.cssText = 'flex:1; background:var(--bg-elev); border:1px solid var(--line); border-radius:9px; padding:9px 10px; color:var(--white); font-size:13px; font-family:inherit;';
    dlInput.onchange = (e)=>{
      const val = e.target.value;
      if(!val) return;
      const ts = new Date(val).getTime();
      if(!Number.isFinite(ts)) return;
      publishTest(!!testEditorOpen.published, testEditorOpen.maxAttempts, ts);
    };
    dlField.appendChild(dlInput);
    publishBox.appendChild(dlField);

    const dlHint = document.createElement('div');
    dlHint.className = 'tr-sub';
    dlHint.style.margin = '-4px 0 0';
    dlHint.textContent = testEditorOpen.deadlineAt
      ? `Học sinh không mở/nộp bài được sau ${formatDeadline(testEditorOpen.deadlineAt)}.`
      : 'Chọn ngày giờ hết hạn ở trên.';
    publishBox.appendChild(dlHint);
  }

  const scoresBtn = document.createElement('button');
  scoresBtn.className = 'save-btn';
  scoresBtn.style.background = 'var(--bg-elev)'; scoresBtn.style.color = 'var(--white)'; scoresBtn.style.border = '1px solid var(--line)';
  scoresBtn.style.margin = '0'; scoresBtn.style.fontSize = '13px'; scoresBtn.style.padding = '11px';
  scoresBtn.textContent = '📊 Xem điểm học sinh';
  scoresBtn.onclick = openTestSubmissions;
  publishBox.appendChild(scoresBtn);

  main.appendChild(publishBox);

  // --- tệp đề bài đính kèm (PDF/Word) — học sinh tải về làm trước khi vào phần trắc nghiệm ---
  const attachBox = document.createElement('div');
  attachBox.className = 'toggle-row';
  attachBox.style.flexDirection = 'column';
  attachBox.style.alignItems = 'stretch';
  attachBox.style.gap = '10px';
  attachBox.style.marginTop = '12px';

  const attachLabel = document.createElement('div');
  attachLabel.className = 'tr-sub';
  attachLabel.style.fontWeight = '600';
  attachLabel.textContent = '📎 Tệp đề bài (PDF/Word)';
  attachBox.appendChild(attachLabel);

  const attachHint = document.createElement('div');
  attachHint.className = 'tr-sub';
  attachHint.textContent = 'Học sinh sẽ tải tệp này về làm trước, sau đó vào phần trắc nghiệm bên dưới để nộp đáp án.';
  attachBox.appendChild(attachHint);

  if(testEditorOpen.attachmentName){
    const fileRow = document.createElement('div');
    fileRow.style.display = 'flex'; fileRow.style.alignItems = 'center'; fileRow.style.gap = '10px';
    fileRow.style.background = 'var(--bg)'; fileRow.style.border = '1px solid var(--line)';
    fileRow.style.borderRadius = '10px'; fileRow.style.padding = '10px 12px';

    const isPdf = (testEditorOpen.attachmentMime||'').includes('pdf');
    const icon = document.createElement('div');
    icon.style.fontSize = '20px'; icon.textContent = isPdf ? '📕' : '📄';
    fileRow.appendChild(icon);

    const nameEl = document.createElement('div');
    nameEl.style.flex = '1'; nameEl.style.fontSize = '13px'; nameEl.style.fontWeight = '600';
    nameEl.style.overflow = 'hidden'; nameEl.style.textOverflow = 'ellipsis'; nameEl.style.whiteSpace = 'nowrap';
    nameEl.textContent = testEditorOpen.attachmentName;
    fileRow.appendChild(nameEl);

    if(testEditorOpen.attachmentData){
      const viewBtn = document.createElement('button');
      viewBtn.textContent = '👁';
      viewBtn.title = 'Xem trong app';
      viewBtn.style.cssText = 'background:none; border:none; color:var(--teal); font-size:16px; cursor:pointer; flex-shrink:0; padding:4px 6px;';
      viewBtn.onclick = ()=> openFilePreview({ name: testEditorOpen.attachmentName, mime: testEditorOpen.attachmentMime, dataUrl: testEditorOpen.attachmentData });
      fileRow.appendChild(viewBtn);

      const openBtn = document.createElement('a');
      openBtn.href = testEditorOpen.attachmentData;
      openBtn.download = testEditorOpen.attachmentName;
      openBtn.textContent = '⬇';
      openBtn.title = 'Tải xuống';
      openBtn.style.cssText = 'font-size:16px; text-decoration:none; padding:4px 6px; flex-shrink:0;';
      fileRow.appendChild(openBtn);
    }

    const delFileBtn = document.createElement('button');
    delFileBtn.textContent = '🗑';
    delFileBtn.title = 'Xoá tệp';
    delFileBtn.style.cssText = 'background:none; border:none; color:var(--coral); font-size:15px; cursor:pointer; flex-shrink:0; padding:4px 6px;';
    delFileBtn.disabled = testAttachmentBusy;
    delFileBtn.onclick = removeTestAttachment;
    fileRow.appendChild(delFileBtn);

    attachBox.appendChild(fileRow);

    const replaceLabel = document.createElement('label');
    replaceLabel.className = 'save-btn secondary-btn';
    replaceLabel.style.margin = '0'; replaceLabel.style.textAlign = 'center'; replaceLabel.style.cursor = 'pointer';
    replaceLabel.style.opacity = testAttachmentBusy ? '0.6' : '1';
    replaceLabel.textContent = testAttachmentBusy ? 'Đang tải lên…' : 'Thay tệp khác';
    const replaceInput = document.createElement('input');
    replaceInput.type = 'file'; replaceInput.accept = '.pdf,.doc,.docx'; replaceInput.style.display = 'none';
    replaceInput.disabled = testAttachmentBusy;
    replaceInput.onchange = (e)=>{ const f = e.target.files[0]; if(f) uploadTestAttachment(f); e.target.value = ''; };
    replaceLabel.appendChild(replaceInput);
    attachBox.appendChild(replaceLabel);
  } else {
    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'save-btn';
    uploadLabel.style.background = 'var(--bg-elev)'; uploadLabel.style.color = 'var(--white)'; uploadLabel.style.border = '1px solid var(--line)';
    uploadLabel.style.margin = '0'; uploadLabel.style.textAlign = 'center'; uploadLabel.style.cursor = 'pointer';
    uploadLabel.style.opacity = testAttachmentBusy ? '0.6' : '1';
    uploadLabel.textContent = testAttachmentBusy ? 'Đang tải lên…' : '📎 Tải lên đề bài (PDF/Word)';
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file'; uploadInput.accept = '.pdf,.doc,.docx'; uploadInput.style.display = 'none';
    uploadInput.disabled = testAttachmentBusy;
    uploadInput.onchange = (e)=>{ const f = e.target.files[0]; if(f) uploadTestAttachment(f); e.target.value = ''; };
    uploadLabel.appendChild(uploadInput);
    attachBox.appendChild(uploadLabel);
  }

  main.appendChild(attachBox);

  if(testEditorOpen.questions.length===0){
    const e = document.createElement('div'); e.className='tr-sub'; e.style.marginBottom='6px'; e.textContent='Chưa có câu hỏi nào.';
    main.appendChild(e);
  }

  // Câu hỏi luôn được nhóm và hiển thị theo đúng thứ tự 3 phần cố định,
  // bất kể được tạo trước/sau — giáo viên bấm nút "+" trong từng phần để
  // thêm câu hỏi thuộc đúng phần đó.
  const SECTIONS = [
    ['mcq', 'Phần I. Trắc nghiệm', '+ Thêm câu trắc nghiệm'],
    ['true_false', 'Phần II. Đúng / Sai', '+ Thêm câu đúng/sai'],
    ['short_answer', 'Phần III. Trả lời ngắn', '+ Thêm câu trả lời ngắn']
  ];

  SECTIONS.forEach(([type, sectionLabel, addLabel])=>{
    const sectionQuestions = testEditorOpen.questions.filter(q=>q.type===type);

    const sectionHead = document.createElement('div');
    sectionHead.className = 'section-head';
    sectionHead.innerHTML = `<div class="section-title">${sectionLabel}</div><div class="tr-sub">${sectionQuestions.length} câu</div>`;
    main.appendChild(sectionHead);

    sectionQuestions.forEach((q,i)=>{
      const card = document.createElement('div');
      card.className = 'question-card';
      card.onclick = ()=> openQuestionEditor('edit', q);

      const badge = document.createElement('div');
      badge.className = 'question-badge';
      badge.textContent = i+1;

      const info = document.createElement('div');
      info.className = 'test-info';
      info.innerHTML = `<div class="subject-name" style="font-size:14px; font-weight:500; line-height:1.4;">${escapeHtml(q.prompt)}</div>`;

      card.appendChild(badge);
      card.appendChild(info);

      if(q.imageData){
        const thumb = document.createElement('img');
        thumb.src = q.imageData;
        thumb.style.width='44px'; thumb.style.height='44px'; thumb.style.objectFit='cover'; thumb.style.borderRadius='8px'; thumb.style.flexShrink='0';
        card.appendChild(thumb);
      }

      const delBtn = document.createElement('button');
      delBtn.className='subject-del'; delBtn.textContent='🗑'; delBtn.title='Xoá câu hỏi';
      delBtn.onclick = (e)=>{ e.stopPropagation(); testConfirm = {type:'delete-question', id:q.id, label: sectionLabel+' — Câu '+(i+1)}; render(); };
      card.appendChild(delBtn);

      main.appendChild(card);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'add-section-btn';
    addBtn.textContent = addLabel;
    addBtn.onclick = ()=> openQuestionEditor('add', null, type);
    main.appendChild(addBtn);

    if(type==='mcq'){
      const bulkBtn = document.createElement('button');
      bulkBtn.className = 'add-section-btn';
      bulkBtn.style.color = 'var(--amber)';
      bulkBtn.textContent = '⚡ Dán nhanh nhiều câu cùng lúc';
      bulkBtn.onclick = ()=>{ bulkImportOpen = { text:'', busy:false, error:'' }; render(); };
      main.appendChild(bulkBtn);
    }
  });

  wrap.appendChild(main);
  return wrap;
}

function renderQuestionEditor(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  const q = questionEditorOpen;

  const header = document.createElement('header');
  header.className='topbar';
  header.innerHTML = `<h1 class="display">${q.mode==='add' ? 'Thêm câu hỏi' : 'Sửa câu hỏi'}</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');

  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← ' + testEditorOpen.title;
  backLink.style.marginBottom = '14px';
  backLink.disabled = questionBusy;
  backLink.onclick = ()=>{ if(!questionBusy){ questionEditorOpen=null; render(); } };
  main.appendChild(backLink);

  const typeLabelMap = { mcq:'Trắc nghiệm', true_false:'Đúng / Sai', short_answer:'Trả lời ngắn' };
  const typeField = document.createElement('div');
  typeField.className='field';
  typeField.innerHTML = `
    <label>Loại câu hỏi</label>
    <span class="question-type-tag ${q.type}" style="margin-top:2px;">${typeLabelMap[q.type]}</span>
  `;
  main.appendChild(typeField);

  const fPrompt = document.createElement('div');
  fPrompt.className='field';
  fPrompt.innerHTML = `<label>${q.type==='true_false' ? 'Đề bài chung (dẫn nhập cho 4 ý a, b, c, d)' : 'Nội dung câu hỏi'}</label>`;
  const promptArea = document.createElement('textarea');
  promptArea.value = q.prompt;
  promptArea.rows = 3;
  promptArea.placeholder = 'Nhập câu hỏi… hỗ trợ mọi ký tự, ví dụ: α, β, ≥, ½, "trích dẫn"';
  promptArea.oninput = ()=>{ q.prompt = promptArea.value; };
  fPrompt.appendChild(promptArea);
  main.appendChild(fPrompt);

  const fImage = document.createElement('div');
  fImage.className='field';
  fImage.innerHTML = `<label>Hình ảnh (không bắt buộc)</label>`;
  if(q.imageData){
    const previewWrap = document.createElement('div');
    previewWrap.style.position='relative'; previewWrap.style.display='inline-block'; previewWrap.style.marginBottom='8px';
    const img = document.createElement('img');
    img.src = q.imageData;
    img.style.maxWidth='160px'; img.style.maxHeight='160px'; img.style.borderRadius='10px'; img.style.display='block';
    const rmBtn = document.createElement('button');
    rmBtn.textContent='✕'; rmBtn.title='Xoá ảnh';
    rmBtn.style.position='absolute'; rmBtn.style.top='-8px'; rmBtn.style.right='-8px';
    rmBtn.style.width='24px'; rmBtn.style.height='24px'; rmBtn.style.borderRadius='50%';
    rmBtn.style.background='var(--coral)'; rmBtn.style.color='#3a0d13'; rmBtn.style.border='none'; rmBtn.style.fontSize='12px'; rmBtn.style.cursor='pointer';
    rmBtn.onclick = ()=>{ q.imageData = null; render(); };
    previewWrap.appendChild(img); previewWrap.appendChild(rmBtn);
    fImage.appendChild(previewWrap);
  } else {
    const fileBtn = document.createElement('label');
    fileBtn.className='save-btn';
    fileBtn.style.background='var(--bg-elev)'; fileBtn.style.color='var(--white)'; fileBtn.style.border='1px solid var(--line)';
    fileBtn.style.display='inline-block'; fileBtn.style.width='auto'; fileBtn.style.padding='10px 16px'; fileBtn.style.fontSize='13px'; fileBtn.style.cursor='pointer'; fileBtn.style.marginTop='0';
    fileBtn.textContent = questionImageProcessing ? 'Đang xử lý ảnh…' : '📷 Chọn ảnh';
    const fileInput = document.createElement('input');
    fileInput.type='file'; fileInput.accept='image/*'; fileInput.style.display='none';
    fileInput.onchange = ()=>{ if(fileInput.files[0]) uploadQuestionImage(fileInput.files[0]); };
    fileBtn.appendChild(fileInput);
    fImage.appendChild(fileBtn);
  }
  main.appendChild(fImage);

  if(q.type==='mcq'){
    const fOpts = document.createElement('div');
    fOpts.className='field';
    fOpts.innerHTML = `<label>4 phương án — chạm ○ để chọn đáp án đúng</label>`;
    q.data.options.forEach((opt,i)=>{
      const optRow = document.createElement('div');
      optRow.style.display='flex'; optRow.style.alignItems='center'; optRow.style.gap='8px'; optRow.style.marginBottom='8px';
      const radio = document.createElement('button');
      radio.type='button';
      radio.textContent = q.data.correctIndex===i ? '●' : '○';
      radio.title = 'Đánh dấu là đáp án đúng';
      radio.style.background='none'; radio.style.border='none'; radio.style.fontSize='18px'; radio.style.cursor='pointer'; radio.style.flexShrink='0';
      radio.style.color = q.data.correctIndex===i ? 'var(--teal)' : 'var(--ink-faint)';
      radio.onclick = ()=>{ q.data.correctIndex = i; render(); };
      const input = document.createElement('input');
      input.type='text'; input.value=opt; input.placeholder = 'Phương án ' + String.fromCharCode(65+i);
      input.style.flex='1'; input.style.background='var(--bg-elev)'; input.style.border='1px solid var(--line)';
      input.style.color='var(--white)'; input.style.borderRadius='9px'; input.style.padding='10px 11px'; input.style.fontSize='14px';
      input.oninput = ()=>{ q.data.options[i] = input.value; };
      optRow.appendChild(radio); optRow.appendChild(input);
      fOpts.appendChild(optRow);
    });
    main.appendChild(fOpts);
  } else if(q.type==='true_false'){
    const fTF = document.createElement('div');
    fTF.className='field';
    fTF.innerHTML = `<label>4 ý a, b, c, d — nhập nội dung và chọn Đúng/Sai cho từng ý</label>`;
    const hint = document.createElement('div');
    hint.className='tr-sub'; hint.style.marginBottom='10px';
    hint.textContent = 'Điểm câu này: đúng 1 ý = 0,1đ · 2 ý = 0,25đ · 3 ý = 0,5đ · 4 ý = 1đ.';
    fTF.appendChild(hint);
    q.data.items.forEach((it,i)=>{
      const itemBox = document.createElement('div');
      itemBox.className = 'tf-item';

      const itemLabel = document.createElement('div');
      itemLabel.className = 'tf-item-label';
      itemLabel.textContent = 'Ý ' + String.fromCharCode(97+i) + ')';
      itemBox.appendChild(itemLabel);

      const input = document.createElement('textarea');
      input.rows = 2;
      input.value = it.text;
      input.placeholder = 'Nội dung ý ' + String.fromCharCode(97+i);
      input.style.width='100%'; input.style.boxSizing='border-box'; input.style.background='var(--bg-elev)'; input.style.border='1px solid var(--line)';
      input.style.color='var(--white)'; input.style.borderRadius='9px'; input.style.padding='10px 11px'; input.style.fontSize='14px'; input.style.marginBottom='8px';
      input.oninput = ()=>{ it.text = input.value; };
      itemBox.appendChild(input);

      const row = document.createElement('div');
      row.style.display='flex'; row.style.gap='8px';
      [[true,'Đúng'],[false,'Sai']].forEach(([val,label])=>{
        const b = document.createElement('button');
        b.type='button'; b.textContent=label;
        b.style.flex='1'; b.style.padding='9px'; b.style.borderRadius='9px'; b.style.fontSize='13px'; b.style.fontWeight='600';
        b.style.border = it.correct===val ? '1px solid var(--teal)' : '1px solid var(--line)';
        b.style.background = it.correct===val ? 'var(--teal)' : 'var(--bg-elev)';
        b.style.color = it.correct===val ? 'var(--bg)' : 'var(--white)';
        b.onclick = ()=>{ it.correct = val; render(); };
        row.appendChild(b);
      });
      itemBox.appendChild(row);
      fTF.appendChild(itemBox);
    });
    main.appendChild(fTF);
  } else {
    const fSA = document.createElement('div');
    fSA.className='field';
    fSA.innerHTML = `<label>Đáp án được chấp nhận</label>`;
    const hint = document.createElement('div');
    hint.className='tr-sub'; hint.style.marginBottom='8px';
    hint.textContent = 'Có thể thêm nhiều cách viết đúng (không phân biệt hoa/thường khi chấm).';
    fSA.appendChild(hint);
    q.data.accepted.forEach((ans,i)=>{
      const ansRow = document.createElement('div');
      ansRow.style.display='flex'; ansRow.style.gap='8px'; ansRow.style.marginBottom='8px';
      const input = document.createElement('input');
      input.type='text'; input.value=ans; input.placeholder='Đáp án đúng';
      input.style.flex='1'; input.style.background='var(--bg-elev)'; input.style.border='1px solid var(--line)';
      input.style.color='var(--white)'; input.style.borderRadius='9px'; input.style.padding='10px 11px'; input.style.fontSize='14px';
      input.oninput = ()=>{ q.data.accepted[i] = input.value; };
      ansRow.appendChild(input);
      if(q.data.accepted.length>1){
        const rm = document.createElement('button');
        rm.textContent='✕'; rm.title='Xoá'; rm.style.background='none'; rm.style.border='none'; rm.style.color='var(--ink-faint)'; rm.style.fontSize='14px'; rm.style.cursor='pointer';
        rm.onclick = ()=>{ q.data.accepted.splice(i,1); render(); };
        ansRow.appendChild(rm);
      }
      fSA.appendChild(ansRow);
    });
    const addAns = document.createElement('button');
    addAns.type='button'; addAns.textContent='+ Thêm cách viết khác';
    addAns.className='back-link';
    addAns.onclick = ()=>{ q.data.accepted.push(''); render(); };
    fSA.appendChild(addAns);
    main.appendChild(fSA);
  }

  if(questionError){
    const errBox = document.createElement('div');
    errBox.style.color='var(--coral)'; errBox.style.fontSize='12px'; errBox.style.margin='0 0 12px';
    errBox.textContent = questionError;
    main.appendChild(errBox);
  }

  const saveBtn = document.createElement('button');
  saveBtn.className='save-btn';
  saveBtn.disabled = questionBusy || questionImageProcessing;
  saveBtn.textContent = questionBusy ? 'Đang lưu…' : 'Lưu câu hỏi';
  saveBtn.onclick = ()=> saveQuestion();
  main.appendChild(saveBtn);

  wrap.appendChild(main);
  return wrap;
}

function renderTestConfirmModal(){
  const overlay = document.createElement('div');
  overlay.className='modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ testConfirm=null; render(); } };
  const info = testConfirm;
  const isTest = info.type === 'delete-test';
  const card = document.createElement('div');
  card.className='modal-card';
  card.innerHTML = `
    <div class="modal-title display">Xoá ${isTest?'bài kiểm tra':'câu hỏi'} "${escapeHtml(info.label)}"?</div>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin:0 0 4px;">
      ${isTest ? 'Toàn bộ câu hỏi và hình ảnh trong bài kiểm tra này sẽ bị xoá vĩnh viễn.' : 'Câu hỏi và hình ảnh đính kèm (nếu có) sẽ bị xoá vĩnh viễn.'}
    </p>
  `;
  const btnRow = document.createElement('div');
  btnRow.style.display='flex'; btnRow.style.gap='10px'; btnRow.style.marginTop='22px';
  const cancelBtn = document.createElement('button');
  cancelBtn.className='save-btn'; cancelBtn.style.background='var(--bg-elev)'; cancelBtn.style.color='var(--white)'; cancelBtn.style.border='1px solid var(--line)';
  cancelBtn.textContent='Huỷ';
  cancelBtn.onclick = ()=>{ testConfirm=null; render(); };
  const confirmBtn = document.createElement('button');
  confirmBtn.className='save-btn'; confirmBtn.style.background='var(--coral)'; confirmBtn.style.color='#3a0d13';
  confirmBtn.textContent='Xoá';
  confirmBtn.onclick = async ()=>{
    const id = info.id;
    testConfirm = null;
    if(isTest) await deleteTest(id); else await deleteQuestion(id);
  };
  btnRow.appendChild(cancelBtn); btnRow.appendChild(confirmBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  return overlay;
}

/* ---- giao bài & xem điểm (giáo viên) ---- */
/* ---- Xem đề bài (PDF/Word) ngay trong app, không cần tải về ----
   PDF: trình duyệt tự có sẵn khung xem PDF, chỉ cần nhúng qua <iframe>.
   .docx: chuyển sang HTML để đọc ngay bằng thư viện mammoth.js (chạy hoàn
   toàn trên máy người dùng, không gửi file lên đâu cả) — tải thư viện này
   từ CDN đúng lúc cần, không tải sẵn để không làm nặng app lúc mở lần đầu.
   .doc (định dạng Word cũ) không có cách xem trong trình duyệt, chỉ tải về. */
let _mammothLoadPromise = null;
function ensureMammothLoaded(){
  if(window.mammoth) return Promise.resolve();
  if(_mammothLoadPromise) return _mammothLoadPromise;
  _mammothLoadPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.7.0/mammoth.browser.min.js';
    s.onload = ()=> resolve();
    s.onerror = ()=>{ _mammothLoadPromise = null; reject(new Error('Cần có mạng để mở trình xem Word lần đầu')); };
    document.head.appendChild(s);
  });
  return _mammothLoadPromise;
}

function dataUrlToArrayBuffer(dataUrl){
  const base64 = dataUrl.slice(dataUrl.indexOf(',')+1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function openFilePreview(file){
  // file: {name, mime, dataUrl}
  filePreviewOpen = { name: file.name, mime: file.mime, dataUrl: file.dataUrl, html: null, loading: false, error: '' };
  render();

  if(file.mime === 'application/msword'){
    filePreviewOpen.error = 'Trình xem trong app chưa đọc được định dạng .doc cũ này. Hãy tải về máy để xem, hoặc nhờ giáo viên xuất lại dạng .docx hoặc PDF.';
    render();
    return;
  }
  if(file.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    filePreviewOpen.loading = true; render();
    try{
      await ensureMammothLoaded();
      const arrayBuffer = dataUrlToArrayBuffer(file.dataUrl);
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      filePreviewOpen.html = result.value || '<p><em>(Tài liệu trống)</em></p>';
    }catch(e){
      filePreviewOpen.error = (e && e.message) || 'Không mở được tệp này trong app — vui lòng tải về xem.';
    }
    filePreviewOpen.loading = false;
    render();
  }
  // PDF: không cần xử lý thêm, <iframe> nhúng thẳng dataUrl trong renderFilePreviewModal.
}

function closeFilePreview(){ filePreviewOpen = null; render(); }

function renderFilePreviewModal(){
  const f = filePreviewOpen;
  const overlay = document.createElement('div');
  overlay.className = 'file-preview-overlay';

  const bar = document.createElement('div');
  bar.className = 'file-preview-bar';
  const title = document.createElement('div');
  title.className = 'file-preview-title';
  title.textContent = f.name;
  bar.appendChild(title);

  const dlBtn = document.createElement('a');
  dlBtn.href = f.dataUrl; dlBtn.download = f.name;
  dlBtn.className = 'file-preview-icon-btn';
  dlBtn.textContent = '⬇';
  dlBtn.title = 'Tải xuống';
  bar.appendChild(dlBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'file-preview-icon-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Đóng';
  closeBtn.onclick = closeFilePreview;
  bar.appendChild(closeBtn);
  overlay.appendChild(bar);

  const body = document.createElement('div');
  body.className = 'file-preview-body';

  if(f.mime === 'application/pdf'){
    const iframe = document.createElement('iframe');
    iframe.src = f.dataUrl;
    iframe.className = 'file-preview-iframe';
    iframe.title = f.name;
    body.appendChild(iframe);
  } else if(f.loading){
    const l = document.createElement('div');
    l.className = 'tr-sub';
    l.style.cssText = 'text-align:center; padding:48px 20px;';
    l.textContent = 'Đang tải trình xem…';
    body.appendChild(l);
  } else if(f.error){
    const errWrap = document.createElement('div');
    errWrap.style.cssText = 'text-align:center; padding:40px 24px;';
    const errMsg = document.createElement('div');
    errMsg.className = 'tr-sub';
    errMsg.style.marginBottom = '18px';
    errMsg.textContent = f.error;
    errWrap.appendChild(errMsg);
    const dlBtn2 = document.createElement('a');
    dlBtn2.href = f.dataUrl; dlBtn2.download = f.name;
    dlBtn2.className = 'save-btn';
    dlBtn2.style.cssText = 'max-width:240px; margin:0 auto; display:block; text-decoration:none;';
    dlBtn2.textContent = '⬇ Tải về xem';
    errWrap.appendChild(dlBtn2);
    body.appendChild(errWrap);
  } else if(f.html){
    const docWrap = document.createElement('div');
    docWrap.className = 'file-preview-doc';
    docWrap.innerHTML = f.html;
    body.appendChild(docWrap);
  }
  overlay.appendChild(body);
  return overlay;
}

async function uploadTestAttachment(file){
  if(!file) return;
  const ALLOWED = {
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true
  };
  if(!ALLOWED[file.type]){
    toast('Chỉ nhận tệp PDF hoặc Word (.pdf, .doc, .docx)');
    return;
  }
  if(file.size > 5.5 * 1024 * 1024){
    toast('Tệp quá lớn — vui lòng chọn tệp dưới khoảng 5MB');
    return;
  }
  testAttachmentBusy = true; testAttachmentError = ''; render();
  try{
    const dataUrl = await new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await authorizedRequest('/tests/attachment/set', {
      testId: testEditorOpen.id, fileName: file.name, mime: file.type, data: dataUrl
    });
    testEditorOpen.attachmentName = res.attachmentName;
    testEditorOpen.attachmentMime = res.attachmentMime;
    testEditorOpen.attachmentData = dataUrl;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].hasAttachment = true;
    toast('Đã tải lên đề bài ✓');
  }catch(e){
    testAttachmentError = e.message || 'Tải tệp lên thất bại';
    toast('Lỗi: ' + testAttachmentError);
  }
  testAttachmentBusy = false; render();
}

async function removeTestAttachment(){
  testAttachmentBusy = true; render();
  try{
    await authorizedRequest('/tests/attachment/remove', { testId: testEditorOpen.id });
    testEditorOpen.attachmentName = null;
    testEditorOpen.attachmentMime = null;
    testEditorOpen.attachmentData = null;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].hasAttachment = false;
    toast('Đã xoá tệp đề bài');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  testAttachmentBusy = false; render();
}

async function publishTest(published, maxAttempts, deadlineAt){
  if(deadlineAt === undefined) deadlineAt = testEditorOpen.deadlineAt || null;
  publishBusy = true; render();
  try{
    const res = await authorizedRequest('/tests/publish', { testId: testEditorOpen.id, published, maxAttempts, deadlineAt });
    testEditorOpen.published = res.published;
    testEditorOpen.maxAttempts = res.maxAttempts;
    testEditorOpen.deadlineAt = res.deadlineAt || null;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0){ TESTS[idx].published = res.published; TESTS[idx].maxAttempts = res.maxAttempts; TESTS[idx].deadlineAt = res.deadlineAt || null; }
    toast(res.published ? 'Đã giao bài cho học sinh ✓' : 'Đã chuyển về bản nháp');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  publishBusy = false; render();
}

function openTestSubmissions(){
  testSubmissionsOpen = { testId: testEditorOpen.id, title: testEditorOpen.title };
  TEST_SUBMISSIONS = [];
  testSubmissionsLoading = true;
  render();
  authorizedGet('/tests/submissions?testId=' + encodeURIComponent(testSubmissionsOpen.testId))
    .then(res=>{ TEST_SUBMISSIONS = res.submissions || []; })
    .catch(e=>{ toast('Lỗi: ' + (e.message||'')); })
    .finally(()=>{ testSubmissionsLoading = false; render(); });
}

function renderTestSubmissions(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display">Điểm số</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');
  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← ' + testSubmissionsOpen.title;
  backLink.style.marginBottom = '14px';
  backLink.onclick = ()=>{ testSubmissionsOpen = null; render(); };
  main.appendChild(backLink);

  if(testSubmissionsLoading){
    const l = document.createElement('div'); l.className='tr-sub'; l.textContent='Đang tải…';
    main.appendChild(l);
  } else if(TEST_SUBMISSIONS.length===0){
    const e = document.createElement('div'); e.className='tr-sub'; e.textContent='Chưa có học sinh nào nộp bài.';
    main.appendChild(e);
  }

  TEST_SUBMISSIONS.forEach(s=>{
    const row = document.createElement('div');
    row.className = 'subject-row';
    const pct = s.total>0 ? Math.round((s.score/s.total)*100) : 0;
    row.innerHTML = `
      <div class="subject-info">
        <div class="subject-name">${escapeHtml(personLabel(s))}</div>
        <div class="subject-meta">${s.attemptCount>1 ? 'Đã làm '+s.attemptCount+' lần' : 'Đã nộp bài'}</div>
      </div>
      <div class="mono" style="font-size:15px; font-weight:700; color:${pct>=50?'var(--teal)':'var(--coral)'};">${s.score}/${s.total}</div>
    `;
    main.appendChild(row);
  });

  wrap.appendChild(main);
  return wrap;
}

/* ---- làm bài kiểm tra (học sinh) ---- */
function openStudentTestList(classroom){
  studentTestListClassroom = {
    id: classroom.id,
    name: classroom.name,
    teacherName: classroom.teacherName,
    teacherEmail: classroom.teacherEmail
  };
  studentTestError = '';
  studentTests = [];
  studentTestsLoading = true;
  render();
  authorizedGet('/tests/student/list?classroomId=' + encodeURIComponent(classroom.id))
    .then(res=>{ studentTests = res.tests || []; })
    .catch(e=>{ studentTestError = e.message || 'Lỗi tải bài kiểm tra'; })
    .finally(()=>{ studentTestsLoading = false; render(); });
}

function closeStudentTestList(){
  studentTestListClassroom = null;
  studentTestDetailOpen = null;
  testReviewOpen = false;
  takeTestOpen = null;
  render();
}

async function openStudentTestDetail(testId){
  try{
    const detail = await authorizedGet('/tests/student/get?testId=' + encodeURIComponent(testId));
    studentTestDetailOpen = detail;
    testReviewOpen = false;
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  render();
}

async function viewPastResult(){
  try{
    const res = await authorizedGet('/tests/student/result?testId=' + encodeURIComponent(studentTestDetailOpen.id));
    studentTestDetailOpen.resultDetail = res.detail;
    testReviewOpen = true;
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  render();
}

function startTakeTest(){
  takeTestOpen = { id: studentTestDetailOpen.id, title: studentTestDetailOpen.title, questions: studentTestDetailOpen.questions };
  takeTestAnswers = {};
  testReviewOpen = false;
  render();
}

// Returns true on success. Deliberately avoids calling render() while the
// request is in flight — the confirm dialog manages its own button state
// directly so the question list underneath is never torn down/rescrolled.
async function submitTest(){
  try{
    const answers = Object.keys(takeTestAnswers).map(qId => ({ questionId: qId, answer: takeTestAnswers[qId] }));
    const res = await authorizedRequest('/tests/submit', { testId: takeTestOpen.id, answers });
    studentTestDetailOpen.mySubmission = { score: res.score, total: res.total, attemptCount: res.attemptCount, submittedAt: res.submittedAt };
    studentTestDetailOpen.canAttempt = studentTestDetailOpen.maxAttempts === null && !studentTestDetailOpen.isExpired;
    studentTestDetailOpen.resultDetail = res.detail;
    testReviewOpen = false;
    const idx = studentTests.findIndex(t=>t.id===takeTestOpen.id);
    if(idx>=0) studentTests[idx].mySubmission = studentTestDetailOpen.mySubmission;
    takeTestOpen = null;
    toast('Đã nộp bài ✓ Điểm: ' + res.score + '/' + res.total);
    render();
    return true;
  }catch(e){
    toast('Lỗi: ' + (e.message || 'Nộp bài thất bại'));
    return false;
  }
}

// Shared 3-band coloring so the test list, result ring, and review page
// all agree on what counts as "good" — teal ≥80%, amber ≥50%, coral below.
function scoreTier(pct){
  if(pct>=0.8) return { color:'var(--teal)', icon:'★', verdict:'Xuất sắc! 🎉' };
  if(pct>=0.5) return { color:'var(--amber)', icon:'◐', verdict:'Khá tốt, cố thêm chút nữa' };
  return { color:'var(--coral)', icon:'!', verdict:'Cần ôn lại phần này' };
}

// One test card for the student-facing list. `done` picks the visual
// treatment (open/red "chưa thi" vs. completed/scored) so the same builder
// serves both the "chưa hoàn thành" and "đã hoàn thành" sections below.
function buildStudentTestCard(t, teacherLabel){
  const card = document.createElement('div');
  card.className = 'srs-test-card' + (t.mySubmission ? ' is-done' : '') + (t.isExpired && !t.mySubmission ? ' is-expired' : '');
  card.onclick = ()=> openStudentTestDetail(t.id);

  const attemptPill = t.maxAttempts === 1
    ? '<span class="stc-pill">🔒 Chỉ 1 lần</span>'
    : '<span class="stc-pill">🔁 Không giới hạn</span>';

  const deadlinePill = !t.deadlineAt
    ? '<span class="stc-pill">🚩 Không thời hạn</span>'
    : t.isExpired
      ? '<span class="stc-pill stc-pill-danger">⏰ Đã hết hạn</span>'
      : `<span class="stc-pill">⏰ Hạn: ${escapeHtml(formatDeadline(t.deadlineAt))}</span>`;

  const attachmentPill = t.hasAttachment ? '<span class="stc-pill">📎 Có đề bài</span>' : '';

  let statusHtml, scorePillHtml = '';
  if(t.mySubmission){
    const pct = t.mySubmission.total>0 ? (t.mySubmission.score/t.mySubmission.total) : 0;
    const tier = scoreTier(pct);
    statusHtml = `<span class="stc-status" style="color:${tier.color};">Trạng thái: đã thi</span>`;
    scorePillHtml = `<span class="stc-pill" style="color:${tier.color}; border-color:${tier.color};">${tier.icon} ${t.mySubmission.score}/${t.mySubmission.total} điểm</span>`;
  } else if(t.isExpired){
    statusHtml = `<span class="stc-status stc-status-pending">Trạng thái: chưa thi · đã hết hạn</span>`;
  } else {
    statusHtml = `<span class="stc-status stc-status-pending">Trạng thái: chưa thi</span>`;
  }

  card.innerHTML = `
    <div class="stc-pillrow">${deadlinePill}${attemptPill}${attachmentPill}${scorePillHtml}</div>
    <div class="stc-teacher"><span class="stc-avatar">${escapeHtml(initialsOf({name:teacherLabel}))}</span>${escapeHtml(teacherLabel)}</div>
    <div class="stc-title">${escapeHtml(t.title)}</div>
    ${statusHtml}
    <div class="stc-meta">📄 ${t.questionCount} câu${t.mySubmission && t.mySubmission.attemptCount>1 ? ' · 🔁 Đã làm '+t.mySubmission.attemptCount+' lần' : ''}</div>
  `;
  return card;
}

function renderStudentTestList(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display">Bài kiểm tra</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');
  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← Lớp học';
  backLink.style.marginBottom = '14px';
  backLink.onclick = closeStudentTestList;
  main.appendChild(backLink);

  const subheading = document.createElement('div');
  subheading.className = 'display';
  subheading.style.fontSize = '19px'; subheading.style.fontWeight = '700'; subheading.style.marginBottom = '16px';
  subheading.textContent = studentTestListClassroom.name;
  main.appendChild(subheading);

  if(studentTestError){
    const errBox = document.createElement('div');
    errBox.style.color='var(--coral)'; errBox.style.fontSize='12px'; errBox.style.margin='0 0 10px';
    errBox.textContent = studentTestError;
    main.appendChild(errBox);
  }

  if(studentTestsLoading){
    const l = document.createElement('div'); l.className='tr-sub'; l.textContent='Đang tải…';
    main.appendChild(l);
  } else if(studentTests.length===0){
    const e = document.createElement('div'); e.className='tr-sub'; e.textContent='Giáo viên chưa giao bài kiểm tra nào cho lớp này.';
    main.appendChild(e);
  } else {
    const teacherLabel = personLabel({name: studentTestListClassroom.teacherName, email: studentTestListClassroom.teacherEmail});
    const pending = studentTests.filter(t=>!t.mySubmission);
    const done = studentTests.filter(t=>t.mySubmission);

    const pendingHead = document.createElement('div');
    pendingHead.className = 'stc-section-title';
    pendingHead.textContent = `Đề thi chưa hoàn thành (${pending.length})`;
    main.appendChild(pendingHead);
    if(pending.length===0){
      const e = document.createElement('div'); e.className='tr-sub'; e.style.marginBottom='18px';
      e.textContent = 'Bạn đã hoàn thành hết bài được giao 🎉';
      main.appendChild(e);
    } else {
      pending.forEach(t=> main.appendChild(buildStudentTestCard(t, teacherLabel)));
    }

    const doneHead = document.createElement('div');
    doneHead.className = 'stc-section-title';
    doneHead.style.marginTop = '22px';
    doneHead.textContent = `Đề thi đã hoàn thành (${done.length})`;
    main.appendChild(doneHead);
    if(done.length===0){
      const e = document.createElement('div'); e.className='tr-sub';
      e.textContent = 'Chưa có đề nào bạn hoàn thành.';
      main.appendChild(e);
    } else {
      done.forEach(t=> main.appendChild(buildStudentTestCard(t, teacherLabel)));
    }
  }

  wrap.appendChild(main);
  return wrap;
}

function renderStudentTestDetail(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  const t = studentTestDetailOpen;

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display">Bài kiểm tra</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');
  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← ' + studentTestListClassroom.name;
  backLink.style.marginBottom = '14px';
  backLink.onclick = ()=>{ studentTestDetailOpen = null; render(); };
  main.appendChild(backLink);

  const titleEl = document.createElement('div');
  titleEl.className = 'display';
  titleEl.style.fontSize = '19px'; titleEl.style.fontWeight = '700'; titleEl.style.marginBottom = '4px';
  titleEl.textContent = t.title;
  main.appendChild(titleEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'tr-sub';
  metaEl.style.marginBottom = '6px';
  metaEl.textContent = t.questions.length + ' câu hỏi · ' + (t.maxAttempts===1 ? 'Chỉ làm 1 lần' : 'Được làm lại nhiều lần');
  main.appendChild(metaEl);

  const deadlineEl = document.createElement('div');
  deadlineEl.className = 'tr-sub';
  deadlineEl.style.marginBottom = '20px';
  if(t.deadlineAt){
    deadlineEl.innerHTML = t.isExpired
      ? `<span style="color:var(--coral); font-weight:600;">⏰ Đã hết hạn lúc ${formatDeadline(t.deadlineAt)}</span>`
      : `⏰ Hạn chót: ${formatDeadline(t.deadlineAt)}`;
  } else {
    deadlineEl.textContent = '⏰ Không giới hạn thời hạn';
  }
  main.appendChild(deadlineEl);

  if(t.attachmentName){
    const attachCard = document.createElement('div');
    attachCard.style.cssText = 'display:flex; align-items:center; gap:10px; background:var(--bg-elev); border:1px solid var(--line); border-radius:12px; padding:12px; margin-bottom:16px; flex-wrap:wrap;';
    const isPdf = (t.attachmentMime||'').includes('pdf');
    attachCard.innerHTML = `
      <div style="font-size:22px;">${isPdf ? '📕' : '📄'}</div>
      <div style="flex:1; min-width:120px;">
        <div style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.attachmentName)}</div>
        <div class="tr-sub" style="margin-top:1px;">Xem hoặc tải đề về làm trước, rồi quay lại nộp phần trắc nghiệm bên dưới.</div>
      </div>
    `;
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex; gap:8px; flex-shrink:0; margin-left:auto;';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.textContent = '👁 Xem đề';
    viewBtn.style.cssText = 'font-size:12.5px; font-weight:700; border:none; color:var(--bg); background:var(--teal); padding:8px 12px; border-radius:9px; white-space:nowrap; cursor:pointer;';
    viewBtn.onclick = ()=> openFilePreview({ name: t.attachmentName, mime: t.attachmentMime, dataUrl: t.attachmentData });
    btnGroup.appendChild(viewBtn);

    const dlBtn = document.createElement('a');
    dlBtn.href = t.attachmentData;
    dlBtn.download = t.attachmentName;
    dlBtn.textContent = '⬇';
    dlBtn.title = 'Tải xuống';
    dlBtn.style.cssText = 'font-size:14px; font-weight:700; text-decoration:none; color:var(--white); background:var(--bg); border:1px solid var(--line); padding:8px 11px; border-radius:9px; white-space:nowrap;';
    btnGroup.appendChild(dlBtn);

    attachCard.appendChild(btnGroup);
    main.appendChild(attachCard);
  }

  if(t.mySubmission){
    const pct = t.mySubmission.total>0 ? (t.mySubmission.score/t.mySubmission.total) : 0;
    const pctInt = Math.round(pct*100);
    const tier = scoreTier(pct);
    const R = 52, C = 2*Math.PI*R;
    const targetOffset = (C * (1-pct)).toFixed(1);

    const scoreBox = document.createElement('div');
    scoreBox.className = 'score-result-card';
    scoreBox.innerHTML = `
      <div class="score-ring-wrap">
        <svg viewBox="0 0 120 120" class="score-ring">
          <circle cx="60" cy="60" r="${R}" class="score-ring-bg"></circle>
          <circle cx="60" cy="60" r="${R}" class="score-ring-fg" style="stroke:${tier.color}; stroke-dasharray:${C.toFixed(1)}; stroke-dashoffset:${C.toFixed(1)};"></circle>
        </svg>
        <div class="score-ring-center">
          <div class="score-ring-num display">${t.mySubmission.score}/${t.mySubmission.total}</div>
          <div class="score-ring-pct mono">${pctInt}%</div>
        </div>
      </div>
      <div class="score-verdict" style="color:${tier.color};">${tier.verdict}</div>
      <div class="tr-sub">${t.mySubmission.attemptCount>1 ? 'Điểm lần gần nhất · Đã làm '+t.mySubmission.attemptCount+' lần' : 'Điểm của bạn'}</div>
    `;
    main.appendChild(scoreBox);
    // Animate the ring filling in from empty, one frame after mount so the
    // browser has painted the empty state first (otherwise it would just
    // appear already-full with no motion).
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        const fg = scoreBox.querySelector('.score-ring-fg');
        if(fg) fg.style.strokeDashoffset = targetOffset;
      });
    });

    const detailBtn = document.createElement('button');
    detailBtn.className = 'save-btn secondary-btn';
    detailBtn.textContent = '📋 Xem lại bài làm';
    detailBtn.onclick = ()=>{
      if(t.resultDetail){ testReviewOpen = true; render(); }
      else { viewPastResult(); }
    };
    main.appendChild(detailBtn);
  }

  if(t.canAttempt){
    const startBtn = document.createElement('button');
    startBtn.className = 'save-btn';
    startBtn.textContent = t.mySubmission ? '🔄 Làm lại' : '▶ Bắt đầu làm bài';
    startBtn.onclick = startTakeTest;
    main.appendChild(startBtn);
  } else if(t.mySubmission){
    const note = document.createElement('div');
    note.className = 'tr-sub';
    note.style.textAlign = 'center';
    note.textContent = t.isExpired ? 'Bài đã hết hạn, không thể làm lại.' : 'Bài này chỉ được làm 1 lần.';
    main.appendChild(note);
  } else if(t.isExpired){
    const note = document.createElement('div');
    note.className = 'tr-sub';
    note.style.textAlign = 'center';
    note.style.color = 'var(--coral)';
    note.textContent = 'Bài đã hết hạn, không thể bắt đầu làm bài.';
    main.appendChild(note);
  }

  wrap.appendChild(main);
  return wrap;
}

function renderTestReview(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  const t = studentTestDetailOpen;

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display" style="font-size:18px;">Xem lại bài làm</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');
  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← Kết quả';
  backLink.style.marginBottom = '14px';
  backLink.onclick = ()=>{ testReviewOpen = false; render(); };
  main.appendChild(backLink);

  if(t.mySubmission){
    const pct = t.mySubmission.total>0 ? (t.mySubmission.score/t.mySubmission.total) : 0;
    const tier = scoreTier(pct);
    const summary = document.createElement('div');
    summary.className = 'review-summary-bar';
    summary.innerHTML = `
      <div class="test-title" style="margin:0; white-space:normal;">${escapeHtml(t.title)}</div>
      <div class="mono" style="font-size:15px; font-weight:700; color:${tier.color}; flex-shrink:0;">${tier.icon} ${t.mySubmission.score}/${t.mySubmission.total}</div>
    `;
    main.appendChild(summary);
  }

  (t.resultDetail||[]).forEach((d,i)=>{
    const qcard = document.createElement('div');
    qcard.className = 'qcard';

    let qCorrect;
    if(d.type==='mcq') qCorrect = d.yourAnswer === d.correctAnswer;
    else if(d.type==='true_false') qCorrect = (d.correctCount||0) === (d.items||[]).length;
    else qCorrect = !!d.isCorrect;

    const promptEl = document.createElement('div');
    promptEl.className = 'qcard-prompt';
    promptEl.innerHTML = `<span class="q-result-dot ${qCorrect?'correct':'wrong'}">${qCorrect?'✓':'✕'}</span>Câu ${i+1}: ${escapeHtml(d.prompt)}`;
    qcard.appendChild(promptEl);

    if(d.imageData){
      const img = document.createElement('img');
      img.src = d.imageData;
      img.style.maxWidth='100%'; img.style.maxHeight='200px'; img.style.borderRadius='10px'; img.style.display='block'; img.style.marginBottom='12px';
      qcard.appendChild(img);
    }

    if(d.type === 'mcq' && Array.isArray(d.options)){
      d.options.forEach((opt,oi)=>{
        const isPicked = opt === d.yourAnswer;
        const isCorrectOpt = opt === d.correctAnswer;
        const row = document.createElement('div');
        row.className = 'opt-row readonly' + (isCorrectOpt ? ' correct' : (isPicked ? ' wrong' : ''));
        let tagHtml = '';
        if(isCorrectOpt && isPicked) tagHtml = '<span class="opt-tag correct">✓ Bạn chọn — Đúng</span>';
        else if(isCorrectOpt) tagHtml = '<span class="opt-tag correct">✓ Đáp án đúng</span>';
        else if(isPicked) tagHtml = '<span class="opt-tag picked">✕ Bạn đã chọn</span>';
        row.innerHTML = `<div class="opt-badge${isCorrectOpt?' correct':(isPicked?' wrong':'')}">${String.fromCharCode(65+oi)}</div><div class="opt-text">${escapeHtml(opt)}</div>${tagHtml}`;
        qcard.appendChild(row);
      });
    } else if(d.type === 'true_false' && Array.isArray(d.items)){
      d.items.forEach((it,ii)=>{
        const itemBox = document.createElement('div');
        itemBox.className = 'tf-item';
        const itemLabel = document.createElement('div');
        itemLabel.className = 'tf-item-label';
        itemLabel.innerHTML = `${String.fromCharCode(97+ii)}) ${escapeHtml(it.text)}`;
        itemBox.appendChild(itemLabel);
        const optWrap = document.createElement('div');
        optWrap.className = 'tf-optwrap';
        [[true,'Đ','Đúng'],[false,'S','Sai']].forEach(([val,letter,label])=>{
          const isPicked = it.yourAnswer === val;
          const isCorrectOpt = it.correctAnswer === val;
          const row = document.createElement('div');
          row.className = 'opt-row readonly' + (isCorrectOpt ? ' correct' : (isPicked ? ' wrong' : ''));
          row.innerHTML = `<div class="opt-badge${isCorrectOpt?' correct':(isPicked?' wrong':'')}">${letter}</div><div class="opt-text">${label}</div>`;
          optWrap.appendChild(row);
        });
        itemBox.appendChild(optWrap);
        qcard.appendChild(itemBox);
      });
      const ptsRow = document.createElement('div');
      ptsRow.className = 'tr-sub';
      ptsRow.style.marginTop = '4px'; ptsRow.style.fontWeight = '600';
      const ptsStr = (Math.round((d.earnedPoints||0)*100)/100).toString().replace('.', ',');
      ptsRow.textContent = `Đúng ${d.correctCount||0}/4 ý — ${ptsStr} điểm`;
      qcard.appendChild(ptsRow);
    } else {
      const yourBox = document.createElement('div');
      yourBox.innerHTML = `<div class="sa-label">Câu trả lời của bạn</div>`;
      const yourVal = document.createElement('div');
      yourVal.className = 'sa-box ' + (d.isCorrect ? 'correct' : 'wrong');
      yourVal.textContent = (d.yourAnswer && d.yourAnswer.trim()) ? d.yourAnswer : '(bỏ trống)';
      yourBox.appendChild(yourVal);
      qcard.appendChild(yourBox);
      if(!d.isCorrect){
        const correctBox = document.createElement('div');
        correctBox.innerHTML = `<div class="sa-label">Đáp án đúng</div>`;
        const correctVal = document.createElement('div');
        correctVal.className = 'sa-box correct';
        correctVal.textContent = d.correctAnswer;
        correctBox.appendChild(correctVal);
        qcard.appendChild(correctBox);
      }
    }

    main.appendChild(qcard);
  });

  wrap.appendChild(main);
  return wrap;
}

function countAnsweredTestQuestions(){
  return takeTestOpen.questions.filter(q => {
    const a = takeTestAnswers[q.id];
    if(q.type==='true_false') return a && Object.keys(a).length === (q.items||[]).length;
    return a!==undefined && a!=='';
  }).length;
}

// Called after any answer changes, post-mount, so it can safely look the
// bar up by id — the initial paint sets it directly (see renderTakeTest).
function updateTakeTestProgress(){
  if(!takeTestOpen) return;
  const fill = document.getElementById('takeTestProgressFill');
  const label = document.getElementById('takeTestProgressLabel');
  if(!fill || !label) return;
  const total = takeTestOpen.questions.length;
  const answered = countAnsweredTestQuestions();
  fill.style.width = (total ? (answered/total*100) : 0) + '%';
  label.textContent = `Đã trả lời ${answered}/${total} câu`;
}

function renderTakeTest(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  const typeLabel = { mcq:'Trắc nghiệm', true_false:'Đúng / Sai', short_answer:'Trả lời ngắn' };

  const header = document.createElement('header');
  header.className = 'topbar';
  const titleEl = document.createElement('h1');
  titleEl.className = 'display';
  titleEl.style.cssText = 'font-size:18px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
  titleEl.textContent = takeTestOpen.title;
  header.appendChild(titleEl);
  const topSubmitBtn = document.createElement('button');
  topSubmitBtn.className = 'top-submit-btn';
  topSubmitBtn.textContent = 'Nộp bài';
  topSubmitBtn.onclick = showSubmitConfirm;
  header.appendChild(topSubmitBtn);
  wrap.appendChild(header);

  const main = document.createElement('main');

  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← Thoát (không lưu)';
  backLink.style.marginBottom = '16px';
  backLink.onclick = ()=>{ takeTestOpen = null; render(); };
  main.appendChild(backLink);

  const total = takeTestOpen.questions.length;
  const progressWrap = document.createElement('div');
  progressWrap.style.marginBottom = '20px';
  const progressBar = document.createElement('div');
  progressBar.className = 'test-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'test-progress-fill';
  progressFill.id = 'takeTestProgressFill';
  progressBar.appendChild(progressFill);
  const progressLabel = document.createElement('div');
  progressLabel.className = 'tr-sub';
  progressLabel.id = 'takeTestProgressLabel';
  progressLabel.style.marginTop = '6px';
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(progressLabel);
  main.appendChild(progressWrap);
  const initAnswered = countAnsweredTestQuestions();
  progressFill.style.width = (total ? (initAnswered/total*100) : 0) + '%';
  progressLabel.textContent = `Đã trả lời ${initAnswered}/${total} câu`;

  takeTestOpen.questions.forEach((q,i)=>{
    const qcard = document.createElement('div');
    qcard.className = 'qcard';

    const promptEl = document.createElement('div');
    promptEl.className = 'qcard-prompt';
    promptEl.innerHTML = `<span class="question-type-tag ${q.type}" style="margin-right:2px;">${typeLabel[q.type]||q.type}</span><br>Câu ${i+1}: ${escapeHtml(q.prompt)}`;
    qcard.appendChild(promptEl);

    if(q.imageData){
      const img = document.createElement('img');
      img.src = q.imageData;
      img.style.maxWidth='100%'; img.style.maxHeight='220px'; img.style.borderRadius='10px'; img.style.display='block'; img.style.marginBottom='12px';
      qcard.appendChild(img);
    }

    if(q.type==='mcq'){
      q.options.forEach((opt,oi)=>{
        const row = document.createElement('div');
        row.className = 'opt-row' + (takeTestAnswers[q.id]===oi ? ' selected' : '');
        row.innerHTML = `<div class="opt-badge${takeTestAnswers[q.id]===oi?' selected':''}">${String.fromCharCode(65+oi)}</div><div class="opt-text">${escapeHtml(opt)}</div>`;
        row.onclick = ()=>{
          takeTestAnswers[q.id] = oi;
          // Update just this question's rows directly — no full re-render,
          // so the page never jumps back to the top while answering.
          Array.from(row.parentNode.children).forEach(sib=>{
            sib.classList.remove('selected');
            const b = sib.querySelector('.opt-badge'); if(b) b.classList.remove('selected');
          });
          row.classList.add('selected');
          row.querySelector('.opt-badge').classList.add('selected');
          updateTakeTestProgress();
        };
        qcard.appendChild(row);
      });
    } else if(q.type==='true_false'){
      if(!takeTestAnswers[q.id]) takeTestAnswers[q.id] = {};
      (q.items||[]).forEach((it,ii)=>{
        const itemBox = document.createElement('div');
        itemBox.className = 'tf-item';
        const itemLabel = document.createElement('div');
        itemLabel.className = 'tf-item-label';
        itemLabel.innerHTML = `${String.fromCharCode(97+ii)}) ${escapeHtml(it.text)}`;
        itemBox.appendChild(itemLabel);
        const optWrap = document.createElement('div');
        optWrap.className = 'tf-optwrap';
        [[true,'Đ','Đúng'],[false,'S','Sai']].forEach(([val,letter,label])=>{
          const row = document.createElement('div');
          row.className = 'opt-row' + (takeTestAnswers[q.id][ii]===val ? ' selected' : '');
          row.innerHTML = `<div class="opt-badge${takeTestAnswers[q.id][ii]===val?' selected':''}">${letter}</div><div class="opt-text">${label}</div>`;
          row.onclick = ()=>{
            takeTestAnswers[q.id][ii] = val;
            Array.from(optWrap.children).forEach(sib=>{
              sib.classList.remove('selected');
              const b = sib.querySelector('.opt-badge'); if(b) b.classList.remove('selected');
            });
            row.classList.add('selected');
            row.querySelector('.opt-badge').classList.add('selected');
            updateTakeTestProgress();
          };
          optWrap.appendChild(row);
        });
        itemBox.appendChild(optWrap);
        qcard.appendChild(itemBox);
      });
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Nhập câu trả lời';
      input.value = takeTestAnswers[q.id] || '';
      input.style.width = '100%'; input.style.boxSizing = 'border-box';
      input.style.background='var(--bg-elev)'; input.style.border='1.5px solid var(--line)';
      input.style.color='var(--white)'; input.style.borderRadius='12px'; input.style.padding='12px 14px'; input.style.fontSize='14px';
      input.oninput = ()=>{ takeTestAnswers[q.id] = input.value; updateTakeTestProgress(); };
      qcard.appendChild(input);
    }

    main.appendChild(qcard);
  });

  wrap.appendChild(main);
  return wrap;
}

// Shows the "Nộp bài?" confirmation as a direct DOM overlay (bypassing the
// global render() cycle) so the question list underneath never gets torn
// down and re-scrolled while the dialog is open.
function showSubmitConfirm(){
  if(document.getElementById('submitConfirmOverlay')) return;
  const total = takeTestOpen.questions.length;
  const answeredCount = countAnsweredTestQuestions();
  const unanswered = total - answeredCount;

  const overlay = document.createElement('div');
  overlay.id = 'submitConfirmOverlay';
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove(); };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `
    <div class="modal-title display">Nộp bài?</div>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin:0 0 4px;">
      Bạn đã làm ${answeredCount}/${total} câu.
      ${unanswered>0 ? `Còn <b style="color:var(--coral);">${unanswered} câu chưa làm</b>. Vẫn muốn nộp bài?` : 'Bạn đã làm hết tất cả câu hỏi.'}
    </p>
  `;

  const btnRow = document.createElement('div');
  btnRow.style.display='flex'; btnRow.style.gap='10px'; btnRow.style.marginTop='22px';
  const cancelBtn = document.createElement('button');
  cancelBtn.className='save-btn'; cancelBtn.style.background='var(--bg-elev)'; cancelBtn.style.color='var(--white)'; cancelBtn.style.border='1px solid var(--line)';
  cancelBtn.textContent='Làm tiếp';
  cancelBtn.onclick = ()=> overlay.remove();
  const confirmBtn = document.createElement('button');
  confirmBtn.className='save-btn';
  confirmBtn.textContent='Nộp bài';
  confirmBtn.onclick = async ()=>{
    confirmBtn.disabled = true; cancelBtn.disabled = true;
    confirmBtn.textContent = 'Đang nộp…';
    const ok = await submitTest();
    if(ok){ overlay.remove(); }
    else { confirmBtn.disabled = false; cancelBtn.disabled = false; confirmBtn.textContent = 'Nộp bài'; }
  };
  btnRow.appendChild(cancelBtn); btnRow.appendChild(confirmBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  $app.appendChild(overlay);
}

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
})();