/* 06-cong-thuc-toan.js — Vẽ công thức toán bằng KaTeX trong nội dung thẻ, và bộ công cụ soạn công thức (căn, phân số, số mũ, ký hiệu Hy Lạp...) khi tạo/sửa thẻ
   (Phần 765-1025 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- Công thức toán học (KaTeX) ----------------
   Mặt trước/sau của thẻ được lưu dạng văn bản thường; đoạn nào đặt giữa
   $...$ (hoặc $$...$$) sẽ được KaTeX vẽ thành công thức toán. Hàm dưới
   đây được gọi lại mỗi khi giao diện được vẽ (render()) để hiện công thức
   ở mọi nơi thẻ xuất hiện (ôn tập, danh sách quản lý, hộp xác nhận xoá...). */
function renderMathIn(el){
  if(!el || typeof window.renderMathInElement !== 'function') return;
  try{
    window.renderMathInElement(el, {
      delimiters: [
        {left:'$$', right:'$$', display:true},
        {left:'\\[', right:'\\]', display:true},
        {left:'$', right:'$', display:false},
        {left:'\\(', right:'\\)', display:false}
      ],
      throwOnError:false,
      ignoredTags:['script','noscript','style','textarea','pre']
    });
  }catch(e){ /* đừng để lỗi vẽ công thức làm hỏng cả giao diện */ }
}


// Các ký hiệu chèn thẳng dạng chữ/ký tự thường — hiện đúng luôn, không cần
// công thức LaTeX phức tạp (chữ Hy Lạp, phép toán, tên hàm lượng giác...).
const MATH_TEXT_GROUPS = [
  [
    {label:'α', text:'α'}, {label:'β', text:'β'}, {label:'γ', text:'γ'}, {label:'θ', text:'θ'},
    {label:'π', text:'π'}, {label:'Δ', text:'Δ'}, {label:'λ', text:'λ'}, {label:'ω', text:'ω'}, {label:'φ', text:'φ'},
  ],
  [
    {label:'sin', text:'sin'}, {label:'cos', text:'cos'}, {label:'tan', text:'tan'},
    {label:'log', text:'log'}, {label:'ln', text:'ln'},
  ],
  [
    {label:'≤', text:'≤'}, {label:'≥', text:'≥'}, {label:'≠', text:'≠'}, {label:'±', text:'±'},
    {label:'×', text:'×'}, {label:'÷', text:'÷'}, {label:'→', text:'→'}, {label:'⇌', text:'⇌'},
    {label:'∞', text:'∞'}, {label:'°', text:'°'},
  ],
];
// Các khối công thức có cấu trúc (căn, phân số, số mũ, chỉ số) — bấm vào là
// hiện ra đúng hình dạng ngay tại chỗ đang gõ (không phải mã LaTeX thô),
// gõ trực tiếp vào phần trống của khối đó rồi gõ tiếp chữ bình thường.
const MATH_STRUCT_BUTTONS = [
  {label:'√', type:'sqrt', title:'Căn bậc hai'},
  {label:'a/b', type:'frac', title:'Phân số'},
  {label:'x²', type:'sup', title:'Số mũ (lũy thừa)'},
  {label:'x₁', type:'sub', title:'Chỉ số dưới'},
];

/* ---------------- Điền vào chỗ trống (Cloze) ----------------
   Bôi đen 1 từ/cụm từ trong câu rồi bấm "🕳 Ẩn từ" sẽ đánh dấu nó thành 1
   chỗ trống có số thứ tự (c1, c2, ...). Khi lưu, MỖI chỗ trống trở thành
   1 thẻ ôn tập RIÊNG (giống Anki): thẻ đó ẩn đúng từ của nó, còn các chỗ
   trống khác trong cùng câu vẫn hiện chữ bình thường (làm ngữ cảnh). Cách
   này buộc não phải "nhớ ra" thay vì chỉ "nhận ra" — hiệu quả ghi nhớ cao
   hơn hẳn so với lật thẻ thông thường. Được lưu ngay trong chuỗi văn bản
   (như công thức toán) bằng cú pháp {{c1::từ bị ẩn}}. */
