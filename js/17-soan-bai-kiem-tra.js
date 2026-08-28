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

