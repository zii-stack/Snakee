/* ═══════════════════════════════════════════════
   NEON SNAKE — script.js
   Full game engine: canvas, input, audio, UI
═══════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   AUDIO ENGINE (Web Audio API — no files needed)
───────────────────────────────────────────────*/
const Audio = (() => {
  let ctx = null;
  const init = () => {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  const tone = (freq, type, duration, vol = 0.18, delay = 0) => {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t); osc.stop(t + duration);
  };

  return {
    init,
    eat() {
      init();
      tone(523, 'square', 0.08, 0.15);
      tone(784, 'square', 0.1, 0.1, 0.06);
    },
    die() {
      init();
      tone(220, 'sawtooth', 0.15, 0.2);
      tone(160, 'sawtooth', 0.2, 0.2, 0.1);
      tone(100, 'sawtooth', 0.3, 0.15, 0.22);
    },
    move() {
      /* Intentionally silent for smooth gameplay */
    },
    levelUp() {
      init();
      tone(523, 'square', 0.07, 0.12);
      tone(659, 'square', 0.07, 0.12, 0.08);
      tone(784, 'square', 0.1,  0.15, 0.16);
    },
    pause() {
      init();
      tone(440, 'sine', 0.12, 0.1);
    }
  };
})();

/* ─────────────────────────────────────────────
   GAME CONFIG
───────────────────────────────────────────────*/
const DIFFICULTY = {
  easy:   { speed: 140, label: 'EASY',   color: '#00ffcc' },
  medium: { speed: 100, label: 'MEDIUM', color: '#ffe600' },
  hard:   { speed: 65,  label: 'HARD',   color: '#ff2d78' }
};

const CELL = 20;          // grid cell size px (canvas coordinates)
const GRID_W = 20;        // number of columns
const GRID_H = 20;        // number of rows
const COLORS = {
  bg:         '#0a0a0f',
  grid:       'rgba(0,255,204,0.035)',
  snakeHead:  '#00ffcc',
  snakeBody:  '#00c896',
  snakeBorder:'rgba(0,255,204,0.4)',
  food:       '#ff2d78',
  foodGlow:   'rgba(255,45,120,0.5)',
  bonus:      '#ffe600',
  bonusGlow:  'rgba(255,230,0,0.5)',
};

/* ─────────────────────────────────────────────
   DOM REFERENCES
───────────────────────────────────────────────*/
const $ = id => document.getElementById(id);
const startScreen    = $('startScreen');
const gameScreen     = $('gameScreen');
const gameOverScreen = $('gameOverScreen');
const canvas         = $('gameCanvas');
const ctx            = canvas.getContext('2d');
const scoreDisplay   = $('scoreDisplay');
const highScoreDisplay = $('highScoreDisplay');
const pauseOverlay   = $('pauseOverlay');
const pauseIcon      = $('pauseIcon');
const playIcon       = $('playIcon');
const finalScore     = $('finalScore');
const finalHighScore = $('finalHighScore');
const newRecordBadge = $('newRecordBadge');
const startHighScore = $('startHighScore');
const goParticles    = $('goParticles');

/* ─────────────────────────────────────────────
   GAME STATE
───────────────────────────────────────────────*/
let snake, dir, nextDir, food, bonusFood;
let score, highScore, difficulty;
let running, paused, gameOver;
let lastTime, elapsed;
let currentSpeed;
let animFrameId;
let foodAnim = 0;  // for pulsing food

// Touch / swipe
let touchStartX = 0, touchStartY = 0;
let touchMoved  = false;
const SWIPE_THRESHOLD = 20;

/* ─────────────────────────────────────────────
   CANVAS SIZING — fills available space cleanly
───────────────────────────────────────────────*/
function resizeCanvas() {
  const wrap = document.querySelector('.canvas-wrap');
  const rect  = wrap.getBoundingClientRect();
  const size  = Math.min(rect.width, rect.height);
  // Make canvas exactly GRID_W * CELL × GRID_H * CELL for crisp pixels
  const cellSize = Math.floor(size / Math.max(GRID_W, GRID_H));
  const w = cellSize * GRID_W;
  const h = cellSize * GRID_H;
  canvas.width  = w;
  canvas.height = h;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  // Store effective cell size for drawing
  canvas._cell = cellSize;
}

