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

