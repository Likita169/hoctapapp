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
    const clozeBuilt = buildMathCardInput('clozeInput', 'Ví dụ: Nước sôi ở 100 độ C.', {clozeButton:true});
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
  const frontBuilt = buildMathCardInput('frontInput', 'Ví dụ: Định luật II Newton là gì?');
  fFront.appendChild(frontBuilt.wrap);

  const fBack = document.createElement('div');
  fBack.className='field';
  fBack.innerHTML = `<label>Mặt sau — Đáp án / giải thích</label>`;
  main.appendChild(fBack);
  const backBuilt = buildMathCardInput('backInput', 'Ví dụ: F = m.a  (Lực = khối lượng × gia tốc)');
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
      if(s){ s.name = name; s.color = subjectModalColor; }
      editSubjectId = null;
    } else {
      const s = {id:uid(), name, color: subjectModalColor, parentId: newSubjectParentId||null};
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

