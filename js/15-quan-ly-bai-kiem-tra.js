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