/* ─────────────────────────────────────────────
   SCREEN MANAGEMENT
───────────────────────────────────────────────*/
function showScreen(screen) {
  [startScreen, gameScreen, gameOverScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

/* ─────────────────────────────────────────────
   HIGH SCORE (localStorage)
───────────────────────────────────────────────*/
function loadHighScore(diff) {
  return parseInt(localStorage.getItem('neonSnakeHS_' + diff) || '0', 10);
}
function saveHighScore(diff, val) {
  localStorage.setItem('neonSnakeHS_' + diff, val);
}

/* ─────────────────────────────────────────────
   INIT / RESTART
───────────────────────────────────────────────*/
function initGame() {
  // Snake starts at center, length 3, moving right
  const startX = Math.floor(GRID_W / 2);
  const startY = Math.floor(GRID_H / 2);
  snake   = [
    { x: startX,     y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];
  dir      = { x: 1, y: 0 };
  nextDir  = { x: 1, y: 0 };
  score    = 0;
  highScore= loadHighScore(difficulty);
  running  = true;
  paused   = false;
  gameOver = false;
  lastTime = null;
  elapsed  = 0;
  foodAnim = 0;
  bonusFood = null;
  currentSpeed = DIFFICULTY[difficulty].speed;

  spawnFood();
  updateScoreDisplay();
  updateHighScoreDisplay();

  // Pause icon reset
  pauseIcon.style.display = '';
  playIcon.style.display  = 'none';
  pauseOverlay.classList.add('hidden');
}

/* ─────────────────────────────────────────────
   FOOD SPAWN — never on snake body
───────────────────────────────────────────────*/
function getAllSnakeCells() {
  const set = new Set();
  snake.forEach(s => set.add(s.x + ',' + s.y));
  if (bonusFood) set.add(bonusFood.x + ',' + bonusFood.y);
  return set;
}

function spawnFood() {
  const occupied = getAllSnakeCells();
  const free = [];
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      if (!occupied.has(x + ',' + y)) free.push({ x, y });
    }
  }
  if (free.length === 0) return; // board full — win condition edge case
  food = free[Math.floor(Math.random() * free.length)];
}

function spawnBonusFood() {
  const occupied = getAllSnakeCells();
  occupied.add(food.x + ',' + food.y);
  const free = [];
  for (let x = 0; x < GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      if (!occupied.has(x + ',' + y)) free.push({ x, y });
    }
  }
  if (free.length === 0) return;
  bonusFood = {
    ...free[Math.floor(Math.random() * free.length)],
    timer: 5000  // disappears after 5 seconds
  };
}

/* ─────────────────────────────────────────────
   DIRECTION QUEUE — prevents 180° reversal & double-input
───────────────────────────────────────────────*/
function setDir(newX, newY) {
  // Prevent reversing
  if (newX === -dir.x && newY === -dir.y) return;
  // Prevent same direction repeat to avoid stutter
  if (newX === nextDir.x && newY === nextDir.y) return;
  // Prevent 180° vs current nextDir
  if (newX === -nextDir.x && newY === -nextDir.y) return;
  nextDir = { x: newX, y: newY };
}

/* ─────────────────────────────────────────────
   GAME LOOP
───────────────────────────────────────────────*/
function gameLoop(timestamp) {
  if (!running) return;
  animFrameId = requestAnimationFrame(gameLoop);

  if (!lastTime) lastTime = timestamp;
  const delta = Math.min(timestamp - lastTime, 100); // cap delta to avoid huge jumps
  lastTime = timestamp;

  foodAnim += delta * 0.004;
  if (bonusFood) bonusFood.timer -= delta;

  if (!paused) {
    elapsed += delta;
    if (elapsed >= currentSpeed) {
      elapsed -= currentSpeed;
      tick();
    }
  }

  draw();
}

/* ─────────────────────────────────────────────
   TICK — one step of game logic
───────────────────────────────────────────────*/
function tick() {
  // Commit buffered direction
  dir = { ...nextDir };

  // New head position
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  // Wall collision (wrap mode optional — we use death)
  if (head.x < 0 || head.x >= GRID_W || head.y < 0 || head.y >= GRID_H) {
    endGame(); return;
  }

  // Self collision — check all body segments except last (which will be removed)
  for (let i = 0; i < snake.length - 1; i++) {
    if (snake[i].x === head.x && snake[i].y === head.y) {
      endGame(); return;
    }
  }

  // Add new head
  snake.unshift(head);

  // Check bonus food
  let ate = false;
  if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
    score += 5;
    bonusFood = null;
    ate = true;
    Audio.eat();
    updateScoreDisplay(true);
    Audio.levelUp();
  }

  // Check regular food
  if (head.x === food.x && head.y === food.y) {
    score++;
    ate = true;
    Audio.eat();
    updateScoreDisplay(true);
    spawnFood();

    // Spawn bonus food every 5 points
    if (score % 5 === 0 && !bonusFood) spawnBonusFood();

    // Speed increase (cap at 55ms for hard)
    if (score % 3 === 0) {
      currentSpeed = Math.max(55, currentSpeed - 2);
    }
  }

  // Remove tail if didn't eat
  if (!ate) snake.pop();

  // Expire bonus food
  if (bonusFood && bonusFood.timer <= 0) bonusFood = null;
}

