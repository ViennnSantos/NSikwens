// ─────────────────────────────────────────────
//  numberedSequence.js  –  Numbered Sequence Minigame
// ─────────────────────────────────────────────

let nsActive       = false;
let nsConfig       = {};
let nsSequence     = [];   // correct order: [cellIndex, cellIndex, ...]
let nsGrid         = [];   // array of cell elements
let nsNextExpected = 0;    // which step player must click next
let nsPhase        = 'idle'; // idle | memorize | recall | result
let nsRound        = 0;
let nsRecallTimer  = null;
let nsMemTimer     = null;
let nsRecallLeft   = 0;
let nsSuccess      = false;

const NS_DEFAULTS = {
    gridSize:     4,   // 4 = 4x4
    numberCount:  6,   // how many numbers to memorize
    memorizeTime: 5,   // seconds numbers are visible
    recallTime:   30,  // seconds to recall
    rounds:       3
};

// ── Setup ────────────────────────────────────

function setupNSGame(config) {
    nsConfig = {
        gridSize:     config?.gridSize     || NS_DEFAULTS.gridSize,
        numberCount:  config?.numberCount  || NS_DEFAULTS.numberCount,
        recallTime:   config?.recallTime   || NS_DEFAULTS.recallTime,
        memorizeTime: config?.memorizeTime || NS_DEFAULTS.memorizeTime,
        rounds:       config?.rounds       || NS_DEFAULTS.rounds
    };

    // Clamp numberCount to max cells
    const maxCells = nsConfig.gridSize * nsConfig.gridSize;
    if (nsConfig.numberCount > maxCells) nsConfig.numberCount = maxCells;

    nsRound = 0;
    buildNSUI();
    startNSRound();
}

// ── UI Build ─────────────────────────────────

function buildNSUI() {
    const grid = document.getElementById('ns-grid');
    if (!grid) return;

    const size = nsConfig.gridSize;
    const wrap = grid.parentElement;

    // Compute cell size to fit inside the wrapper without overflowing
    const availW   = (wrap.clientWidth  || 500) - 20;
    const availH   = (wrap.clientHeight || 500) - 20;
    const available = Math.min(availW, availH > 100 ? availH : availW);
    const gap      = 5;
    const cellSize = Math.floor((available - gap * (size - 1)) / size);

    grid.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    grid.style.gridTemplateRows    = `repeat(${size}, ${cellSize}px)`;
    grid.innerHTML = '';
    nsGrid = [];

    const totalCells = size * size;
    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className  = 'ns-cell';
        cell.dataset.index = i;
        cell.style.width  = cellSize + 'px';
        cell.style.height = cellSize + 'px';
        cell.addEventListener('click', () => handleNSClick(i));
        grid.appendChild(cell);
        nsGrid.push(cell);
    }
}

// ── Round Logic ──────────────────────────────

function startNSRound() {
    nsRound++;
    nsNextExpected = 0;
    nsActive       = true;
    nsPhase        = 'memorize';

    clearTimers();
    resetCells();
    generateSequence();

    updateRoundLabel();
    setMessage('Memorize the sequence', '');

    showNumbers();

    // After memorize time, hide numbers and start recall
    nsMemTimer = setTimeout(() => {
        hideNumbers();
        startRecall();
    }, nsConfig.memorizeTime * 1000);

    // Countdown display during memorize
    startCountdownDisplay('ns-mem-timer', nsConfig.memorizeTime);
}

function generateSequence() {
    const totalCells = nsConfig.gridSize * nsConfig.gridSize;
    const indices    = shuffle([...Array(totalCells).keys()]);
    nsSequence       = indices.slice(0, nsConfig.numberCount);
}

function showNumbers() {
    nsSequence.forEach((cellIdx, order) => {
        const cell = nsGrid[cellIdx];
        if (!cell) return;
        cell.classList.add('ns-revealed');
        cell.textContent = order + 1;
    });
}

function hideNumbers() {
    nsGrid.forEach(cell => {
        cell.classList.remove('ns-revealed');
        cell.textContent = '';
    });
}

function resetCells() {
    nsGrid.forEach(cell => {
        cell.className = 'ns-cell';
        cell.textContent = '';
        cell.style.pointerEvents = 'auto';
    });
}

// ── Recall Phase ─────────────────────────────