function nextClozeIndex(fieldEl){
  let max = 0;
  fieldEl.querySelectorAll('.cloze-mark').forEach(m=>{
    const n = parseInt(m.dataset.c, 10) || 0;
    if(n > max) max = n;
  });
  return max + 1;
}
function wrapSelectionAsCloze(fieldEl){
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0 || sel.isCollapsed){
    toast('Hãy bôi đen từ/cụm từ cần ẩn trước, rồi bấm nút này');
    return;
  }
  const range = sel.getRangeAt(0);
  if(!fieldEl.contains(range.commonAncestorContainer)){
    toast('Hãy bôi đen từ/cụm từ ngay trong ô câu văn bên dưới');
    return;
  }
  const text = range.toString();
  if(!text.trim()){
    toast('Hãy bôi đen từ/cụm từ cần ẩn trước, rồi bấm nút này');
    return;
  }
  const span = document.createElement('span');
  span.className = 'cloze-mark';
  span.contentEditable = 'false';
  span.dataset.type = 'cloze';
  span.dataset.c = String(nextClozeIndex(fieldEl));
  span.textContent = text;
  range.deleteContents();
  range.insertNode(span);
  const anchor = document.createTextNode('\u200b');
  span.after(anchor);
  const r2 = document.createRange();
  r2.setStartAfter(anchor); r2.collapse(true);
  sel.removeAllRanges(); sel.addRange(r2);
  fieldEl.focus();
  markFieldEmptyState(fieldEl);
}
// Chạm vào 1 chỗ đã ẩn để bỏ đánh dấu (trả lại thành chữ thường) — sửa nhầm dễ dàng.
function attachClozeUnwrap(fieldEl){
  fieldEl.addEventListener('click', (e)=>{
    const mark = e.target.closest && e.target.closest('.cloze-mark');
    if(!mark || !fieldEl.contains(mark)) return;
    const text = document.createTextNode(mark.textContent);
    mark.replaceWith(text);
    markFieldEmptyState(fieldEl);
  });
}

// Tách 1 chuỗi có chứa {{cN::đáp án}} thành từng đoạn — dùng chung cho mọi
// nơi cần hiện/ẩn chỗ trống (ôn tập, danh sách quản lý, trò chơi ghép thẻ...).
function parseClozeParts(text){
  const parts = [];
  const re = /\{\{c(\d+)::([\s\S]*?)\}\}/g;
  let last = 0, m;
  while((m = re.exec(text||''))){
    if(m.index > last) parts.push({type:'text', value:text.slice(last, m.index)});
    parts.push({type:'cloze', index: parseInt(m[1],10), answer: m[2]});
    last = re.lastIndex;
  }
  if(last < (text||'').length) parts.push({type:'text', value:text.slice(last)});
  return parts;
}
// Các số thứ tự chỗ trống có trong 1 câu (không trùng lặp, tăng dần).
function clozeIndicesOf(text){
  const set = new Set();
  parseClozeParts(text).forEach(p=>{ if(p.type==='cloze') set.add(p.index); });
  return Array.from(set).sort((a,b)=>a-b);
}
// Đáp án (chữ bị ẩn) của đúng 1 số thứ tự cụ thể trong câu.
function clozeAnswerAt(text, idx){
  const found = parseClozeParts(text).find(p=>p.type==='cloze' && p.index===idx);
  return found ? found.answer : '';
}
// Dựng HTML để hiện câu cloze: chỗ trống mang đúng số idx thì ẩn đi (hoặc
// hiện đáp án có tô đậm nếu revealTarget=true), các chỗ trống KHÁC trong
// cùng câu luôn hiện chữ thật (làm ngữ cảnh, không phải thứ đang được hỏi).
function clozeDisplayHtml(text, idx, revealTarget){
  return parseClozeParts(text).map(p=>{
    if(p.type==='text') return escapeHtml(p.value);
    if(p.index === idx){
      return revealTarget
        ? `<mark class="cloze-answer">${escapeHtml(p.answer)}</mark>`
        : `<span class="cloze-gap">[...]</span>`;
    }
    return escapeHtml(p.answer);
  }).join('');
}
// Bản chữ thường (không HTML) của câu hỏi, dùng làm nhãn nút trong trò
// chơi Ghép thẻ — chỗ trống đang hỏi hiện thành "_____", chỗ khác hiện chữ thật.
function clozeQuestionPlainText(text, idx){
  return parseClozeParts(text).map(p=>{
    if(p.type==='text') return p.value;
    return p.index===idx ? '_____' : p.answer;
  }).join('').trim();
}

// Chuẩn hoá 1 chuỗi để so khớp khi chấm "Gõ đáp án"/trắc nghiệm — bỏ công
// thức toán ($...$), viết thường, gộp khoảng trắng thừa, bỏ khoảng trắng 2 đầu.
function normalizeForCompare(s){
  return (s||'')
    .replace(/\$[^$]*\$/g, ' ')
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}
// Đáp án "đúng" của 1 thẻ, dùng cho cả chế độ Gõ đáp án và Trắc nghiệm nhanh.
function correctAnswerText(card){
  return (card.type==='cloze') ? clozeAnswerAt(card.front, card.clozeIndex) : card.back;
}

