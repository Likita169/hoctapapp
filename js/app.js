/* 01-trang-thai-toan-cuc.js — Hằng số dùng chung + toàn bộ biến trạng thái (state) của app: dữ liệu thẻ/bộ thẻ, tài khoản, lớp học, bài kiểm tra, các cờ mở/đóng modal...
   (Phần 1-159 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
let newTestType = 'mcq';                        // 'mcq' | 'essay' — loại của bài kiểm tra sắp tạo, chọn trong renderTestManager
let NOTIFICATIONS = [];                         // [{id,type,title,body,classroomId,testId,read,createdAt}]
let notificationsUnreadCount = 0;
let notificationsPanelOpen = false;
let notificationsPanelFresh = false;
let notificationsLoadedOnce = false;

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
let fileImportOpen = null;                      // {status:'busy'|'preview'|'error', ...} while "Nhập đề từ file Word" modal is open
let testAttachmentBusy = false;                 // uploading/removing the PDF/Word đề bài attached to a test
let testAttachmentError = '';
let filePreviewOpen = null;                     // {name, mime, dataUrl, html, loading, error} while the in-app file viewer is open

/* ---- giao bài & xem điểm (giáo viên) ---- */
let publishBusy = false;
let testSubmissionsOpen = null;                 // {testId, title} whose submissions page is open
let TEST_SUBMISSIONS = [];
let testSubmissionsLoading = false;

let submissionDetailOpen = null;                // {testId, title, studentId, studentEmail, studentName, score, total, attemptCount, submittedAt, detail} — 1 học sinh, để giáo viên xem/chấm
let submissionDetailLoading = false;
let essayGradeOpen = null;                      // {questionId, prompt, imageData, rubric, submittedImages, status, note, busy} — màn chấm 1 câu tự luận

/* ---- làm bài kiểm tra (học sinh) ---- */
let studentTestListClassroom = null;            // {id, name} whose test list (student view) is open
let studentTests = [];
let studentTestsLoading = false;
let studentTestError = '';

let studentTestDetailOpen = null;               // {id,title,maxAttempts,questions,mySubmission,resultDetail?} landing page for 1 test
let testReviewOpen = false;                     // true while the dedicated "Xem lại bài làm" page is open

let takeTestOpen = null;                        // {id,title,questions} while actively taking a test
let takeTestAnswers = {};                       // {questionId: answer}
let takeTestDeadline = null;      // epoch ms — mốc hết giờ nếu bài có giới hạn thời gian, null = không giới hạn
let takeTestCountdownHandle = null; // setInterval id của đồng hồ đếm ngược làm bài, dọn dẹp khi nộp/thoát
let takeTestLocked = false;       // true khi đã hết giờ và đang tự động nộp — khoá không cho bấm gì thêm
let essayPhotoProcessing = null;                // questionId whose photo is currently being compressed/added, or null
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
let subjectModalCountdownEnabled = false;  // đang bật/tắt đếm ngược cho bộ thẻ đang tạo/sửa trong modal
let subjectModalCountdownSeconds = 15;     // số giây đếm ngược đang chọn trong modal
let newSubjectParentId = null;   // parent for the subject the modal is about to create
let editSubjectId = null;        // if set, the modal edits (renames/recolors) this subject instead of creating one
// Bộ thẻ nào đang "mở" (hiện các bộ thẻ phụ bên trong) trên Trang chủ — cây
// lồng nhau kiểu AnkiDroid, thay cho cách bấm-vào-để-chuyển-trang cũ.
// Lưu vào localStorage để giữ trạng thái mở/thu gọn giữa các lần mở app.
let expandedSubjects = new Set();
try{
  const _expandedRaw = localStorage.getItem('srs_deck_expanded');
  if(_expandedRaw) JSON.parse(_expandedRaw).forEach(id=>expandedSubjects.add(id));
}catch(e){ /* ignore */ }
function saveExpandedSubjects(){
  try{ localStorage.setItem('srs_deck_expanded', JSON.stringify(Array.from(expandedSubjects))); }catch(e){ /* ignore */ }
}
function toggleSubjectExpanded(id){
  if(expandedSubjects.has(id)) expandedSubjects.delete(id); else expandedSubjects.add(id);
  saveExpandedSubjects();
}
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

/* ---- chế độ trả lời khi ôn tập: lật thẻ / gõ đáp án / trắc nghiệm nhanh ---- */
let reviewInputMode = 'flip';    // 'flip' | 'type' | 'quiz' — nhớ lại lựa chọn lần ôn trước
try{ reviewInputMode = localStorage.getItem('srs_review_mode') || 'flip'; }catch(e){ /* ignore */ }
function setReviewInputMode(mode){
  reviewInputMode = mode;
  try{ localStorage.setItem('srs_review_mode', mode); }catch(e){ /* ignore */ }
}
let typedAnswerValue = '';       // đang gõ gì ở chế độ "Gõ đáp án", cho đúng thẻ hiện tại
let typedAnswerChecked = false;  // đã bấm "Kiểm tra" cho thẻ hiện tại chưa
let typedAnswerCorrect = false;
let quizCurrentCardId = null;    // id thẻ mà quizCurrentChoices đang ứng với — tránh sinh lại đáp án mỗi lần vẽ lại
let quizCurrentChoices = [];     // các lựa chọn trắc nghiệm (đã xáo trộn) cho thẻ hiện tại
let quizSelectedChoice = null;
let quizIsCorrect = false;
let quizCountdownRemaining = null;  // số giây còn lại — null khi không bật đếm ngược cho thẻ hiện tại
let quizCountdownHandle = null;     // setInterval id, dọn dẹp khi chuyển thẻ/đổi chế độ/rời màn ôn tập
let quizCountdownCardId = null;     // id thẻ mà bộ đếm đang chạy ứng với — tránh khởi động lại mỗi lần vẽ

/* ---- soạn thẻ: loại "Lật thẻ" (mặc định) hay "Điền từ" (cloze) ---- */
let addCardType = 'basic';       // 'basic' | 'cloze' — chọn ở màn Thêm thẻ

/* ---- trò chơi Ghép thẻ — chỉ để luyện vui, không ảnh hưởng lịch ôn tập ---- */
let matchGameSubjectId = null;
let matchGamePairs = [];         // [{cardId, front, back}] các cặp trong ván đang chơi
let matchGameLeftOrder = [];     // thứ tự cardId ở cột trái (đã xáo trộn riêng)
let matchGameRightOrder = [];    // thứ tự cardId ở cột phải (đã xáo trộn riêng)
let matchGameMatchedIds = new Set();
let matchGameSelectedLeft = null;
let matchGameSelectedRight = null;
let matchGameWrongFlash = null;  // {left,right} — vừa chọn sai 1 cặp, đang chớp đỏ trước khi tự bỏ chọn
let matchGameMistakes = 0;
let matchGameStartedAt = 0;
let matchGameFinishedAt = null;
let matchGameTimerHandle = null; // id của setInterval đồng hồ, dọn dẹp khi rời màn chơi

const $app = document.getElementById('app');

