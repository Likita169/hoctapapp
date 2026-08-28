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