function makeMathSlot(placeholder){
  const s = document.createElement('span');
  s.className = 'math-slot';
  s.contentEditable = 'true';
  if(placeholder) s.dataset.placeholder = placeholder;
  return s;
}

// Dựng DOM cho 1 khối công thức; trả về {el, focusSlot} — focusSlot là ô
// trống sẽ được đưa con trỏ vào ngay sau khi chèn, để gõ tiếp luôn.
function buildMathWidget(type){
  const w = document.createElement('span');
  w.className = 'math-widget math-' + type;
  w.contentEditable = 'false';
  w.dataset.type = type;
  if(type === 'sqrt'){
    const sign = document.createElement('span'); sign.className = 'sqrt-sign'; sign.textContent = '√';
    const body = document.createElement('span'); body.className = 'sqrt-body';
    const slot = makeMathSlot(''); slot.classList.add('sqrt-slot');
    body.appendChild(slot);
    w.appendChild(sign); w.appendChild(body);
    return {el:w, focusSlot:slot};
  }
  if(type === 'frac'){
    const col = document.createElement('span'); col.className = 'frac-col';
    const num = makeMathSlot(''); num.classList.add('frac-num');
    const den = makeMathSlot(''); den.classList.add('frac-den');
    col.appendChild(num); col.appendChild(den);
    w.appendChild(col);
    return {el:w, focusSlot:num};
  }
  // sup / sub — chỉ 1 ô nhỏ nâng lên/hạ xuống, chèn ngay sau chữ đã gõ
  // trước đó (không cần chọn "cơ số" riêng, đỡ rắc rối khi thao tác).
  const slot = makeMathSlot(type==='sup' ? '2' : '1');
  w.appendChild(slot);
  return {el:w, focusSlot:slot};
}

// Lấy vị trí con trỏ hiện tại bên trong 1 ô nhập cụ thể; nếu con trỏ
// không nằm trong ô đó (vd chưa từng bấm vào), đưa con trỏ về cuối ô.
function getFieldRange(fieldEl){
  const sel = window.getSelection();
  if(sel && sel.rangeCount > 0){
    const r = sel.getRangeAt(0);
    if(fieldEl.contains(r.startContainer)) return r;
  }
  fieldEl.focus();
  const r = document.createRange();
  r.selectNodeContents(fieldEl);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
  return r;
}

function markFieldEmptyState(fieldEl){
  const empty = fieldEl.childNodes.length===0 ||
    (fieldEl.childNodes.length===1 && fieldEl.firstChild.nodeType===3 && fieldEl.firstChild.textContent==='') ||
    fieldEl.innerHTML === '<br>';
  fieldEl.classList.toggle('is-empty', !!empty);
}

function insertPlainText(fieldEl, text){
  const range = getFieldRange(fieldEl);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node); range.setEndAfter(node);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  fieldEl.focus();
  markFieldEmptyState(fieldEl);
}

function insertMathWidget(fieldEl, type){
  const range = getFieldRange(fieldEl);
  // Không lồng khối công thức vào bên trong 1 ô trống của khối khác —
  // nếu con trỏ đang ở trong 1 ô như vậy thì chỉ chèn ký tự thường tương ứng.
  const inSlot = range.startContainer.nodeType===1
    ? range.startContainer.closest && range.startContainer.closest('.math-slot')
    : range.startContainer.parentElement && range.startContainer.parentElement.closest('.math-slot');
  if(inSlot){
    const fallback = {sqrt:'√', frac:'/', sup:'^', sub:'_'}[type] || '';
    insertPlainText(fieldEl, fallback);
    return;
  }
  range.deleteContents();
  const {el, focusSlot} = buildMathWidget(type);
  range.insertNode(el);
  // Neo con trỏ ngay sau khối vừa chèn bằng 1 ký tự rỗng, để gõ tiếp chữ
  // thường sau công thức luôn hoạt động bình thường trên mọi trình duyệt.
  const anchor = document.createTextNode('\u200b');
  el.after(anchor);
  fieldEl.focus();
  const r2 = document.createRange();
  r2.selectNodeContents(focusSlot); r2.collapse(true);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r2);
  markFieldEmptyState(fieldEl);
}

