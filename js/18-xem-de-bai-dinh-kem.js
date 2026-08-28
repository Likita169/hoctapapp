/* 18-xem-de-bai-dinh-kem.js — Xem trước đề bài đính kèm (PDF/Word/ảnh) ngay trong app bằng pdf.js/mammoth.js, tải lên/xoá tệp đề bài, và giao bài (bật/tắt bản nháp)
   (Phần 4112-4462 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---- giao bài & xem điểm (giáo viên) ---- */
/* ---- Xem đề bài (PDF/Word) ngay trong app, không cần tải về ----
   PDF: KHÔNG dùng <iframe> nhúng PDF nữa — nhiều trình duyệt di động (đặc
   biệt app đã "Thêm vào màn hình chính" trên iPhone) không có sẵn khung xem
   PDF nhúng trong iframe, chỉ hiện màn hình trắng. Thay vào đó dùng pdf.js
   (thư viện mã nguồn mở của Mozilla) để tự vẽ từng trang ra <canvas> — cách
   này chạy được trên mọi trình duyệt/webview vì canvas là chuẩn web cơ bản.
   .docx: chuyển sang HTML để đọc ngay bằng thư viện mammoth.js.
   Cả 2 thư viện đều chạy hoàn toàn trên máy người dùng (không gửi file lên
   đâu cả), tải từ CDN đúng lúc cần, không tải sẵn để không làm nặng app lúc
   mở lần đầu.
   .doc (định dạng Word cũ) không có cách xem trong trình duyệt, chỉ tải về. */
let _mammothLoadPromise = null;
function ensureMammothLoaded(){
  if(window.mammoth) return Promise.resolve();
  if(_mammothLoadPromise) return _mammothLoadPromise;
  _mammothLoadPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.7.0/mammoth.browser.min.js';
    s.onload = ()=> resolve();
    s.onerror = ()=>{ _mammothLoadPromise = null; reject(new Error('Cần có mạng để mở trình xem Word lần đầu')); };
    document.head.appendChild(s);
  });
  return _mammothLoadPromise;
}

let _pdfjsLoadPromise = null;
function ensurePdfJsLoaded(){
  if(window.pdfjsLib) return Promise.resolve();
  if(_pdfjsLoadPromise) return _pdfjsLoadPromise;
  _pdfjsLoadPromise = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = ()=>{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      resolve();
    };
    s.onerror = ()=>{ _pdfjsLoadPromise = null; reject(new Error('Cần có mạng để mở trình xem PDF lần đầu')); };
    document.head.appendChild(s);
  });
  return _pdfjsLoadPromise;
}

