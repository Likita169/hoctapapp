/* 03-thuat-toan-on-tap.js — Thuật toán ôn tập ngắt quãng (grade), tính XP/cấp độ, chuỗi ngày streak, huy hiệu, và hàm toast() hiện thông báo nhỏ ở góc màn hình
   (Phần 279-424 của app.js gốc, tách ra để dễ tìm & dễ sửa.) */

function grade(card, quality){
  // quality: 0 again, 1 hard, 2 good, 3 easy
  let {ease, interval, reps} = card;
  if(quality===0){
    reps = 0;
    interval = 10/1440;
    ease = Math.max(1.3, ease-0.2);
  } else {
    if(reps===0){
      interval = quality===3 ? 2 : 1;
    } else if(reps===1){
      interval = quality===1 ? 3 : quality===2 ? 6 : 8;
    } else {
      const factor = quality===1 ? 1.2 : quality===2 ? ease : ease*1.3;
      interval = Math.round(interval*factor*10)/10;
    }
    reps += 1;
    if(quality===1) ease = Math.max(1.3, ease-0.15);
    if(quality===3) ease = ease+0.15;
  }
  card.ease = ease;
  card.interval = interval;
  card.reps = reps;
  card.due = Date.now() + dayMs(interval);
  card.lastReview = Date.now();
}

/* ---------------- STREAK + XP + HUY HIỆU ---------------- */
// XP mỗi thẻ tuỳ theo mức nhớ chọn — "Quên" vẫn được tính (khuyến khích cứ
// ôn đều, không phạt nặng), nhớ càng chắc thì XP càng cao.
const XP_PER_GRADE = [1, 2, 3, 4]; // [Quên, Khó, Nhớ, Dễ]

// Level tăng dần độ khó: mức 1→2 cần 50 XP, mỗi mức sau cần thêm 20 XP so
// với mức trước — vừa đủ chậm lại để cảm giác "lên cấp" luôn có ý nghĩa.
function levelGap(level){ return 50 + (level-1)*20; }
function computeLevel(xp){
  let level = 1, threshold = 0, gap = levelGap(1);
  while(xp >= threshold + gap){
    threshold += gap;
    level += 1;
    gap = levelGap(level);
  }
  return { level, xpIntoLevel: xp - threshold, xpForThisLevel: gap };
}

function pad2(n){ return String(n).padStart(2,'0'); }
function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function todayKey(){ return dateKey(new Date()); }
// Số ngày lịch chênh lệch giữa 2 khoá "YYYY-MM-DD" (so theo ngày, không theo giờ).
function daysBetweenKeys(a, b){
  const [ay,am,ad] = a.split('-').map(Number);
  const [by,bm,bd] = b.split('-').map(Number);
  const ta = Date.UTC(ay,am-1,ad), tb = Date.UTC(by,bm-1,bd);
  return Math.round((tb-ta) / 86400000);
}

const BADGE_DEFS = {
  first_review:  { icon:'🌱', title:'Buổi ôn đầu tiên', desc:'Ôn tập thẻ đầu tiên của bạn' },
  streak_3:      { icon:'🔥', title:'Chuỗi 3 ngày',      desc:'Ôn tập 3 ngày liên tục' },
  streak_7:      { icon:'🔥', title:'Chuỗi 7 ngày',      desc:'Ôn tập 7 ngày liên tục' },
  streak_30:     { icon:'🏆', title:'Chuỗi 30 ngày',     desc:'Ôn tập 30 ngày liên tục' },
  reviews_100:   { icon:'📚', title:'100 thẻ',           desc:'Ôn tổng cộng 100 lượt thẻ' },
  reviews_500:   { icon:'🎓', title:'500 thẻ',           desc:'Ôn tổng cộng 500 lượt thẻ' },
  reviews_1000:  { icon:'👑', title:'1000 thẻ',          desc:'Ôn tổng cộng 1000 lượt thẻ' },
  level_5:       { icon:'⭐', title:'Cấp độ 5',          desc:'Đạt tới cấp độ 5' },
  level_10:      { icon:'🌟', title:'Cấp độ 10',         desc:'Đạt tới cấp độ 10' },
  perfect_session:{ icon:'✨', title:'Phiên hoàn hảo',   desc:'Ôn hết 1 phiên (≥5 thẻ) không "Quên" câu nào' }
};

function unlockBadge(id){
  if(!DATA.progress.badges.includes(id)){
    DATA.progress.badges.push(id);
    const def = BADGE_DEFS[id];
    if(def) toast(`🏅 Mở khoá huy hiệu: ${def.title}`);
  }
}

function evaluateThresholdBadges(){
  const p = DATA.progress;
  if(p.totalReviews>=1) unlockBadge('first_review');
  if(p.bestStreak>=3) unlockBadge('streak_3');
  if(p.bestStreak>=7) unlockBadge('streak_7');
  if(p.bestStreak>=30) unlockBadge('streak_30');
  if(p.totalReviews>=100) unlockBadge('reviews_100');
  if(p.totalReviews>=500) unlockBadge('reviews_500');
  if(p.totalReviews>=1000) unlockBadge('reviews_1000');
  const lvl = computeLevel(p.xp).level;
  if(lvl>=5) unlockBadge('level_5');
  if(lvl>=10) unlockBadge('level_10');
}

// Cập nhật chuỗi ngày ôn tập — gọi mỗi khi có ít nhất 1 thẻ được chấm điểm.
// An toàn khi gọi nhiều lần trong cùng 1 ngày (không cộng streak trùng).
function recordStudyDay(){
  const p = DATA.progress;
  const today = todayKey();
  if(p.lastStudyDate === today) return; // đã tính hôm nay rồi

  if(!p.lastStudyDate){
    p.streak = 1;
  } else {
    const gap = daysBetweenKeys(p.lastStudyDate, today);
    if(gap === 1){
      p.streak += 1;
    } else if(gap === 2 && p.streakFreezes > 0){
      // Lỡ quên đúng 1 ngày — dùng 1 lượt "đóng băng" để nối chuỗi thay vì mất trắng.
      p.streakFreezes -= 1;
      p.streak += 1;
      toast('❄️ Đã dùng 1 lượt đóng băng để giữ chuỗi ngày!');
    } else {
      p.streak = 1;
    }
  }
  p.lastStudyDate = today;
  p.bestStreak = Math.max(p.bestStreak, p.streak);
  // Thưởng thêm 1 lượt đóng băng mỗi mốc 7 ngày liên tục, tối đa giữ 3 lượt.
  if(p.streak > 0 && p.streak % 7 === 0 && p.streakFreezes < 3){
    p.streakFreezes += 1;
    toast('❄️ Nhận thêm 1 lượt đóng băng chuỗi ngày!');
  }
}

// Gọi ngay sau grade(card, quality) mỗi lần học sinh chấm 1 thẻ.
function recordXpAndStreak(quality){
  normalizeProgress();
  const p = DATA.progress;
  const beforeLevel = computeLevel(p.xp).level;
  p.xp += XP_PER_GRADE[quality] || 0;
  p.totalReviews += 1;
  if(quality === 0) sessionHadMiss = true;
  sessionXpEarned += XP_PER_GRADE[quality] || 0;
  recordStudyDay();
  evaluateThresholdBadges();
  const afterLevel = computeLevel(p.xp).level;
  if(afterLevel > beforeLevel) toast(`🎉 Lên cấp ${afterLevel}!`);
}

function toast(msg){
  const t = document.createElement('div');
  t.className='toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, 1600);
}

