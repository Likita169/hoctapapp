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
// chèn thẳng đoạn mã LaTeX tương ứng (đặt trong $...$) vào đúng vị trí con
// trỏ trong ô soạn (giống gõ 1 phím bình thường), con trỏ tự nằm vào đúng
// chỗ cần điền — không dựng hình khối riêng trong lúc gõ nữa. Hình dáng
// chuẩn (căn, phân số...) chỉ hiện ở khung "Xem trước" ngay bên dưới và ở
// mọi nơi thẻ hiển thị sau này, vẽ bằng chính KaTeX nên luôn đúng chuẩn,
// không còn bị lệch dòng hay "lòi" lên như cách vẽ tay bằng CSS trước đây.
const MATH_STRUCT_BUTTONS = [
  {label:'√', before:'$\\sqrt{', after:'}$', title:'Căn bậc hai'},
  {label:'a/b', before:'$\\frac{', after:'}{ }$', title:'Phân số — gõ tử số trước, rồi chạm vào giữa cặp { } tiếp theo để gõ mẫu số'},
  {label:'x²', before:'${}^{', after:'}$', title:'Số mũ (lũy thừa)'},
  {label:'x₁', before:'${}_{', after:'}$', title:'Chỉ số dưới'},
];

/* ---------------- Điền vào chỗ trống (Cloze) ----------------
   Bôi đen 1 từ/cụm từ trong câu rồi bấm "🕳 Ẩn từ" sẽ đánh dấu nó thành 1
   chỗ trống có số thứ tự (c1, c2, ...). Khi lưu, MỖI chỗ trống trở thành
   1 thẻ ôn tập RIÊNG (giống Anki): thẻ đó ẩn đúng từ của nó, còn các chỗ
   trống khác trong cùng câu vẫn hiện chữ bình thường (làm ngữ cảnh). Cách
   này buộc não phải "nhớ ra" thay vì chỉ "nhận ra" — hiệu quả ghi nhớ cao
   hơn hẳn so với lật thẻ thông thường. Được lưu ngay trong chuỗi văn bản
   (như công thức toán) bằng cú pháp {{c1::từ bị ẩn}}. */
function nextClozeIndex(text){
  const indices = clozeIndicesOf(text);
  return indices.length ? Math.max(...indices) + 1 : 1;
}
// field ở đây là 1 <textarea> thường — dùng selectionStart/selectionEnd
// (API chuẩn của textarea) thay vì Range/Selection của contenteditable,
// nên hoạt động ổn định như nhau trên mọi trình duyệt/điện thoại.
function wrapSelectionAsCloze(field){
  const start = field.selectionStart, end = field.selectionEnd;
  if(start === end){
    toast('Hãy bôi đen từ/cụm từ cần ẩn trước, rồi bấm nút này');
    return;
  }
  const selected = field.value.slice(start, end);
  if(!selected.trim()){
    toast('Hãy bôi đen từ/cụm từ cần ẩn trước, rồi bấm nút này');
    return;
  }
  const snippet = '{{c' + nextClozeIndex(field.value) + '::' + selected + '}}';
  field.value = field.value.slice(0, start) + snippet + field.value.slice(end);
  const cursor = start + snippet.length;
  field.focus();
  field.setSelectionRange(cursor, cursor);
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

// Chèn 1 đoạn mã vào đúng vị trí con trỏ trong <textarea>, giống hệt như
// vừa gõ nó vào bàn phím — dùng cho các nút ký hiệu ở thanh công cụ.
// Nếu đang bôi đen sẵn 1 đoạn thì đoạn đó được coi là "phần bên trong"
// (vd bôi đen "4" rồi bấm √ ra thẳng "$\sqrt{4}$" thay vì phải gõ lại số 4).
function insertMathSnippet(field, before, after){
  const start = field.selectionStart, end = field.selectionEnd;
  const selected = field.value.slice(start, end);
  field.value = field.value.slice(0, start) + before + selected + after + field.value.slice(end);
  // Không bôi đen gì trước đó: đặt con trỏ ngay sau "before" để gõ tiếp
  // vào giữa (vd giữa 2 dấu ngoặc { }). Có bôi đen: đặt con trỏ ngay sau
  // toàn bộ đoạn vừa chèn, để gõ tiếp chữ theo sau như bình thường.
  const cursor = selected ? (start + before.length + selected.length + after.length) : (start + before.length);
  field.focus();
  field.setSelectionRange(cursor, cursor);
}

// Xây 1 ô soạn công thức: 1 <textarea> gõ mã bình thường (con trỏ hoạt
// động tự nhiên như mọi ô nhập khác) + thanh công cụ chèn ký hiệu phía
// trên + khung "Xem trước" phía dưới hiện đúng ký tự toán học chuẩn bằng
// KaTeX — y hệt cách thẻ sẽ hiển thị khi ôn tập. Trả về {wrap, field}.
// opts.clozeButton=true → thêm nút "🕳 Ẩn từ" để đánh dấu chỗ trống.
function buildMathCardInput(fieldId, placeholder, opts){
  opts = opts || {};
  const wrap = document.createElement('div');

  const toolbar = document.createElement('div');
  toolbar.className = 'math-toolbar';

  const field = document.createElement('textarea');
  field.id = fieldId;
  field.className = 'card-input';
  field.placeholder = placeholder || '';
  field.rows = 3;
  field.setAttribute('translate', 'no');

  const preview = document.createElement('div');
  preview.className = 'math-preview is-empty';
  preview.id = fieldId + 'Preview';
  preview.textContent = 'Xem trước sẽ hiện ở đây...';

  const updatePreview = ()=>{
    const val = field.value;
    if(!val.trim()){
      preview.classList.add('is-empty');
      preview.textContent = 'Xem trước sẽ hiện ở đây...';
      return;
    }
    preview.classList.remove('is-empty');
    preview.innerHTML = escapeHtml(val);
    renderMathIn(preview);
  };

  const addBtn = (label, title, onClick)=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'math-btn' + (label.length>1 ? ' math-btn-wide' : '');
    btn.textContent = label;
    if(title) btn.title = title;
    // preventDefault ở mousedown để ô nhập không bị mất focus/con trỏ
    // trước khi kịp chèn ký hiệu vào đúng vị trí đang gõ.
    btn.onmousedown = (e)=> e.preventDefault();
    btn.onclick = (e)=>{ e.preventDefault(); onClick(); updatePreview(); };
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
    structGroup.appendChild(addBtn(s.label, s.title, ()=> insertMathSnippet(field, s.before, s.after)));
  });
  toolbar.appendChild(structGroup);

  MATH_TEXT_GROUPS.forEach(group=>{
    const g = document.createElement('div');
    g.className = 'math-tgroup';
    group.forEach(s=> g.appendChild(addBtn(s.label, 'Chèn ' + s.label, ()=> insertMathSnippet(field, s.text, ''))));
    toolbar.appendChild(g);
  });

  field.addEventListener('input', updatePreview);

  wrap.appendChild(toolbar);
  wrap.appendChild(field);
  wrap.appendChild(preview);
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


