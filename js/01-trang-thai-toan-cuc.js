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

