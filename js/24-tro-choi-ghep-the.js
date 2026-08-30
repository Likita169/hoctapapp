/* 24-tro-choi-ghep-the.js — Trò chơi "Ghép thẻ": hiện 2 cột câu hỏi/đáp án
   đã xáo trộn riêng, chạm 1 ô mỗi cột để ghép đúng cặp. Không ảnh hưởng
   lịch ôn tập — chỉ để luyện lại nhanh, vui hơn là lật thẻ tuần tự. */

function stopMatchGameTimer(){
  if(matchGameTimerHandle){ clearInterval(matchGameTimerHandle); matchGameTimerHandle = null; }
}
function shuffleArr(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function fmtElapsed(ms){
  const s = Math.max(0, Math.round(ms/1000));
  const m = Math.floor(s/60), r = s%60;
  return m>0 ? `${m}:${String(r).padStart(2,'0')}` : `${r}s`;
}

// Chuẩn bị dữ liệu 1 ván ghép thẻ mới cho 1 bộ thẻ (và các bộ thẻ phụ bên trong).
function startMatchGame(subjectId){
  const cards = subjectCards(subjectId).filter(c=>{
    const back = correctAnswerText(c);
    return back && back.trim();
  });
  if(cards.length < 3){
    toast('Cần ít nhất 3 thẻ trong bộ này để chơi ghép thẻ');
    return;
  }
  const picked = shuffleArr(cards).slice(0, Math.min(8, cards.length));

  matchGameSubjectId = subjectId;
  matchGamePairs = picked.map(c=>({
    cardId: c.id,
    front: (c.type==='cloze') ? clozeQuestionPlainText(c.front, c.clozeIndex) : c.front,
    back: correctAnswerText(c),
  }));
  matchGameLeftOrder = shuffleArr(matchGamePairs.map(p=>p.cardId));
  matchGameRightOrder = shuffleArr(matchGamePairs.map(p=>p.cardId));
  matchGameMatchedIds = new Set();
  matchGameSelectedLeft = null;
  matchGameSelectedRight = null;
  matchGameWrongFlash = null;
  matchGameMistakes = 0;
  matchGameStartedAt = Date.now();
  matchGameFinishedAt = null;

  stopMatchGameTimer();
  matchGameTimerHandle = setInterval(()=>{
    const el = document.getElementById('matchGameTimer');
    if(el && !matchGameFinishedAt) el.textContent = fmtElapsed(Date.now()-matchGameStartedAt);
  }, 1000);

  setView('match');
}

function closeMatchGame(){
  stopMatchGameTimer();
  setView('home');
}

function matchGamePick(side, cardId){
  // Đã ghép xong rồi, hoặc đang chớp đỏ chờ tự bỏ chọn — chưa bấm được lúc này.
  if(matchGameMatchedIds.has(cardId) || matchGameWrongFlash) return;

  if(side==='left') matchGameSelectedLeft = (matchGameSelectedLeft===cardId) ? null : cardId;
  else matchGameSelectedRight = (matchGameSelectedRight===cardId) ? null : cardId;

  if(matchGameSelectedLeft && matchGameSelectedRight){
    if(matchGameSelectedLeft === matchGameSelectedRight){
      matchGameMatchedIds.add(matchGameSelectedLeft);
      matchGameSelectedLeft = null;
      matchGameSelectedRight = null;
      if(matchGameMatchedIds.size === matchGamePairs.length){
        matchGameFinishedAt = Date.now();
        stopMatchGameTimer();
      }
    } else {
      matchGameMistakes += 1;
      matchGameWrongFlash = {left: matchGameSelectedLeft, right: matchGameSelectedRight};
      setTimeout(()=>{
        matchGameWrongFlash = null;
        matchGameSelectedLeft = null;
        matchGameSelectedRight = null;
        render();
      }, 550);
    }
  }
  render();
}

function renderMatchGame(){
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';

  const subject = subjectById(matchGameSubjectId);

  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<button class="back-link" style="margin:0;">← Đóng</button><h1 class="display" style="font-size:17px;">🧩 ${subject?escapeHtml(subject.name):'Ghép thẻ'}</h1>`;
  header.querySelector('.back-link').onclick = ()=> closeMatchGame();
  wrap.appendChild(header);

  const main = document.createElement('main');

  const statsRow = document.createElement('div');
  statsRow.className = 'match-stats-row';
  statsRow.innerHTML = `
    <span>⏱ <span id="matchGameTimer">${fmtElapsed((matchGameFinishedAt||Date.now())-matchGameStartedAt)}</span></span>
    <span>${matchGameMatchedIds.size}/${matchGamePairs.length} cặp · ${matchGameMistakes} lần sai</span>
  `;
  main.appendChild(statsRow);

  if(matchGameFinishedAt){
    const done = document.createElement('div');
    done.className = 'review-done';
    done.style.cssText = 'height:auto; padding:40px 20px;';
    done.innerHTML = `
      <div class="glyph">🎉</div>
      <h2 class="display">Ghép xong hết!</h2>
      <p>Mất ${fmtElapsed(matchGameFinishedAt-matchGameStartedAt)}, sai ${matchGameMistakes} lần.</p>
    `;
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:10px; width:100%; max-width:320px;';
    const again = document.createElement('button');
    again.className = 'hero-btn'; again.textContent = 'Chơi lại';
    again.onclick = ()=> startMatchGame(matchGameSubjectId);
    const home = document.createElement('button');
    home.className = 'save-btn';
    home.style.background = 'var(--bg-elev)'; home.style.color = 'var(--white)'; home.style.border = '1px solid var(--line)';
    home.textContent = 'Về trang chủ';
    home.onclick = ()=> closeMatchGame();
    btnRow.appendChild(again); btnRow.appendChild(home);
    done.appendChild(btnRow);
    main.appendChild(done);
    wrap.appendChild(main);
    return wrap;
  }

  const grid = document.createElement('div');
  grid.className = 'match-grid';

  function buildCol(order, side, selectedId){
    const col = document.createElement('div');
    col.className = 'match-col';
    order.forEach(cardId=>{
      const pair = matchGamePairs.find(p=>p.cardId===cardId);
      const text = side==='left' ? pair.front : pair.back;
      const btn = document.createElement('button');
      btn.type = 'button';
      const matched = matchGameMatchedIds.has(cardId);
      const wrongHere = matchGameWrongFlash && matchGameWrongFlash[side]===cardId;
      btn.className = 'match-tile' + (matched?' matched':'') + (selectedId===cardId?' selected':'') + (wrongHere?' wrong':'');
      btn.innerHTML = escapeHtml(text);
      btn.disabled = matched;
      btn.onclick = ()=> matchGamePick(side, cardId);
      col.appendChild(btn);
    });
    return col;
  }

  grid.appendChild(buildCol(matchGameLeftOrder, 'left', matchGameSelectedLeft));
  grid.appendChild(buildCol(matchGameRightOrder, 'right', matchGameSelectedRight));
  main.appendChild(grid);

  wrap.appendChild(main);
  return wrap;
}