function startRecall() {
    nsPhase      = 'recall';
    nsRecallLeft = nsConfig.recallTime;

    setMessage('Click the numbers in order: 1 → ' + nsConfig.numberCount, '');
    updateRecallTimer(nsRecallLeft);

    nsRecallTimer = setInterval(() => {
        nsRecallLeft--;
        updateRecallTimer(nsRecallLeft);
        if (nsRecallLeft <= 0) {
            clearInterval(nsRecallTimer);
            endGame(false, 'Time\'s up!');
        }
    }, 1000);
}

function updateRecallTimer(secs) {
    const el = document.getElementById('ns-recall-timer');
    if (el) el.textContent = 'Time: ' + secs + 's';
}

function handleNSClick(cellIdx) {
    if (nsPhase !== 'recall') return;

    const correctIdx = nsSequence[nsNextExpected];

    if (cellIdx === correctIdx) {
        // Correct
        const cell = nsGrid[cellIdx];
        cell.classList.add('ns-correct');
        cell.textContent = nsNextExpected + 1;
        cell.style.pointerEvents = 'none';
        nsNextExpected++;

        if (nsNextExpected >= nsConfig.numberCount) {
            // Round complete
            clearTimers();
            if (nsRound >= nsConfig.rounds) {
                endGame(true);
            } else {
                setMessage(`Round ${nsRound} complete! Get ready…`, 'success');
                setTimeout(() => startNSRound(), 1800);
            }
        }
    } else {
        // Wrong — instant fail
        const cell = nsGrid[cellIdx];
        cell.classList.add('ns-wrong');
        clearTimers();
        // Reveal correct answer
        revealAll();
        endGame(false, 'Wrong tile!');
    }
}

function revealAll() {
    nsSequence.forEach((cellIdx, order) => {
        const cell = nsGrid[cellIdx];
        if (!cell) return;
        if (!cell.classList.contains('ns-correct')) {
            cell.classList.add('ns-revealed-hint');
            cell.textContent = order + 1;
        }
    });
}

// ── End Game ─────────────────────────────────

function endGame(success, reason) {
    nsActive  = false;
    nsPhase   = 'result';
    nsSuccess = success;

    clearTimers();
    lockGrid();

    if (success) {
        setMessage('SEQUENCE COMPLETE!', 'success');
    } else {
        setMessage(reason || 'FAILED', 'failure');
    }

    // Show retry hint
    const retryEl = document.getElementById('ns-retry-hint');
    if (retryEl) retryEl.style.display = 'block';

    // Send result to FiveM
    setTimeout(() => {
        const result = { success, rounds: nsRound, config: nsConfig };
        fetch(`https://${GetParentResourceName()}/nsResult`, {
            method: 'POST',
            body: JSON.stringify(result)
        });
    }, 2000);
}

function lockGrid() {
    nsGrid.forEach(cell => cell.style.pointerEvents = 'none');
}

// ── Space to Retry ────────────────────────────

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && nsPhase === 'result') {
        e.preventDefault();
        retryNSGame();
    }
});

function retryNSGame() {
    const retryEl = document.getElementById('ns-retry-hint');
    if (retryEl) retryEl.style.display = 'none';

    nsRound = 0;
    buildNSUI();
    startNSRound();
}

// ── Helpers ───────────────────────────────────

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function clearTimers() {
    clearTimeout(nsMemTimer);
    clearInterval(nsRecallTimer);
    clearInterval(window._nsCountdownInterval);
}

function setMessage(text, type) {
    const el = document.getElementById('ns-message');
    if (!el) return;
    el.textContent = text;
    el.className   = 'ns-message' + (type ? ' ns-msg-' + type : '');
}

function updateRoundLabel() {
    const el = document.getElementById('ns-round-label');
    if (el) el.textContent = `ROUND: ${nsRound}/${nsConfig.rounds}`;
}

function startCountdownDisplay(id, seconds) {
    const el = document.getElementById(id);
    if (!el) return;
    let left = seconds;
    el.textContent = 'Memorize: ' + left + 's';
    clearInterval(window._nsCountdownInterval);
    window._nsCountdownInterval = setInterval(() => {
        left--;
        if (el) el.textContent = 'Memorize: ' + left + 's';
        if (left <= 0) clearInterval(window._nsCountdownInterval);
    }, 1000);
}

// ── postMessage listener ──────────────────────

window.addEventListener('message', (event) => {
    if (event.data?.action === 'startNS') {
        const container = document.getElementById('ns-container');
        const idle      = document.getElementById('ns-idle');
        if (idle)      idle.style.display      = 'none';
        if (container) {
            container.style.display  = 'flex';
            container.style.opacity  = '1';
        }
        setupNSGame(event.data.config);
    }
});