function dataUrlToArrayBuffer(dataUrl){
  const base64 = dataUrl.slice(dataUrl.indexOf(',')+1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function openFilePreview(file){
  // file: {name, mime, dataUrl}
  filePreviewOpen = {
    name: file.name, mime: file.mime, dataUrl: file.dataUrl, objectUrl: null,
    html: null, pages: [], totalPages: 0, truncated: false, loading: true, error: ''
  };
  render();

  if(file.mime === 'application/msword'){
    filePreviewOpen.loading = false;
    filePreviewOpen.error = 'Trình xem trong app chưa đọc được định dạng .doc cũ này. Hãy tải về máy để xem, hoặc nhờ giáo viên xuất lại dạng .docx hoặc PDF.';
    render();
    return;
  }

  // objectUrl chỉ dùng cho nút "Mở trong trình duyệt" dự phòng — không còn
  // dùng để nhúng iframe nữa.
  try{
    const resp = await fetch(file.dataUrl);
    const blob = await resp.blob();
    filePreviewOpen.objectUrl = URL.createObjectURL(blob);
  }catch(e){ /* vẫn còn dataUrl gốc để dùng tạm nếu bước này lỗi */ }

  if(file.mime === 'application/pdf'){
    try{
      await ensurePdfJsLoaded();
      const arrayBuffer = dataUrlToArrayBuffer(file.dataUrl);
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const maxPages = Math.min(pdf.numPages, 40); // chặn tài liệu quá dài làm máy yếu bị đơ
      filePreviewOpen.totalPages = pdf.numPages;
      filePreviewOpen.truncated = pdf.numPages > maxPages;
      const containerWidth = Math.min(document.documentElement.clientWidth - 24, 720);
      for(let i=1; i<=maxPages; i++){
        // Người dùng có thể đã đóng preview hoặc mở tệp khác trong lúc đang vẽ dở — dừng lại luôn.
        if(!filePreviewOpen || filePreviewOpen.dataUrl !== file.dataUrl) return;
        const page = await pdf.getPage(i);
        if(!filePreviewOpen || filePreviewOpen.dataUrl !== file.dataUrl) return;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = (containerWidth / unscaled.width) * Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.className = 'file-preview-page';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if(!filePreviewOpen || filePreviewOpen.dataUrl !== file.dataUrl) return;
        filePreviewOpen.pages.push(canvas);
        filePreviewOpen.loading = false; // hiện dần từng trang ngay khi vẽ xong, không cần đợi hết tài liệu
        // Nối trực tiếp vào DOM thay vì gọi render() toàn app mỗi trang —
        // render() xoá sạch rồi dựng lại cả cây DOM, làm animation mở modal
        // chạy lại từ đầu mỗi lần → nhấp nháy liên tục cho tới khi xong hết
        // trang. Chỉ khi khung xem chưa từng được vẽ ra (hiếm) mới cần render().
        if(filePreviewOpen.pagesWrapEl && filePreviewOpen.pagesWrapEl.isConnected){
          filePreviewOpen.pagesWrapEl.appendChild(canvas);
          if(filePreviewOpen.statusEl && i < maxPages){
            filePreviewOpen.statusEl.textContent = `Đang tải thêm trang… (${filePreviewOpen.pages.length}/${filePreviewOpen.totalPages})`;
          }
        } else {
          render();
        }
      }
      // Xong toàn bộ — cập nhật dòng trạng thái tại chỗ, không gọi render() để tránh giật hình lần cuối.
      if(filePreviewOpen.statusEl){
        if(filePreviewOpen.truncated){
          filePreviewOpen.statusEl.style.cssText = 'text-align:center; margin-top:10px;';
          filePreviewOpen.statusEl.textContent = `Chỉ xem trước ${filePreviewOpen.pages.length}/${filePreviewOpen.totalPages} trang đầu — tải xuống để xem đầy đủ.`;
        } else {
          filePreviewOpen.statusEl.remove();
        }
        filePreviewOpen.statusEl = null;
      }
      filePreviewOpen.loading = false;
    }catch(e){
      filePreviewOpen.error = 'Không mở được bản xem trước PDF trong app — vui lòng tải xuống hoặc bấm ↗ để mở trong trình duyệt.';
      filePreviewOpen.loading = false;
      render();
    }
    return;
  }

  if(file.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    try{
      await ensureMammothLoaded();
      const arrayBuffer = dataUrlToArrayBuffer(file.dataUrl);
      const result = await window.mammoth.convertToHtml({ arrayBuffer });
      filePreviewOpen.html = result.value || '<p><em>(Tài liệu trống)</em></p>';
    }catch(e){
      filePreviewOpen.error = (e && e.message) || 'Không mở được tệp này trong app — vui lòng tải về xem.';
    }
  }
  filePreviewOpen.loading = false;
  render();
}

function closeFilePreview(){
  if(filePreviewOpen && filePreviewOpen.objectUrl){
    try{ URL.revokeObjectURL(filePreviewOpen.objectUrl); }catch(e){ /* ignore */ }
  }
  filePreviewOpen = null;
  render();
}

function renderFilePreviewModal(){
  const f = filePreviewOpen;
  const overlay = document.createElement('div');
  overlay.className = 'file-preview-overlay';

  const bar = document.createElement('div');
  bar.className = 'file-preview-bar';
  const title = document.createElement('div');
  title.className = 'file-preview-title';
  title.textContent = f.name;
  bar.appendChild(title);

  const dlBtn = document.createElement('a');
  dlBtn.href = f.dataUrl; dlBtn.download = f.name;
  dlBtn.className = 'file-preview-icon-btn';
  dlBtn.textContent = '⬇';
  dlBtn.title = 'Tải xuống';
  bar.appendChild(dlBtn);

  if(f.mime === 'application/pdf'){
    // Dự phòng: mở bằng trình xem PDF thật của hệ điều hành/trình duyệt,
    // phòng khi máy quá yếu để pdf.js vẽ hoặc gặp file PDF lỗi/đặc biệt.
    const openTabBtn = document.createElement('a');
    openTabBtn.href = f.objectUrl || f.dataUrl;
    openTabBtn.target = '_blank';
    openTabBtn.rel = 'noopener';
    openTabBtn.className = 'file-preview-icon-btn';
    openTabBtn.textContent = '↗';
    openTabBtn.title = 'Mở trong trình duyệt';
    bar.appendChild(openTabBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'file-preview-icon-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Đóng';
  closeBtn.onclick = closeFilePreview;
  bar.appendChild(closeBtn);
  overlay.appendChild(bar);

  const body = document.createElement('div');
  body.className = 'file-preview-body';

  if(f.mime === 'application/pdf'){
    if(f.error && !f.pages.length){
      const errWrap = document.createElement('div');
      errWrap.style.cssText = 'text-align:center; padding:40px 24px;';
      errWrap.innerHTML = `<div class="tr-sub" style="margin-bottom:18px;">${escapeHtml(f.error)}</div>`;
      const dlBtn2 = document.createElement('a');
      dlBtn2.href = f.dataUrl; dlBtn2.download = f.name;
      dlBtn2.className = 'save-btn';
      dlBtn2.style.cssText = 'max-width:240px; margin:0 auto; display:block; text-decoration:none;';
      dlBtn2.textContent = '⬇ Tải về xem';
      errWrap.appendChild(dlBtn2);
      body.appendChild(errWrap);
    } else {
      // Container "sống" — openFilePreview() nối thẳng canvas từng trang vào
      // đây khi vẽ xong, không gọi lại render() toàn app (tránh nhấp nháy).
      const pagesWrap = document.createElement('div');
      pagesWrap.className = 'pdf-pages';
      f.pages.forEach(canvas=> pagesWrap.appendChild(canvas));
      body.appendChild(pagesWrap);
      f.pagesWrapEl = pagesWrap;

      if(f.loading || f.truncated){
        const statusEl = document.createElement('div');
        statusEl.className = 'tr-sub';
        statusEl.style.cssText = f.loading
          ? 'text-align:center; padding:' + (f.pages.length ? '16px' : '48px 20px') + ';'
          : 'text-align:center; margin-top:10px;';
        statusEl.textContent = f.loading
          ? (f.pages.length ? `Đang tải thêm trang… (${f.pages.length}/${f.totalPages})` : 'Đang tải bản xem trước…')
          : `Chỉ xem trước ${f.pages.length}/${f.totalPages} trang đầu — tải xuống để xem đầy đủ.`;
        body.appendChild(statusEl);
        f.statusEl = f.loading ? statusEl : null; // hết loading + không cần cập nhật thêm thì thôi không giữ tham chiếu
      } else {
        f.statusEl = null;
      }
    }
  } else if(f.loading){
    const l = document.createElement('div');
    l.className = 'tr-sub';
    l.style.cssText = 'text-align:center; padding:48px 20px;';
    l.textContent = 'Đang tải trình xem…';
    body.appendChild(l);
  } else if(f.error){
    const errWrap = document.createElement('div');
    errWrap.style.cssText = 'text-align:center; padding:40px 24px;';
    const errMsg = document.createElement('div');
    errMsg.className = 'tr-sub';
    errMsg.style.marginBottom = '18px';
    errMsg.textContent = f.error;
    errWrap.appendChild(errMsg);
    const dlBtn2 = document.createElement('a');
    dlBtn2.href = f.dataUrl; dlBtn2.download = f.name;
    dlBtn2.className = 'save-btn';
    dlBtn2.style.cssText = 'max-width:240px; margin:0 auto; display:block; text-decoration:none;';
    dlBtn2.textContent = '⬇ Tải về xem';
    errWrap.appendChild(dlBtn2);
    body.appendChild(errWrap);
  } else if(f.html){
    const docWrap = document.createElement('div');
    docWrap.className = 'file-preview-doc';
    docWrap.innerHTML = f.html;
    body.appendChild(docWrap);
  }
  overlay.appendChild(body);
  return overlay;
}


async function uploadTestAttachment(file){
  if(!file) return;
  const ALLOWED_DOC = {
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true
  };
  const isImage = file.type.startsWith('image/');
  if(!ALLOWED_DOC[file.type] && !isImage){
    toast('Chỉ nhận tệp PDF, Word (.pdf, .doc, .docx) hoặc ảnh (.jpg, .png, .webp)');
    return;
  }
  if(!isImage && file.size > 5.5 * 1024 * 1024){
    toast('Tệp quá lớn — vui lòng chọn tệp dưới khoảng 5MB');
    return;
  }
  testAttachmentBusy = true; testAttachmentError = ''; render();
  try{
    let dataUrl, mime, fileName;
    if(isImage){
      // Nén ảnh đề bài với độ phân giải cao hơn ảnh câu hỏi thường (giữ chữ
      // trong đề rõ để đọc), nhưng vẫn đủ nhỏ để lưu trong D1.
      const { mime: outMime, base64 } = await compressImageFile(file, 1800, 0.85);
      if(base64.length > 6_500_000){
        toast('Ảnh vẫn còn quá lớn sau khi nén, hãy thử ảnh khác');
        testAttachmentBusy = false; render();
        return;
      }
      mime = outMime; dataUrl = 'data:' + outMime + ';base64,' + base64; fileName = file.name;
    } else {
      dataUrl = await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = ()=> resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      mime = file.type; fileName = file.name;
    }
    const res = await authorizedRequest('/tests/attachment/set', {
      testId: testEditorOpen.id, fileName, mime, data: dataUrl
    });
    testEditorOpen.attachmentName = res.attachmentName;
    testEditorOpen.attachmentMime = res.attachmentMime;
    testEditorOpen.attachmentData = dataUrl;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].hasAttachment = true;
    toast('Đã tải lên đề bài ✓');
  }catch(e){
    testAttachmentError = e.message || 'Tải tệp lên thất bại';
    toast('Lỗi: ' + testAttachmentError);
  }
  testAttachmentBusy = false; render();
}

async function removeTestAttachment(){
  testAttachmentBusy = true; render();
  try{
    await authorizedRequest('/tests/attachment/remove', { testId: testEditorOpen.id });
    testEditorOpen.attachmentName = null;
    testEditorOpen.attachmentMime = null;
    testEditorOpen.attachmentData = null;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0) TESTS[idx].hasAttachment = false;
    toast('Đã xoá tệp đề bài');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  testAttachmentBusy = false; render();
}

async function publishTest(published, maxAttempts, deadlineAt){
  if(deadlineAt === undefined) deadlineAt = testEditorOpen.deadlineAt || null;
  publishBusy = true; render();
  try{
    const res = await authorizedRequest('/tests/publish', { testId: testEditorOpen.id, published, maxAttempts, deadlineAt });
    testEditorOpen.published = res.published;
    testEditorOpen.maxAttempts = res.maxAttempts;
    testEditorOpen.deadlineAt = res.deadlineAt || null;
    const idx = TESTS.findIndex(t=>t.id===testEditorOpen.id);
    if(idx>=0){ TESTS[idx].published = res.published; TESTS[idx].maxAttempts = res.maxAttempts; TESTS[idx].deadlineAt = res.deadlineAt || null; }
    toast(res.published ? 'Đã giao bài cho học sinh ✓' : 'Đã chuyển về bản nháp');
  }catch(e){
    toast('Lỗi: ' + (e.message||''));
  }
  publishBusy = false; render();
}

