/* 08-hen-gio-va-on-tap.js — Modal chọn giờ (dùng cho giờ nhắc nhở) và toàn bộ màn hình Ôn tập (lật thẻ, chấm điểm, hoàn tác)
   (Phần 1323-1589 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

/* ---------------- TIME PICKER MODAL (custom wheel, no native input[type=time]) ---------------- */
function renderTimeModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.onclick = (e)=>{ if(e.target===overlay){ timeModalOpen=false; render(); } };

  const card = document.createElement('div');
  card.className = 'modal-card';
  card.innerHTML = `<div class="modal-title display">Chọn giờ nhắc</div>`;

  const row = document.createElement('div');
  row.className = 'time-picker-row';

  function buildWheel(count){
    const wheel = document.createElement('div');
    wheel.className = 'time-wheel';
    let html = `<div class="time-wheel-pad"></div>`;
    for(let i=0;i<count;i++) html += `<div class="time-wheel-item" data-v="${i}">${String(i).padStart(2,'0')}</div>`;
    html += `<div class="time-wheel-pad"></div>`;
    wheel.innerHTML = html;
    return wheel;
  }

  const hourWheel = buildWheel(24);
  const minuteWheel = buildWheel(60);
  const sep = document.createElement('div');
  sep.className = 'time-wheel-sep';
  sep.textContent = ':';
  const highlight = document.createElement('div');
  highlight.className = 'time-wheel-highlight';

  row.appendChild(hourWheel);
  row.appendChild(sep);
  row.appendChild(minuteWheel);
  row.appendChild(highlight);
  card.appendChild(row);

  let selHour = timeModalHour;
  let selMinute = timeModalMinute;

  function markSelected(wheel, val){
    wheel.querySelectorAll('.time-wheel-item').forEach(el=>{
      el.classList.toggle('selected', Number(el.dataset.v)===val);
    });
  }

  function setupWheel(wheel, initialVal, onChange){
    const maxIdx = wheel.children.length - 3; // exclude the two padding divs
    let settleTimer = null;
    wheel.addEventListener('scroll', ()=>{
      clearTimeout(settleTimer);
      settleTimer = setTimeout(()=>{
        const idx = Math.max(0, Math.min(maxIdx, Math.round(wheel.scrollTop / TIME_ITEM_H)));
        wheel.scrollTo({ top: idx*TIME_ITEM_H, behavior:'smooth' });
        const val = Number(wheel.children[idx+1].dataset.v);
        markSelected(wheel, val);
        onChange(val);
      }, 120);
    });
    requestAnimationFrame(()=>{
      wheel.scrollTop = initialVal * TIME_ITEM_H;
      markSelected(wheel, initialVal);
    });
  }

  setupWheel(hourWheel, selHour, (v)=>{ selHour = v; });
  setupWheel(minuteWheel, selMinute, (v)=>{ selMinute = v; });

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
  cancelBtn.onclick = ()=>{ timeModalOpen=false; render(); };

  const okBtn = document.createElement('button');
  okBtn.className = 'save-btn';
  okBtn.style.background = 'var(--teal)';
  okBtn.textContent = 'Xong';
  okBtn.onclick = async ()=>{
    timeModalHour = selHour;
    timeModalMinute = selMinute;
    timeModalOpen = false;
    render();
    await updatePushTime(selHour, selMinute);
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(okBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);

  return overlay;
}

/* ---------------- REVIEW ---------------- */
function startReview(){
  reviewQueue = dueCards(sessionSubjectFilter).sort((a,b)=>a.due-b.due);
  reviewIdx = 0;
  flipped = false;
  reviewHistory = [];
  reviewMenuOpen = false;
  sessionHadMiss = false;
  sessionXpEarned = 0;
  sessionCompletionHandled = false;
  resetAnswerInputState();
  setView('review');
}

// Xoá sạch trạng thái "đang gõ / đang chọn trắc nghiệm" của thẻ hiện tại —
// gọi mỗi khi chuyển sang thẻ khác (tiến hoặc hoàn tác) để thẻ mới luôn
// bắt đầu từ đầu, không dính trạng thái của thẻ trước.
function resetAnswerInputState(){
  typedAnswerValue = '';
  typedAnswerChecked = false;
  typedAnswerCorrect = false;
  quizCurrentCardId = null;
  quizCurrentChoices = [];
  quizSelectedChoice = null;
  quizIsCorrect = false;
  stopQuizCountdown();
}

