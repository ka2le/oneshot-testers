const NUMBERS = [7, 8, 9, 4, 5, 6, 1, 2, 3];
const audioCtx = new (typeof AudioContext !== 'undefined' ? AudioContext : window.AudioContext)();

function playTone(freq, dur, type) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.15;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain);
  osc.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function showPopup(cell, text) {
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.textContent = text;
  popup.style.left = cell.offsetLeft + 30 + 'px';
  popup.style.top = cell.offsetTop + 'px';
  gridEl.appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}

let score = 0;
let combo = 0;
let lives = 3;
let activeCell = null;
let activeNumber = null;
let gameOver = false;
let started = false;
let round = 0;
let interval = 1500;
let timer = null;

const gridEl = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const livesEl = document.getElementById('lives');
const msgEl = document.getElementById('message');
const btnEl = document.getElementById('startBtn');

const cells = [];

function buildGrid() {
  gridEl.innerHTML = '';
  cells.length = 0;
  for (const num of NUMBERS) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.number = String(num);
    cell.textContent = String(num);
    gridEl.appendChild(cell);
    cells.push(cell);
  }
}

function updateHUD() {
  scoreEl.textContent = `Score: ${score}`;
  comboEl.textContent = `Combo: x${Math.max(1, combo)}`;
  const hearts = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, 3 - lives));
  livesEl.textContent = `Lives: ${hearts}`;
}

function startGame() {
  score = 0;
  combo = 0;
  lives = 3;
  gameOver = false;
  started = true;
  round = 0;
  interval = 2000;
  activeCell = null;
  activeNumber = null;
  buildGrid();
  updateHUD();
  msgEl.textContent = '3...';
  btnEl.textContent = 'RESTART';
  setTimeout(() => { if (started) msgEl.textContent = '2...'; }, 600);
  setTimeout(() => { if (started) msgEl.textContent = '1...'; }, 1200);
  setTimeout(() => { if (started) { msgEl.textContent = ''; nextRound(); } }, 1800);
}

function nextRound() {
  round++;
  if (round % 5 === 0 && interval > 600) {
    interval -= 100;
  }
  const idx = Math.floor(Math.random() * 9);
  activeCell = cells[idx];
  activeNumber = NUMBERS[idx];
  activeCell.classList.add('active');
  timer = setTimeout(missedTarget, interval);
}

function missedTarget() {
  timer = null;
  if (activeCell) {
    activeCell.classList.remove('active');
    activeCell.classList.add('miss');
    setTimeout(() => {
      activeCell.classList.remove('miss');
    }, 300);
  }
  playTone(180, 0.25, 'sawtooth');
  combo = 0;
  lives--;
  updateHUD();
  if (lives <= 0) {
    endGame();
    return;
  }
  setTimeout(nextRound, 400);
}

function handleKeyPress(e) {
  if (!started || gameOver) return;
  const key = e.key;
  if (!'0123456789'.includes(key)) return;
  const pressed = parseInt(key, 10);
  if (activeNumber === null) return;

  if (pressed === activeNumber) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    combo++;
    const points = 10 * Math.max(1, combo);
    score += points;
    playTone(440 + combo * 40, 0.15, 'square');
    showPopup(activeCell, `+${points}`);
    activeCell.classList.remove('active');
    activeCell.classList.add('hit');
    const hitCell = activeCell;
    setTimeout(() => {
      hitCell.classList.remove('hit');
    }, 200);
    activeCell = null;
    activeNumber = null;
    updateHUD();
    setTimeout(nextRound, 300);
  } else {
    combo = 0;
    lives--;
    playTone(180, 0.25, 'sawtooth');
    updateHUD();
    if (activeCell) {
      activeCell.classList.remove('active');
      activeCell.classList.add('miss');
      const missCell = activeCell;
      setTimeout(() => {
        missCell.classList.remove('miss');
      }, 300);
    }
    activeCell = null;
    activeNumber = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lives <= 0) {
      endGame();
      return;
    }
    setTimeout(nextRound, 500);
  }
}

function endGame() {
  gameOver = true;
  started = false;
  msgEl.textContent = `GAME OVER — Score: ${score}`;
  btnEl.textContent = 'PLAY AGAIN';
  btnEl.style.display = 'inline';
}

btnEl.addEventListener('click', (e) => {
  if (!started || gameOver) {
    startGame();
  }
});

document.addEventListener('keydown', handleKeyPress);

buildGrid();
updateHUD();