// Long-pressing cards/buttons shouldn't trigger the OS text-selection
// handles or the "Search Google for..." context menu — only real text
// fields (typing a card's front/back, etc.) should still get that.
document.addEventListener('contextmenu', (e)=>{
  const tag = e.target.tagName;
  if(tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
});

/* 02-du-lieu-luu-tru.js — Hàm tiện ích nhỏ (uid, định dạng ngày giờ) + lưu/đọc dữ liệu bằng IndexedDB + các hàm truy vấn bộ thẻ (subjectById, childSubjects, dueCards...)
   (Phần 160-278 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
// Toàn bộ thẻ trong 1 bộ + các bộ thẻ phụ bên trong nó, KHÔNG lọc theo hạn ôn
// — dùng cho trò chơi Ghép thẻ (luyện tự do, không theo lịch ôn tập).
function subjectCards(subjectId){
  if(!subjectId) return DATA.cards.slice();
  const set = new Set(subtreeIds(subjectId));
  return DATA.cards.filter(c => set.has(c.subjectId));
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
  DATA.subjects.forEach(s=>{
    if(s.parentId===undefined) s.parentId = null;
    if(s.countdownEnabled===undefined) s.countdownEnabled = false;
    if(!s.countdownSeconds) s.countdownSeconds = 15;
  });
}
// Same idea for progress — fills in the field with sane defaults for data
// saved before the streak/XP/huy hiệu feature existed.
function normalizeProgress(){
  DATA.progress = Object.assign({}, DEFAULT_PROGRESS, DATA.progress || {});
  if(!Array.isArray(DATA.progress.badges)) DATA.progress.badges = [];
}

/* 03-thuat-toan-on-tap.js — Thuật toán ôn tập ngắt quãng (grade), tính XP/cấp độ, chuỗi ngày streak, huy hiệu, và hàm toast() hiện thông báo nhỏ ở góc màn hình
   (Phần 279-424 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
  if(fileImportOpen) $app.appendChild(renderFileImportModal());
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

/* 06-cong-thuc-toan.js — Cloze (điền vào chỗ trống) + các hàm tiện ích nhỏ dùng chung (person label, định dạng ngày giờ...)
   (Phần 765-1025 của app.js gốc, tách ra để dễ tìm & dễ sửa — đã bỏ phần soạn công thức toán học theo yêu cầu, giữ lại renderMathIn() phòng khi có thẻ cũ còn chứa $...$.) */

/* ---------------- Công thức toán học (KaTeX) — không còn ô soạn riêng nữa,
   chỉ giữ hàm vẽ này để các thẻ CŨ (nếu có) từng chứa $...$ vẫn hiển thị
   đúng. Không có gì trong giao diện soạn thẻ tạo ra $...$ mới nữa. */
function renderMathIn(el){
  if(!el || typeof window.renderMathInElement !== 'function') return;
  try{
    window.renderMathInElement(el, {
      delimiters: [
        {left:'$$', right:'$$', display:true},
        {left:'\\[', right:'\\]', display:true},
        {left:'$', right:'$', display:false},
        {left:'\\(', right:'\\)', display:false}
      ],
      throwOnError:false,
      ignoredTags:['script','noscript','style','textarea','pre']
    });
  }catch(e){ /* đừng để lỗi vẽ công thức làm hỏng cả giao diện */ }
}

/* ---------------- Điền vào chỗ trống (Cloze) ----------------
   Bôi đen 1 từ/cụm từ trong câu rồi bấm "🕳 Ẩn từ" sẽ đánh dấu nó thành 1
   chỗ trống có số thứ tự (c1, c2, ...). Khi lưu, MỖI chỗ trống trở thành
   1 thẻ ôn tập RIÊNG (giống Anki): thẻ đó ẩn đúng từ của nó, còn các chỗ
   trống khác trong cùng câu vẫn hiện chữ bình thường (làm ngữ cảnh). Cách
   này buộc não phải "nhớ ra" thay vì chỉ "nhận ra" — hiệu quả ghi nhớ cao
   hơn hẳn so với lật thẻ thông thường. Được lưu ngay trong chuỗi văn bản
   bằng cú pháp {{c1::từ bị ẩn}}. */
function nextClozeIndex(text){
  const indices = clozeIndicesOf(text);
  return indices.length ? Math.max(...indices) + 1 : 1;
}
// field ở đây là 1 <textarea> thường — dùng selectionStart/selectionEnd
// (API chuẩn của textarea) nên hoạt động ổn định trên mọi trình duyệt/điện thoại.
function wrapSelectionAsCloze(field){
  const start = field.selectionStart, end = field.selectionEnd;
  if(start === end){
    toast('Hãy bôi đen từ/cụm từ cần ẩn trước, rồi bấm nút này');
    return;
  }
  const selected = field.value.slice(start, end);
  if(!selected.trim()){
    toast('Hãy bôi đen từ/cụm từ cần ẩn trước, rồi bấm nút này');
    return;
  }
  const snippet = '{{c' + nextClozeIndex(field.value) + '::' + selected + '}}';
  field.value = field.value.slice(0, start) + snippet + field.value.slice(end);
  const cursor = start + snippet.length;
  field.focus();
  field.setSelectionRange(cursor, cursor);
}

// Tách 1 chuỗi có chứa {{cN::đáp án}} thành từng đoạn — dùng chung cho mọi
// nơi cần hiện/ẩn chỗ trống (ôn tập, danh sách quản lý, trò chơi ghép thẻ...).
function parseClozeParts(text){
  const parts = [];
  const re = /\{\{c(\d+)::([\s\S]*?)\}\}/g;
  let last = 0, m;
  while((m = re.exec(text||''))){
    if(m.index > last) parts.push({type:'text', value:text.slice(last, m.index)});
    parts.push({type:'cloze', index: parseInt(m[1],10), answer: m[2]});
    last = re.lastIndex;
  }
  if(last < (text||'').length) parts.push({type:'text', value:text.slice(last)});
  return parts;
}
// Các số thứ tự chỗ trống có trong 1 câu (không trùng lặp, tăng dần).
function clozeIndicesOf(text){
  const set = new Set();
  parseClozeParts(text).forEach(p=>{ if(p.type==='cloze') set.add(p.index); });
  return Array.from(set).sort((a,b)=>a-b);
}
// Đáp án (chữ bị ẩn) của đúng 1 số thứ tự cụ thể trong câu.
function clozeAnswerAt(text, idx){
  const found = parseClozeParts(text).find(p=>p.type==='cloze' && p.index===idx);
  return found ? found.answer : '';
}
// Dựng HTML để hiện câu cloze: chỗ trống mang đúng số idx thì ẩn đi (hoặc
// hiện đáp án có tô đậm nếu revealTarget=true), các chỗ trống KHÁC trong
// cùng câu luôn hiện chữ thật (làm ngữ cảnh, không phải thứ đang được hỏi).
function clozeDisplayHtml(text, idx, revealTarget){
  return parseClozeParts(text).map(p=>{
    if(p.type==='text') return escapeHtml(p.value);
    if(p.index === idx){
      return revealTarget
        ? `<mark class="cloze-answer">${escapeHtml(p.answer)}</mark>`
        : `<span class="cloze-gap">[...]</span>`;
    }
    return escapeHtml(p.answer);
  }).join('');
}
// Bản chữ thường (không HTML) của câu hỏi, dùng làm nhãn nút trong trò
// chơi Ghép thẻ — chỗ trống đang hỏi hiện thành "_____", chỗ khác hiện chữ thật.
function clozeQuestionPlainText(text, idx){
  return parseClozeParts(text).map(p=>{
    if(p.type==='text') return p.value;
    return p.index===idx ? '_____' : p.answer;
  }).join('').trim();
}

// Chuẩn hoá 1 chuỗi để so khớp khi chấm "Gõ đáp án"/trắc nghiệm — viết
// thường, gộp khoảng trắng thừa, bỏ khoảng trắng 2 đầu.
function normalizeForCompare(s){
  return (s||'')
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}
// Đáp án "đúng" của 1 thẻ, dùng cho cả chế độ Gõ đáp án và Trắc nghiệm nhanh.
function correctAnswerText(card){
  return (card.type==='cloze') ? clozeAnswerAt(card.front, card.clozeIndex) : card.back;
}

// Xây 1 ô nhập nội dung thẻ: 1 <textarea> gõ chữ bình thường, không có
// thanh công cụ gì thêm — trừ khi opts.clozeButton=true thì có thêm đúng
// 1 nút "🕳 Ẩn từ" để đánh dấu chỗ trống (dùng cho thẻ kiểu Điền từ).
function buildCardTextarea(fieldId, placeholder, opts){
  opts = opts || {};
  const wrap = document.createElement('div');

  const field = document.createElement('textarea');
  field.id = fieldId;
  field.className = 'card-input';
  field.placeholder = placeholder || '';
  field.rows = 3;

  if(opts.clozeButton){
    const toolbar = document.createElement('div');
    toolbar.className = 'math-toolbar';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'math-btn math-btn-cloze math-btn-wide';
    btn.textContent = '🕳 Ẩn từ';
    btn.title = 'Bôi đen từ/cụm từ cần ẩn rồi bấm nút này';
    // preventDefault ở mousedown để ô nhập không bị mất focus/vị trí con
    // trỏ trước khi kịp đánh dấu chỗ trống.
    btn.onmousedown = (e)=> e.preventDefault();
    btn.onclick = (e)=>{ e.preventDefault(); wrapSelectionAsCloze(field); };
    toolbar.appendChild(btn);
    wrap.appendChild(toolbar);
  }

  wrap.appendChild(field);
  return {wrap, field};
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


/* 07-them-the-va-bo-the.js — Màn hình Thêm thẻ, modal Tạo/Đổi tên bộ thẻ, modal Xoá bộ thẻ, modal Xoá thẻ
   (Phần 1026-1322 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
    subjectModalCountdownEnabled = false;
    subjectModalCountdownSeconds = 15;
    subjectModalOpen = true;
    render();
  };
  picker.appendChild(newChip);
  fSub.appendChild(picker);
  main.appendChild(fSub);

  // Loại thẻ: Lật thẻ (mặc định) hay Điền từ (cloze)
  const fType = document.createElement('div');
  fType.className = 'field';
  fType.innerHTML = `<label>Loại thẻ</label>`;
  const typeToggle = document.createElement('div');
  typeToggle.className = 'card-type-toggle';
  const typeBtns = [
    {id:'basic', label:'🔄 Lật thẻ'},
    {id:'cloze', label:'🕳 Điền từ'},
  ];
  typeBtns.forEach(t=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-type-btn' + (addCardType===t.id ? ' active' : '');
    btn.textContent = t.label;
    btn.onclick = ()=>{ addCardType = t.id; render(); };
    typeToggle.appendChild(btn);
  });
  fType.appendChild(typeToggle);
  main.appendChild(fType);

  if(addCardType === 'cloze'){
    const fCloze = document.createElement('div');
    fCloze.className = 'field';
    fCloze.innerHTML = `<label>Câu văn — bôi đen từ/cụm từ cần ẩn rồi bấm "🕳 Ẩn từ"</label>`;
    main.appendChild(fCloze);
    const clozeBuilt = buildCardTextarea('clozeInput', 'Ví dụ: Nước sôi ở 100 độ C.', {clozeButton:true});
    fCloze.appendChild(clozeBuilt.wrap);
    const clozeHint = document.createElement('p');
    clozeHint.style.cssText = 'color:var(--ink-faint); font-size:12px; margin:8px 2px 0; line-height:1.5;';
    clozeHint.textContent = 'Mỗi chỗ đã ẩn sẽ trở thành 1 thẻ ôn tập riêng — bấm vào 1 chỗ đã ẩn để bỏ đánh dấu nếu lỡ tay.';
    main.appendChild(clozeHint);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Lưu thẻ điền từ';
    saveBtn.onclick = async ()=>{
      const field = document.getElementById('clozeInput');
      const text = field.value.trim();
      if(!addSubjectChoice){ toast('Hãy chọn hoặc tạo một bộ thẻ'); return; }
      const indices = clozeIndicesOf(text);
      if(!text || indices.length===0){
        toast('Hãy bôi đen ít nhất 1 từ/cụm từ để ẩn trước khi lưu');
        return;
      }
      indices.forEach(idx=>{
        DATA.cards.push({id:uid(), subjectId:addSubjectChoice, type:'cloze', front:text, back:'', clozeIndex:idx, ease:2.5, interval:0, reps:0, due:Date.now()});
      });
      await saveData();
      toast(indices.length>1 ? `Đã lưu ${indices.length} thẻ điền từ ✓` : 'Đã lưu thẻ điền từ ✓');
      render();
    };
    main.appendChild(saveBtn);

    wrap.appendChild(main);
    return wrap;
  }

  // front field
  const fFront = document.createElement('div');
  fFront.className='field';
  fFront.innerHTML = `<label>Mặt trước — Câu hỏi / công thức</label>`;
  main.appendChild(fFront);
  const frontBuilt = buildCardTextarea('frontInput', 'Ví dụ: Định luật II Newton là gì?');
  fFront.appendChild(frontBuilt.wrap);

  const fBack = document.createElement('div');
  fBack.className='field';
  fBack.innerHTML = `<label>Mặt sau — Đáp án / giải thích</label>`;
  main.appendChild(fBack);
  const backBuilt = buildCardTextarea('backInput', 'Ví dụ: F = m.a  (Lực = khối lượng × gia tốc)');
  fBack.appendChild(backBuilt.wrap);

  const saveBtn = document.createElement('button');
  saveBtn.className='save-btn';
  saveBtn.textContent = 'Lưu thẻ';
  saveBtn.onclick = async ()=>{
    const front = document.getElementById('frontInput').value.trim();
    const back = document.getElementById('backInput').value.trim();
    if(!addSubjectChoice){ toast('Hãy chọn hoặc tạo một bộ thẻ'); return; }
    if(!front || !back){ toast('Hãy điền cả hai mặt của thẻ'); return; }
    DATA.cards.push({id:uid(), subjectId:addSubjectChoice, type:'basic', front, back, ease:2.5, interval:0, reps:0, due:Date.now()});
    await saveData();
    toast('Đã lưu thẻ ✓');
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
    <div class="field" style="margin-top:20px; margin-bottom:4px;">
      <label>Đếm ngược khi làm Trắc nghiệm nhanh</label>
    </div>
    <div class="toggle-row" id="countdownRow">
      <div class="tr-text">
        <div class="tr-title">⏱ Bật đếm ngược</div>
        <div class="tr-sub">Chỉ áp dụng cho Trắc nghiệm nhanh — Lật thẻ và Gõ đáp án không giới hạn giờ.</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="countdownCheckbox" ${subjectModalCountdownEnabled ? 'checked' : ''}>
        <span class="track"></span>
      </label>
    </div>
    <div class="field" id="countdownSecondsField" style="margin-top:12px; display:${subjectModalCountdownEnabled ? 'block' : 'none'};">
      <label>Số giây mỗi câu</label>
      <div class="color-picker" id="countdownSecondsPicker" style="gap:8px;"></div>
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

  const secondsField = card.querySelector('#countdownSecondsField');
  const secondsPicker = card.querySelector('#countdownSecondsPicker');
  [10, 15, 20, 30].forEach(sec=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (sec===subjectModalCountdownSeconds ? ' active' : '');
    btn.textContent = sec + 's';
    btn.onclick = ()=>{
      subjectModalCountdownSeconds = sec;
      secondsPicker.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    };
    secondsPicker.appendChild(btn);
  });

  card.querySelector('#countdownCheckbox').onchange = (e)=>{
    subjectModalCountdownEnabled = e.target.checked;
    secondsField.style.display = subjectModalCountdownEnabled ? 'block' : 'none';
  };

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
      if(s){
        s.name = name; s.color = subjectModalColor;
        s.countdownEnabled = subjectModalCountdownEnabled;
        s.countdownSeconds = subjectModalCountdownSeconds;
      }
      editSubjectId = null;
    } else {
      const s = {
        id:uid(), name, color: subjectModalColor, parentId: newSubjectParentId||null,
        countdownEnabled: subjectModalCountdownEnabled, countdownSeconds: subjectModalCountdownSeconds,
      };
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
    expandedSubjects.delete(id);
    saveExpandedSubjects();
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
      ${c.type==='cloze'
        ? `<div style="font-size:14px; font-weight:600; line-height:1.4;">${clozeDisplayHtml(c.front, c.clozeIndex, false)}</div>
           <div style="font-size:13px; color:var(--ink-faint); margin-top:6px; line-height:1.4;">Đáp án: ${escapeHtml(clozeAnswerAt(c.front, c.clozeIndex))}</div>`
        : `<div style="font-size:14px; font-weight:600; line-height:1.4;">${escapeHtml(c.front)}</div>
           <div style="font-size:13px; color:var(--ink-faint); margin-top:6px; line-height:1.4;">${escapeHtml(c.back)}</div>`}
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

/* 08-hen-gio-va-on-tap.js — Modal chọn giờ (dùng cho giờ nhắc nhở) và toàn bộ màn hình Ôn tập (lật thẻ, chấm điểm, hoàn tác)
   (Phần 1323-1589 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
  resetAnswerInputState();
  setView('review');
}

// Xoá sạch trạng thái "đang gõ / đang chọn trắc nghiệm" của thẻ hiện tại —
// gọi mỗi khi chuyển sang thẻ khác (tiến hoặc hoàn tác) để thẻ mới luôn
// bắt đầu từ đầu, không dính trạng thái của thẻ trước.
function resetAnswerInputState(){
  typedAnswerValue = '';
  typedAnswerChecked = false;
  typedAnswerCorrect = false;
  quizCurrentCardId = null;
  quizCurrentChoices = [];
  quizSelectedChoice = null;
  quizIsCorrect = false;
  stopQuizCountdown();
}

// Đồng hồ đếm ngược cho chế độ Trắc nghiệm nhanh — chỉ chạy khi bộ thẻ
// của thẻ đang ôn có bật "Đếm ngược" (đặt trong modal Tạo/Đổi bộ thẻ).
// Hết giờ mà chưa chọn đáp án nào thì coi như trả lời sai, tự lật thẻ.
function stopQuizCountdown(){
  if(quizCountdownHandle){ clearInterval(quizCountdownHandle); quizCountdownHandle = null; }
  quizCountdownRemaining = null;
  quizCountdownCardId = null;
}
function startQuizCountdownIfNeeded(card){
  const subj = subjectById(card.subjectId);
  if(!subj || !subj.countdownEnabled){ stopQuizCountdown(); return; }
  if(quizCountdownCardId === card.id) return; // đã chạy cho đúng thẻ này rồi
  stopQuizCountdown();
  quizCountdownCardId = card.id;
  quizCountdownRemaining = subj.countdownSeconds || 15;
  quizCountdownHandle = setInterval(()=>{
    quizCountdownRemaining -= 1;
    if(quizCountdownRemaining <= 0){
      stopQuizCountdown();
      // Hết giờ — coi như chưa trả lời được, tự lật thẻ hiện đáp án đúng.
      quizSelectedChoice = null;
      quizIsCorrect = false;
      flipped = true;
      render();
      return;
    }
    // Chỉ cập nhật đúng con số hiện trên màn hình, không vẽ lại cả trang
    // để khỏi giật giao diện mỗi giây.
    const el = document.getElementById('quizCountdownDisplay');
    if(el){
      el.textContent = '⏱ ' + quizCountdownRemaining + 's';
      el.classList.toggle('low', quizCountdownRemaining <= 5);
    }
  }, 1000);
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
  resetAnswerInputState();
  saveData();
  render();
}

// Sinh 3 phương án nhiễu (khác đáp án đúng) cho chế độ Trắc nghiệm nhanh —
// ưu tiên lấy từ các thẻ khác CÙNG bộ thẻ trước để các lựa chọn hợp lý về
// mặt ngữ nghĩa, thiếu thì lấy thêm từ toàn bộ dữ liệu.
function buildQuizChoices(card){
  const correct = correctAnswerText(card);
  function answerPool(list){
    return list
      .filter(c=>c.id!==card.id)
      .map(c=> correctAnswerText(c))
      .map(s=>(s||'').trim())
      .filter(s=> s && normalizeForCompare(s)!==normalizeForCompare(correct));
  }
  function pickUnique(arr, n, alreadyUsed){
    const seen = new Set(alreadyUsed.map(normalizeForCompare));
    const out = [];
    const shuffled = arr.slice().sort(()=>Math.random()-0.5);
    for(const s of shuffled){
      const key = normalizeForCompare(s);
      if(seen.has(key)) continue;
      seen.add(key); out.push(s);
      if(out.length>=n) break;
    }
    return out;
  }
  const sameSubjectPool = answerPool(DATA.cards.filter(c=>c.subjectId===card.subjectId));
  let distractors = pickUnique(sameSubjectPool, 3, [correct]);
  if(distractors.length < 3){
    distractors = distractors.concat(pickUnique(answerPool(DATA.cards), 3-distractors.length, [correct, ...distractors]));
  }
  const choices = [correct, ...distractors];
  for(let i=choices.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [choices[i],choices[j]]=[choices[j],choices[i]]; }
  return choices;
}

function checkTypedAnswer(){
  const input = document.getElementById('typedAnswerInput');
  typedAnswerValue = input ? input.value : '';
  const card = reviewQueue[reviewIdx];
  const correct = correctAnswerText(card);
  typedAnswerCorrect = !!typedAnswerValue.trim() && normalizeForCompare(typedAnswerValue) === normalizeForCompare(correct);
  typedAnswerChecked = true;
  flipped = true;
  render();
}

function selectQuizChoice(choice){
  const card = reviewQueue[reviewIdx];
  stopQuizCountdown();
  quizSelectedChoice = choice;
  quizIsCorrect = normalizeForCompare(choice) === normalizeForCompare(correctAnswerText(card));
  flipped = true;
  render();
}

function renderReview(){
  const wrap = document.createElement('div');
  wrap.className='review-wrap';

  if(reviewQueue.length===0 || reviewIdx >= reviewQueue.length){
    stopQuizCountdown();
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
  const cardType = card.type || 'basic';

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
  topbar.querySelector('.review-back').onclick = ()=>{ stopQuizCountdown(); setView('home'); };
  topbar.querySelector('.review-undo').onclick = ()=> undoReview();
  topbar.querySelector('.review-menu-btn').onclick = (e)=>{ e.stopPropagation(); reviewMenuOpen = !reviewMenuOpen; render(); };
  wrap.appendChild(topbar);

  if(reviewMenuOpen){
    const menu = document.createElement('div');
    menu.className = 'review-menu';
    const modes = [
      {id:'flip', icon:'🔄', label:'Lật thẻ'},
      {id:'type', icon:'⌨️', label:'Gõ đáp án'},
      {id:'quiz', icon:'🧠', label:'Trắc nghiệm'},
    ];
    menu.innerHTML = modes.map(m=>
      `<button class="review-menu-item" data-mode="${m.id}">${m.icon} ${m.label} ${reviewInputMode===m.id?'✓':''}</button>`
    ).join('') + `
      <button class="review-menu-item" id="shuffleReviewBtn">🔀 Xáo trộn thẻ còn lại</button>
      <button class="review-menu-item" id="endReviewBtn">✕ Kết thúc phiên</button>
    `;
    menu.querySelectorAll('[data-mode]').forEach(btn=>{
      btn.onclick = ()=>{
        setReviewInputMode(btn.dataset.mode);
        reviewMenuOpen = false;
        flipped = false;
        resetAnswerInputState();
        render();
      };
    });
    menu.querySelector('#shuffleReviewBtn').onclick = ()=>{
      const head = reviewQueue.slice(0, reviewIdx);
      const tail = reviewQueue.slice(reviewIdx);
      for(let i=tail.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tail[i],tail[j]]=[tail[j],tail[i]]; }
      reviewQueue = head.concat(tail);
      reviewMenuOpen = false;
      render();
    };
    menu.querySelector('#endReviewBtn').onclick = ()=>{ reviewMenuOpen=false; stopQuizCountdown(); setView('home'); };
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
  const questionHtml = cardType==='cloze' ? clozeDisplayHtml(card.front, card.clozeIndex, false) : escapeHtml(card.front);
  const answerHtml = flipped
    ? (cardType==='cloze' ? escapeHtml(clozeAnswerAt(card.front, card.clozeIndex)) : escapeHtml(card.back))
    : '';
  fc.innerHTML = `
    <div class="content">${questionHtml}</div>
    ${flipped ? `<hr class="answer-divider"><div class="answer">${answerHtml}</div>` : ''}
  `;
  stage.appendChild(fc);
  wrap.appendChild(stage);

  if(!flipped){
    if(reviewInputMode==='type'){
      const box = document.createElement('div');
      box.className = 'type-answer-box';
      box.innerHTML = `
        <input type="text" id="typedAnswerInput" class="type-answer-input" placeholder="Gõ đáp án của bạn..." autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="reveal-btn type-answer-check">Kiểm tra</button>
      `;
      box.querySelector('.type-answer-check').onclick = ()=> checkTypedAnswer();
      box.querySelector('#typedAnswerInput').onkeydown = (e)=>{ if(e.key==='Enter') checkTypedAnswer(); };
      wrap.appendChild(box);
      requestAnimationFrame(()=>{ const el = document.getElementById('typedAnswerInput'); if(el) el.focus(); });
    } else if(reviewInputMode==='quiz'){
      if(quizCurrentCardId !== card.id){
        quizCurrentChoices = buildQuizChoices(card);
        quizCurrentCardId = card.id;
        quizSelectedChoice = null;
      }
      if(quizCurrentChoices.length < 2){
        stopQuizCountdown();
        const note = document.createElement('p');
        note.style.cssText = 'text-align:center; color:var(--ink-faint); font-size:12.5px; margin:0 16px 10px;';
        note.textContent = 'Chưa đủ thẻ khác để ra trắc nghiệm — hiện đáp án như bình thường nhé.';
        wrap.appendChild(note);
        const revealBtn = document.createElement('button');
        revealBtn.className = 'reveal-btn';
        revealBtn.textContent = 'Hiện đáp án';
        revealBtn.onclick = ()=>{ flipped = true; render(); };
        wrap.appendChild(revealBtn);
      } else {
        startQuizCountdownIfNeeded(card);
        if(quizCountdownRemaining !== null){
          const cd = document.createElement('div');
          cd.id = 'quizCountdownDisplay';
          cd.className = 'quiz-countdown' + (quizCountdownRemaining<=5 ? ' low' : '');
          cd.textContent = '⏱ ' + quizCountdownRemaining + 's';
          wrap.appendChild(cd);
        }
        const choicesEl = document.createElement('div');
        choicesEl.className = 'quiz-choices';
        quizCurrentChoices.forEach(choice=>{
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quiz-choice';
          btn.innerHTML = escapeHtml(choice);
          btn.onclick = ()=> selectQuizChoice(choice);
          choicesEl.appendChild(btn);
        });
        wrap.appendChild(choicesEl);
      }
    } else {
      const revealBtn = document.createElement('button');
      revealBtn.className = 'reveal-btn';
      revealBtn.textContent = 'Hiện đáp án';
      revealBtn.onclick = ()=>{ flipped = true; render(); };
      wrap.appendChild(revealBtn);
    }
  } else {
    if(reviewInputMode==='type' && typedAnswerChecked){
      const feedback = document.createElement('div');
      feedback.className = 'type-feedback ' + (typedAnswerCorrect ? 'correct' : 'wrong');
      feedback.textContent = typedAnswerCorrect
        ? '✓ Chính xác!'
        : (typedAnswerValue.trim() ? `✗ Chưa đúng — bạn đã gõ: "${typedAnswerValue.trim()}"` : '✗ Bạn chưa gõ gì cả');
      wrap.insertBefore(feedback, wrap.querySelector('.card-stage').nextSibling);
    } else if(reviewInputMode==='quiz' && quizCurrentChoices.length>=2){
      const choicesEl = document.createElement('div');
      choicesEl.className = 'quiz-choices answered';
      const correct = correctAnswerText(card);
      quizCurrentChoices.forEach(choice=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.disabled = true;
        const isCorrectChoice = normalizeForCompare(choice)===normalizeForCompare(correct);
        const isChosen = choice === quizSelectedChoice;
        btn.className = 'quiz-choice' + (isCorrectChoice ? ' correct' : '') + (isChosen && !isCorrectChoice ? ' wrong' : '');
        btn.innerHTML = escapeHtml(choice) + (isCorrectChoice ? ' ✓' : (isChosen ? ' ✗' : ''));
        choicesEl.appendChild(btn);
      });
      wrap.insertBefore(choicesEl, wrap.querySelector('.card-stage').nextSibling);
      if(quizSelectedChoice === null){
        const timeout = document.createElement('div');
        timeout.className = 'type-feedback wrong';
        timeout.textContent = '⏱ Hết giờ — chưa kịp chọn đáp án';
        wrap.insertBefore(timeout, choicesEl);
      }
    }

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
        resetAnswerInputState();
        render();
      };
    });
    wrap.appendChild(row);
  }

  return wrap;
}
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
    const isCloze = c.type==='cloze';
    item.innerHTML = `
      <div class="mi-top">
        <div>
          <span class="subject-dot" style="background:${s?s.color:'#888'};display:inline-block;margin-right:6px;"></span>
          <span style="font-size:11px;color:var(--ink-faint)">${s?escapeHtml(s.name):''}${isCloze ? ' · 🕳 Điền từ' : ''}</span>
          <div class="mi-front">${isCloze ? clozeDisplayHtml(c.front, c.clozeIndex, false) : escapeHtml(c.front)}</div>
          <div class="mi-back">${isCloze ? 'Đáp án: '+escapeHtml(clozeAnswerAt(c.front, c.clozeIndex)) : escapeHtml(c.back)}</div>
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

/* 12-api-tai-khoan-dong-bo.js — Các hàm gọi máy chủ: xin quyền thông báo, đăng nhập/đăng ký, đồng bộ dữ liệu (đẩy/kéo), đăng xuất, và các hàm API cho lớp học (tạo/tham gia/rời/xoá lớp)
   (Phần 2183-2493 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
  loadNotifications();
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
  submissionDetailOpen = null;
  essayGradeOpen = null;
  studentTestListClassroom = null;
  studentTests = [];
  studentTestDetailOpen = null;
  testReviewOpen = false;
  NOTIFICATIONS = [];
  notificationsUnreadCount = 0;
  notificationsPanelOpen = false;
  notificationsLoadedOnce = false;
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

/* 15-quan-ly-bai-kiem-tra.js — Giáo viên: mở/đóng trang quản lý bài kiểm tra của 1 lớp, tạo/xoá/đổi tên bài kiểm tra, tạo/sửa/xoá câu hỏi, nén & tải ảnh câu hỏi lên
   (Phần 3027-3244 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
  submissionDetailOpen = null;
  essayGradeOpen = null;
  render();
}

async function fetchTests(classroomId){
  const res = await authorizedGet('/tests/list?classroomId=' + encodeURIComponent(classroomId));
  return res.tests || [];
}

async function createTest(title, testType){
  title = (title||'').trim();
  testType = testType==='essay' ? 'essay' : 'mcq';
  if(!title){ testError = 'Nhập tên bài kiểm tra'; render(); return; }
  testBusy = true; testError = ''; render();
  try{
    const res = await authorizedRequest('/tests/create', { classroomId: testManagerClassroom.id, title, testType });
    TESTS = [{ id:res.id, title:res.title, questionCount:0, createdAt:res.createdAt, updatedAt:res.updatedAt, testType:res.testType, published:false, hasAttachment:false }, ...TESTS];
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
    detail._timeLimitDraftOn = !!detail.timeLimitMinutes;  // UI-only flag, not sent to server
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
  if(type==='essay') return { rubric:'' };
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

async function compressImageFile(file, maxDim, quality){
  maxDim = maxDim || 1000;
  quality = quality || 0.8;
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
  let width = img.width, height = img.height;
  if(width > maxDim || height > maxDim){
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width*scale);
    height = Math.round(height*scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const outDataUrl = canvas.toDataURL(outMime, quality);
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
  } else if(q.type==='essay'){
    q.data.rubric = (q.data.rubric||'').trim();
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

/* 16-dan-nhap-cau-hoi.js — Dán nhanh nhiều câu trắc nghiệm cùng lúc (bulk import) và giao diện trang quản lý bài kiểm tra (danh sách câu hỏi)
   (Phần 3245-3537 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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

  const typeField = document.createElement('div');
  typeField.className = 'field';
  typeField.style.marginBottom = '10px';
  typeField.innerHTML = `<label>Loại bài kiểm tra sắp tạo</label>`;
  const typeRow = document.createElement('div');
  typeRow.style.display = 'flex'; typeRow.style.gap = '8px';
  [['mcq','📝 Trắc nghiệm'],['essay','✍️ Tự luận']].forEach(([val,label])=>{
    const b = document.createElement('button');
    b.type='button'; b.textContent=label;
    b.style.flex='1'; b.style.padding='10px'; b.style.borderRadius='9px'; b.style.fontSize='13px'; b.style.fontWeight='600';
    const active = newTestType===val;
    b.style.border = active ? '1px solid var(--teal)' : '1px solid var(--line)';
    b.style.background = active ? 'var(--teal)' : 'var(--bg-elev)';
    b.style.color = active ? 'var(--bg)' : 'var(--white)';
    b.onclick = ()=>{ newTestType = val; render(); };
    typeRow.appendChild(b);
  });
  typeField.appendChild(typeRow);
  main.appendChild(typeField);

  const typeHint = document.createElement('div');
  typeHint.className = 'tr-sub'; typeHint.style.marginBottom = '10px';
  typeHint.textContent = newTestType==='essay'
    ? 'Bài tự luận: học sinh xem đề bạn tải lên, chụp ảnh bài làm để nộp — bạn chấm Đạt/Chưa đạt, không cộng điểm số.'
    : 'Bài trắc nghiệm: gồm câu trắc nghiệm, đúng/sai, trả lời ngắn — chấm điểm tự động.';
  main.appendChild(typeHint);

  const formRow = document.createElement('div');
  formRow.style.display='flex'; formRow.style.gap='8px'; formRow.style.marginBottom='16px';
  const input = document.createElement('input');
  input.type='text'; input.placeholder='Tên bài kiểm tra, ví dụ: Kiểm tra 15 phút - Chương 1';
  input.style.flex='1'; input.style.background='var(--bg-elev)'; input.style.border='1px solid var(--line)';
  input.style.color='var(--white)'; input.style.borderRadius='10px'; input.style.padding='11px 12px'; input.style.fontSize='14px';
  input.onkeydown = (e)=>{ if(e.key==='Enter') createTest(input.value, newTestType); };
  const btn = document.createElement('button');
  btn.className='save-btn'; btn.style.width='auto'; btn.style.margin='0'; btn.style.padding='11px 16px'; btn.style.fontSize='14px';
  btn.textContent = testBusy ? '…' : '+ Tạo';
  btn.disabled = testBusy;
  btn.onclick = ()=> createTest(input.value, newTestType);
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
    icon.textContent = t.testType==='essay' ? '✍️' : '📝';

    const info = document.createElement('div');
    info.className = 'test-info';
    info.innerHTML = `
      <div class="test-title">${escapeHtml(t.title)}</div>
      <div class="test-meta">${t.testType==='essay' ? 'Tự luận · ' : ''}${t.questionCount} câu hỏi</div>
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

/* 17-soan-bai-kiem-tra.js — Giao diện soạn 1 bài kiểm tra chi tiết: sửa từng câu hỏi (trắc nghiệm/đúng-sai/trả lời ngắn/tự luận), và modal xác nhận xoá bài/câu hỏi
   (Phần 3538-4111 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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

  // --- giới hạn thời gian làm bài: học sinh bấm vào làm là đồng hồ đếm
  // ngược bắt đầu chạy, hết giờ tự động nộp bài luôn, không cần xác nhận ---
  const timeLimitLabel = document.createElement('div');
  timeLimitLabel.className = 'tr-sub';
  timeLimitLabel.style.fontWeight = '600';
  timeLimitLabel.style.margin = '2px 0 -2px';
  timeLimitLabel.textContent = 'Giới hạn thời gian làm bài';
  publishBox.appendChild(timeLimitLabel);

  const timeLimitRow = document.createElement('div');
  timeLimitRow.style.display = 'flex'; timeLimitRow.style.gap = '8px';
  [[false,'Không giới hạn'],[true,'Có giới hạn']].forEach(([wantsLimit,label])=>{
    const b = document.createElement('button');
    b.type='button'; b.textContent=label;
    b.style.flex='1'; b.style.padding='9px'; b.style.borderRadius='9px'; b.style.fontSize='12.5px'; b.style.fontWeight='600';
    const active = !!testEditorOpen._timeLimitDraftOn === wantsLimit;
    b.style.border = active ? '1px solid var(--coral)' : '1px solid var(--line)';
    b.style.background = active ? 'var(--coral)' : 'var(--bg-elev)';
    b.style.color = active ? 'var(--bg)' : 'var(--white)';
    b.disabled = publishBusy;
    b.onclick = ()=>{
      if(wantsLimit){
        testEditorOpen._timeLimitDraftOn = true;
        render();
      } else {
        testEditorOpen._timeLimitDraftOn = false;
        publishTest(!!testEditorOpen.published, testEditorOpen.maxAttempts, undefined, null);
      }
    };
    timeLimitRow.appendChild(b);
  });
  publishBox.appendChild(timeLimitRow);

  if(testEditorOpen._timeLimitDraftOn){
    const tlField = document.createElement('div');
    tlField.style.display = 'flex'; tlField.style.flexWrap = 'wrap'; tlField.style.gap = '8px';
    [15, 30, 45, 60, 90].forEach(mins=>{
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (testEditorOpen.timeLimitMinutes===mins ? ' active' : '');
      chip.textContent = mins + ' phút';
      chip.disabled = publishBusy;
      chip.onclick = ()=> publishTest(!!testEditorOpen.published, testEditorOpen.maxAttempts, undefined, mins);
      tlField.appendChild(chip);
    });
    publishBox.appendChild(tlField);

    const tlHint = document.createElement('div');
    tlHint.className = 'tr-sub';
    tlHint.style.margin = '2px 0 0';
    tlHint.textContent = testEditorOpen.timeLimitMinutes
      ? `Học sinh bấm vào làm bài là đồng hồ ${testEditorOpen.timeLimitMinutes} phút bắt đầu chạy — hết giờ tự động nộp, không kịp làm tiếp.`
      : 'Chọn số phút ở trên.';
    publishBox.appendChild(tlHint);
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

  const isEssayTest = testEditorOpen.testType === 'essay';
  const attachAccept = isEssayTest ? '.pdf,.doc,.docx,image/*' : '.pdf,.doc,.docx';

  const attachLabel = document.createElement('div');
  attachLabel.className = 'tr-sub';
  attachLabel.style.fontWeight = '600';
  attachLabel.textContent = isEssayTest ? '📎 Đề bài (ảnh/PDF/Word)' : '📎 Tệp đề bài (PDF/Word)';
  attachBox.appendChild(attachLabel);

  const attachHint = document.createElement('div');
  attachHint.className = 'tr-sub';
  attachHint.textContent = isEssayTest
    ? 'Học sinh sẽ xem/tải đề này về làm ra giấy, sau đó chụp ảnh bài làm để nộp ở từng câu bên dưới.'
    : 'Học sinh sẽ tải tệp này về làm trước, sau đó vào phần trắc nghiệm bên dưới để nộp đáp án.';
  attachBox.appendChild(attachHint);

  if(testEditorOpen.attachmentName){
    const fileRow = document.createElement('div');
    fileRow.style.display = 'flex'; fileRow.style.alignItems = 'center'; fileRow.style.gap = '10px';
    fileRow.style.background = 'var(--bg)'; fileRow.style.border = '1px solid var(--line)';
    fileRow.style.borderRadius = '10px'; fileRow.style.padding = '10px 12px';

    const attachMime = testEditorOpen.attachmentMime || '';
    const isPdf = attachMime.includes('pdf');
    const isImage = attachMime.startsWith('image/');
    if(isImage && testEditorOpen.attachmentData){
      const thumb = document.createElement('img');
      thumb.src = testEditorOpen.attachmentData;
      thumb.style.width = '32px'; thumb.style.height = '32px'; thumb.style.objectFit = 'cover'; thumb.style.borderRadius = '6px'; thumb.style.flexShrink = '0';
      fileRow.appendChild(thumb);
    } else {
      const icon = document.createElement('div');
      icon.style.fontSize = '20px'; icon.textContent = isPdf ? '📕' : '📄';
      fileRow.appendChild(icon);
    }

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
    replaceInput.type = 'file'; replaceInput.accept = attachAccept; replaceInput.style.display = 'none';
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
    uploadLabel.textContent = testAttachmentBusy ? 'Đang tải lên…' : (isEssayTest ? '📎 Tải lên đề bài (ảnh/PDF/Word)' : '📎 Tải lên đề bài (PDF/Word)');
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file'; uploadInput.accept = attachAccept; uploadInput.style.display = 'none';
    uploadInput.disabled = testAttachmentBusy;
    uploadInput.onchange = (e)=>{ const f = e.target.files[0]; if(f) uploadTestAttachment(f); e.target.value = ''; };
    uploadLabel.appendChild(uploadInput);
    attachBox.appendChild(uploadLabel);
  }

  main.appendChild(attachBox);

  if(testEditorOpen.questions.length===0){
    const e = document.createElement('div'); e.className='tr-sub'; e.style.marginBottom='6px';
    e.textContent = isEssayTest
      ? 'Chưa có câu hỏi nào — không bắt buộc phải thêm. Nếu để trống, học sinh sẽ có 1 khung nộp ảnh chung cho cả bài (giống nộp trực tiếp trên Azota).'
      : 'Chưa có câu hỏi nào.';
    main.appendChild(e);
  }

  if(!isEssayTest){
    const importLabel = document.createElement('label');
    importLabel.className = 'add-section-btn';
    importLabel.style.color = 'var(--amber)';
    importLabel.style.cursor = 'pointer';
    importLabel.textContent = '📎 Nhập đề từ file Word (tự động nhận diện)';
    const importInput = document.createElement('input');
    importInput.type = 'file'; importInput.accept = '.docx'; importInput.style.display = 'none';
    importInput.onchange = (e)=>{ const f = e.target.files[0]; if(f) handleFileImportPick(f); e.target.value = ''; };
    importLabel.appendChild(importInput);
    main.appendChild(importLabel);
    const importHint = document.createElement('div');
    importHint.className = 'tr-sub'; importHint.style.margin = '-10px 0 16px';
    importHint.textContent = 'Dùng cho file soạn theo khuôn "PHẦN I. Trắc nghiệm / PHẦN II. Đúng-Sai / PHẦN III. Trả lời ngắn" kèm đáp án "ĐA:...".';
    main.appendChild(importHint);
  }

  // Câu hỏi luôn được nhóm và hiển thị theo đúng thứ tự các phần cố định,
  // bất kể được tạo trước/sau — giáo viên bấm nút "+" trong từng phần để
  // thêm câu hỏi thuộc đúng phần đó. Một bài chỉ thuộc 1 loại (mcq hoặc
  // essay) nên chỉ hiển thị đúng nhóm phần tương ứng với loại đó.
  const SECTIONS = isEssayTest ? [
    ['essay', 'Câu hỏi tự luận (nộp ảnh, chấm Đạt/Chưa đạt)', '+ Thêm câu tự luận']
  ] : [
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

  const typeLabelMap = { mcq:'Trắc nghiệm', true_false:'Đúng / Sai', short_answer:'Trả lời ngắn', essay:'Tự luận' };
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
  } else if(q.type==='essay'){
    const fEs = document.createElement('div');
    fEs.className='field';
    fEs.innerHTML = `<label>Hướng dẫn chấm (không bắt buộc)</label>`;
    const hint = document.createElement('div');
    hint.className='tr-sub'; hint.style.marginBottom='8px';
    hint.textContent = 'Học sinh sẽ nộp bài bằng cách chụp/tải ảnh lên (có thể nhiều ảnh). Bạn chấm bằng cách khoanh/vẽ lên ảnh và đánh giá Đạt/Chưa đạt — không cộng vào điểm bài kiểm tra.';
    fEs.appendChild(hint);
    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.value = q.data.rubric || '';
    textarea.placeholder = 'Ví dụ: yêu cầu trình bày đủ 3 bước, ghi rõ đơn vị…';
    textarea.style.width='100%'; textarea.style.boxSizing='border-box'; textarea.style.background='var(--bg-elev)'; textarea.style.border='1px solid var(--line)';
    textarea.style.color='var(--white)'; textarea.style.borderRadius='9px'; textarea.style.padding='10px 11px'; textarea.style.fontSize='14px';
    textarea.oninput = ()=>{ q.data.rubric = textarea.value; };
    fEs.appendChild(textarea);
    main.appendChild(fEs);
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

/* 18-xem-de-bai-dinh-kem.js — Xem trước đề bài đính kèm (PDF/Word/ảnh) ngay trong app bằng pdf.js/mammoth.js, tải lên/xoá tệp đề bài, và giao bài (bật/tắt bản nháp)
   (Phần 4112-4462 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---- giao bài & xem điểm (giáo viên) ---- */
/* ---- Xem đề bài (PDF/Word) ngay trong app, không cần tải về ----
   PDF: KHÔNG dùng <iframe> nhúng PDF nữa — nhiều trình duyệt di động (đặc
   biệt app đã "Thêm vào màn hình chính" trên iPhone) không có sẵn khung xem
   PDF nhúng trong iframe, chỉ hiện màn hình trắng. Thay vào đó dùng pdf.js
   (thư viện mã nguồn mở của Mozilla) để tự vẽ từng trang ra <canvas> — cách
   này chạy được trên mọi trình duyệt/webview vì canvas là chuẩn web cơ bản.
   .docx: chuyển sang HTML để đọc ngay bằng thư viện mammoth.js.
   Cả 2 thư viện đều chạy hoàn toàn trên máy người dùng (không gửi file lên
   đâu cả), tải từ CDN đúng lúc cần, không tải sẵn để không làm nặng app lúc
   mở lần đầu.
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

let _pdfjsLoadPromise = null;
function ensurePdfJsLoaded(){
  if(window.pdfjsLib) return Promise.resolve();
  if(_pdfjsLoadPromise) return _pdfjsLoadPromise;
  _pdfjsLoadPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = ()=>{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      resolve();
    };
    s.onerror = ()=>{ _pdfjsLoadPromise = null; reject(new Error('Cần có mạng để mở trình xem PDF lần đầu')); };
    document.head.appendChild(s);
  });
  return _pdfjsLoadPromise;
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
  filePreviewOpen = {
    name: file.name, mime: file.mime, dataUrl: file.dataUrl, objectUrl: null,
    html: null, pages: [], totalPages: 0, truncated: false, loading: true, error: ''
  };
  render();

  if(file.mime === 'application/msword'){
    filePreviewOpen.loading = false;
    filePreviewOpen.error = 'Trình xem trong app chưa đọc được định dạng .doc cũ này. Hãy tải về máy để xem, hoặc nhờ giáo viên xuất lại dạng .docx hoặc PDF.';
    render();
    return;
  }

  // objectUrl chỉ dùng cho nút "Mở trong trình duyệt" dự phòng — không còn
  // dùng để nhúng iframe nữa.
  try{
    const resp = await fetch(file.dataUrl);
    const blob = await resp.blob();
    filePreviewOpen.objectUrl = URL.createObjectURL(blob);
  }catch(e){ /* vẫn còn dataUrl gốc để dùng tạm nếu bước này lỗi */ }

  if(file.mime === 'application/pdf'){
    try{
      await ensurePdfJsLoaded();
      const arrayBuffer = dataUrlToArrayBuffer(file.dataUrl);
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const maxPages = Math.min(pdf.numPages, 40); // chặn tài liệu quá dài làm máy yếu bị đơ
      filePreviewOpen.totalPages = pdf.numPages;
      filePreviewOpen.truncated = pdf.numPages > maxPages;
      const containerWidth = Math.min(document.documentElement.clientWidth - 24, 720);
      for(let i=1; i<=maxPages; i++){
        // Người dùng có thể đã đóng preview hoặc mở tệp khác trong lúc đang vẽ dở — dừng lại luôn.
        if(!filePreviewOpen || filePreviewOpen.dataUrl !== file.dataUrl) return;
        const page = await pdf.getPage(i);
        if(!filePreviewOpen || filePreviewOpen.dataUrl !== file.dataUrl) return;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = (containerWidth / unscaled.width) * Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.className = 'file-preview-page';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if(!filePreviewOpen || filePreviewOpen.dataUrl !== file.dataUrl) return;
        filePreviewOpen.pages.push(canvas);
        filePreviewOpen.loading = false; // hiện dần từng trang ngay khi vẽ xong, không cần đợi hết tài liệu
        // Nối trực tiếp vào DOM thay vì gọi render() toàn app mỗi trang —
        // render() xoá sạch rồi dựng lại cả cây DOM, làm animation mở modal
        // chạy lại từ đầu mỗi lần → nhấp nháy liên tục cho tới khi xong hết
        // trang. Chỉ khi khung xem chưa từng được vẽ ra (hiếm) mới cần render().
        if(filePreviewOpen.pagesWrapEl && filePreviewOpen.pagesWrapEl.isConnected){
          filePreviewOpen.pagesWrapEl.appendChild(canvas);
          if(filePreviewOpen.statusEl && i < maxPages){
            filePreviewOpen.statusEl.textContent = `Đang tải thêm trang… (${filePreviewOpen.pages.length}/${filePreviewOpen.totalPages})`;
          }
        } else {
          render();
        }
      }
      // Xong toàn bộ — cập nhật dòng trạng thái tại chỗ, không gọi render() để tránh giật hình lần cuối.
      if(filePreviewOpen.statusEl){
        if(filePreviewOpen.truncated){
          filePreviewOpen.statusEl.style.cssText = 'text-align:center; margin-top:10px;';
          filePreviewOpen.statusEl.textContent = `Chỉ xem trước ${filePreviewOpen.pages.length}/${filePreviewOpen.totalPages} trang đầu — tải xuống để xem đầy đủ.`;
        } else {
          filePreviewOpen.statusEl.remove();
        }
        filePreviewOpen.statusEl = null;
      }
      filePreviewOpen.loading = false;
    }catch(e){
      filePreviewOpen.error = 'Không mở được bản xem trước PDF trong app — vui lòng tải xuống hoặc bấm ↗ để mở trong trình duyệt.';
      filePreviewOpen.loading = false;
      render();
    }
    return;
  }

  if(file.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    try{
      await ensureMammothLoaded();
      const arrayBuffer = dataUrlToArrayBuffer(file.dataUrl);
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      filePreviewOpen.html = result.value || '<p><em>(Tài liệu trống)</em></p>';
    }catch(e){
      filePreviewOpen.error = (e && e.message) || 'Không mở được tệp này trong app — vui lòng tải về xem.';
    }
  }
  filePreviewOpen.loading = false;
  render();
}

