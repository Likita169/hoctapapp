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
    attachmentName: studentTestDetailOpen.attachmentName, attachmentMime: studentTestDetailOpen.attachmentMime, attachmentData: studentTestDetailOpen.attachmentData
  };
  takeTestAnswers = {};
  questions.forEach(q=>{ if(q.type==='essay') takeTestAnswers[q.id] = []; });
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
    const wasEssay = takeTestOpen.testType === 'essay';
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