/* ─────────────────────────────────────────────
   DRAW
───────────────────────────────────────────────*/
function draw() {
  const C = canvas._cell || CELL;
  const W = canvas.width;
  const H = canvas.height;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath(); ctx.moveTo(x * C, 0); ctx.lineTo(x * C, H); ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * C); ctx.lineTo(W, y * C); ctx.stroke();
  }

  // Bonus food
  if (bonusFood) {
    const pulse = 0.7 + 0.3 * Math.sin(foodAnim * 2.5);
    const bx = bonusFood.x * C + C / 2;
    const by = bonusFood.y * C + C / 2;
    const br = (C / 2 - 2) * pulse;

    // Glow
    const bgrd = ctx.createRadialGradient(bx, by, 0, bx, by, br * 2.5);
    bgrd.addColorStop(0, 'rgba(255,230,0,0.5)');
    bgrd.addColorStop(1, 'rgba(255,230,0,0)');
    ctx.fillStyle = bgrd; ctx.beginPath();
    ctx.arc(bx, by, br * 2.5, 0, Math.PI * 2); ctx.fill();

    // Star shape for bonus
    drawStar(ctx, bx, by, 5, br, br * 0.45, COLORS.bonus);

    // Timer bar
    const frac = Math.max(0, bonusFood.timer / 5000);
    ctx.fillStyle = 'rgba(255,230,0,0.2)';
    ctx.fillRect(bonusFood.x * C + 1, bonusFood.y * C + C - 4, C - 2, 3);
    ctx.fillStyle = COLORS.bonus;
    ctx.fillRect(bonusFood.x * C + 1, bonusFood.y * C + C - 4, (C - 2) * frac, 3);
  }

  // Regular food
  if (food) {
    const pulse = 0.75 + 0.25 * Math.sin(foodAnim * 3);
    const fx = food.x * C + C / 2;
    const fy = food.y * C + C / 2;
    const fr = (C / 2 - 2) * pulse;

    // Outer glow
    const fgrd = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 3);
    fgrd.addColorStop(0, 'rgba(255,45,120,0.6)');
    fgrd.addColorStop(1, 'rgba(255,45,120,0)');
    ctx.fillStyle = fgrd; ctx.beginPath();
    ctx.arc(fx, fy, fr * 3, 0, Math.PI * 2); ctx.fill();

    // Food circle
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.food;
    ctx.shadowColor = COLORS.food;
    ctx.shadowBlur = 14 * pulse;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner highlight
    ctx.beginPath(); ctx.arc(fx - fr * 0.28, fy - fr * 0.28, fr * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
  }

  // Snake
  snake.forEach((seg, i) => {
    const isHead = i === 0;
    const x = seg.x * C;
    const y = seg.y * C;
    const pad = isHead ? 1 : 2;
    const radius = isHead ? C * 0.3 : C * 0.25;
    const alpha = isHead ? 1 : Math.max(0.4, 1 - i * 0.02);
    const gColor = isHead ? COLORS.snakeHead : COLORS.snakeBody;

    // Glow on head
    if (isHead) {
      ctx.shadowColor = COLORS.snakeHead;
      ctx.shadowBlur = 16;
    }

    // Body segment
    ctx.beginPath();
    roundRect(ctx, x + pad, y + pad, C - pad * 2, C - pad * 2, radius);
    ctx.fillStyle = isHead ? COLORS.snakeHead : adjustAlpha(COLORS.snakeBody, alpha);
    ctx.fill();

    // Border glow on each segment
    ctx.strokeStyle = adjustAlpha(COLORS.snakeBorder, alpha * 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Eyes on head
    if (isHead) {
      const eyeR = C * 0.1;
      const eyeOff = C * 0.22;
      // Pick eye positions based on direction
      let e1, e2;
      if (dir.x === 1)       { e1 = {x: C*0.65, y: C*0.28}; e2 = {x: C*0.65, y: C*0.72}; }
      else if (dir.x === -1) { e1 = {x: C*0.35, y: C*0.28}; e2 = {x: C*0.35, y: C*0.72}; }
      else if (dir.y === -1) { e1 = {x: C*0.28, y: C*0.35}; e2 = {x: C*0.72, y: C*0.35}; }
      else                   { e1 = {x: C*0.28, y: C*0.65}; e2 = {x: C*0.72, y: C*0.65}; }

      ctx.fillStyle = '#0a0a0f';
      ctx.beginPath(); ctx.arc(x + e1.x, y + e1.y, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + e2.x, y + e2.y, eyeR, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + e1.x - eyeR*0.2, y + e1.y - eyeR*0.2, eyeR*0.45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + e2.x - eyeR*0.2, y + e2.y - eyeR*0.2, eyeR*0.45, 0, Math.PI * 2); ctx.fill();
    }
  });

  // Paused dim (subtle)
  if (paused) {
    ctx.fillStyle = 'rgba(10,10,15,0.4)';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ─────────────────────────────────────────────
   DRAWING HELPERS
───────────────────────────────────────────────*/
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx, cx, cy, pts, outerR, innerR, color) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const angle = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function adjustAlpha(hexColor, alpha) {
  // Convert hex to rgba
  const r = parseInt(hexColor.slice(1,3),16);
  const g = parseInt(hexColor.slice(3,5),16);
  const b = parseInt(hexColor.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─────────────────────────────────────────────
   SCORE UI
───────────────────────────────────────────────*/
function updateScoreDisplay(pop = false) {
  scoreDisplay.textContent = score;
  if (pop) {
    scoreDisplay.classList.remove('pop');
    void scoreDisplay.offsetWidth;
    scoreDisplay.classList.add('pop');
    setTimeout(() => scoreDisplay.classList.remove('pop'), 150);
  }
}

function updateHighScoreDisplay() {
  highScoreDisplay.textContent = highScore;
}

/* ─────────────────────────────────────────────
   END GAME
───────────────────────────────────────────────*/
function endGame() {
  running  = false;
  gameOver = true;
  cancelAnimationFrame(animFrameId);
  Audio.die();

  // Flash the canvas red briefly
  let flashes = 0;
  const flashInterval = setInterval(() => {
    ctx.fillStyle = `rgba(255,45,120,${0.15 - flashes * 0.03})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    flashes++;
    if (flashes >= 5) clearInterval(flashInterval);
  }, 60);

  // Update high score
  let isNewRecord = false;
  if (score > highScore) {
    highScore = score;
    saveHighScore(difficulty, highScore);
    isNewRecord = true;
  }

  setTimeout(() => {
    finalScore.textContent     = score;
    finalHighScore.textContent = highScore;
    newRecordBadge.classList.toggle('hidden', !isNewRecord);
    spawnParticles();
    showScreen(gameOverScreen);
  }, 350);
}

/* ─────────────────────────────────────────────
   PARTICLES (game over celebration)
───────────────────────────────────────────────*/
function spawnParticles() {
  goParticles.innerHTML = '';
  const colors = ['#00ffcc','#ff2d78','#ffe600','#00c3ff','#fff'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 4 + Math.random() * 8;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left  = Math.random() * 100;
    const dur   = 1.2 + Math.random() * 1.8;
    const delay = Math.random() * 0.8;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      background:${color};
      left:${left}%;
      bottom:-20px;
      box-shadow: 0 0 8px ${color};
      animation-duration:${dur}s;
      animation-delay:${delay}s;
    `;
    goParticles.appendChild(p);
  }
}

/* ─────────────────────────────────────────────
   PAUSE / RESUME
───────────────────────────────────────────────*/
function togglePause() {
  if (gameOver || !running) return;
  paused = !paused;
  Audio.pause();
  pauseIcon.style.display = paused ? 'none' : '';
  playIcon.style.display  = paused ? '' : 'none';
  pauseOverlay.classList.toggle('hidden', !paused);
  if (!paused) lastTime = null; // reset delta so no jump on resume
}

/* ─────────────────────────────────────────────
   KEYBOARD INPUT
───────────────────────────────────────────────*/
document.addEventListener('keydown', e => {
  switch (e.code) {
    case 'ArrowUp':    case 'KeyW': e.preventDefault(); setDir(0, -1);  break;
    case 'ArrowDown':  case 'KeyS': e.preventDefault(); setDir(0,  1);  break;
    case 'ArrowLeft':  case 'KeyA': e.preventDefault(); setDir(-1, 0);  break;
    case 'ArrowRight': case 'KeyD': e.preventDefault(); setDir(1,  0);  break;
    case 'Space': case 'KeyP':      e.preventDefault(); togglePause();  break;
  }
});

/* ─────────────────────────────────────────────
   TOUCH / SWIPE INPUT (super responsive)
───────────────────────────────────────────────*/
function handleTouchStart(e) {
  const t = e.changedTouches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchMoved  = false;
  Audio.init(); // unlock audio on first touch
}

function handleTouchMove(e) {
  e.preventDefault();
  if (touchMoved) return;

  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (Math.max(adx, ady) < SWIPE_THRESHOLD) return;

  touchMoved = true;
  if (adx > ady) {
    setDir(dx > 0 ? 1 : -1, 0);
  } else {
    setDir(0, dy > 0 ? 1 : -1);
  }
}

// Attach to canvas wrap for game screen
const canvasWrap = document.querySelector('.canvas-wrap');
canvasWrap.addEventListener('touchstart', handleTouchStart, { passive: true });
canvasWrap.addEventListener('touchmove',  handleTouchMove,  { passive: false });

// Full-screen swipe fallback (swipe anywhere on game screen)
gameScreen.addEventListener('touchstart', handleTouchStart, { passive: true });
gameScreen.addEventListener('touchmove',  handleTouchMove,  { passive: false });

/* ─────────────────────────────────────────────
   D-PAD BUTTONS
───────────────────────────────────────────────*/
document.querySelectorAll('.dpad-btn').forEach(btn => {
  const press = (e) => {
    e.preventDefault();
    Audio.init();
    const d = btn.dataset.dir;
    if (d === 'UP')    setDir(0, -1);
    if (d === 'DOWN')  setDir(0,  1);
    if (d === 'LEFT')  setDir(-1, 0);
    if (d === 'RIGHT') setDir(1,  0);
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);
  };
  btn.addEventListener('touchstart', press, { passive: false });
  btn.addEventListener('mousedown',  press);
});

/* ─────────────────────────────────────────────
   UI BUTTONS — Start Screen
───────────────────────────────────────────────*/
let selectedDiff = 'medium';

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDiff = btn.dataset.diff;
    startHighScore.textContent = loadHighScore(selectedDiff);
  });

  // Also update highscore display on hover (desktop)
  btn.addEventListener('mouseenter', () => {
    startHighScore.textContent = loadHighScore(btn.dataset.diff);
  });
  btn.addEventListener('mouseleave', () => {
    startHighScore.textContent = loadHighScore(selectedDiff);
  });
});