// Chuyển nội dung đã gõ (chữ thường + các khối công thức + các chỗ đã ẩn
// kiểu cloze) thành 1 chuỗi văn bản để lưu vào thẻ — mỗi khối công thức
// trở thành 1 đoạn $...$, mỗi chỗ ẩn trở thành 1 đoạn {{cN::...}} mà các
// hàm renderMathIn()/clozeDisplayHtml() ở trên sẽ vẽ lại đúng như vậy.
function serializeMathInput(root){
  function textOf(slot){ return slot ? slot.textContent.replace(/\u200b/g,'').trim() : ''; }
  function serializeNode(node){
    if(node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u200b/g,'');
    if(node.nodeType !== Node.ELEMENT_NODE) return '';
    if(node.tagName === 'BR') return '\n';
    const type = node.dataset && node.dataset.type;
    if(type === 'sqrt') return '$\\sqrt{' + textOf(node.querySelector('.sqrt-slot')) + '}$';
    if(type === 'frac') return '$\\frac{' + textOf(node.querySelector('.frac-num')) + '}{' + textOf(node.querySelector('.frac-den')) + '}$';
    if(type === 'sup') return '${}^{' + textOf(node.querySelector('.math-slot')) + '}$';
    if(type === 'sub') return '${}_{' + textOf(node.querySelector('.math-slot')) + '}$';
    if(type === 'cloze'){
      const inner = Array.from(node.childNodes).map(serializeNode).join('').replace(/\u200b/g,'').trim();
      return '{{c' + (node.dataset.c||'1') + '::' + inner + '}}';
    }
    return Array.from(node.childNodes).map(serializeNode).join('');
  }
  return Array.from(root.childNodes).map(serializeNode).join('').trim();
}

// Xây 1 ô nhập kiểu WYSIWYG (thay cho <textarea> thường) cùng thanh công
// cụ chèn công thức ngay phía trên — trả về {wrap, field} để gắn vào form.
// opts.clozeButton=true → thêm nút "🕳 Ẩn từ" để đánh dấu chỗ trống (dùng
// cho thẻ kiểu Điền từ) và cho phép chạm vào 1 chỗ đã ẩn để bỏ đánh dấu.
function buildMathCardInput(fieldId, placeholder, opts){
  opts = opts || {};
  const wrap = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'math-toolbar';

  const field = document.createElement('div');
  field.id = fieldId;
  field.className = 'card-input is-empty';
  field.contentEditable = 'true';
  field.dataset.placeholder = placeholder || '';
  field.setAttribute('translate', 'no');

  const addBtn = (label, title, onClick)=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'math-btn' + (label.length>1 ? ' math-btn-wide' : '');
    btn.textContent = label;
    if(title) btn.title = title;
    // preventDefault ở mousedown để ô nhập không bị mất focus/con trỏ
    // trước khi kịp chèn ký hiệu vào đúng vị trí đang gõ.
    btn.onmousedown = (e)=> e.preventDefault();
    btn.onclick = (e)=>{ e.preventDefault(); onClick(); };
    return btn;
  };

  if(opts.clozeButton){
    const clozeGroup = document.createElement('div');
    clozeGroup.className = 'math-tgroup';
    const clozeBtn = addBtn('🕳 Ẩn từ', 'Bôi đen từ/cụm từ cần ẩn rồi bấm nút này', ()=> wrapSelectionAsCloze(field));
    clozeBtn.classList.add('math-btn-cloze');
    clozeGroup.appendChild(clozeBtn);
    toolbar.appendChild(clozeGroup);
  }

  const structGroup = document.createElement('div');
  structGroup.className = 'math-tgroup';
  MATH_STRUCT_BUTTONS.forEach(s=>{
    structGroup.appendChild(addBtn(s.label, s.title, ()=> insertMathWidget(field, s.type)));
  });
  toolbar.appendChild(structGroup);

  MATH_TEXT_GROUPS.forEach(group=>{
    const g = document.createElement('div');
    g.className = 'math-tgroup';
    group.forEach(s=> g.appendChild(addBtn(s.label, 'Chèn ' + s.label, ()=> insertPlainText(field, s.text))));
    toolbar.appendChild(g);
  });

  field.addEventListener('input', ()=> markFieldEmptyState(field));
  if(opts.clozeButton) attachClozeUnwrap(field);

  wrap.appendChild(toolbar);
  wrap.appendChild(field);
  return {wrap, field};
}

// Always prefer a real display name over an email address anywhere a person
// is shown (teacher on a class card, student in a roster/score list...).
// Falls back to email only if the server hasn't sent a name for that person yet.
function personLabel(p){
  if(!p) return '';
  if(p.name) return p.name;
  return p.email || '';
}
// Short initials for a small round avatar chip, from a name or an email.
function initialsOf(p){
  const label = personLabel(p);
  if(!label) return '?';
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if(parts.length>1) return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
  return label.slice(0,2).toUpperCase();
}
// epoch-ms <-> the string format <input type="datetime-local"> needs/gives,
// both always in the browser's local time zone (no explicit TZ in either).
function toDatetimeLocalValue(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDeadline(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
}