function closeFilePreview(){
  if(filePreviewOpen && filePreviewOpen.objectUrl){
    try{ URL.revokeObjectURL(filePreviewOpen.objectUrl); }catch(e){ /* ignore */ }
  }
  filePreviewOpen = null;
  render();
}

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

  if(f.mime === 'application/pdf'){
    // Dự phòng: mở bằng trình xem PDF thật của hệ điều hành/trình duyệt,
    // phòng khi máy quá yếu để pdf.js vẽ hoặc gặp file PDF lỗi/đặc biệt.
    const openTabBtn = document.createElement('a');
    openTabBtn.href = f.objectUrl || f.dataUrl;
    openTabBtn.target = '_blank';
    openTabBtn.rel = 'noopener';
    openTabBtn.className = 'file-preview-icon-btn';
    openTabBtn.textContent = '↗';
    openTabBtn.title = 'Mở trong trình duyệt';
    bar.appendChild(openTabBtn);
  }

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
    if(f.error && !f.pages.length){
      const errWrap = document.createElement('div');
      errWrap.style.cssText = 'text-align:center; padding:40px 24px;';
      errWrap.innerHTML = `<div class="tr-sub" style="margin-bottom:18px;">${escapeHtml(f.error)}</div>`;
      const dlBtn2 = document.createElement('a');
      dlBtn2.href = f.dataUrl; dlBtn2.download = f.name;
      dlBtn2.className = 'save-btn';
      dlBtn2.style.cssText = 'max-width:240px; margin:0 auto; display:block; text-decoration:none;';
      dlBtn2.textContent = '⬇ Tải về xem';
      errWrap.appendChild(dlBtn2);
      body.appendChild(errWrap);
    } else {
      // Container "sống" — openFilePreview() nối thẳng canvas từng trang vào
      // đây khi vẽ xong, không gọi lại render() toàn app (tránh nhấp nháy).
      const pagesWrap = document.createElement('div');
      pagesWrap.className = 'pdf-pages';
      f.pages.forEach(canvas=> pagesWrap.appendChild(canvas));
      body.appendChild(pagesWrap);
      f.pagesWrapEl = pagesWrap;

      if(f.loading || f.truncated){
        const statusEl = document.createElement('div');
        statusEl.className = 'tr-sub';
        statusEl.style.cssText = f.loading
          ? 'text-align:center; padding:' + (f.pages.length ? '16px' : '48px 20px') + ';'
          : 'text-align:center; margin-top:10px;';
        statusEl.textContent = f.loading
          ? (f.pages.length ? `Đang tải thêm trang… (${f.pages.length}/${f.totalPages})` : 'Đang tải bản xem trước…')
          : `Chỉ xem trước ${f.pages.length}/${f.totalPages} trang đầu — tải xuống để xem đầy đủ.`;
        body.appendChild(statusEl);
        f.statusEl = f.loading ? statusEl : null; // hết loading + không cần cập nhật thêm thì thôi không giữ tham chiếu
      } else {
        f.statusEl = null;
      }
    }
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
  const ALLOWED_DOC = {
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true
  };
  const isImage = file.type.startsWith('image/');
  if(!ALLOWED_DOC[file.type] && !isImage){
    toast('Chỉ nhận tệp PDF, Word (.pdf, .doc, .docx) hoặc ảnh (.jpg, .png, .webp)');
    return;
  }
  if(!isImage && file.size > 5.5 * 1024 * 1024){
    toast('Tệp quá lớn — vui lòng chọn tệp dưới khoảng 5MB');
    return;
  }
  testAttachmentBusy = true; testAttachmentError = ''; render();
  try{
    let dataUrl, mime, fileName;
    if(isImage){
      // Nén ảnh đề bài với độ phân giải cao hơn ảnh câu hỏi thường (giữ chữ
      // trong đề rõ để đọc), nhưng vẫn đủ nhỏ để lưu trong D1.
      const { mime: outMime, base64 } = await compressImageFile(file, 1800, 0.85);
      if(base64.length > 6_500_000){
        toast('Ảnh vẫn còn quá lớn sau khi nén, hãy thử ảnh khác');
        testAttachmentBusy = false; render();
        return;
      }
      mime = outMime; dataUrl = 'data:' + outMime + ';base64,' + base64; fileName = file.name;
    } else {
      dataUrl = await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = ()=> resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      mime = file.type; fileName = file.name;
    }
    const res = await authorizedRequest('/tests/attachment/set', {
      testId: testEditorOpen.id, fileName, mime, data: dataUrl
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

async function publishTest(published, maxAttempts, deadlineAt, timeLimitMinutes){
  if(deadlineAt === undefined) deadlineAt = testEditorOpen.deadlineAt || null;
  if(timeLimitMinutes === undefined) timeLimitMinutes = testEditorOpen.timeLimitMinutes || null;
  publishBusy = true; render();
  try{
    const res = await authorizedRequest('/tests/publish', { testId: testEditorOpen.id, published, maxAttempts, deadlineAt, timeLimitMinutes });
    testEditorOpen.published = res.published;
    testEditorOpen.maxAttempts = res.maxAttempts;
    testEditorOpen.deadlineAt = res.deadlineAt || null;
    testEditorOpen.timeLimitMinutes = res.timeLimitMinutes || null;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0){
      TESTS[idx].published = res.published; TESTS[idx].maxAttempts = res.maxAttempts;
      TESTS[idx].deadlineAt = res.deadlineAt || null; TESTS[idx].timeLimitMinutes = res.timeLimitMinutes || null;
    }
    toast(res.published ? 'Đã giao bài cho học sinh ✓' : 'Đã chuyển về bản nháp');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  publishBusy = false; render();
}

/* 19-cham-bai-giao-vien.js — Giáo viên: trang xem điểm/danh sách bài nộp, xem chi tiết bài làm của 1 học sinh, và màn chấm câu tự luận (khoanh/vẽ lên ảnh bài làm)
   (Phần 4463-4840 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

function openTestSubmissions(){
  testSubmissionsOpen = { testId: testEditorOpen.id, title: testEditorOpen.title, testType: testEditorOpen.testType };
  TEST_SUBMISSIONS = [];
  testSubmissionsLoading = true;
  render();
  authorizedGet('/tests/submissions?testId=' + encodeURIComponent(testSubmissionsOpen.testId))
    .then(res=>{ TEST_SUBMISSIONS = res.submissions || []; })
    .catch(e=>{ toast('Lỗi: ' + (e.message||'')); })
    .finally(()=>{ testSubmissionsLoading = false; render(); });
}

function openSubmissionDetail(studentId){
  submissionDetailOpen = { testId: testSubmissionsOpen.testId, title: testSubmissionsOpen.title, testType: testSubmissionsOpen.testType, studentId };
  submissionDetailLoading = true;
  render();
  authorizedGet('/tests/submissions/detail?testId=' + encodeURIComponent(testSubmissionsOpen.testId) + '&studentId=' + encodeURIComponent(studentId))
    .then(res=>{ submissionDetailOpen = { testId: testSubmissionsOpen.testId, title: testSubmissionsOpen.title, testType: testSubmissionsOpen.testType, ...res }; })
    .catch(e=>{ toast('Lỗi: ' + (e.message||'')); submissionDetailOpen = null; })
    .finally(()=>{ submissionDetailLoading = false; render(); });
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

  const isEssayTest = testSubmissionsOpen.testType === 'essay';
  TEST_SUBMISSIONS.forEach(s=>{
    const row = document.createElement('div');
    row.className = 'subject-row';
    row.style.cursor = 'pointer';
    row.onclick = ()=> openSubmissionDetail(s.studentId);
    const pct = s.total>0 ? Math.round((s.score/s.total)*100) : 0;
    const pendingBadge = s.essayPendingCount>0
      ? `<div class="essay-status-badge pending" style="margin-top:4px;">⏳ ${s.essayPendingCount} câu chờ chấm</div>`
      : (isEssayTest ? `<div class="essay-status-badge pass" style="margin-top:4px;">✓ Đã chấm xong</div>` : '');
    const scoreHtml = isEssayTest ? '' :
      `<div class="mono" style="font-size:15px; font-weight:700; color:${pct>=50?'var(--teal)':'var(--coral)'}; flex-shrink:0;">${s.total>0 ? s.score+'/'+s.total : ''}</div>`;
    row.innerHTML = `
      <div class="subject-info">
        <div class="subject-name">${escapeHtml(personLabel(s))}</div>
        <div class="subject-meta">${s.attemptCount>1 ? 'Đã làm '+s.attemptCount+' lần' : 'Đã nộp bài'}</div>
        ${pendingBadge}
      </div>
      ${scoreHtml}
    `;
    main.appendChild(row);
  });

  wrap.appendChild(main);
  return wrap;
}

/* ---- xem/chấm bài của 1 học sinh (giáo viên) ---- */
function renderSubmissionDetail(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display" style="font-size:18px;">Bài làm học sinh</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');
  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← Điểm số';
  backLink.style.marginBottom = '14px';
  backLink.onclick = ()=>{ submissionDetailOpen = null; render(); };
  main.appendChild(backLink);

  if(submissionDetailLoading){
    const l = document.createElement('div'); l.className='tr-sub'; l.textContent='Đang tải…';
    main.appendChild(l);
    wrap.appendChild(main);
    return wrap;
  }

  const s = submissionDetailOpen;
  const nameEl = document.createElement('div');
  nameEl.className = 'subject-name'; nameEl.style.fontSize = '16px'; nameEl.style.marginBottom = '2px';
  nameEl.textContent = s.studentName || s.studentEmail;
  main.appendChild(nameEl);
  if(s.testType !== 'essay' && s.total>0){
    const scoreEl = document.createElement('div');
    scoreEl.className = 'tr-sub'; scoreEl.style.marginBottom = '16px';
    scoreEl.textContent = `Điểm trắc nghiệm/đúng-sai/trả lời ngắn: ${s.score}/${s.total}`;
    main.appendChild(scoreEl);
  }

  (s.detail||[]).forEach((d,i)=>{
    const qcard = document.createElement('div');
    qcard.className = 'qcard';

    const promptEl = document.createElement('div');
    promptEl.className = 'qcard-prompt';
    promptEl.textContent = `Câu ${i+1}: ${d.prompt}`;
    qcard.appendChild(promptEl);

    if(d.imageData){
      const img = document.createElement('img');
      img.src = d.imageData;
      img.style.maxWidth='100%'; img.style.maxHeight='180px'; img.style.borderRadius='10px'; img.style.display='block'; img.style.marginBottom='12px';
      qcard.appendChild(img);
    }

    if(d.type === 'essay'){
      const statusLabel = { pending:'⏳ Chờ chấm', pass:'✓ Đạt', fail:'✕ Chưa đạt' };
      const badge = document.createElement('div');
      badge.className = 'essay-status-badge ' + d.status;
      badge.textContent = statusLabel[d.status] || 'Chờ chấm';
      badge.style.marginBottom = '10px';
      qcard.appendChild(badge);

      if((d.submittedImages||[]).length===0){
        const noPhoto = document.createElement('div'); noPhoto.className='tr-sub'; noPhoto.textContent='Học sinh chưa nộp ảnh nào cho câu này.';
        qcard.appendChild(noPhoto);
      } else {
        const grid = document.createElement('div');
        grid.className = 'essay-photo-grid'; grid.style.marginBottom = '12px';
        const imagesToShow = (d.gradedImages && d.gradedImages.length ? d.gradedImages : d.submittedImages);
        imagesToShow.forEach((src,pi)=>{
          const thumb = document.createElement('div');
          thumb.className = 'essay-photo-thumb'; thumb.style.width='96px'; thumb.style.height='96px';
          const img = document.createElement('img'); img.src = src;
          img.onclick = ()=> openImageLightbox(imagesToShow, pi);
          thumb.appendChild(img);
          grid.appendChild(thumb);
        });
        qcard.appendChild(grid);

        if(d.note){
          const noteBox = document.createElement('div');
          noteBox.className = 'tr-sub'; noteBox.style.marginBottom='10px'; noteBox.style.fontStyle='italic';
          noteBox.textContent = 'Nhận xét: ' + d.note;
          qcard.appendChild(noteBox);
        }

        const gradeBtn = document.createElement('button');
        gradeBtn.className = 'save-btn';
        gradeBtn.style.width='auto'; gradeBtn.style.padding='9px 16px'; gradeBtn.style.fontSize='13px';
        gradeBtn.textContent = d.status==='pending' ? 'Chấm bài này' : 'Sửa lại điểm';
        gradeBtn.onclick = ()=> openEssayGrade(d);
        qcard.appendChild(gradeBtn);
      }
    } else if(d.type === 'mcq' && Array.isArray(d.options)){
      d.options.forEach((opt,oi)=>{
        const isPicked = opt === d.yourAnswer;
        const isCorrectOpt = opt === d.correctAnswer;
        const row = document.createElement('div');
        row.className = 'opt-row readonly' + (isCorrectOpt ? ' correct' : (isPicked ? ' wrong' : ''));
        let tagHtml = '';
        if(isCorrectOpt && isPicked) tagHtml = '<span class="opt-tag correct">✓ Học sinh chọn — Đúng</span>';
        else if(isCorrectOpt) tagHtml = '<span class="opt-tag correct">✓ Đáp án đúng</span>';
        else if(isPicked) tagHtml = '<span class="opt-tag picked">✕ Học sinh đã chọn</span>';
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
    } else if(d.type === 'short_answer'){
      const yourBox = document.createElement('div');
      yourBox.innerHTML = `<div class="sa-label">Câu trả lời của học sinh</div>`;
      const yourVal = document.createElement('div');
      yourVal.className = 'sa-box ' + (d.isCorrect ? 'correct' : 'wrong');
      yourVal.textContent = (d.yourAnswer && d.yourAnswer.trim()) ? d.yourAnswer : '(bỏ trống)';
      yourBox.appendChild(yourVal);
      qcard.appendChild(yourBox);
    }

    main.appendChild(qcard);
  });

  wrap.appendChild(main);
  return wrap;
}

/* ---- chấm 1 câu tự luận bằng cách khoanh/vẽ lên ảnh (giáo viên) ---- */
function openEssayGrade(d){
  essayGradeOpen = {
    questionId: d.questionId, prompt: d.prompt, rubric: d.rubric || '',
    submittedImages: d.submittedImages || [], status: d.status==='pending' ? 'pass' : d.status,
    note: d.note || '', busy: false
  };
  render();
}

function renderEssayGrade(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  const g = essayGradeOpen;

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<h1 class="display" style="font-size:18px;">Chấm bài tự luận</h1>`;
  wrap.appendChild(header);

  const main = document.createElement('main');
  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← Quay lại';
  backLink.style.marginBottom = '14px';
  backLink.disabled = g.busy;
  backLink.onclick = ()=>{ if(!g.busy){ essayGradeOpen = null; render(); } };
  main.appendChild(backLink);

  const promptEl = document.createElement('div');
  promptEl.className = 'qcard-prompt'; promptEl.style.marginBottom = '4px';
  promptEl.textContent = g.prompt;
  main.appendChild(promptEl);
  if(g.rubric){
    const rubricEl = document.createElement('div');
    rubricEl.className = 'tr-sub'; rubricEl.style.marginBottom = '14px'; rubricEl.style.fontStyle = 'italic';
    rubricEl.textContent = 'Yêu cầu: ' + g.rubric;
    main.appendChild(rubricEl);
  }

  const hint = document.createElement('div');
  hint.className = 'tr-sub'; hint.style.marginBottom = '10px';
  hint.textContent = 'Chạm và kéo trên ảnh để khoanh/vẽ chỗ sai. Nút "Xoá nét" xoá toàn bộ nét vẽ trên ảnh đó.';
  main.appendChild(hint);

  const canvasCtxs = []; // {canvas, img}
  g.submittedImages.forEach((src,pi)=>{
    const photoWrap = document.createElement('div');
    photoWrap.className = 'essay-grade-photo-wrap';
    const img = document.createElement('img');
    img.src = src;
    const canvas = document.createElement('canvas');
    photoWrap.appendChild(img);
    photoWrap.appendChild(canvas);
    main.appendChild(photoWrap);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'back-link';
    clearBtn.style.marginBottom = '14px';
    clearBtn.textContent = '🗑 Xoá nét vẽ trên ảnh ' + (pi+1);
    main.appendChild(clearBtn);

    const setup = ()=>{
      const rect = img.getBoundingClientRect();
      canvas.width = img.naturalWidth || rect.width;
      canvas.height = img.naturalHeight || rect.height;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = Math.max(4, canvas.width/120); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      let drawing = false, lastX = 0, lastY = 0;
      const posFromEvent = (e)=>{
        const r = canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
        return { x: cx * (canvas.width/r.width), y: cy * (canvas.height/r.height) };
      };
      const start = (e)=>{ e.preventDefault(); drawing = true; const p = posFromEvent(e); lastX = p.x; lastY = p.y; };
      const move = (e)=>{
        if(!drawing) return;
        e.preventDefault();
        const p = posFromEvent(e);
        ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(p.x,p.y); ctx.stroke();
        lastX = p.x; lastY = p.y;
      };
      const end = ()=>{ drawing = false; };
      canvas.onpointerdown = start; canvas.onpointermove = move; canvas.onpointerup = end; canvas.onpointerleave = end;
      clearBtn.onclick = ()=> ctx.clearRect(0,0,canvas.width,canvas.height);
    };
    if(img.complete && img.naturalWidth) setup(); else img.onload = setup;

    canvasCtxs.push({ canvas, img });
  });

  const statusField = document.createElement('div');
  statusField.className = 'field';
  statusField.innerHTML = `<label>Kết quả</label>`;
  const statusRow = document.createElement('div');
  statusRow.style.display = 'flex'; statusRow.style.gap = '8px';
  [['pass','✓ Đạt','var(--teal)'],['fail','✕ Chưa đạt','var(--coral)']].forEach(([val,label,color])=>{
    const b = document.createElement('button');
    b.type='button'; b.textContent=label;
    b.style.flex='1'; b.style.padding='11px'; b.style.borderRadius='10px'; b.style.fontSize='14px'; b.style.fontWeight='700';
    b.style.border = g.status===val ? `1px solid ${color}` : '1px solid var(--line)';
    b.style.background = g.status===val ? color : 'var(--bg-elev)';
    b.style.color = g.status===val ? 'var(--bg)' : 'var(--white)';
    b.onclick = ()=>{ g.status = val; render(); };
    statusRow.appendChild(b);
  });
  statusField.appendChild(statusRow);
  main.appendChild(statusField);

  const noteField = document.createElement('div');
  noteField.className = 'field';
  noteField.innerHTML = `<label>Nhận xét cho học sinh (không bắt buộc)</label>`;
  const noteArea = document.createElement('textarea');
  noteArea.rows = 3; noteArea.value = g.note; noteArea.placeholder = 'Ví dụ: thiếu bước rút gọn ở câu b, xem lại đơn vị đo…';
  noteArea.style.width='100%'; noteArea.style.boxSizing='border-box'; noteArea.style.background='var(--bg-elev)'; noteArea.style.border='1px solid var(--line)';
  noteArea.style.color='var(--white)'; noteArea.style.borderRadius='9px'; noteArea.style.padding='10px 11px'; noteArea.style.fontSize='14px';
  noteArea.oninput = ()=>{ g.note = noteArea.value; };
  noteField.appendChild(noteArea);
  main.appendChild(noteField);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.textContent = g.busy ? 'Đang lưu…' : 'Lưu kết quả chấm';
  saveBtn.disabled = g.busy;
  saveBtn.onclick = ()=> saveEssayGrade(canvasCtxs);
  main.appendChild(saveBtn);

  wrap.appendChild(main);
  return wrap;
}

async function saveEssayGrade(canvasCtxs){
  const g = essayGradeOpen;
  g.busy = true; render();
  try{
    // Gộp từng ảnh gốc với nét vẽ của giáo viên thành 1 ảnh mới.
    const gradedImages = canvasCtxs.map(({canvas, img})=>{
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      const ctx = out.getContext('2d');
      ctx.drawImage(img, 0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0);
      return out.toDataURL('image/jpeg', 0.85);
    });
    const res = await authorizedRequest('/tests/essay/grade', {
      testId: submissionDetailOpen.testId, studentId: submissionDetailOpen.studentId,
      questionId: g.questionId, status: g.status, gradedImages, note: g.note
    });
    const target = (submissionDetailOpen.detail||[]).find(d=>d.questionId===g.questionId);
    if(target){ target.status = res.status; target.gradedImages = res.gradedImages; target.note = res.note; }
    const listRow = TEST_SUBMISSIONS.find(s=>s.studentId===submissionDetailOpen.studentId);
    if(listRow && listRow.essayPendingCount>0) listRow.essayPendingCount--;
    essayGradeOpen = null;
    toast('Đã lưu kết quả chấm ✓');
  }catch(e){
    g.busy = false;
    toast('Lỗi: ' + (e.message||'Lưu chấm bài thất bại'));
  }
  render();
}

/* 20-danh-sach-bai-kiem-tra.js — Học sinh: danh sách bài kiểm tra được giao, mở chi tiết 1 bài, xem lại kết quả cũ, và trang xem lại toàn bộ bài làm đã nộp
   (Phần 4841-5499 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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
  stopTakeTestCountdown();
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
  let questions = studentTestDetailOpen.questions;
  if(studentTestDetailOpen.testType === 'essay' && questions.length === 0){
    // Bài tự luận không có câu hỏi cụ thể nào — cho học sinh 1 khung nộp
    // ảnh chung cho cả bài, giống nộp 1 bài làm duy nhất kiểu Azota.
    questions = [{ id: '__general__', type: 'essay', prompt: 'Bài làm của bạn', rubric: '' }];
  }
  takeTestOpen = {
    id: studentTestDetailOpen.id, title: studentTestDetailOpen.title, questions,
    testType: studentTestDetailOpen.testType,
    attachmentName: studentTestDetailOpen.attachmentName, attachmentMime: studentTestDetailOpen.attachmentMime, attachmentData: studentTestDetailOpen.attachmentData,
    timeLimitMinutes: studentTestDetailOpen.timeLimitMinutes || null,
  };
  takeTestAnswers = {};
  questions.forEach(q=>{ if(q.type==='essay') takeTestAnswers[q.id] = []; });
  testReviewOpen = false;
  takeTestLocked = false;
  if(takeTestOpen.timeLimitMinutes){
    takeTestDeadline = Date.now() + takeTestOpen.timeLimitMinutes * 60000;
    startTakeTestCountdown();
  } else {
    takeTestDeadline = null;
  }
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
    const wasEssay = takeTestOpen.testType === 'essay';
    stopTakeTestCountdown();
    takeTestOpen = null;
    toast(wasEssay ? 'Đã nộp bài ✓ Chờ giáo viên chấm' : 'Đã nộp bài ✓ Điểm: ' + res.score + '/' + res.total);
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
  const typePill = t.testType==='essay' ? '<span class="stc-pill">✍️ Tự luận</span>' : '';

  let statusHtml, scorePillHtml = '';
  if(t.mySubmission && t.testType==='essay'){
    const es = t.mySubmission.essay;
    if(es && es.verdict==='pass'){
      statusHtml = `<span class="stc-status" style="color:var(--teal);">Trạng thái: Đạt</span>`;
      scorePillHtml = `<span class="stc-pill" style="color:var(--teal); border-color:var(--teal);">✓ Đạt</span>`;
    } else if(es && es.verdict==='fail'){
      statusHtml = `<span class="stc-status" style="color:var(--coral);">Trạng thái: Chưa đạt</span>`;
      scorePillHtml = `<span class="stc-pill" style="color:var(--coral); border-color:var(--coral);">✕ Chưa đạt</span>`;
    } else if(es && es.gradedCount>0){
      statusHtml = `<span class="stc-status" style="color:var(--amber);">Trạng thái: đã chấm ${es.gradedCount}/${es.totalCount} câu</span>`;
      scorePillHtml = `<span class="stc-pill" style="color:var(--amber); border-color:var(--amber);">⏳ ${es.gradedCount}/${es.totalCount} đã chấm</span>`;
    } else {
      statusHtml = `<span class="stc-status" style="color:var(--teal);">Trạng thái: đã nộp, chờ chấm</span>`;
      scorePillHtml = `<span class="stc-pill" style="color:var(--teal); border-color:var(--teal);">✓ Đã nộp bài</span>`;
    }
  } else if(t.mySubmission){
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
    <div class="stc-pillrow">${typePill}${deadlinePill}${attemptPill}${attachmentPill}${scorePillHtml}</div>
    <div class="stc-teacher"><span class="stc-avatar">${escapeHtml(initialsOf({name:teacherLabel}))}</span>${escapeHtml(teacherLabel)}</div>
    <div class="stc-title">${escapeHtml(t.title)}</div>
    ${statusHtml}
    <div class="stc-meta">${(t.testType==='essay' && t.questionCount===0) ? '📷 Nộp ảnh bài làm' : '📄 '+t.questionCount+' câu'}${t.mySubmission && t.mySubmission.attemptCount>1 ? ' · 🔁 Đã làm '+t.mySubmission.attemptCount+' lần' : ''}</div>
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
  const questionCountLabel = (t.testType==='essay' && t.questions.length===0)
    ? 'Nộp ảnh bài làm' : t.questions.length + ' câu hỏi';
  metaEl.textContent = questionCountLabel + ' · ' + (t.maxAttempts===1 ? 'Chỉ làm 1 lần' : 'Được làm lại nhiều lần');
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
    const attachMime = t.attachmentMime || '';
    const isPdf = attachMime.includes('pdf');
    const isImage = attachMime.startsWith('image/');
    const iconHtml = isImage
      ? `<img src="${t.attachmentData}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;">`
      : `<div style="font-size:22px;">${isPdf ? '📕' : '📄'}</div>`;
    const attachHintText = t.testType==='essay'
      ? 'Xem đề, làm ra giấy, rồi chụp ảnh bài làm để nộp ở từng câu bên dưới.'
      : 'Xem hoặc tải đề về làm trước, rồi quay lại nộp phần trắc nghiệm bên dưới.';
    attachCard.innerHTML = `
      ${iconHtml}
      <div style="flex:1; min-width:120px;">
        <div style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.attachmentName)}</div>
        <div class="tr-sub" style="margin-top:1px;">${attachHintText}</div>
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

  if(t.mySubmission && t.testType==='essay'){
    // Bài tự luận không có điểm số — hiện trạng thái Đạt/Chưa đạt/chờ
    // chấm dựa trên kết quả chấm thật (t.mySubmission.essay), thay vì
    // luôn hiện "chờ chấm" một cách tĩnh.
    const es = t.mySubmission.essay;
    let verdictText, verdictColor, subText;
    if(es && es.verdict==='pass'){
      verdictText = '✓ Đạt'; verdictColor = 'var(--teal)'; subText = 'Giáo viên đã chấm xong bài này.';
    } else if(es && es.verdict==='fail'){
      verdictText = '✕ Chưa đạt'; verdictColor = 'var(--coral)'; subText = 'Giáo viên đã chấm xong bài này.';
    } else if(es && es.gradedCount>0){
      verdictText = '⏳ Đã chấm ' + es.gradedCount + '/' + es.totalCount + ' câu'; verdictColor = 'var(--amber)';
      subText = 'Còn ' + es.pendingCount + ' câu chưa chấm.';
    } else {
      verdictText = '✓ Đã nộp bài'; verdictColor = 'var(--teal)'; subText = 'Chờ giáo viên chấm bài';
    }
    const submittedBox = document.createElement('div');
    submittedBox.className = 'score-result-card';
    submittedBox.innerHTML = `
      <div class="score-verdict" style="color:${verdictColor};">${verdictText}</div>
      <div class="tr-sub">${t.mySubmission.attemptCount>1 ? 'Lần nộp gần nhất · Đã làm '+t.mySubmission.attemptCount+' lần' : subText}</div>
    `;
    main.appendChild(submittedBox);

    const detailBtn = document.createElement('button');
    detailBtn.className = 'save-btn secondary-btn';
    detailBtn.textContent = '📋 Xem lại bài làm';
    detailBtn.onclick = ()=>{
      if(t.resultDetail){ testReviewOpen = true; render(); }
      else { viewPastResult(); }
    };
    main.appendChild(detailBtn);
  } else if(t.mySubmission){
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

  if(t.mySubmission && t.testType !== 'essay'){
    const pct = t.mySubmission.total>0 ? (t.mySubmission.score/t.mySubmission.total) : 0;
    const tier = scoreTier(pct);
    const summary = document.createElement('div');
    summary.className = 'review-summary-bar';
    summary.innerHTML = `
      <div class="test-title" style="margin:0; white-space:normal;">${escapeHtml(t.title)}</div>
      <div class="mono" style="font-size:15px; font-weight:700; color:${tier.color}; flex-shrink:0;">${tier.icon} ${t.mySubmission.score}/${t.mySubmission.total}</div>
    `;
    main.appendChild(summary);
  } else if(t.mySubmission){
    const summary = document.createElement('div');
    summary.className = 'review-summary-bar';
    summary.innerHTML = `<div class="test-title" style="margin:0; white-space:normal;">${escapeHtml(t.title)}</div>`;
    main.appendChild(summary);
  }

  (t.resultDetail||[]).forEach((d,i)=>{
    const qcard = document.createElement('div');
    qcard.className = 'qcard';

    let qCorrect;
    if(d.type==='mcq') qCorrect = d.yourAnswer === d.correctAnswer;
    else if(d.type==='true_false') qCorrect = (d.correctCount||0) === (d.items||[]).length;
    else if(d.type==='essay') qCorrect = null;
    else qCorrect = !!d.isCorrect;

    const promptEl = document.createElement('div');
    promptEl.className = 'qcard-prompt';
    const dotHtml = d.type==='essay' ? '' : `<span class="q-result-dot ${qCorrect?'correct':'wrong'}">${qCorrect?'✓':'✕'}</span>`;
    promptEl.innerHTML = `${dotHtml}Câu ${i+1}: ${escapeHtml(d.prompt)}`;
    qcard.appendChild(promptEl);

    if(d.imageData){
      const img = document.createElement('img');
      img.src = d.imageData;
      img.style.maxWidth='100%'; img.style.maxHeight='200px'; img.style.borderRadius='10px'; img.style.display='block'; img.style.marginBottom='12px';
      qcard.appendChild(img);
    }

    if(d.type === 'essay'){
      const statusLabel = { pending:'⏳ Chờ chấm', pass:'✓ Đạt', fail:'✕ Chưa đạt' };
      const badge = document.createElement('div');
      badge.className = 'essay-status-badge ' + d.status;
      badge.textContent = statusLabel[d.status] || 'Chờ chấm';
      badge.style.marginBottom = '10px';
      qcard.appendChild(badge);

      const imagesToShow = (d.gradedImages && d.gradedImages.length) ? d.gradedImages : (d.submittedImages||[]);
      if(imagesToShow.length){
        const grid = document.createElement('div');
        grid.className = 'essay-photo-grid';
        imagesToShow.forEach((src,pi)=>{
          const thumb = document.createElement('div');
          thumb.className = 'essay-photo-thumb'; thumb.style.width='96px'; thumb.style.height='96px';
          const img = document.createElement('img'); img.src = src;
          img.onclick = ()=> openImageLightbox(imagesToShow, pi);
          thumb.appendChild(img);
          grid.appendChild(thumb);
        });
        qcard.appendChild(grid);
      } else {
        const noPhoto = document.createElement('div'); noPhoto.className='tr-sub'; noPhoto.textContent='Chưa nộp ảnh nào.';
        qcard.appendChild(noPhoto);
      }
      if(d.note){
        const noteBox = document.createElement('div');
        noteBox.className = 'tr-sub'; noteBox.style.marginTop='10px'; noteBox.style.fontStyle='italic';
        noteBox.textContent = 'Nhận xét của giáo viên: ' + d.note;
        qcard.appendChild(noteBox);
      }
    } else if(d.type === 'mcq' && Array.isArray(d.options)){
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

// Nén từng ảnh học sinh chọn (dùng chung compressImageFile với ảnh câu hỏi)
// rồi thêm vào mảng câu trả lời của câu tự luận, tối đa 6 ảnh.
// Overlay xem ảnh phóng to (chạm vào 1 ảnh đã tải lên để xem toàn màn
// hình). Vẽ trực tiếp bằng DOM, không qua render() để không ảnh hưởng màn
// hình bên dưới.
function openImageLightbox(images, startIndex){
  const existing = document.getElementById('imageLightboxOverlay');
  if(existing) existing.remove();
  let idx = startIndex || 0;

  const overlay = document.createElement('div');
  overlay.id = 'imageLightboxOverlay';
  overlay.className = 'image-lightbox-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay) overlay.remove(); };

  const img = document.createElement('img');
  img.style.cssText = 'max-width:92vw; max-height:80vh; object-fit:contain; border-radius:10px; display:block;';
  img.src = images[idx];

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button'; closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:fixed; top:calc(env(safe-area-inset-top,0px) + 14px); right:16px; width:36px; height:36px; border-radius:50%; border:none; background:rgba(255,255,255,0.12); color:#fff; font-size:16px; cursor:pointer;';
  closeBtn.onclick = ()=> overlay.remove();

  overlay.appendChild(img);
  overlay.appendChild(closeBtn);

  if(images.length > 1){
    const counter = document.createElement('div');
    counter.style.cssText = 'position:fixed; bottom:calc(env(safe-area-inset-bottom,0px) + 18px); left:0; right:0; text-align:center; color:#fff; font-size:13px; font-weight:600;';
    const updateCounter = ()=>{ counter.textContent = (idx+1) + ' / ' + images.length; img.src = images[idx]; };
    updateCounter();
    overlay.appendChild(counter);

    const mkNavBtn = (dir, symbol)=>{
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = symbol;
      b.style.cssText = `position:fixed; top:50%; ${dir<0?'left':'right'}:10px; transform:translateY(-50%); width:40px; height:40px; border-radius:50%; border:none; background:rgba(255,255,255,0.12); color:#fff; font-size:20px; cursor:pointer;`;
      b.onclick = (e)=>{ e.stopPropagation(); idx = (idx+dir+images.length)%images.length; updateCounter(); };
      return b;
    };
    overlay.appendChild(mkNavBtn(-1, '‹'));
    overlay.appendChild(mkNavBtn(1, '›'));
  }

  document.body.appendChild(overlay);
}

async function addEssayPhotos(questionId, files, onDone){
  essayPhotoProcessing = questionId;
  if(onDone) onDone();
  const arr = takeTestAnswers[questionId];
  for(const file of files){
    if(arr.length >= 6){ toast('Mỗi câu tự luận chỉ được nộp tối đa 6 ảnh'); break; }
    try{
      const { mime, base64 } = await compressImageFile(file);
      if(base64.length > 1_100_000){
        toast('Một ảnh vẫn còn quá lớn sau khi nén, hãy thử ảnh khác');
      } else {
        arr.push('data:' + mime + ';base64,' + base64);
      }
    }catch(e){
      toast('Lỗi xử lý ảnh: ' + (e.message||''));
    }
  }
  essayPhotoProcessing = null;
  if(onDone) onDone();
  updateTakeTestProgress();
}

function countAnsweredTestQuestions(){
  return takeTestOpen.questions.filter(q => {
    const a = takeTestAnswers[q.id];
    if(q.type==='true_false') return a && Object.keys(a).length === (q.items||[]).length;
    if(q.type==='essay') return Array.isArray(a) && a.length>0;
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

/* 21-lam-bai-kiem-tra.js — Học sinh: giao diện đang làm bài kiểm tra (từng câu hỏi, thanh tiến độ, thêm ảnh bài tự luận, xác nhận nộp bài)
   (Phần 5500-5757 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

// Đồng hồ đếm ngược cho bài có giới hạn thời gian (giáo viên đặt trong lúc
// soạn bài) — bắt đầu chạy ngay khi học sinh bấm vào làm bài, hết giờ thì
// tự động nộp bài luôn (không cần xác nhận), khoá không cho làm tiếp.
function stopTakeTestCountdown(){
  if(takeTestCountdownHandle){ clearInterval(takeTestCountdownHandle); takeTestCountdownHandle = null; }
}
function startTakeTestCountdown(){
  stopTakeTestCountdown();
  if(!takeTestDeadline) return;
  takeTestCountdownHandle = setInterval(()=>{
    const remaining = Math.max(0, Math.ceil((takeTestDeadline - Date.now())/1000));
    const el = document.getElementById('takeTestCountdownDisplay');
    if(el){
      el.textContent = '⏱ ' + fmtTestCountdown(remaining);
      el.classList.toggle('low', remaining <= 60);
    }
    if(remaining <= 0){
      stopTakeTestCountdown();
      if(takeTestLocked || !takeTestOpen) return;
      takeTestLocked = true;
      toast('⏱ Hết giờ! Bài đã được tự động nộp');
      submitTest();
      render();
    }
  }, 1000);
}
function fmtTestCountdown(totalSeconds){
  const m = Math.floor(totalSeconds/60), s = totalSeconds%60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function renderTakeTest(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  const typeLabel = { mcq:'Trắc nghiệm', true_false:'Đúng / Sai', short_answer:'Trả lời ngắn', essay:'Tự luận' };

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
  topSubmitBtn.disabled = takeTestLocked;
  topSubmitBtn.onclick = showSubmitConfirm;
  header.appendChild(topSubmitBtn);
  wrap.appendChild(header);

  const main = document.createElement('main');

  const backLink = document.createElement('button');
  backLink.className = 'back-link';
  backLink.textContent = '← Thoát (không lưu)';
  backLink.style.marginBottom = '16px';
  backLink.disabled = takeTestLocked;
  backLink.onclick = ()=>{ stopTakeTestCountdown(); takeTestOpen = null; render(); };
  main.appendChild(backLink);

  if(takeTestOpen.timeLimitMinutes){
    const remaining = takeTestDeadline ? Math.max(0, Math.ceil((takeTestDeadline - Date.now())/1000)) : takeTestOpen.timeLimitMinutes*60;
    const cd = document.createElement('div');
    cd.id = 'takeTestCountdownDisplay';
    cd.className = 'quiz-countdown' + (remaining<=60 ? ' low' : '');
    cd.style.marginBottom = '18px';
    cd.textContent = '⏱ ' + fmtTestCountdown(remaining);
    main.appendChild(cd);
  }

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

  if(takeTestOpen.attachmentName){
    const attachMime = takeTestOpen.attachmentMime || '';
    const isPdf = attachMime.includes('pdf');
    const isImage = attachMime.startsWith('image/');
    const attachCard = document.createElement('div');
    attachCard.style.cssText = 'display:flex; align-items:center; gap:10px; background:var(--bg-elev); border:1px solid var(--line); border-radius:12px; padding:12px; margin-bottom:18px;';
    const iconHtml = isImage
      ? `<img src="${takeTestOpen.attachmentData}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;">`
      : `<div style="font-size:22px;">${isPdf ? '📕' : '📄'}</div>`;
    attachCard.innerHTML = `
      ${iconHtml}
      <div style="flex:1; min-width:0; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(takeTestOpen.attachmentName)}</div>
    `;
    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.textContent = '👁 Xem đề';
    viewBtn.style.cssText = 'font-size:12.5px; font-weight:700; border:none; color:var(--bg); background:var(--teal); padding:8px 12px; border-radius:9px; white-space:nowrap; cursor:pointer; flex-shrink:0;';
    viewBtn.onclick = ()=> openFilePreview({ name: takeTestOpen.attachmentName, mime: takeTestOpen.attachmentMime, dataUrl: takeTestOpen.attachmentData });
    attachCard.appendChild(viewBtn);
    main.appendChild(attachCard);
  }

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
    } else if(q.type==='essay'){
      if(q.rubric){
        const rubricBox = document.createElement('div');
        rubricBox.className='tr-sub'; rubricBox.style.marginBottom='10px'; rubricBox.style.fontStyle='italic';
        rubricBox.textContent = 'Yêu cầu: ' + q.rubric;
        qcard.appendChild(rubricBox);
      }
      if(!Array.isArray(takeTestAnswers[q.id])) takeTestAnswers[q.id] = [];
      const photoHint = document.createElement('div');
      photoHint.className = 'tr-sub'; photoHint.style.marginBottom = '8px';
      photoHint.textContent = 'Chạm vào ảnh để xem to hơn. Dùng nút ‹ › để đổi thứ tự ảnh.';
      qcard.appendChild(photoHint);
      const photoGrid = document.createElement('div');
      photoGrid.className = 'essay-photo-grid';
      const renderPhotos = ()=>{
        photoGrid.innerHTML = '';
        const photos = takeTestAnswers[q.id];
        photos.forEach((src,pi)=>{
          const thumb = document.createElement('div');
          thumb.className = 'essay-photo-thumb';
          const img = document.createElement('img'); img.src = src;
          img.onclick = ()=> openImageLightbox(photos, pi);
          const rm = document.createElement('button');
          rm.type='button'; rm.textContent='✕'; rm.title='Xoá ảnh';
          rm.onclick = (e)=>{ e.stopPropagation(); photos.splice(pi,1); renderPhotos(); updateTakeTestProgress(); };
          thumb.appendChild(img); thumb.appendChild(rm);
          if(photos.length > 1){
            const reorderRow = document.createElement('div');
            reorderRow.className = 'essay-photo-reorder';
            const mkArrow = (dir, symbol, disabled)=>{
              const b = document.createElement('button');
              b.type='button'; b.textContent=symbol; b.disabled = disabled;
              b.onclick = (e)=>{
                e.stopPropagation();
                const tmp = photos[pi]; photos[pi] = photos[pi+dir]; photos[pi+dir] = tmp;
                renderPhotos();
              };
              return b;
            };
            reorderRow.appendChild(mkArrow(-1, '‹', pi===0));
            reorderRow.appendChild(mkArrow(1, '›', pi===photos.length-1));
            thumb.appendChild(reorderRow);
          }
          photoGrid.appendChild(thumb);
        });
        if(photos.length < 6){
          const addBtn = document.createElement('label');
          addBtn.className = 'essay-photo-add';
          addBtn.textContent = essayPhotoProcessing===q.id ? '…' : '+';
          const input = document.createElement('input');
          input.type='file'; input.accept='image/*'; input.multiple=true; input.style.display='none';
          input.onchange = ()=>{ if(input.files.length) addEssayPhotos(q.id, Array.from(input.files), renderPhotos); };
          addBtn.appendChild(input);
          photoGrid.appendChild(addBtn);
        }
      };
      renderPhotos();
      qcard.appendChild(photoGrid);
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

/* 23-cap-nhat-va-giao-dien.js — Phát hiện bản cập nhật mới từ service worker và áp dụng, cùng với việc áp dụng giao diện sáng/tối (theme)
   (Phần 5884-5962 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

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

/* 24-tro-choi-ghep-the.js — Trò chơi "Ghép thẻ": hiện 2 cột câu hỏi/đáp án
   đã xáo trộn riêng, chạm 1 ô mỗi cột để ghép đúng cặp. Không ảnh hưởng
   lịch ôn tập — chỉ để luyện lại nhanh, vui hơn là lật thẻ tuần tự. */

function stopMatchGameTimer(){
  if(matchGameTimerHandle){ clearInterval(matchGameTimerHandle); matchGameTimerHandle = null; }
}
function shuffleArr(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function fmtElapsed(ms){
  const s = Math.max(0, Math.round(ms/1000));
  const m = Math.floor(s/60), r = s%60;
  return m>0 ? `${m}:${String(r).padStart(2,'0')}` : `${r}s`;
}

// Chuẩn bị dữ liệu 1 ván ghép thẻ mới cho 1 bộ thẻ (và các bộ thẻ phụ bên trong).
function startMatchGame(subjectId){
  const cards = subjectCards(subjectId).filter(c=>{
    const back = correctAnswerText(c);
    return back && back.trim();
  });
  if(cards.length < 3){
    toast('Cần ít nhất 3 thẻ trong bộ này để chơi ghép thẻ');
    return;
  }
  const picked = shuffleArr(cards).slice(0, Math.min(8, cards.length));

  matchGameSubjectId = subjectId;
  matchGamePairs = picked.map(c=>({
    cardId: c.id,
    front: (c.type==='cloze') ? clozeQuestionPlainText(c.front, c.clozeIndex) : c.front,
    back: correctAnswerText(c),
  }));
  matchGameLeftOrder = shuffleArr(matchGamePairs.map(p=>p.cardId));
  matchGameRightOrder = shuffleArr(matchGamePairs.map(p=>p.cardId));
  matchGameMatchedIds = new Set();
  matchGameSelectedLeft = null;
  matchGameSelectedRight = null;
  matchGameWrongFlash = null;
  matchGameMistakes = 0;
  matchGameStartedAt = Date.now();
  matchGameFinishedAt = null;

  stopMatchGameTimer();
  matchGameTimerHandle = setInterval(()=>{
    const el = document.getElementById('matchGameTimer');
    if(el && !matchGameFinishedAt) el.textContent = fmtElapsed(Date.now()-matchGameStartedAt);
  }, 1000);

  setView('match');
}

function closeMatchGame(){
  stopMatchGameTimer();
  setView('home');
}

function matchGamePick(side, cardId){
  // Đã ghép xong rồi, hoặc đang chớp đỏ chờ tự bỏ chọn — chưa bấm được lúc này.
  if(matchGameMatchedIds.has(cardId) || matchGameWrongFlash) return;

  if(side==='left') matchGameSelectedLeft = (matchGameSelectedLeft===cardId) ? null : cardId;
  else matchGameSelectedRight = (matchGameSelectedRight===cardId) ? null : cardId;

  if(matchGameSelectedLeft && matchGameSelectedRight){
    if(matchGameSelectedLeft === matchGameSelectedRight){
      matchGameMatchedIds.add(matchGameSelectedLeft);
      matchGameSelectedLeft = null;
      matchGameSelectedRight = null;
      if(matchGameMatchedIds.size === matchGamePairs.length){
        matchGameFinishedAt = Date.now();
        stopMatchGameTimer();
      }
    } else {
      matchGameMistakes += 1;
      matchGameWrongFlash = {left: matchGameSelectedLeft, right: matchGameSelectedRight};
      setTimeout(()=>{
        matchGameWrongFlash = null;
        matchGameSelectedLeft = null;
        matchGameSelectedRight = null;
        render();
      }, 550);
    }
  }
  render();
}

function renderMatchGame(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const subject = subjectById(matchGameSubjectId);

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<button class="back-link" style="margin:0;">← Đóng</button><h1 class="display" style="font-size:17px;">🧩 ${subject?escapeHtml(subject.name):'Ghép thẻ'}</h1>`;
  header.querySelector('.back-link').onclick = ()=> closeMatchGame();
  wrap.appendChild(header);

  const main = document.createElement('main');

  const statsRow = document.createElement('div');
  statsRow.className = 'match-stats-row';
  statsRow.innerHTML = `
    <span>⏱ <span id="matchGameTimer">${fmtElapsed((matchGameFinishedAt||Date.now())-matchGameStartedAt)}</span></span>
    <span>${matchGameMatchedIds.size}/${matchGamePairs.length} cặp · ${matchGameMistakes} lần sai</span>
  `;
  main.appendChild(statsRow);

  if(matchGameFinishedAt){
    const done = document.createElement('div');
    done.className = 'review-done';
    done.style.cssText = 'height:auto; padding:40px 20px;';
    done.innerHTML = `
      <div class="glyph">🎉</div>
      <h2 class="display">Ghép xong hết!</h2>
      <p>Mất ${fmtElapsed(matchGameFinishedAt-matchGameStartedAt)}, sai ${matchGameMistakes} lần.</p>
    `;
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:10px; width:100%; max-width:320px;';
    const again = document.createElement('button');
    again.className = 'hero-btn'; again.textContent = 'Chơi lại';
    again.onclick = ()=> startMatchGame(matchGameSubjectId);
    const home = document.createElement('button');
    home.className = 'save-btn';
    home.style.background = 'var(--bg-elev)'; home.style.color = 'var(--white)'; home.style.border = '1px solid var(--line)';
    home.textContent = 'Về trang chủ';
    home.onclick = ()=> closeMatchGame();
    btnRow.appendChild(again); btnRow.appendChild(home);
    done.appendChild(btnRow);
    main.appendChild(done);
    wrap.appendChild(main);
    return wrap;
  }

  const grid = document.createElement('div');
  grid.className = 'match-grid';

  function buildCol(order, side, selectedId){
    const col = document.createElement('div');
    col.className = 'match-col';
    order.forEach(cardId=>{
      const pair = matchGamePairs.find(p=>p.cardId===cardId);
      const text = side==='left' ? pair.front : pair.back;
      const btn = document.createElement('button');
      btn.type = 'button';
      const matched = matchGameMatchedIds.has(cardId);
      const wrongHere = matchGameWrongFlash && matchGameWrongFlash[side]===cardId;
      btn.className = 'match-tile' + (matched?' matched':'') + (selectedId===cardId?' selected':'') + (wrongHere?' wrong':'');
      btn.innerHTML = escapeHtml(text);
      btn.disabled = matched;
      btn.onclick = ()=> matchGamePick(side, cardId);
      col.appendChild(btn);
    });
    return col;
  }

  grid.appendChild(buildCol(matchGameLeftOrder, 'left', matchGameSelectedLeft));
  grid.appendChild(buildCol(matchGameRightOrder, 'right', matchGameSelectedRight));
  main.appendChild(grid);

  wrap.appendChild(main);
  return wrap;
}
/* 25-khoi-dong.js — Điểm khởi động app: tải dữ liệu, áp dụng giao diện, vẽ màn hình đầu tiên, bật kiểm tra cập nhật & đồng bộ nền
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
})();/* 26-nhap-de-tu-file.js — Giáo viên tải lên 1 file Word (.docx) đề kiểm tra soạn theo mẫu
   "PHẦN I. TRẮC NGHIỆM / PHẦN II. ĐÚNG-SAI / PHẦN III. TRẢ LỜI NGẮN" kèm đáp án (ĐA:...),
   app tự đọc file (kể cả công thức toán chèn bằng Word Equation), tự nhận diện từng câu
   + đáp án, rồi thêm thẳng vào bài kiểm tra đang soạn — không cần gõ tay lại từng câu. */

/* ---------------- ĐỌC FILE .DOCX THÀNH VĂN BẢN (giữ nguyên công thức toán, hiện ra
   đúng như trong Word — không đổi thành ký tự thường) ----------------
   .docx thực chất là 1 file zip chứa word/document.xml. Mỗi công thức toán chèn bằng
   Word Equation được lưu dưới dạng cây <m:oMath>...</m:oMath> (phân số, luỹ thừa, căn...)
   chứ không phải chữ thường. Hàm omlToText() dưới đây "đọc hiểu" cây đó và viết lại
   thành cú pháp LaTeX chuẩn (ví dụ phân số 5π/12 → "\frac{5π}{12}"), bọc trong cặp dấu
   "$...$" — đúng định dạng mà app này đã hỗ trợ sẵn để hiển thị công thức toán bằng
   KaTeX (xem renderMathIn() trong phần "Công thức toán học"). Nhờ vậy câu hỏi/phương án
   nhập vào hiện ra phân số, căn, số mũ... y hệt bản Word gốc, không phải "(5π)/(12)". */

function domFindChild(node, tag){
  return Array.from(node.childNodes||[]).find(c=>c.nodeType===1 && c.tagName===tag);
}
function domFindChildren(node, tag){
  return Array.from(node.childNodes||[]).filter(c=>c.nodeType===1 && c.tagName===tag);
}
function omlContainerText(node){
  if(!node) return '';
  let out = '';
  Array.from(node.childNodes||[]).forEach(child=>{ if(child.nodeType===1) out += omlToText(child); });
  return out;
}
// Chuyển 1 node công thức toán (Word OMML) thành LaTeX, đệ quy. Chỉ xử lý các dạng
// hay gặp trong đề thi phổ thông: phân số, căn, số mũ/chỉ số, ngoặc, tổng/tích.
function omlToText(node){
  const tag = node.tagName;
  if(tag==='m:t' || tag==='w:t') return node.textContent||'';
  if(tag==='w:br' || tag==='w:tab') return ' ';
  if(tag==='m:f'){
    const num = domFindChild(node,'m:num'), den = domFindChild(node,'m:den');
    return `\\frac{${num?omlContainerText(num):''}}{${den?omlContainerText(den):''}}`;
  }
  if(tag==='m:rad'){
    const e = domFindChild(node,'m:e'), deg = domFindChild(node,'m:deg');
    const degTxt = deg ? omlContainerText(deg).trim() : '';
    const inner = e ? omlContainerText(e) : '';
    return (degTxt && degTxt!=='2') ? `\\sqrt[${degTxt}]{${inner}}` : `\\sqrt{${inner}}`;
  }
  if(tag==='m:sSup'){
    const e = domFindChild(node,'m:e'), sup = domFindChild(node,'m:sup');
    return `{${e?omlContainerText(e):''}}^{${sup?omlContainerText(sup):''}}`;
  }
  if(tag==='m:sSub'){
    const e = domFindChild(node,'m:e'), sub = domFindChild(node,'m:sub');
    return `{${e?omlContainerText(e):''}}_{${sub?omlContainerText(sub):''}}`;
  }
  if(tag==='m:sSubSup'){
    const e = domFindChild(node,'m:e'), sub = domFindChild(node,'m:sub'), sup = domFindChild(node,'m:sup');
    return `{${e?omlContainerText(e):''}}_{${sub?omlContainerText(sub):''}}^{${sup?omlContainerText(sup):''}}`;
  }
  if(tag==='m:d'){
    const dPr = domFindChild(node,'m:dPr');
    let beg='(', end=')';
    if(dPr){
      const begEl = domFindChild(dPr,'m:begChr'), endEl = domFindChild(dPr,'m:endChr');
      if(begEl){ const v = begEl.getAttribute('m:val'); if(v!==null) beg = v; }
      if(endEl){ const v = endEl.getAttribute('m:val'); if(v!==null) end = v; }
    }
    // KaTeX cần \left/\right đi kèm 1 ký hiệu ngoặc hợp lệ — chuỗi rỗng (không hiện
    // ngoặc, kiểu OOXML) thì dùng "." (dấu chấm ẩn) theo đúng quy ước LaTeX.
    beg = beg || '.'; end = end || '.';
    return `\\left${beg}${domFindChildren(node,'m:e').map(omlContainerText).join(', ')}\\right${end}`;
  }
  if(tag==='m:nary'){
    const naryPr = domFindChild(node,'m:naryPr');
    let chr='∑';
    if(naryPr){ const chrEl = domFindChild(naryPr,'m:chr'); if(chrEl){ const v=chrEl.getAttribute('m:val'); if(v) chr=v; } }
    const cmd = {'∑':'\\sum', '∫':'\\int', '∏':'\\prod'}[chr] || chr;
    const sub = domFindChild(node,'m:sub'), sup = domFindChild(node,'m:sup'), e = domFindChild(node,'m:e');
    return `${cmd}${sub?'_{'+omlContainerText(sub)+'}':''}${sup?'^{'+omlContainerText(sup)+'}':''}{${e?omlContainerText(e):''}}`;
  }
  if(tag==='m:bar'){ const e = domFindChild(node,'m:e'); return `\\overline{${e?omlContainerText(e):''}}`; }
  if(tag==='m:acc'){ const e = domFindChild(node,'m:e'); return omlContainerText(e); }
  if(/Pr$/.test(tag)) return ''; // các thẻ *Pr chỉ là định dạng (font/màu...), bỏ qua
  return omlContainerText(node); // container khác (m:r, m:num, m:den, m:e, m:sub, m:sup, m:deg...): gộp con
}

// Text của 1 đoạn <w:p>, thay riêng phần công thức toán bằng $...$ (LaTeX, KaTeX vẽ lại
// đúng như bản Word) — chữ thường xung quanh giữ nguyên, không đụng vào.
function docxParagraphText(pNode){
  let text = '';
  function walk(n){
    if(n.nodeType!==1) return;
    if(n.tagName==='m:oMath'){ const latex = omlToText(n).trim(); if(latex) text += '$' + latex + '$'; return; }
    if(n.tagName==='w:t'){ text += n.textContent; return; }
    if(n.tagName==='w:tab'){ text += ' '; return; }
    if(n.tagName==='w:br' || n.tagName==='w:cr'){ text += ' '; return; }
    Array.from(n.childNodes||[]).forEach(walk);
  }
  Array.from(pNode.childNodes||[]).forEach(walk);
  return text.replace(/\s+/g,' ').trim();
}

// Đọc toàn bộ word/document.xml thành 1 danh sách "khối" theo đúng thứ tự trong file:
// đoạn văn bản thường ({type:'p', text}) hoặc 1 hàng của bảng ({type:'tr', cells:[...]}) —
// bảng dùng cho các phương án A/B/C/D và bảng Đúng-Sai (mỗi ô là 1 cell riêng).
function docxExtractBlocks(xmlDoc){
  const body = xmlDoc.getElementsByTagName('w:body')[0];
  const blocks = [];
  if(!body) return blocks;
  Array.from(body.childNodes).forEach(child=>{
    if(child.nodeType!==1) return;
    if(child.tagName==='w:p'){
      const t = docxParagraphText(child);
      if(t) blocks.push({type:'p', text:t});
    } else if(child.tagName==='w:tbl'){
      Array.from(child.childNodes).filter(c=>c.nodeType===1 && c.tagName==='w:tr').forEach(tr=>{
        const cells = Array.from(tr.childNodes).filter(c=>c.nodeType===1 && c.tagName==='w:tc').map(tc=>{
          const ps = Array.from(tc.childNodes).filter(c=>c.nodeType===1 && c.tagName==='w:p').map(docxParagraphText).filter(Boolean);
          return ps.join(' ');
        });
        if(cells.some(Boolean)) blocks.push({type:'tr', cells});
      });
    }
  });
  return blocks;
}

async function docxFileToBlocks(file){
  if(typeof JSZip === 'undefined') throw new Error('Chưa tải được thư viện đọc file — kiểm tra kết nối mạng rồi thử lại');
  let zip;
  try{
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  }catch(e){
    throw new Error('Không mở được file — hãy chắc chắn đây là file .docx (Word), không phải .doc cũ hoặc PDF');
  }
  const entry = zip.file('word/document.xml');
  if(!entry) throw new Error('File này không đúng định dạng .docx (Word)');
  const xml = await entry.async('string');
  const xmlDoc = new DOMParser().parseFromString(xml, 'application/xml');
  if(xmlDoc.getElementsByTagName('parsererror')[0]) throw new Error('Không đọc được nội dung file (lỗi định dạng)');
  return docxExtractBlocks(xmlDoc);
}

/* ---------------- TÁCH 3 PHẦN + NHẬN DIỆN TỪNG CÂU ----------------
   Dựa theo đúng khuôn mẫu "PHẦN I. TRẮC NGHIỆM / PHẦN II. ĐÚNG-SAI / PHẦN III. TRẢ LỜI
   NGẮN" mà app này dùng khi soạn bài kiểm tra (xem renderTestManager). Đáp án ghi ngay
   sau mỗi câu theo dạng "ĐA:A" (trắc nghiệm), "ĐA:Đ Đ S Đ" (đúng-sai), "ĐA:<đáp án>"
   (trả lời ngắn) — đúng với thói quen soạn đề phổ biến. */
const FI_Q_START_RE = /^\s*(?:Câu|Cau|Question)\s*(\d+)\s*[:.\)]?\s*(.*)$/i;
const FI_OPT_RE = /^\s*([A-Da-d])[.\):]\s*(.+)$/;
const FI_ANS_MCQ_RE = /^\s*(?:Đáp\s*án\s*(?:đúng)?|Dap\s*an|ĐA|DA|Answer|Correct)\b\s*[:.]?\s*([A-Da-d])\s*\.?\s*$/i;
const FI_ANS_TF_RE = /^\s*(?:Đáp\s*án\s*(?:đúng)?|Dap\s*an|ĐA|DA|Answer|Correct)\b\s*[:.]?\s*((?:[ĐSđs]\s*){2,4})\s*$/i;
const FI_ANS_TEXT_RE = /^\s*(?:Đáp\s*án\s*(?:đúng)?|Dap\s*an|ĐA|DA|Answer|Correct)\b\s*[:.]?\s*(.+)$/i;
const FI_SEC1_RE = /PHẦN\s*I\b|TRẮC\s*NGHIỆM\s*KHÁCH\s*QUAN/i;
const FI_SEC2_RE = /PHẦN\s*II\b|CÂU\s*HỎI\s*ĐÚNG/i;
const FI_SEC3_RE = /PHẦN\s*III\b|TRẢ\s*LỜI\s*NGẮN/i;

function splitIntoSections(blocks){
  const sections = {1:[], 2:[], 3:[]};
  let cur = 0;
  blocks.forEach(b=>{
    const headerText = b.type==='p' ? b.text : (b.cells.length===1 ? b.cells[0] : '');
    if(headerText){
      if(FI_SEC1_RE.test(headerText)){ cur=1; return; }
      if(FI_SEC2_RE.test(headerText)){ cur=2; return; }
      if(FI_SEC3_RE.test(headerText)){ cur=3; return; }
    }
    if(cur>0) sections[cur].push(b);
  });
  // Không tìm thấy tiêu đề PHẦN nào (file soạn khác khuôn) — coi cả file là phần trắc
  // nghiệm, giống kiểu "Dán nhanh nhiều câu" đã có sẵn.
  if(sections[1].length===0 && sections[2].length===0 && sections[3].length===0){
    sections[1] = blocks;
  }
  return sections;
}

function parseMCQBlocks(blocks){
  const questions = [], warnings = [];
  let cur = null;
  function finalize(){
    if(!cur) return;
    const opts = ['A','B','C','D'].map(k=>cur.options[k]);
    if(cur.prompt && opts.every(Boolean) && cur.answer && 'ABCD'.includes(cur.answer)){
      questions.push({ prompt: cur.prompt, options: opts, correctIndex: 'ABCD'.indexOf(cur.answer) });
    } else {
      warnings.push(`Trắc nghiệm — Câu ${cur.num||'?'}: thiếu phương án hoặc đáp án, đã bỏ qua`);
    }
    cur = null;
  }
  blocks.forEach(b=>{
    if(b.type==='p'){
      const qm = b.text.match(FI_Q_START_RE);
      const am = b.text.match(FI_ANS_MCQ_RE);
      if(qm){ finalize(); cur = { num:qm[1], prompt:qm[2]||'', options:{}, answer:null }; }
      else if(am && cur){ cur.answer = am[1].toUpperCase(); }
      else if(cur && Object.keys(cur.options).length===0){ cur.prompt = (cur.prompt?cur.prompt+' ':'') + b.text; }
    } else if(b.type==='tr' && cur){
      b.cells.forEach(cellText=>{
        const om = cellText.match(FI_OPT_RE);
        if(om && Object.keys(cur.options).length<4) cur.options[om[1].toUpperCase()] = om[2].trim();
      });
    }
  });
  finalize();
  return {questions, warnings};
}

function parseTrueFalseBlocks(blocks){
  const questions = [], warnings = [];
  let cur = null;
  function finalize(){
    if(!cur) return;
    const items = cur.items;
    if(cur.prompt && items.length===4 && items.every(it=>it.text) && items.every(it=>it.correct!==null)){
      questions.push({ prompt: cur.prompt, items: items.map(it=>({text:it.text, correct:it.correct})) });
    } else {
      warnings.push(`Đúng/Sai — Câu ${cur.num||'?'}: thiếu ý a/b/c/d hoặc đáp án, đã bỏ qua`);
    }
    cur = null;
  }
  blocks.forEach(b=>{
    if(b.type==='p'){
      const qm = b.text.match(FI_Q_START_RE);
      const tfm = b.text.match(FI_ANS_TF_RE);
      if(qm){ finalize(); cur = { num:qm[1], prompt:qm[2]||'', items: [] }; }
      else if(tfm && cur){
        tfm[1].replace(/\s+/g,'').split('').forEach((ch,i)=>{ if(cur.items[i]) cur.items[i].correct = /^[Đđ]$/.test(ch); });
      } else if(cur && cur.items.length===0){ cur.prompt = (cur.prompt?cur.prompt+' ':'') + b.text; }
    } else if(b.type==='tr' && cur){
      if(b.cells[0] && /^[a-d]\)/i.test(b.cells[0].trim())){
        cur.items.push({ text: (b.cells[1]||'').trim(), correct: null });
      }
    }
  });
  finalize();
  return {questions, warnings};
}

function parseShortAnswerBlocks(blocks){
  const questions = [], warnings = [];
  let cur = null;
  function finalize(){
    if(!cur) return;
    if(cur.prompt && cur.answer){ questions.push({ prompt: cur.prompt, accepted: [cur.answer] }); }
    else { warnings.push(`Trả lời ngắn — Câu ${cur.num||'?'}: thiếu đề bài hoặc đáp án, đã bỏ qua`); }
    cur = null;
  }
  blocks.forEach(b=>{
    if(b.type!=='p') return;
    const qm = b.text.match(FI_Q_START_RE);
    const am = b.text.match(FI_ANS_TEXT_RE);
    if(qm){ finalize(); cur = { num:qm[1], prompt:qm[2]||'', answer:null }; }
    else if(am && cur && !cur.answer){ cur.answer = am[1].trim(); }
    else if(cur && !cur.answer){ cur.prompt = (cur.prompt?cur.prompt+' ':'') + b.text; }
  });
  finalize();
  return {questions, warnings};
}

function parseFullTestDocx(blocks){
  const sections = splitIntoSections(blocks);
  const mcq = parseMCQBlocks(sections[1]);
  const tf = parseTrueFalseBlocks(sections[2]);
  const sa = parseShortAnswerBlocks(sections[3]);
  return {
    mcq: mcq.questions, tf: tf.questions, sa: sa.questions,
    warnings: [...mcq.warnings, ...tf.warnings, ...sa.warnings]
  };
}

/* ---------------- GIAO DIỆN ----------------
   Nút bấm mở file (label bọc <input type="file"> ẩn) nằm trong renderTestEditor()
   ở 17-soan-bai-kiem-tra.js, ngay cạnh nút "Dán nhanh nhiều câu". */
async function handleFileImportPick(file){
  fileImportOpen = { status:'busy', fileName: file.name };
  render();
  try{
    const blocks = await docxFileToBlocks(file);
    const result = parseFullTestDocx(blocks);
    const total = result.mcq.length + result.tf.length + result.sa.length;
    if(total===0){
      fileImportOpen = { status:'error', fileName: file.name,
        message: 'Không nhận diện được câu nào — kiểm tra lại file có đúng khuôn "PHẦN I/II/III" và đáp án dạng "ĐA:..." không.' };
    } else {
      fileImportOpen = {
        status:'preview', fileName: file.name,
        mcq: result.mcq, tf: result.tf, sa: result.sa, warnings: result.warnings,
        includeMcq: result.mcq.length>0, includeTf: result.tf.length>0, includeSa: result.sa.length>0,
        busy:false, error:''
      };
    }
  }catch(e){
    fileImportOpen = { status:'error', fileName: file.name, message: e.message || 'Đọc file thất bại' };
  }
  render();
}

async function submitFileImport(){
  const f = fileImportOpen;
  f.busy = true; f.error = ''; render();
  let added = 0;
  try{
    if(f.includeMcq){
      for(const q of f.mcq){
        const data = { options: q.options, correctIndex: q.correctIndex };
        const res = await authorizedRequest('/tests/questions/add', { testId: testEditorOpen.id, type:'mcq', prompt:q.prompt, imageData:null, data });
        testEditorOpen.questions.push({ id:res.id, type:'mcq', prompt:q.prompt, imageData:null, data, orderIndex:res.orderIndex });
        added++;
      }
    }
    if(f.includeTf){
      for(const q of f.tf){
        const data = { items: q.items };
        const res = await authorizedRequest('/tests/questions/add', { testId: testEditorOpen.id, type:'true_false', prompt:q.prompt, imageData:null, data });
        testEditorOpen.questions.push({ id:res.id, type:'true_false', prompt:q.prompt, imageData:null, data, orderIndex:res.orderIndex });
        added++;
      }
    }
    if(f.includeSa){
      for(const q of f.sa){
        const data = { accepted: q.accepted };
        const res = await authorizedRequest('/tests/questions/add', { testId: testEditorOpen.id, type:'short_answer', prompt:q.prompt, imageData:null, data });
        testEditorOpen.questions.push({ id:res.id, type:'short_answer', prompt:q.prompt, imageData:null, data, orderIndex:res.orderIndex });
        added++;
      }
    }
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].questionCount = testEditorOpen.questions.length;
    fileImportOpen = null;
    toast(`Đã thêm ${added} câu từ file ✓` + (f.warnings.length ? ` (bỏ qua ${f.warnings.length} câu không nhận diện được)` : ''));
  }catch(e){
    f.error = (added>0 ? `Đã thêm ${added} câu thì gặp lỗi: ` : 'Lỗi: ') + (e.message||'Thêm câu hỏi thất bại');
    f.busy = false;
  }
  render();
}

function renderFileImportModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  const canClose = fileImportOpen.status!=='busy' && !(fileImportOpen.busy);
  overlay.onclick = (e)=>{ if(e.target===overlay && canClose){ fileImportOpen=null; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<div class="modal-title display">📎 Nhập đề từ file Word</div>`;

  if(fileImportOpen.status==='busy'){
    const p = document.createElement('div');
    p.className = 'tr-sub';
    p.style.margin = '6px 0 4px';
    p.textContent = `Đang đọc "${fileImportOpen.fileName}"…`;
    card.appendChild(p);
  } else if(fileImportOpen.status==='error'){
    const p = document.createElement('div');
    p.style.color = 'var(--coral)'; p.style.fontSize = '13px'; p.style.lineHeight = '1.6'; p.style.margin = '6px 0 4px';
    p.textContent = fileImportOpen.message;
    card.appendChild(p);
    const btn = document.createElement('button');
    btn.className = 'save-btn'; btn.style.marginTop = '16px'; btn.textContent = 'Đóng';
    btn.onclick = ()=>{ fileImportOpen=null; render(); };
    card.appendChild(btn);
  } else if(fileImportOpen.status==='preview'){
    const f = fileImportOpen;
    const help = document.createElement('div');
    help.className = 'tr-sub'; help.style.marginBottom = '12px';
    help.textContent = `Đã đọc "${f.fileName}" — chọn phần muốn thêm vào đề:`;
    card.appendChild(help);

    const rows = [
      ['includeMcq', `Phần I — Trắc nghiệm (${f.mcq.length} câu)`, f.mcq.length],
      ['includeTf', `Phần II — Đúng/Sai (${f.tf.length} câu)`, f.tf.length],
      ['includeSa', `Phần III — Trả lời ngắn (${f.sa.length} câu)`, f.sa.length],
    ];
    rows.forEach(([key,label,count])=>{
      if(count===0) return;
      const row = document.createElement('label');
      row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px 0; font-size:14px; cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = f[key];
      cb.onchange = ()=>{ f[key] = cb.checked; render(); };
      row.appendChild(cb);
      const span = document.createElement('span'); span.textContent = label;
      row.appendChild(span);
      card.appendChild(row);
    });

    if(f.warnings.length){
      const warnBox = document.createElement('div');
      warnBox.style.cssText = 'margin-top:8px; font-size:12px; color:var(--ink-faint); line-height:1.6;';
      warnBox.textContent = `⚠ ${f.warnings.length} câu không nhận diện được đầy đủ, sẽ không được thêm: ` + f.warnings.slice(0,4).join('; ') + (f.warnings.length>4 ? '…' : '');
      card.appendChild(warnBox);
    }

    if(f.error){
      const errBox = document.createElement('div');
      errBox.style.color = 'var(--coral)'; errBox.style.fontSize = '12px'; errBox.style.margin = '10px 0 0';
      errBox.textContent = f.error;
      card.appendChild(errBox);
    }

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex'; btnRow.style.gap = '8px'; btnRow.style.marginTop = '16px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'save-btn secondary-btn';
    cancelBtn.style.margin = '0'; cancelBtn.style.flex = '1';
    cancelBtn.textContent = 'Huỷ'; cancelBtn.disabled = f.busy;
    cancelBtn.onclick = ()=>{ fileImportOpen=null; render(); };
    btnRow.appendChild(cancelBtn);

    const totalSelected = (f.includeMcq?f.mcq.length:0) + (f.includeTf?f.tf.length:0) + (f.includeSa?f.sa.length:0);
    const addBtn = document.createElement('button');
    addBtn.className = 'save-btn';
    addBtn.style.margin = '0'; addBtn.style.flex = '2';
    addBtn.textContent = f.busy ? 'Đang thêm…' : `+ Thêm ${totalSelected} câu vào đề`;
    addBtn.disabled = f.busy || totalSelected===0;
    addBtn.onclick = submitFileImport;
    btnRow.appendChild(addBtn);

    card.appendChild(btnRow);
  }

  overlay.appendChild(card);
  return overlay;
}
