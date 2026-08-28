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
  setView('review');
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
  saveData();
  render();
}

function renderReview(){
  const wrap = document.createElement('div');
  wrap.className='review-wrap';

  if(reviewQueue.length===0 || reviewIdx >= reviewQueue.length){
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
  topbar.querySelector('.review-back').onclick = ()=> setView('home');
  topbar.querySelector('.review-undo').onclick = ()=> undoReview();
  topbar.querySelector('.review-menu-btn').onclick = (e)=>{ e.stopPropagation(); reviewMenuOpen = !reviewMenuOpen; render(); };
  wrap.appendChild(topbar);

  if(reviewMenuOpen){
    const menu = document.createElement('div');
    menu.className = 'review-menu';
    menu.innerHTML = `
      <button class="review-menu-item" id="shuffleReviewBtn">🔀 Xáo trộn thẻ còn lại</button>
      <button class="review-menu-item" id="endReviewBtn">✕ Kết thúc phiên</button>
    `;
    menu.querySelector('#shuffleReviewBtn').onclick = ()=>{
      const head = reviewQueue.slice(0, reviewIdx);
      const tail = reviewQueue.slice(reviewIdx);
      for(let i=tail.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tail[i],tail[j]]=[tail[j],tail[i]]; }
      reviewQueue = head.concat(tail);
      reviewMenuOpen = false;
      render();
    };
    menu.querySelector('#endReviewBtn').onclick = ()=>{ reviewMenuOpen=false; setView('home'); };
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
  fc.innerHTML = `
    <div class="content">${escapeHtml(card.front)}</div>
    ${flipped ? `<hr class="answer-divider"><div class="answer">${escapeHtml(card.back)}</div>` : ''}
  `;
  stage.appendChild(fc);
  wrap.appendChild(stage);

  if(!flipped){
    const revealBtn = document.createElement('button');
    revealBtn.className = 'reveal-btn';
    revealBtn.textContent = 'Hiện đáp án';
    revealBtn.onclick = ()=>{ flipped = true; render(); };
    wrap.appendChild(revealBtn);
  } else {
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
        render();
      };
    });
    wrap.appendChild(row);
  }

  return wrap;
}