// Đồng hồ đếm ngược cho chế độ Trắc nghiệm nhanh — chỉ chạy khi bộ thẻ
// của thẻ đang ôn có bật "Đếm ngược" (đặt trong modal Tạo/Đổi bộ thẻ).
// Hết giờ mà chưa chọn đáp án nào thì coi như trả lời sai, tự lật thẻ.
function stopQuizCountdown(){
  if(quizCountdownHandle){ clearInterval(quizCountdownHandle); quizCountdownHandle = null; }
  quizCountdownRemaining = null;
  quizCountdownCardId = null;
}
function startQuizCountdownIfNeeded(card){
  const subj = subjectById(card.subjectId);
  if(!subj || !subj.countdownEnabled){ stopQuizCountdown(); return; }
  if(quizCountdownCardId === card.id) return; // đã chạy cho đúng thẻ này rồi
  stopQuizCountdown();
  quizCountdownCardId = card.id;
  quizCountdownRemaining = subj.countdownSeconds || 15;
  quizCountdownHandle = setInterval(()=>{
    quizCountdownRemaining -= 1;
    if(quizCountdownRemaining <= 0){
      stopQuizCountdown();
      // Hết giờ — coi như chưa trả lời được, tự lật thẻ hiện đáp án đúng.
      quizSelectedChoice = null;
      quizIsCorrect = false;
      flipped = true;
      render();
      return;
    }
    // Chỉ cập nhật đúng con số hiện trên màn hình, không vẽ lại cả trang
    // để khỏi giật giao diện mỗi giây.
    const el = document.getElementById('quizCountdownDisplay');
    if(el){
      el.textContent = '⏱ ' + quizCountdownRemaining + 's';
      el.classList.toggle('low', quizCountdownRemaining <= 5);
    }
  }, 1000);
}

function undoReview(){
  if(reviewHistory.length===0) return;
  const entry = reviewHistory.pop();
  const c = DATA.cards.find(x=>x.id===entry.cardId);
  if(c) Object.assign(c, entry.snapshot);
  // Hoàn lại XP/lượt ôn vừa cộng — tránh việc chấm rồi hoàn tác lặp lại để "cày" XP khống.
  if(typeof entry.xpBefore === 'number'){
    const xpAwarded = DATA.progress.xp - entry.xpBefore;
    sessionXpEarned = Math.max(0, sessionXpEarned - xpAwarded);
    DATA.progress.xp = entry.xpBefore;
    DATA.progress.totalReviews = entry.reviewsBefore;
  }
  reviewIdx = entry.idx;
  flipped = false;
  resetAnswerInputState();
  saveData();
  render();
}

// Sinh 3 phương án nhiễu (khác đáp án đúng) cho chế độ Trắc nghiệm nhanh —
// ưu tiên lấy từ các thẻ khác CÙNG bộ thẻ trước để các lựa chọn hợp lý về
// mặt ngữ nghĩa, thiếu thì lấy thêm từ toàn bộ dữ liệu.
function buildQuizChoices(card){
  const correct = correctAnswerText(card);
  function answerPool(list){
    return list
      .filter(c=>c.id!==card.id)
      .map(c=> correctAnswerText(c))
      .map(s=>(s||'').trim())
      .filter(s=> s && normalizeForCompare(s)!==normalizeForCompare(correct));
  }
  function pickUnique(arr, n, alreadyUsed){
    const seen = new Set(alreadyUsed.map(normalizeForCompare));
    const out = [];
    const shuffled = arr.slice().sort(()=>Math.random()-0.5);
    for(const s of shuffled){
      const key = normalizeForCompare(s);
      if(seen.has(key)) continue;
      seen.add(key); out.push(s);
      if(out.length>=n) break;
    }
    return out;
  }
  const sameSubjectPool = answerPool(DATA.cards.filter(c=>c.subjectId===card.subjectId));
  let distractors = pickUnique(sameSubjectPool, 3, [correct]);
  if(distractors.length < 3){
    distractors = distractors.concat(pickUnique(answerPool(DATA.cards), 3-distractors.length, [correct, ...distractors]));
  }
  const choices = [correct, ...distractors];
  for(let i=choices.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [choices[i],choices[j]]=[choices[j],choices[i]]; }
  return choices;
}

