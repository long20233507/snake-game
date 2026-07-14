(function () {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const GRID_SIZE = 20;
  const TILE_COUNT = canvas.width / GRID_SIZE;

  let selectedSpeed = 110;
  let selectedLevel = 'classic';

  // ================= ÂM THANH =================
  let soundEnabled = localStorage.getItem('snakeSoundOn') !== 'false';
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type, volume, delay) { // âm thanh của game
    if (!soundEnabled) return;
    try {
      const ac = getAudioCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ac.destination);
      const startTime = ac.currentTime + (delay || 0);
      gain.gain.setValueAtTime(volume || 0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) { /* trình duyệt không hỗ trợ, bỏ qua */ }
  }

  function playEatAppleSound() {
    playTone(700, 0.08, 'square', 0.15, 0);
  }

  function playEatGrapeSound() {
    playTone(600, 0.08, 'square', 0.18, 0);
    playTone(950, 0.12, 'square', 0.18, 0.08);
  }

  function playGameOverSound() {
    playTone(300, 0.16, 'sawtooth', 0.2, 0);
    playTone(220, 0.18, 'sawtooth', 0.2, 0.15);
    playTone(140, 0.3, 'sawtooth', 0.2, 0.33);
  }

  function playClickSound() {
    playTone(500, 0.05, 'sine', 0.1, 0);
  }

  function playSpecialFoodSound() {
    playTone(500, 0.09, 'triangle', 0.18, 0);
    playTone(800, 0.09, 'triangle', 0.18, 0.07);
    playTone(1100, 0.14, 'triangle', 0.18, 0.14);
  }

  function playReviveSound() {
    playTone(200, 0.1, 'sawtooth', 0.2, 0);
    playTone(500, 0.1, 'sine', 0.2, 0.1);
    playTone(750, 0.2, 'sine', 0.2, 0.2);
  }

  function updateSoundButton() {
    const btn = document.getElementById('btnSoundToggle');
    if (btn) btn.textContent = soundEnabled ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt';
  }

  document.addEventListener('DOMContentLoaded', updateSoundButton);
  updateSoundButton();

  document.getElementById('btnSoundToggle') && document.getElementById('btnSoundToggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('snakeSoundOn', soundEnabled ? 'true' : 'false');
    updateSoundButton();
    if (soundEnabled) playClickSound();
  });

  // Tiếng click nhẹ cho các nút menu / màn hình chọn
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.menu-btn, .option-btn, .level-card, .back-btn, .action');
    if (target && target.id !== 'btnSoundToggle') {
      playClickSound();
    }
  });

  let snake, direction, nextDirection, food, score, highScore, gameLoop, gameRunning, isPaused, obstacles;
  let ghosts = [];
  let ghostTickCounter = 0;
  let applesEatenSinceGrape = 0;
  let growPending = 0;
  const GRAPE_EVERY = 5; // sau mỗi 5 quả táo thì mồi tiếp theo là chùm nho

  // ================= KỸ NĂNG ĐẶC BIỆT (chế độ Đặc biệt) =================
  const SKILL_DURATION_MS = 5000; // mỗi kỹ năng tồn tại/khả dụng trong 5 giây
  const SPECIAL_FOOD_CHANCE = 0.28; // xác suất 1 quả táo thường được thay bằng mồi đặc biệt (chỉ ở chế độ Đặc biệt)
  let phaseUntil = 0;   // Táo phép: xuyên thấu vật cản + ma
  let freezeUntil = 0;  // Chuối phép: làm chậm ma
  let reviveUntil = 0;  // Dưa hấu phép: bị động, tự hồi sinh nếu chết trong lúc còn hạn
  let snakeTickCounter = 0; // dùng để rắn tự chậm lại 50% khi đang đóng băng
  let hudInterval = null;

  function isPhaseActive() { return Date.now() < phaseUntil; }
  function isFreezeActive() { return Date.now() < freezeUntil; }
  function isReviveArmed() { return Date.now() < reviveUntil; }

  highScore = parseInt(localStorage.getItem('snakeHighScore') || '0', 10);
  document.getElementById('highscore').textContent = highScore;

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + id).classList.add('active');
  }

  document.getElementById('btnStart').addEventListener('click', () => {
    showScreen('game');
    initGame();
  });
  document.getElementById('btnSpeedMenu').addEventListener('click', () => showScreen('speed'));
  document.getElementById('btnLevelMenu').addEventListener('click', () => showScreen('level'));
  document.getElementById('btnHistoryMenu').addEventListener('click', () => {
    renderHistory();
    showScreen('history');
  });

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.back));
  });

  document.querySelectorAll('[data-speed]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSpeed = parseInt(btn.dataset.speed, 10);
      document.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  document.querySelector('[data-speed="110"]').classList.add('selected');

  document.querySelectorAll('[data-level]').forEach(card => {
    card.addEventListener('click', () => {
      selectedLevel = card.dataset.level;
      document.querySelectorAll('[data-level]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
  document.querySelector('[data-level="classic"]').classList.add('selected');

  function getHistory() { //xây dựng lưu lịch sử điểm và kỷ lục
    return JSON.parse(localStorage.getItem('snakeHistory') || '[]');
  }

  function saveToHistory(entry) {  
    const history = getHistory();
    history.unshift(entry);
    if (history.length > 10) history.length = 10;
    localStorage.setItem('snakeHistory', JSON.stringify(history));
  }

  function levelName(key) {
    return { classic: 'Cổ điển', obstacles: 'Trung bình', maze: 'Đặc biệt' }[key] || key;
  }

  function speedName(ms) {
    return { 160: 'Chậm', 110: 'Vừa', 70: 'Nhanh' }[ms] || ms + 'ms';
  }

  function renderHistory() {
    const list = document.getElementById('historyList');
    const history = getHistory();
    if (history.length === 0) {
      list.innerHTML = '<div class="empty-msg">Chưa có lượt chơi nào</div>';
      return;
    }
    list.innerHTML = history.map(h => `
      <div class="history-item">
        <div>
          <div class="h-score">${h.score} điểm</div>
          <div class="h-meta">${levelName(h.level)} • ${speedName(h.speed)}</div>
        </div>
        <div class="h-meta">${h.date}</div>
      </div>
    `).join('');
  }

  document.getElementById('btnClearHistory').addEventListener('click', () => {
    localStorage.removeItem('snakeHistory');
    renderHistory();
  });

  function buildObstacles(level) {
    const obs = [];
    if (level === 'obstacles') {
      const pattern = [
        [3,3],[3,4],[4,3],
        [15,3],[15,4],[16,3],
        [3,15],[3,16],[4,16],
        [15,15],[15,16],[16,15],
        [10,3],[10,16]
      ];
      pattern.forEach(([x,y]) => obs.push({x,y}));
    } else if (level === 'maze') {
      for (let i = 4; i < 16; i++) {
        if (i !== 9 && i !== 10) obs.push({x: i, y: 5});
        if (i !== 9 && i !== 10) obs.push({x: i, y: 14});
      }
      for (let i = 6; i < 14; i++) {
        if (i !== 9 && i !== 10) obs.push({x: 5, y: i});
        if (i !== 9 && i !== 10) obs.push({x: 14, y: i});
      }
    }
    return obs;
  }

  // ================= MA TUẦN TRA (chế độ Trung bình & Đặc biệt) =================
  const GHOST_STEP_EVERY = 2; // ma di chuyển 1 ô sau mỗi 2 nhịp rắn (chậm hơn rắn)

  // Tạo đường tuần tra thẳng (ngang hoặc dọc) giữa 2 điểm, dùng chung cho mọi chế độ có ma
  function buildLinePath(x1, y1, x2, y2) {
    const path = [];
    if (x1 === x2) {
      const step = y2 >= y1 ? 1 : -1;
      for (let y = y1; ; y += step) { path.push({ x: x1, y }); if (y === y2) break; }
    } else {
      const step = x2 >= x1 ? 1 : -1;
      for (let x = x1; ; x += step) { path.push({ x, y: y1 }); if (x === x2) break; }
    }
    return path;
  }

  function makeGhost(color, path) {
    return { color, path, idx: 0, dir: 1 };
  }

  function buildGhosts(level) {
    // Cùng 1 kiểu tuần tra (1 ma đi ngang + 1 ma đi dọc, chu kỳ qua lại) áp dụng
    // cho cả 2 chế độ "Trung bình" và "Đặc biệt", chỉ khác toạ độ cho phù hợp bản đồ.
    if (level === 'obstacles') { // Trung bình
      return [
        makeGhost('#ff6b6b', buildLinePath(6, 9, 13, 9)),
        makeGhost('#6bb1ff', buildLinePath(13, 7, 13, 12))
      ];
    }
    if (level === 'maze') { // Đặc biệt
      return [
        makeGhost('#ff6b6b', buildLinePath(7, 9, 12, 9)),
        makeGhost('#6bb1ff', buildLinePath(8, 7, 8, 12))
      ];
    }
    return []; // Cổ điển: không có ma
  }

  function stepGhost(g) {
    g.idx += g.dir;
    if (g.idx <= 0 || g.idx >= g.path.length - 1) {
      g.dir *= -1;
    }
  }

  function ghostAt(x, y) {
    return ghosts.some(g => {
      const p = g.path[g.idx];
      return p.x === x && p.y === y;
    });
  }

  function activatePhase() {
    phaseUntil = Date.now() + SKILL_DURATION_MS;
  }

  function activateFreeze() {
    freezeUntil = Date.now() + SKILL_DURATION_MS;
  }

  function armRevive() {
    reviveUntil = Date.now() + SKILL_DURATION_MS;
  }

  // Được gọi khi rắn sắp thua; nếu có hồi sinh còn hạn thì tiêu nó và tha cho rắn,
  // đồng thời biến đuôi thành đầu và cho rắn chạy ngược lại để thoát khỏi chỗ vừa va chạm
  function tryRevive() {
    if (!isReviveArmed()) return false;
    reviveUntil = 0;

    snake = snake.slice().reverse(); // đuôi cũ giờ thành đầu mới, giữ nguyên chiều dài

    direction = { x: -direction.x, y: -direction.y }; // chạy ngược lại hướng vừa đâm
    nextDirection = direction;

    // Bất tử ngắn với vật cản/ma để đảm bảo thoát ra an toàn ngay khi vừa đổi đầu
    phaseUntil = Math.max(phaseUntil, Date.now() + 500);

    playReviveSound();
    return true;
  }

  function updateBuffHud() {
    const el = document.getElementById('buffStatus');
    if (!el) return;
    const buffs = [];
    if (isPhaseActive()) buffs.push(`🌀 Xuyên thấu ${Math.ceil((phaseUntil - Date.now()) / 1000)}s`);
    if (isFreezeActive()) buffs.push(`❄️ Đóng băng ma ${Math.ceil((freezeUntil - Date.now()) / 1000)}s`);
    if (isReviveArmed()) buffs.push(`❤️ Hồi sinh sẵn sàng ${Math.ceil((reviveUntil - Date.now()) / 1000)}s`);
    el.textContent = buffs.join('   ');
  }

  function initGame() {  // vòng lặp game
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    isPaused = false;
    applesEatenSinceGrape = 0;
    growPending = 0;
    obstacles = buildObstacles(selectedLevel);
    ghosts = buildGhosts(selectedLevel);
    ghostTickCounter = 0;
    snakeTickCounter = 0;
    phaseUntil = 0;
    freezeUntil = 0;
    reviveUntil = 0;
    document.getElementById('score').textContent = score;
    placeFood();
    document.getElementById('gameOverScreen').classList.remove('show');
    gameRunning = true;

    if (gameLoop) clearInterval(gameLoop);
    gameLoop = setInterval(tick, selectedSpeed);
    if (hudInterval) clearInterval(hudInterval);
    hudInterval = setInterval(updateBuffHud, 200);
    updateBuffHud();
    draw();
  }

  function placeFood() {    //sinh mồi 
    let type = (applesEatenSinceGrape >= GRAPE_EVERY) ? 'grape' : 'apple';
    if (selectedLevel === 'maze' && type === 'apple' && Math.random() < SPECIAL_FOOD_CHANCE) {
      const specials = ['magicApple', 'magicBanana', 'magicWatermelon'];
      type = specials[Math.floor(Math.random() * specials.length)];
    }
    let valid = false;
    while (!valid) {
      food = {
        x: Math.floor(Math.random() * TILE_COUNT),
        y: Math.floor(Math.random() * TILE_COUNT),
        type
      };
      valid = !snake.some(seg => seg.x === food.x && seg.y === food.y)
        && !obstacles.some(o => o.x === food.x && o.y === food.y)
        && !ghostAt(food.x, food.y);
    }
  }

  function tick() {
    if (!gameRunning || isPaused) return;

    // Ma di chuyển theo chu kỳ riêng (chậm hơn rắn); khi đóng băng thì ma đi chậm hẳn lại
    ghostTickCounter++;
    const effectiveGhostStep = isFreezeActive() ? GHOST_STEP_EVERY * 4 : GHOST_STEP_EVERY;
    if (ghosts.length && ghostTickCounter % effectiveGhostStep === 0) {
      ghosts.forEach(stepGhost);
    }

    // Khi đóng băng: rắn cũng tự chậm lại 50% (chỉ thực sự bước đi ở mỗi nhịp chẵn)
    snakeTickCounter++;
    if (isFreezeActive() && snakeTickCounter % 2 !== 0) {
      draw();
      return;
    }

    direction = nextDirection;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
      if (tryRevive()) { draw(); return; }
      return endGame();
    }
    if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      if (tryRevive()) { draw(); return; }
      return endGame();
    }
    if (!isPhaseActive() && obstacles.some(o => o.x === head.x && o.y === head.y)) {
      if (tryRevive()) { draw(); return; }
      return endGame();
    }
    if (!isPhaseActive() && ghostAt(head.x, head.y)) { // đụng ma = thua, giống va chạm tường (trừ khi đang xuyên thấu)
      if (tryRevive()) { draw(); return; }
      return endGame();
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {  //tăng kích thước
      if (food.type === 'grape') {
        score += 20;
        growPending += 2; // nho to giúp rắn dài ra gấp 2 lần táo thường
        applesEatenSinceGrape = 0;
        playEatGrapeSound();
      } else if (food.type === 'magicApple') {
        score += 15;
        growPending += 1;
        applesEatenSinceGrape++;
        activatePhase();
        playSpecialFoodSound();
      } else if (food.type === 'magicBanana') {
        score += 15;
        growPending += 1;
        applesEatenSinceGrape++;
        activateFreeze();
        playSpecialFoodSound();
      } else if (food.type === 'magicWatermelon') {
        score += 15;
        growPending += 1;
        applesEatenSinceGrape++;
        armRevive();
        playSpecialFoodSound();
      } else {
        score += 10;
        growPending += 1;
        applesEatenSinceGrape++;
        playEatAppleSound();
      }
      document.getElementById('score').textContent = score;
      placeFood();
    }

    if (growPending > 0) {
      growPending--;
    } else {
      snake.pop();
    }

    draw();
  }

  function drawApple(cx, cy) {
    const r = GRID_SIZE / 2 - 3;
    // Thân táo (hơi lệch để trông tự nhiên hơn)
    ctx.fillStyle = '#e6392b';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, r, r - 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Điểm sáng nhỏ tạo độ bóng
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.3, r * 0.28, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // Cuống
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + 1, cy - r - 3);
    ctx.stroke();
    // Lá nhỏ
    ctx.fillStyle = '#3fae3f';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy - r - 2, 3, 1.6, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGrape(cx, cy) {
    // Chùm nho to hơn 1 ô, gồm nhiều quả nho nhỏ xếp thành cụm
    const berries = [
      [0, -5], [-5, -1], [5, -1],
      [-8, 4], [-2.5, 4], [3, 4], [8, 4],
      [-5, 9], [0, 9], [5, 9],
      [0, 14]
    ];
    const br = GRID_SIZE * 0.30;

    berries.forEach(([dx, dy]) => {
      const bx = cx + dx * 0.9;
      const by = cy + dy * 0.7 - 4;
      const grad = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 1, bx, by, br);
      grad.addColorStop(0, '#c58fe0');
      grad.addColorStop(1, '#6a2c91');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    });

    // Cuống nhỏ phía trên chùm nho
    ctx.strokeStyle = '#3fae3f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 13);
    ctx.lineTo(cx, cy - 20);
    ctx.stroke();
  }

  function drawMagicApple(cx, cy) { // Táo phép - kỹ năng xuyên thấu
    const r = GRID_SIZE / 2 - 2;
    const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, r + 6);
    glow.addColorStop(0, 'rgba(120,200,255,0.55)');
    glow.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4fd1ff';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, r - 2, r - 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - (r - 2) * 0.35, cy - (r - 2) * 0.3, (r - 2) * 0.28, (r - 2) * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a5a6a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + 1, cy - r - 3);
    ctx.stroke();
  }

  function drawBanana(cx, cy) { // Chuối phép - kỹ năng đóng băng ma
    ctx.strokeStyle = '#f0d24a';
    ctx.lineWidth = GRID_SIZE * 0.28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + 7, GRID_SIZE * 0.42, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = '#8a6d1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy + 7, GRID_SIZE * 0.42, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawWatermelon(cx, cy) { // Dưa hấu phép - kỹ năng hồi sinh (bị động)
    const r = GRID_SIZE / 2 - 2;
    ctx.fillStyle = '#2f9e44';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff6b81';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    const seeds = [[-4, -3], [4, -3], [0, 2], [-5, 5], [5, 5]];
    seeds.forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy + dy, 1.3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawGhost(cx, cy, color) { // hình con ma tuần tra
    const r = GRID_SIZE / 2 - 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r - 2);
    const waves = 3;
    const ww = (r * 2) / waves;
    for (let i = 0; i < waves; i++) {
      const xStart = cx + r - ww * i;
      const xMid = xStart - ww / 2;
      const xEnd = xStart - ww;
      ctx.quadraticCurveTo(xMid, cy + r - 6, xEnd, cy + r - 2);
    }
    ctx.lineTo(cx - r, cy - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx - r * 0.4, cy - 3, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.4, cy - 3, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(cx - r * 0.4, cy - 2, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.4, cy - 2, r * 0.14, 0, Math.PI * 2); ctx.fill();
  }

  function draw() {
    ctx.fillStyle = '#0f1f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i <= TILE_COUNT; i++) {
      ctx.beginPath();
      ctx.moveTo(i * GRID_SIZE, 0);
      ctx.lineTo(i * GRID_SIZE, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * GRID_SIZE);
      ctx.lineTo(canvas.width, i * GRID_SIZE);
      ctx.stroke();
    }

    ctx.fillStyle = '#6a6a6a';
    obstacles.forEach(o => {
      ctx.fillRect(o.x * GRID_SIZE + 1, o.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    });

    ghosts.forEach(g => {
      const p = g.path[g.idx];
      ctx.globalAlpha = isFreezeActive() ? 0.45 : 1;
      drawGhost(p.x * GRID_SIZE + GRID_SIZE / 2, p.y * GRID_SIZE + GRID_SIZE / 2, g.color);
      ctx.globalAlpha = 1;
    });

    const foodCx = food.x * GRID_SIZE + GRID_SIZE / 2;
    const foodCy = food.y * GRID_SIZE + GRID_SIZE / 2;

    if (food.type === 'grape') {
      drawGrape(foodCx, foodCy);
    } else if (food.type === 'magicApple') {
      drawMagicApple(foodCx, foodCy);
    } else if (food.type === 'magicBanana') {
      drawBanana(foodCx, foodCy);
    } else if (food.type === 'magicWatermelon') {
      drawWatermelon(foodCx, foodCy);
    } else {
      drawApple(foodCx, foodCy);
    }

    drawSnake();
  }

  function roundRect(x, y, w, h, r) {     //xây dựng hình ảnh rắn
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function lerpColor(c1, c2, t) {   //màu sắc thân rắn
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r},${g},${b})`;
  }

  const SNAKE_HEAD_COLOR = [168, 255, 168];
  const SNAKE_TAIL_COLOR = [30, 90, 30];

  function drawSnake() {
    const n = snake.length;

    // Vẽ thân trước (từ đuôi lên gần đầu), đầu vẽ sau cùng để nổi bật nhất
    for (let i = n - 1; i >= 0; i--) {
      const seg = snake[i];
      const x = seg.x * GRID_SIZE + 1;
      const y = seg.y * GRID_SIZE + 1;
      const w = GRID_SIZE - 2;
      const h = GRID_SIZE - 2;
      const t = n > 1 ? i / (n - 1) : 0;

      ctx.fillStyle = i === 0 ? 'rgb(168,255,168)' : lerpColor(SNAKE_HEAD_COLOR, SNAKE_TAIL_COLOR, t);
      roundRect(x, y, w, h, i === 0 ? 6 : 4);
      ctx.fill();
    }

    // Vẽ chi tiết mắt + lưỡi cho đầu rắn
    const head = snake[0];
    const cx = head.x * GRID_SIZE + GRID_SIZE / 2;
    const cy = head.y * GRID_SIZE + GRID_SIZE / 2;

    if (isPhaseActive()) { // hào quang xanh khi đang xuyên thấu
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, GRID_SIZE * 1.1);
      glow.addColorStop(0, 'rgba(120,200,255,0.45)');
      glow.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, GRID_SIZE * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    drawSnakeHeadDetails(cx, cy, direction);
  }

  function drawSnakeHeadDetails(cx, cy, dir) { //vẽ mắt
    const perp = { x: -dir.y, y: dir.x };
    const eyeForward = GRID_SIZE * 0.12;
    const eyeSide = GRID_SIZE * 0.22;
    const eyeR = 2.4;

    [1, -1].forEach(sign => {
      const ex = cx + dir.x * eyeForward + perp.x * eyeSide * sign;
      const ey = cy + dir.y * eyeForward + perp.y * eyeSide * sign;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(ex + dir.x * 1, ey + dir.y * 1, eyeR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    });

    // Lưỡi thè ra hình chữ V phía trước đầu
    const baseX = cx + dir.x * (GRID_SIZE / 2 - 1);
    const baseY = cy + dir.y * (GRID_SIZE / 2 - 1);
    const tipX = cx + dir.x * (GRID_SIZE / 2 + 6);
    const tipY = cy + dir.y * (GRID_SIZE / 2 + 6);

    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const forkLen = 3;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + perp.x * forkLen - dir.x * 2, tipY + perp.y * forkLen - dir.y * 2);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - perp.x * forkLen - dir.x * 2, tipY - perp.y * forkLen - dir.y * 2);
    ctx.stroke();
  }

  function endGame() {
    gameRunning = false;
    clearInterval(gameLoop);
    clearInterval(hudInterval);
    playGameOverSound();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('snakeHighScore', highScore);
      document.getElementById('highscore').textContent = highScore;
    }
    saveToHistory({
      score,
      level: selectedLevel,
      speed: selectedSpeed,
      date: new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    });
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOverScreen').classList.add('show');
  }

  function setDirection(x, y) {     //chặn quay ngược
    if (direction.x === -x && direction.y === -y) return;
    nextDirection = { x, y };
  }

  document.addEventListener('keydown', (e) => { //xây dựng chức năng điều khiển
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': setDirection(0, -1); break;
      case 'ArrowDown': case 's': case 'S': setDirection(0, 1); break;
      case 'ArrowLeft': case 'a': case 'A': setDirection(-1, 0); break;
      case 'ArrowRight': case 'd': case 'D': setDirection(1, 0); break;
      case ' ': isPaused = !isPaused; break;
    }
  });

  document.getElementById('btnUp').addEventListener('click', () => setDirection(0, -1));
  document.getElementById('btnDown').addEventListener('click', () => setDirection(0, 1));
  document.getElementById('btnLeft').addEventListener('click', () => setDirection(-1, 0));
  document.getElementById('btnRight').addEventListener('click', () => setDirection(1, 0));
  document.getElementById('restartBtn').addEventListener('click', initGame);
  document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('gameOverScreen').classList.remove('show');
    clearInterval(gameLoop);
    clearInterval(hudInterval);
    showScreen('menu');
  });

})();
