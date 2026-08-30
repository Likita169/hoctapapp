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

