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