$('startBtn').addEventListener('click', () => {
  Audio.init();
  difficulty = selectedDiff;
  resizeCanvas();
  initGame();
  showScreen(gameScreen);
  cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
});

/* ─────────────────────────────────────────────
   UI BUTTONS — Game Screen
───────────────────────────────────────────────*/
$('pauseBtn').addEventListener('click', () => togglePause());

$('resumeBtn').addEventListener('click', () => {
  if (paused) togglePause();
});

$('restartFromPause').addEventListener('click', () => {
  cancelAnimationFrame(animFrameId);
  resizeCanvas();
  initGame();
  showScreen(gameScreen);
  animFrameId = requestAnimationFrame(gameLoop);
});

$('menuFromPause').addEventListener('click', () => {
  cancelAnimationFrame(animFrameId);
  running = false;
  startHighScore.textContent = loadHighScore(selectedDiff);
  showScreen(startScreen);
});

/* ─────────────────────────────────────────────
   UI BUTTONS — Game Over Screen
───────────────────────────────────────────────*/
$('restartBtn').addEventListener('click', () => {
  Audio.init();
  resizeCanvas();
  initGame();
  showScreen(gameScreen);
  cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
});

$('menuBtn').addEventListener('click', () => {
  startHighScore.textContent = loadHighScore(selectedDiff);
  showScreen(startScreen);
});

/* ─────────────────────────────────────────────
   WINDOW RESIZE
───────────────────────────────────────────────*/
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (gameScreen.classList.contains('active')) {
      resizeCanvas();
    }
  }, 150);
});

/* ─────────────────────────────────────────────
   INIT — Show start screen
───────────────────────────────────────────────*/
(function bootstrap() {
  // Default difficulty is medium
  selectedDiff = 'medium';
  document.querySelector('[data-diff="medium"]').classList.add('active');
  document.querySelector('[data-diff="easy"]').classList.remove('active');
  startHighScore.textContent = loadHighScore('medium');
  showScreen(startScreen);
})();