function checkTypedAnswer(){
  const input = document.getElementById('typedAnswerInput');
  typedAnswerValue = input ? input.value : '';
  const card = reviewQueue[reviewIdx];
  const correct = correctAnswerText(card);
  typedAnswerCorrect = !!typedAnswerValue.trim() && normalizeForCompare(typedAnswerValue) === normalizeForCompare(correct);
  typedAnswerChecked = true;
  flipped = true;
  render();
}

function selectQuizChoice(choice){
  const card = reviewQueue[reviewIdx];
  stopQuizCountdown();
  quizSelectedChoice = choice;
  quizIsCorrect = normalizeForCompare(choice) === normalizeForCompare(correctAnswerText(card));
  flipped = true;
  render();
}

function renderReview(){
  const wrap = document.createElement('div');
  wrap.className='review-wrap';

  if(reviewQueue.length===0 || reviewIdx >= reviewQueue.length){
    stopQuizCountdown();
    if(reviewQueue.length>0 && !sessionCompletionHandled){
      sessionCompletionHandled = true;
      if(!sessionHadMiss && reviewQueue.length>=5) unlockBadge('perfect_session');
      saveData();
    }
    const p = DATA.progress;
    const lvl = computeLevel(p.xp);
    wrap.innerHTML = `<div class="review-done">
      <div class="glyph">🎉</div>
      <h2 class="display">Xong hết rồi!</h2>
      <p>Bạn đã ôn hết các thẻ đến hạn. Quay lại vào ngày mai nhé.</p>
      ${reviewQueue.length>0 ? `
      <div class="session-recap">
        <div class="session-recap-item"><span class="srv">+${sessionXpEarned}</span><span class="srl">XP</span></div>
        <div class="session-recap-item"><span class="srv">🔥 ${p.streak}</span><span class="srl">ngày liên tục</span></div>
        <div class="session-recap-item"><span class="srv">Lv.${lvl.level}</span><span class="srl">${lvl.xpIntoLevel}/${lvl.xpForThisLevel} XP</span></div>
      </div>` : ''}
    </div>`;
    const btn = document.createElement('button');
    btn.className='hero-btn'; btn.style.maxWidth='260px'; btn.textContent='Về trang chủ';
    btn.onclick = ()=> setView('home');
    wrap.querySelector('.review-done').appendChild(btn);
    return wrap;
  }

  const card = reviewQueue[reviewIdx];
  const cardType = card.type || 'basic';

  // Counters over the cards still left in this session (from this card on).
  const remaining = reviewQueue.slice(reviewIdx);
  const newCount = remaining.filter(c=>c.reps===0).length;
  const learningCount = remaining.filter(c=>c.reps>0 && c.interval<21).length;
  const masteredCount = remaining.filter(c=>c.interval>=21).length;
  const bucket = card.reps===0 ? 'new' : (card.interval>=21 ? 'mastered' : 'learning');

  const topbar = document.createElement('div');
  topbar.className = 'review-topbar';
  topbar.innerHTML = `
    <button class="review-icon-btn review-back" aria-label="Đóng">←</button>
    <div class="review-counters">
      <span class="rc rc-blue ${bucket==='new'?'active':''}">${newCount}</span>
      <span class="rc rc-red ${bucket==='learning'?'active':''}">${learningCount}</span>
      <span class="rc rc-green ${bucket==='mastered'?'active':''}">${masteredCount}</span>
    </div>
    <div style="display:flex;">
      <button class="review-icon-btn review-undo" aria-label="Hoàn tác" ${reviewHistory.length===0?'disabled':''}>↶</button>
      <button class="review-icon-btn review-menu-btn" aria-label="Thêm">⋮</button>
    </div>
  `;
  topbar.querySelector('.review-back').onclick = ()=>{ stopQuizCountdown(); setView('home'); };
  topbar.querySelector('.review-undo').onclick = ()=> undoReview();
  topbar.querySelector('.review-menu-btn').onclick = (e)=>{ e.stopPropagation(); reviewMenuOpen = !reviewMenuOpen; render(); };
  wrap.appendChild(topbar);

  if(reviewMenuOpen){
    const menu = document.createElement('div');
    menu.className = 'review-menu';
    const modes = [
      {id:'flip', icon:'🔄', label:'Lật thẻ'},
      {id:'type', icon:'⌨️', label:'Gõ đáp án'},
      {id:'quiz', icon:'🧠', label:'Trắc nghiệm'},
    ];
    menu.innerHTML = modes.map(m=>
      `<button class="review-menu-item" data-mode="${m.id}">${m.icon} ${m.label} ${reviewInputMode===m.id?'✓':''}</button>`
    ).join('') + `
      <button class="review-menu-item" id="shuffleReviewBtn">🔀 Xáo trộn thẻ còn lại</button>
      <button class="review-menu-item" id="endReviewBtn">✕ Kết thúc phiên</button>
    `;
    menu.querySelectorAll('[data-mode]').forEach(btn=>{
      btn.onclick = ()=>{
        setReviewInputMode(btn.dataset.mode);
        reviewMenuOpen = false;
        flipped = false;
        resetAnswerInputState();
        render();
      };
    });
    menu.querySelector('#shuffleReviewBtn').onclick = ()=>{
      const head = reviewQueue.slice(0, reviewIdx);
      const tail = reviewQueue.slice(reviewIdx);
      for(let i=tail.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tail[i],tail[j]]=[tail[j],tail[i]]; }
      reviewQueue = head.concat(tail);
      reviewMenuOpen = false;
      render();
    };
    menu.querySelector('#endReviewBtn').onclick = ()=>{ reviewMenuOpen=false; stopQuizCountdown(); setView('home'); };
    wrap.appendChild(menu);
    // Tapping anywhere outside the menu closes it.
    setTimeout(()=>{
      document.addEventListener('click', function closeOnce(e){
        if(!menu.contains(e.target)){ reviewMenuOpen=false; render(); }
        document.removeEventListener('click', closeOnce);
      }, {once:true});
    }, 0);
  }

  const stage = document.createElement('div');
  stage.className='card-stage';
  const fc = document.createElement('div');
  fc.className='flashcard flashcard-plain';
  const questionHtml = cardType==='cloze' ? clozeDisplayHtml(card.front, card.clozeIndex, false) : escapeHtml(card.front);
  const answerHtml = flipped
    ? (cardType==='cloze' ? escapeHtml(clozeAnswerAt(card.front, card.clozeIndex)) : escapeHtml(card.back))
    : '';
  fc.innerHTML = `
    <div class="content">${questionHtml}</div>
    ${flipped ? `<hr class="answer-divider"><div class="answer">${answerHtml}</div>` : ''}
  `;
  stage.appendChild(fc);
  wrap.appendChild(stage);

  if(!flipped){
    if(reviewInputMode==='type'){
      const box = document.createElement('div');
      box.className = 'type-answer-box';
      box.innerHTML = `
        <input type="text" id="typedAnswerInput" class="type-answer-input" placeholder="Gõ đáp án của bạn..." autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="reveal-btn type-answer-check">Kiểm tra</button>
      `;
      box.querySelector('.type-answer-check').onclick = ()=> checkTypedAnswer();
      box.querySelector('#typedAnswerInput').onkeydown = (e)=>{ if(e.key==='Enter') checkTypedAnswer(); };
      wrap.appendChild(box);
      requestAnimationFrame(()=>{ const el = document.getElementById('typedAnswerInput'); if(el) el.focus(); });
    } else if(reviewInputMode==='quiz'){
      if(quizCurrentCardId !== card.id){
        quizCurrentChoices = buildQuizChoices(card);
        quizCurrentCardId = card.id;
        quizSelectedChoice = null;
      }
      if(quizCurrentChoices.length < 2){
        stopQuizCountdown();
        const note = document.createElement('p');
        note.style.cssText = 'text-align:center; color:var(--ink-faint); font-size:12.5px; margin:0 16px 10px;';
        note.textContent = 'Chưa đủ thẻ khác để ra trắc nghiệm — hiện đáp án như bình thường nhé.';
        wrap.appendChild(note);
        const revealBtn = document.createElement('button');
        revealBtn.className = 'reveal-btn';
        revealBtn.textContent = 'Hiện đáp án';
        revealBtn.onclick = ()=>{ flipped = true; render(); };
        wrap.appendChild(revealBtn);
      } else {
        startQuizCountdownIfNeeded(card);
        if(quizCountdownRemaining !== null){
          const cd = document.createElement('div');
          cd.id = 'quizCountdownDisplay';
          cd.className = 'quiz-countdown' + (quizCountdownRemaining<=5 ? ' low' : '');
          cd.textContent = '⏱ ' + quizCountdownRemaining + 's';
          wrap.appendChild(cd);
        }
        const choicesEl = document.createElement('div');
        choicesEl.className = 'quiz-choices';
        quizCurrentChoices.forEach(choice=>{
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'quiz-choice';
          btn.innerHTML = escapeHtml(choice);
          btn.onclick = ()=> selectQuizChoice(choice);
          choicesEl.appendChild(btn);
        });
        wrap.appendChild(choicesEl);
      }
    } else {
      const revealBtn = document.createElement('button');
      revealBtn.className = 'reveal-btn';
      revealBtn.textContent = 'Hiện đáp án';
      revealBtn.onclick = ()=>{ flipped = true; render(); };
      wrap.appendChild(revealBtn);
    }
  } else {
    if(reviewInputMode==='type' && typedAnswerChecked){
      const feedback = document.createElement('div');
      feedback.className = 'type-feedback ' + (typedAnswerCorrect ? 'correct' : 'wrong');
      feedback.textContent = typedAnswerCorrect
        ? '✓ Chính xác!'
        : (typedAnswerValue.trim() ? `✗ Chưa đúng — bạn đã gõ: "${typedAnswerValue.trim()}"` : '✗ Bạn chưa gõ gì cả');
      wrap.insertBefore(feedback, wrap.querySelector('.card-stage').nextSibling);
    } else if(reviewInputMode==='quiz' && quizCurrentChoices.length>=2){
      const choicesEl = document.createElement('div');
      choicesEl.className = 'quiz-choices answered';
      const correct = correctAnswerText(card);
      quizCurrentChoices.forEach(choice=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.disabled = true;
        const isCorrectChoice = normalizeForCompare(choice)===normalizeForCompare(correct);
        const isChosen = choice === quizSelectedChoice;
        btn.className = 'quiz-choice' + (isCorrectChoice ? ' correct' : '') + (isChosen && !isCorrectChoice ? ' wrong' : '');
        btn.innerHTML = escapeHtml(choice) + (isCorrectChoice ? ' ✓' : (isChosen ? ' ✗' : ''));
        choicesEl.appendChild(btn);
      });
      wrap.insertBefore(choicesEl, wrap.querySelector('.card-stage').nextSibling);
      if(quizSelectedChoice === null){
        const timeout = document.createElement('div');
        timeout.className = 'type-feedback wrong';
        timeout.textContent = '⏱ Hết giờ — chưa kịp chọn đáp án';
        wrap.insertBefore(timeout, choicesEl);
      }
    }

    const preview = {
      again: (()=>{ const c={...card}; grade(c,0); return c.interval; })(),
      hard: (()=>{ const c={...card}; grade(c,1); return c.interval; })(),
      good: (()=>{ const c={...card}; grade(c,2); return c.interval; })(),
      easy: (()=>{ const c={...card}; grade(c,3); return c.interval; })(),
    };
    const row = document.createElement('div');
    row.className='grade-row';
    row.innerHTML = `
      <button class="grade-btn grade-again"><span class="label">Quên</span><span class="interval">${fmtInterval(preview.again)}</span></button>
      <button class="grade-btn grade-hard"><span class="label">Khó</span><span class="interval">${fmtInterval(preview.hard)}</span></button>
      <button class="grade-btn grade-good"><span class="label">Nhớ</span><span class="interval">${fmtInterval(preview.good)}</span></button>
      <button class="grade-btn grade-easy"><span class="label">Dễ</span><span class="interval">${fmtInterval(preview.easy)}</span></button>
    `;
    const qualities = [0,1,2,3];
    row.querySelectorAll('.grade-btn').forEach((btn,i)=>{
      btn.onclick = async ()=>{
        const xpBefore = DATA.progress.xp, reviewsBefore = DATA.progress.totalReviews;
        reviewHistory.push({cardId: card.id, snapshot: {...card}, idx: reviewIdx, xpBefore, reviewsBefore});
        grade(card, qualities[i]);
        recordXpAndStreak(qualities[i]);
        await saveData();
        reviewIdx += 1;
        flipped = false;
        resetAnswerInputState();
        render();
      };
    });
    wrap.appendChild(row);
  }

  return wrap;
}
