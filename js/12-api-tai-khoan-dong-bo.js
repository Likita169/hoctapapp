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

