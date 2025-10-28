
        // WebSocket connection - CHANGE THIS URL TO YOUR BACKEND SERVER
        const WS_URL = 'https://lnvidia-1.tailee5ad1.ts.net/' // Change to your deployed backend URL
        let ws = null;
        let isConnected = false;

        // Game state
        const state = {
            words: ['apple', 'banana', 'computer', 'elephant', 'guitar', 'house', 'mountain', 'rainbow', 'telephone', 'umbrella'],
            currentWord: '',
            myScore: 0,
            round: 1,
            totalRounds: 3,
            drawTime: 80,
            timeLeft: 80,
            maxHints: 2,
        guessedCorrectly: false,
        guessedPlayerIds: new Set(),
            hintsGiven: 0,
            playerName: 'Player1',
            playerId: null,
            playerColor: '#FF6B6B',
            players: [],
            roomCode: null,
            isHost: false,
            currentDrawer: null,
            isMyTurn: false,
            gameStarted: false,
            currentWordLength: 0,
            currentMask: '',
            revealedIndices: [],
            wordSelectionDuration: 0,
            wordChoiceTimeLeft: 0,
            drawerChoiceTimeLeft: 0
        };

const SPACE_PLACEHOLDER = '/';
function resetGuessedPlayers(guessedPlayers = []) {
    if (!(state.guessedPlayerIds instanceof Set)) {
        state.guessedPlayerIds = new Set();
    } else {
        state.guessedPlayerIds.clear();
    }

    if (Array.isArray(guessedPlayers)) {
        guessedPlayers.forEach(id => state.guessedPlayerIds.add(id));
    }
}

function pruneGuessedPlayers() {
    if (!(state.guessedPlayerIds instanceof Set)) {
        return;
    }

    const activeIds = new Set(Array.isArray(state.players) ? state.players.map(player => player.id) : []);
    Array.from(state.guessedPlayerIds).forEach(id => {
        if (!activeIds.has(id)) {
            state.guessedPlayerIds.delete(id);
        }
    });
}

const SPACE_DISPLAY_GAP = '   ';
const HYPHEN_CHARS = new Set(['-', '\u2013', '\u2014']);
const GUESSABLE_CHAR_REGEX_CLIENT = /[A-Za-z0-9]/;

function buildClientMask(word, revealedIndices, options = {}) {
    if (!word) return '';
    const revealAll = !!options.revealAll;
    const indicesSet = revealedIndices instanceof Set
        ? revealedIndices
        : new Set(Array.isArray(revealedIndices) ? revealedIndices : []);
    const tokens = [];
    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        if (char === ' ') {
            tokens.push(SPACE_PLACEHOLDER);
        } else if (HYPHEN_CHARS.has(char)) {
            tokens.push(char);
        } else if (!GUESSABLE_CHAR_REGEX_CLIENT.test(char)) {
            tokens.push(char);
        } else if (revealAll || indicesSet.has(i)) {
            tokens.push(char);
        } else {
            tokens.push('_');
        }
    }
    return tokens.join(' ');
}

function maskToDisplayString(mask) {
    if (Array.isArray(mask)) {
        return mask.map(token => token === SPACE_PLACEHOLDER ? SPACE_DISPLAY_GAP : token).join(' ');
    }
    if (typeof mask !== 'string' || mask.length === 0) {
        return '';
    }
    return mask.split(' ')
        .map(token => token === SPACE_PLACEHOLDER ? SPACE_DISPLAY_GAP : token)
        .join(' ');
}

function getMaskTokenCount(mask) {
    if (Array.isArray(mask)) return mask.length;
    if (typeof mask !== 'string' || mask.length === 0) return 0;
    return mask.split(' ').filter(token => token.length > 0).length;
}

function createEmptyMask(source) {
    if (!source) return '';
    if (typeof source === 'string') {
        return buildClientMask(source, [], { revealAll: false });
    }
    const length = Number(source);
    if (!Number.isFinite(length) || length <= 0) return '';
    return Array.from({ length }, () => '_').join(' ');
}

function clearWordChoiceCountdown() {
    if (wordChoiceInterval) {
        clearInterval(wordChoiceInterval);
        wordChoiceInterval = null;
    }
    state.wordChoiceTimeLeft = 0;
}

function updateWordChoiceSubtitle() {
    if (!wordSelectSubtitle) return;
    if (state.wordChoiceTimeLeft > 0) {
        wordSelectSubtitle.textContent = `Pick one to start drawing. Time left: ${state.wordChoiceTimeLeft}s`;
    } else {
        wordSelectSubtitle.textContent = 'Pick one to start drawing.';
    }
}

function startWordChoiceCountdown(seconds) {
    clearWordChoiceCountdown();
    const initial = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    state.wordChoiceTimeLeft = initial;
    updateWordChoiceSubtitle();
    if (initial > 0) {
        wordChoiceInterval = setInterval(() => {
            state.wordChoiceTimeLeft = Math.max(0, state.wordChoiceTimeLeft - 1);
            updateWordChoiceSubtitle();
            if (state.wordChoiceTimeLeft <= 0) {
                clearWordChoiceCountdown();
            }
        }, 1000);
    }
}

        function ensureKickMenu() {
    if (kickMenu) return kickMenu;
    kickMenu = document.createElement('div');
    kickMenu.className = 'kick-menu';

    const kickButton = document.createElement('button');
    kickButton.type = 'button';
    kickButton.textContent = 'Kick Player';
    kickMenu.appendChild(kickButton);

    kickButton.addEventListener('click', () => {
        if (!kickMenuPlayerId) return;
        sendMessage({
            type: 'kick-player',
            playerId: kickMenuPlayerId
        });
        hideKickMenu();
    });

    document.body.appendChild(kickMenu);
    return kickMenu;
}

function showKickMenu(player, anchor) {
    if (!state.isHost) return;
    const menu = ensureKickMenu();
    kickMenuPlayerId = player.id;
    kickMenuAnchor = anchor;

    const kickButton = menu.querySelector('button');
    kickButton.textContent = `Kick ${player.name}`;

    const rect = anchor.getBoundingClientRect();
    menu.classList.add('active');

    const margin = 12;
    const menuRect = menu.getBoundingClientRect();

    let left = window.scrollX + rect.right + 12;
    let top = window.scrollY + rect.top + (rect.height - menuRect.height) / 2;

    if (left + menuRect.width > window.scrollX + window.innerWidth - margin) {
        left = window.scrollX + rect.left - menuRect.width - 12;
    }

    if (left < window.scrollX + margin) {
        left = window.scrollX + margin;
    }

    if (top + menuRect.height > window.scrollY + window.innerHeight - margin) {
        top = window.scrollY + window.innerHeight - menuRect.height - margin;
    }

    if (top < window.scrollY + margin) {
        top = window.scrollY + margin;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function hideKickMenu() {
    if (!kickMenu) return;
    kickMenu.classList.remove('active');
    kickMenuPlayerId = null;
    kickMenuAnchor = null;
}

document.addEventListener('click', (event) => {
    if (!kickMenu || !kickMenu.classList.contains('active')) return;
    const isMenuClick = kickMenu.contains(event.target);
    const isAnchorClick = kickMenuAnchor && kickMenuAnchor.contains(event.target);
    if (!isMenuClick && !isAnchorClick) {
        hideKickMenu();
    }
});

window.addEventListener('resize', hideKickMenu);
window.addEventListener('scroll', hideKickMenu, { passive: true });

        // Colors
        const colors = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#FFC0CB', '#8B4513'];

        // Initialize color picker
        const colorPicker = document.getElementById('colorPicker');
        colors.forEach(color => {
            const btn = document.createElement('div');
            btn.className = 'color-btn';
            btn.style.backgroundColor = color;
            if (color === '#000000') btn.classList.add('active');
            btn.addEventListener('click', () => {
                currentColor = color;
                setActiveTool('brush');
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            colorPicker.appendChild(btn);
        });

        // Brush size
        const brushSizeInput = document.getElementById('brushSize');
        const sizeValue = document.getElementById('sizeValue');
        brushSizeInput.addEventListener('input', (e) => {
            brushSize = Number(e.target.value);
            sizeValue.textContent = brushSize;
        });

        // Canvas drawing
        const supportsPointerEvents = typeof window !== 'undefined' && window.PointerEvent;

        function handlePointerDown(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) {
                return;
            }
            if (e.pointerType !== 'mouse') {
                e.preventDefault();
            }
            if (canvas.setPointerCapture && typeof e.pointerId === 'number') {
                try {
                    canvas.setPointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore capture errors
                }
            }
            startDrawing(e);
        }

        function handlePointerMove(e) {
            if (!isMouseDown) return;
            if (e.pointerType !== 'mouse') {
                e.preventDefault();
            }
            draw(e);
        }

        function handlePointerUp(e) {
            if (e.pointerType !== 'mouse') {
                e.preventDefault();
            }
            if (canvas.releasePointerCapture && typeof e.pointerId === 'number') {
                try {
                    canvas.releasePointerCapture(e.pointerId);
                } catch (err) {
                    // Ignore capture errors
                }
            }
            stopDrawing();
        }

        function handleTouchStart(e) {
            if (!state.isMyTurn) return;
            if (!e.touches || e.touches.length === 0) return;
            e.preventDefault();
            startDrawing(e);
        }

        function handleTouchMove(e) {
            if (!isMouseDown) return;
            if (!e.touches || e.touches.length === 0) return;
            e.preventDefault();
            draw(e);
        }

        function handleTouchEnd(e) {
            if (e && e.touches && e.touches.length > 0) {
                return;
            }
            stopDrawing();
        }

        if (supportsPointerEvents) {
            canvas.addEventListener('pointerdown', handlePointerDown);
            canvas.addEventListener('pointermove', handlePointerMove);
            canvas.addEventListener('pointerup', handlePointerUp);
            canvas.addEventListener('pointercancel', handlePointerUp);
            canvas.addEventListener('pointerout', handlePointerUp);
            canvas.addEventListener('pointerleave', handlePointerUp);
        } else {
            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseout', stopDrawing);

            canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
            canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
            canvas.addEventListener('touchend', handleTouchEnd);
            canvas.addEventListener('touchcancel', handleTouchEnd);
        }

        function startDrawing(e) {
            if (!state.isMyTurn) return;

            if (activeTool === 'fill') {
                const { x, y } = getCanvasCoordinates(e);
                performFill(x, y, currentColor, { broadcast: true });
                return;
            }

            isMouseDown = true;
            currentStroke = [];
            const { x, y } = getCanvasCoordinates(e);
            lastX = x;
            lastY = y;
        }

        function draw(e) {
            if (!isMouseDown || !state.isMyTurn) return;
            if (activeTool === 'fill') return;

            const { x, y } = getCanvasCoordinates(e);

            const segment = {
                x1: lastX,
                y1: lastY,
                x2: x,
                y2: y,
                color: activeTool === 'eraser' ? '#FFFFFF' : currentColor,
                size: brushSize
            };

            drawSegment(segment);
            currentStroke.push(segment);

            // Send drawing data to other players
            sendMessage({
                type: 'draw',
                data: segment
            });

            lastX = x;
            lastY = y;
        }

        function stopDrawing() {
            if (!isMouseDown) return;
            isMouseDown = false;

            if (!state.isMyTurn) {
                currentStroke = [];
                return;
            }

            if (currentStroke.length > 0) {
                const finalizedStroke = cloneStroke(currentStroke);
                strokes.push(finalizedStroke);
                actionHistory.push({ type: 'stroke' });
                currentStroke = [];
                updateUndoState();
                sendMessage({ type: 'stroke-end' });
            }
        }

        function drawLine(x1, y1, x2, y2, color, size) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        function drawSegment(segment) {
            if (!segment) return;
            const color = segment.color || currentColor;
            const size = typeof segment.size === 'number' ? segment.size : brushSize;
            drawLine(segment.x1, segment.y1, segment.x2, segment.y2, color, size);
        }

        function redrawCanvas(includeCurrent = false) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            strokes.forEach(action => {
                if (Array.isArray(action)) {
                    action.forEach(drawSegment);
                } else if (action && action.type === 'fill' && action.imageData) {
                    ctx.putImageData(action.imageData, 0, 0);
                }
            });

            if (includeCurrent && currentStroke.length > 0) {
                currentStroke.forEach(drawSegment);
            }
        }

        function updateUndoState() {
            if (undoBtn) {
                undoBtn.disabled = !state.isMyTurn || actionHistory.length === 0;
            }
        }

        function resetDrawingData() {
            strokes = [];
            currentStroke = [];
            actionHistory = [];
            setActiveTool('brush');
            updateUndoState();
        }

        function processCanvasEvent(event) {
            if (!event || !event.type) return;

            switch (event.type) {
                case 'draw': {
                    if (event.data) {
                        const segment = cloneSegment(event.data);
                        drawSegment(segment);
                        currentStroke.push(segment);
                    }
                    break;
                }

                case 'fill': {
                    if (event.data) {
                        performFill(event.data.x, event.data.y, event.data.color || '#000000');
                    }
                    break;
                }

                case 'clear': {
                    const snapshot = captureSnapshot();
                    actionHistory.push({ type: 'clear', snapshot });
                    strokes = [];
                    currentStroke = [];
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    redrawCanvas();
                    updateUndoState();
                    break;
                }

                case 'stroke-end': {
                    if (currentStroke.length > 0) {
                        const finalizedStroke = cloneStroke(currentStroke);
                        strokes.push(finalizedStroke);
                        actionHistory.push({ type: 'stroke' });
                        currentStroke = [];
                        updateUndoState();
                    }
                    break;
                }

                case 'undo': {
                    if (actionHistory.length === 0) {
                        updateUndoState();
                        break;
                    }

                    const action = actionHistory.pop();

                    if (!action) {
                        updateUndoState();
                        break;
                    }

                    if (action.type === 'stroke') {
                        if (strokes.length > 0) {
                            strokes.pop();
                        }
                        redrawCanvas();
                    } else if (action.type === 'clear') {
                        restoreSnapshot(action.snapshot);
                    } else if (action.type === 'fill') {
                        removeLastFillAction();
                        redrawCanvas();
                    }

                    currentStroke = [];
                    updateUndoState();
                    break;
                }

                default:
                    break;
            }
        }

        function applyCanvasHistory(history) {
            if (!canvas || !ctx) return;

            if (!Array.isArray(history) || history.length === 0) {
                resetDrawingData();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                redrawCanvas();
                updateUndoState();
                return;
            }

            resetDrawingData();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            history.forEach(event => processCanvasEvent(event));
            updateUndoState();
        }

        updateUndoState();

        // Clear button
        clearBtn.addEventListener('click', () => {
            if (!state.isMyTurn) return;
            const snapshot = captureSnapshot();
            actionHistory.push({ type: 'clear', snapshot });
            setActiveTool('brush');
            strokes = [];
            currentStroke = [];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            redrawCanvas();
            updateUndoState();
            sendMessage({ type: 'clear' });
        });

        // Undo button
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (!state.isMyTurn || actionHistory.length === 0) return;

                const action = actionHistory.pop();

                if (!action) {
                    updateUndoState();
                    return;
                }

                if (action.type === 'stroke') {
                    if (strokes.length > 0) {
                        strokes.pop();
                    }
                    redrawCanvas();
                } else if (action.type === 'clear') {
                    restoreSnapshot(action.snapshot);
                } else if (action.type === 'fill') {
                    removeLastFillAction();
                    redrawCanvas();
                }

                currentStroke = [];
                updateUndoState();
                sendMessage({ type: 'undo' });
            });
        }

        // Eraser button
        eraserBtn.addEventListener('click', () => {
            if (!state.isMyTurn) return;
            setActiveTool(activeTool === 'eraser' ? 'brush' : 'eraser');
        });

        if (fillBtn) {
            fillBtn.addEventListener('click', () => {
                if (!state.isMyTurn) return;
                setActiveTool(activeTool === 'fill' ? 'brush' : 'fill');
            });
        }

        // Enable/disable drawing tools
        function setDrawingEnabled(enabled) {
            clearBtn.disabled = !enabled;
            eraserBtn.disabled = !enabled;
            if (fillBtn) {
                fillBtn.disabled = !enabled;
            }
            if (!enabled) {
                setActiveTool('brush');
            }
            if (!enabled) {
                canvas.style.cursor = 'not-allowed';
            } else {
                updateCanvasCursor();
            }
            updateUndoState();
        }

        // Chat functions
        function addMessage(text, type = 'normal', playerName = null) {
            const chatMessages = document.getElementById('chatMessages');
            const msg = document.createElement('div');
            msg.className = `message ${type}`;
            msg.textContent = playerName ? `${playerName}: ${text}` : text;
            chatMessages.appendChild(msg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // Guess handling
        document.getElementById('sendBtn').addEventListener('click', submitGuess);
        document.getElementById('guessInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitGuess();
        });

        function submitGuess() {
            const input = document.getElementById('guessInput');
            const guess = input.value.trim();
            
            if (!guess) return;

            // Send guess to server
            sendMessage({
                type: 'guess',
                guess: guess
            });

            input.value = '';
        }

        function isClose(guess, word) {
            guess = guess.toLowerCase();
            word = word.toLowerCase();
            
            if (Math.abs(guess.length - word.length) > 1) return false;
            
            if (guess.length === word.length) {
                let differences = 0;
                for (let i = 0; i < word.length; i++) {
                    if (guess[i] !== word[i]) differences++;
                    if (differences > 1) return false;
                }
                return differences === 1;
            }
            
            const [shorter, longer] = guess.length < word.length ? [guess, word] : [word, guess];
            let i = 0, j = 0, skipped = false;
            
            while (i < shorter.length && j < longer.length) {
                if (shorter[i] === longer[j]) {
                    i++;
                    j++;
                } else if (!skipped) {
                    skipped = true;
                    j++;
                } else {
                    return false;
                }
            }
            
            return true;
        }

        // Word display
        function updateWordDisplay() {
            const display = document.getElementById('wordDisplay');
            if (!display) return;

            const maskLength = getMaskTokenCount(state.currentMask);
            const wordLength = state.currentWord && state.currentWord.length
                ? state.currentWord.length
                : (state.currentWordLength || maskLength);

            if (state.isMyTurn || state.guessedCorrectly) {
                if (state.currentWord && state.currentWord.length) {
                    const revealAllMask = buildClientMask(state.currentWord, [], { revealAll: true });
                    display.textContent = maskToDisplayString(revealAllMask);
                } else if (wordLength) {
                    display.textContent = maskToDisplayString(createEmptyMask(wordLength));
                } else {
                    display.textContent = maskToDisplayString(createEmptyMask(5));
                }
                return;
            }

            if (state.currentMask && state.currentMask.length) {
                display.textContent = maskToDisplayString(state.currentMask);
                return;
            }

            if (wordLength) {
                const placeholderMask = state.currentWord && state.currentWord.length
                    ? createEmptyMask(state.currentWord)
                    : createEmptyMask(wordLength);
                display.textContent = maskToDisplayString(placeholderMask);
            } else {
                display.textContent = maskToDisplayString(createEmptyMask(5));
            }
        }

        // Timer
        let timerInterval;
        function startTimer(duration, options = {}) {
            const { resetHints = true } = options;
            state.timeLeft = Math.max(0, duration ?? state.drawTime);
            if (resetHints) {
                state.hintsGiven = 0;
            }
            
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                state.timeLeft = Math.max(0, state.timeLeft - 1);
                document.getElementById('timer').textContent = state.timeLeft;

                if (state.timeLeft <= 0) {
                    clearInterval(timerInterval);
                }
            }, 1000);

            const timerDisplay = document.getElementById('timer');
            if (timerDisplay) {
                timerDisplay.textContent = state.timeLeft;
            }
        }

        // Word selection
        let wordChoiceAnimationFrame = null;
        function showWordChoices(words, timeLeft = null) {
            wordSelectTitle.textContent = 'Choose a word';
            wordSelectSubtitle.textContent = 'Pick one to start drawing.';
            wordChoicesContainer.innerHTML = '';

            words.forEach(word => {
                const btn = document.createElement('button');
                btn.className = 'word-choice';
                btn.textContent = word;
                btn.addEventListener('click', () => {
                    sendMessage({
                        type: 'word-selected',
                        word: word
                    });
                    hideWordChoices();
                });
                wordChoicesContainer.appendChild(btn);
            });

            const countdownStart = timeLeft ?? state.wordChoiceTimeLeft ?? state.wordSelectionDuration;
            const normalizedCountdown = Number.isFinite(countdownStart) ? Math.max(0, Math.floor(countdownStart)) : 0;
            state.wordSelectionDuration = normalizedCountdown;
            startWordChoiceCountdown(normalizedCountdown);

            if (wordChoiceAnimationFrame !== null) {
                cancelAnimationFrame(wordChoiceAnimationFrame);
                wordChoiceAnimationFrame = null;
            }
            wordChoiceAnimationFrame = requestAnimationFrame(() => {
                wordChoiceAnimationFrame = null;
                wordSelectOverlay.classList.add('active');
            });
        }

        function hideWordChoices() {
            if (wordChoiceAnimationFrame !== null) {
                cancelAnimationFrame(wordChoiceAnimationFrame);
                wordChoiceAnimationFrame = null;
            }
            wordSelectOverlay.classList.remove('active');
            wordChoicesContainer.innerHTML = '';
            clearWordChoiceCountdown();
            updateWordChoiceSubtitle();
        }

        function getCurrentDrawerName() {
            if (!Array.isArray(state.players) || !state.currentDrawer) {
                return null;
            }
            const currentDrawer = state.players.find(player => player.id === state.currentDrawer);
            return currentDrawer ? currentDrawer.name : null;
        }

        function showDrawerOverlay(timeLeft) {
            if (!drawerOverlay) return;
            clearDrawerChoiceInterval();
            state.drawerChoiceTimeLeft = Math.max(0, Math.floor(timeLeft || 0));
            if (drawerOverlayTitle) {
                const drawerName = getCurrentDrawerName();
                drawerOverlayTitle.textContent = drawerName
                    ? `${drawerName} is chosing!`
                    : 'The drawer is choosing';
            }
            updateDrawerOverlayTimer();
            drawerOverlay.classList.add('active');
            
            if (state.drawerChoiceTimeLeft > 0) {
                drawerChoiceInterval = setInterval(() => {
                    state.drawerChoiceTimeLeft = Math.max(0, state.drawerChoiceTimeLeft - 1);
                    updateDrawerOverlayTimer();
                    if (state.drawerChoiceTimeLeft <= 0) {
                        clearDrawerChoiceInterval();
                    }
                }, 1000);
            }
        }

        function hideDrawerOverlay() {
            if (!drawerOverlay) return;
            drawerOverlay.classList.remove('active');
            clearDrawerChoiceInterval();
        }

        function clearDrawerChoiceInterval() {
            if (drawerChoiceInterval) {
                clearInterval(drawerChoiceInterval);
                drawerChoiceInterval = null;
            }
            state.drawerChoiceTimeLeft = 0;
        }

        function updateDrawerOverlayTimer() {
            if (!drawerOverlayTimer) return;
            if (state.drawerChoiceTimeLeft > 0) {
                drawerOverlayTimer.textContent = `Time left: ${state.drawerChoiceTimeLeft}s`;
            } else {
                drawerOverlayTimer.textContent = 'Choosing...';
            }
        }

        function showEndGameResults(finalScores) {
            endGamePodium.innerHTML = '';
            const existingOthers = endGameModal.querySelector('.others-list');
            if (existingOthers) {
                existingOthers.remove();
            }

            const topThree = finalScores.slice(0, 3);
            if (topThree.length === 0) {
                const emptyState = document.createElement('p');
                emptyState.className = 'modal-subtitle';
                emptyState.textContent = 'No scores to display yet.';
                endGamePodium.appendChild(emptyState);
            } else {
                const labels = ['#1', '#2', '#3'];
                topThree.forEach((player, index) => {
                    const slot = document.createElement('div');
                    slot.className = `podium-slot top-${index + 1}`;

                    const rank = document.createElement('div');
                    rank.className = 'podium-rank';
                    rank.textContent = labels[index];

                    const name = document.createElement('div');
                    name.className = 'podium-name';
                    name.textContent = player.name;

                    const score = document.createElement('div');
                    score.className = 'podium-score';
                    score.textContent = `${player.score} pts`;

                    slot.appendChild(rank);
                    slot.appendChild(name);
                    slot.appendChild(score);
                    endGamePodium.appendChild(slot);
                });
            }

            const remaining = finalScores.slice(3);
            if (remaining.length > 0) {
                const othersList = document.createElement('div');
                othersList.className = 'others-list';
                remaining.forEach((player, index) => {
                    const item = document.createElement('span');
                    item.textContent = `#${index + 4} ${player.name} - ${player.score} pts`;
                    othersList.appendChild(item);
                });

                const actions = endGameModal.querySelector('.modal-actions');
                endGameModal.insertBefore(othersList, actions);
            }

            requestAnimationFrame(() => {
                endGameOverlay.classList.add('active');
            });
        }

        function hideEndGameOverlay() {
            endGameOverlay.classList.remove('active');
            endGamePodium.innerHTML = '';
            const others = endGameModal.querySelector('.others-list');
            if (others) {
                others.remove();
            }
        }

        playAgainBtn.addEventListener('click', () => {
            hideEndGameOverlay();
            showScreen('waitingRoomScreen');
            if (state.isHost) {
                document.getElementById('startGameFromWaitingBtn').style.display = 
                    state.players.length >= 2 ? 'inline-block' : 'none';
            }
        });

        // Players list
        function updatePlayersList() {
            const playersList = document.getElementById('playersList');
            playersList.innerHTML = '';
            hideKickMenu();
            pruneGuessedPlayers();
            const guessedPlayers = state.guessedPlayerIds instanceof Set ? state.guessedPlayerIds : null;
            
            state.players.forEach(player => {
                const card = document.createElement('div');
                card.className = 'player-card';
                if (guessedPlayers && guessedPlayers.has(player.id)) {
                    card.classList.add('guessed');
                }
                if (player.id === state.currentDrawer) card.classList.add('drawing');
                if (state.isHost && player.id !== state.playerId) {
                    card.classList.add('player-card--interactive');
                    card.addEventListener('click', (event) => {
                        event.stopPropagation();
                        showKickMenu(player, card);
                    });
                    card.setAttribute('role', 'button');
                    card.tabIndex = 0;
                    card.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            showKickMenu(player, card);
                        }
                    });
                }
                
                const avatar = document.createElement('div');
                avatar.className = 'player-avatar';
                avatar.style.backgroundColor = player.color;
                avatar.textContent = player.name[0].toUpperCase();
                
                const info = document.createElement('div');
                info.className = 'player-info';
                
                const name = document.createElement('div');
                name.className = 'player-name';
                name.textContent = player.name + (player.id === state.playerId ? ' (You)' : '');
                
                const score = document.createElement('div');
                score.className = 'player-score';
                score.textContent = `Score: ${player.score}`;
                
                info.appendChild(name);
                info.appendChild(score);
                card.appendChild(avatar);
                card.appendChild(info);
                playersList.appendChild(card);
            });

            const selfPlayer = state.players.find(p => p.id === state.playerId);
            if (selfPlayer) {
                state.myScore = selfPlayer.score;
                const scoreDisplay = document.getElementById('score');
                if (scoreDisplay) {
                    scoreDisplay.textContent = state.myScore;
                }
            }
        }

        function updateWaitingPlayers() {
            const waitingPlayers = document.getElementById('waitingPlayers');
            waitingPlayers.innerHTML = '<h3 style="color: #667eea; margin-bottom: 10px;">Players:</h3>';
            hideKickMenu();
            pruneGuessedPlayers();
            const guessedPlayers = state.guessedPlayerIds instanceof Set ? state.guessedPlayerIds : null;
            
            state.players.forEach(player => {
                const card = document.createElement('div');
                card.className = 'player-card';
                if (guessedPlayers && guessedPlayers.has(player.id)) {
                    card.classList.add('guessed');
                }
                if (state.isHost && player.id !== state.playerId) {
                    card.classList.add('player-card--interactive');
                    card.addEventListener('click', (event) => {
                        event.stopPropagation();
                        showKickMenu(player, card);
                    });
                    card.setAttribute('role', 'button');
                    card.tabIndex = 0;
                    card.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            showKickMenu(player, card);
                        }
                    });
                }
                
                const avatar = document.createElement('div');
                avatar.className = 'player-avatar';
                avatar.style.backgroundColor = player.color;
                avatar.textContent = player.name[0].toUpperCase();
                
                const info = document.createElement('div');
                info.className = 'player-info';
                
                const name = document.createElement('div');
                name.className = 'player-name';
                name.textContent = player.name + (player.id === state.playerId ? ' (You)' : '');
                
                info.appendChild(name);
                card.appendChild(avatar);
                card.appendChild(info);
                waitingPlayers.appendChild(card);
            });

            // Show start button only for host
            document.getElementById('startGameFromWaitingBtn').style.display = 
                state.isHost && state.players.length >= 2 ? 'inline-block' : 'none';
        }

        // WebSocket functions
        function connectWebSocket() {
            try {
                ws = new WebSocket(WS_URL);

                ws.onopen = () => {
                    console.log('Connected to server');
                    isConnected = true;
                    updateConnectionStatus(true);
                };

                ws.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    handleServerMessage(message);
                };

                ws.onclose = () => {
                    console.log('Disconnected from server');
                    isConnected = false;
                    updateConnectionStatus(false);
                    hideKickMenu();
                    // Try to reconnect after 3 seconds
                    setTimeout(connectWebSocket, 3000);
                };

                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    updateConnectionStatus(false);
                };
            } catch (error) {
                console.error('Failed to connect:', error);
                updateConnectionStatus(false);
                setTimeout(connectWebSocket, 3000);
            }
        }

        function sendMessage(message) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        }

        function updateConnectionStatus(connected) {
            const statusDiv = document.getElementById('connectionStatus');
            statusDiv.style.display = 'block';
            if (connected) {
                statusDiv.className = 'connection-status connected';
                statusDiv.textContent = 'Connected to server';
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 2000);
            } else {
                statusDiv.className = 'connection-status disconnected';
                statusDiv.textContent = 'Disconnected from server - Reconnecting...';
            }
        }

        function handleServerMessage(message) {
            console.log('Received:', message);

            switch (message.type) {
                case 'room-created':
                    clearWordChoiceCountdown();
                    state.roomCode = message.roomCode;
                    state.playerId = message.playerId;
                    state.isHost = true;
                    state.players = message.players;
                state.gameStarted = false;
                state.currentRound = 0;
                state.currentDrawer = null;
                state.isMyTurn = false;
                state.guessedCorrectly = false;
                resetGuessedPlayers();
                state.hintsGiven = 0;
                    state.currentWord = '';
                    state.currentWordLength = 0;
                    state.currentMask = '';
                    state.revealedIndices = [];
                    state.wordSelectionDuration = 0;
                    state.wordChoiceTimeLeft = 0;
                    applyCanvasHistory(message.canvasHistory);
                    document.getElementById('displayRoomCode').textContent = message.roomCode;
                    showScreen('waitingRoomScreen');
                    updateWaitingPlayers();
                    updatePlayersList();
                    updateWordDisplay();
                    addMessage(`Room created! Code: ${message.roomCode}`, 'system');
                    break;

                case 'room-joined':
                    clearWordChoiceCountdown();
                    state.roomCode = message.roomCode;
                    state.playerId = message.playerId;
                    state.players = message.players || [];
                    state.totalRounds = message.settings.numRounds;
                    state.drawTime = message.settings.drawTime;
                    state.maxHints = message.settings.maxHints;
                    state.gameStarted = !!message.gameStarted;
                    state.currentRound = message.currentRound || 0;
                state.currentDrawer = message.currentDrawer || null;
                state.hintsGiven = message.hintsGiven || 0;
                state.guessedCorrectly = Array.isArray(message.guessedPlayers) ? message.guessedPlayers.includes(state.playerId) : false;
                resetGuessedPlayers(message.guessedPlayers);
                    state.currentWord = message.currentWord || '';
                    state.currentWordLength = message.wordLength || (state.currentWord ? state.currentWord.length : 0);
                    state.currentMask = (message.mask && message.mask.length)
                        ? message.mask
                        : (state.currentWordLength ? createEmptyMask(state.currentWord || state.currentWordLength) : '');
                    state.revealedIndices = Array.isArray(message.revealedIndices) ? message.revealedIndices : [];
                    state.wordSelectionDuration = message.wordSelectionDuration || state.wordSelectionDuration || 0;
                    state.wordChoiceTimeLeft = message.wordChoiceTimeLeft ?? (state.gameStarted ? state.wordSelectionDuration : 0);
                    state.timeLeft = message.timeLeft ?? state.drawTime;
                    state.isMyTurn = state.currentDrawer === state.playerId;
                    state.isHost = message.host === state.playerId;
                    state.round = state.currentRound || 0;
                    const selfPlayer = state.players.find(p => p.id === state.playerId);
                    state.myScore = selfPlayer ? selfPlayer.score : 0;
                    const scoreDisplay = document.getElementById('score');
                    if (scoreDisplay) {
                        scoreDisplay.textContent = state.myScore;
                    }
                    const canvasHistory = Array.isArray(message.canvasHistory) ? message.canvasHistory : [];
                    applyCanvasHistory(canvasHistory);
                    document.getElementById('displayRoomCode').textContent = message.roomCode;

                    if (state.gameStarted) {
                        showScreen('gameScreen');
                        setDrawingEnabled(state.isMyTurn);
                        updatePlayersList();
                        updateWaitingPlayers();
                        updateWordDisplay();
                        const hasActiveWord = !!state.currentWord && state.currentWord.length > 0;
                        if (hasActiveWord) {
                            startTimer(state.timeLeft, { resetHints: false });
                            hideDrawerOverlay();
                        } else {
                            clearInterval(timerInterval);
                            timerInterval = null;
                            const timerDisplay = document.getElementById('timer');
                            if (timerDisplay) {
                                timerDisplay.textContent = state.drawTime;
                            }
                            if (!state.isMyTurn && state.currentDrawer) {
                                const choiceTime = state.wordChoiceTimeLeft ?? state.wordSelectionDuration;
                                showDrawerOverlay(choiceTime);
                            }
                        }
                        document.getElementById('currentRound').textContent = Math.max(1, state.currentRound || 1);
                        document.getElementById('totalRounds').textContent = state.totalRounds;
                        addMessage(`Joined game in progress (Round ${Math.max(1, state.currentRound || 1)}).`, 'system');
                    } else {
                        state.round = 0;
                        showScreen('waitingRoomScreen');
                        updateWaitingPlayers();
                        updatePlayersList();
                        setDrawingEnabled(false);
                        state.currentMask = '';
                        state.revealedIndices = [];
                        state.currentWord = '';
                        state.currentWordLength = 0;
                        state.hintsGiven = 0;
                        updateWordDisplay();
                        addMessage(`Joined room: ${message.roomCode}`, 'system');
                    }
                    break;

                case 'player-joined':
                    hideKickMenu();
                    state.players = message.players || [];
                    updateWaitingPlayers();
                    updatePlayersList();
                    addMessage(`${message.playerName} joined the room`, 'system');
                    break;

                case 'player-left': {
                    hideKickMenu();
                    state.players = message.players || [];
                    updateWaitingPlayers();

                    let leftMessage = `${message.playerName} left the room`;
                    if (message.reason === 'disconnected') {
                        leftMessage = `${message.playerName} disconnected`;
                    } else if (message.reason === 'kicked') {
                        leftMessage = `${message.playerName} was removed from the room`;
                    }
                    addMessage(leftMessage, 'system');

                    if (message.newHost) {
                        state.isHost = message.newHost === state.playerId;
                        const newHostPlayer = state.players.find(p => p.id === message.newHost);
                        if (state.isHost) {
                            addMessage('You are now the host', 'system');
                        } else if (newHostPlayer) {
                            addMessage(`${newHostPlayer.name} is now the host`, 'system');
                        }
                    }

                    updatePlayersList();
                    break;
                }

                case 'player-kicked': {
                    hideKickMenu();
                    state.players = message.players || [];
                    updateWaitingPlayers();

                    const kickerName = message.kickedBy || 'the host';
                    addMessage(`${message.playerName} was kicked by ${kickerName}`, 'system');

                    if (message.newHost) {
                        state.isHost = message.newHost === state.playerId;
                        const newHostPlayer = state.players.find(p => p.id === message.newHost);
                        if (state.isHost) {
                            addMessage('You are now the host', 'system');
                        } else if (newHostPlayer) {
                            addMessage(`${newHostPlayer.name} is now the host`, 'system');
                        }
                    }

                    updatePlayersList();
                    break;
                }

                case 'kicked': {
                    hideKickMenu();
                    const kickerName = message.kickedBy ? ` by ${message.kickedBy}` : '';
                    alert(`You were kicked${kickerName}. You can rejoin with the room code.`);
                    addMessage('You were removed from the room by the host.', 'system');
                    clearInterval(timerInterval);
                    state.roomCode = null;
                    state.isHost = false;
                    state.players = [];
                    state.currentDrawer = null;
                    state.isMyTurn = false;
                    state.guessedCorrectly = false;
                    state.hintsGiven = 0;
                    state.currentWord = '';
                    state.currentWordLength = 0;
                    state.currentMask = '';
                    state.revealedIndices = [];
                    state.wordSelectionDuration = 0;
                    state.wordChoiceTimeLeft = 0;
                    state.gameStarted = false;
                    state.playerId = null;
                    state.myScore = 0;
                    state.round = 1;
                    state.totalRounds = 3;
                    state.drawTime = 80;
                    state.timeLeft = state.drawTime;
                    state.maxHints = 2;
                    resetDrawingData();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    updatePlayersList();
                    updateWaitingPlayers();
                    updateWordDisplay();
                    setDrawingEnabled(false);
                    hideWordChoices();
                    hideEndGameOverlay();
                    const roomCodeDisplay = document.getElementById('displayRoomCode'); if (roomCodeDisplay) { roomCodeDisplay.textContent = '------'; }
                    const scoreDisplay = document.getElementById('score');
                    if (scoreDisplay) {
                        scoreDisplay.textContent = '0';
                    }
                    const timerDisplayGameStart = document.getElementById('timer');
                    if (timerDisplayGameStart) {
                        timerDisplayGameStart.textContent = state.drawTime;
                    }
                    const currentRoundDisplay = document.getElementById('currentRound');
                    if (currentRoundDisplay) {
                        currentRoundDisplay.textContent = '1';
                    }
                    const totalRoundsDisplay = document.getElementById('totalRounds');
                    if (totalRoundsDisplay) {
                        totalRoundsDisplay.textContent = state.totalRounds;
                    }
                    showScreen('lobbyScreen');
                    break;
                }

                case 'game-started':
                      state.totalRounds = message.settings.numRounds;
                      state.drawTime = message.settings.drawTime;
                      state.maxHints = message.settings.maxHints;
                      state.gameStarted = true;
                      state.round = 1;
                      state.currentDrawer = null;
                      state.currentWord = '';
                    state.currentWordLength = 0;
                    state.hintsGiven = 0;
                    state.guessedCorrectly = false;
                    resetGuessedPlayers();
                    state.isMyTurn = false;
                    state.timeLeft = state.drawTime;
                    state.currentMask = '';
                    state.revealedIndices = [];
                    state.wordSelectionDuration = 0;
                    state.wordChoiceTimeLeft = 0;
                    setDrawingEnabled(false);
                      document.getElementById('totalRounds').textContent = message.settings.numRounds;
                      const currentRoundDisplayGameStart = document.getElementById('currentRound');
                      if (currentRoundDisplayGameStart) {
                          currentRoundDisplayGameStart.textContent = '1';
                      }
                    resetDrawingData();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    hideEndGameOverlay();
                    clearWordChoiceCountdown();
                    hideWordChoices();
                    showScreen('gameScreen');
                    updatePlayersList();
                    updateWaitingPlayers();
                    updateWordDisplay();
                    const timerDisplayRound = document.getElementById('timer');
                    if (timerDisplayRound) {
                        timerDisplayRound.textContent = state.drawTime;
                    }
                    addMessage('Game started!', 'system');
                    break;

                case 'round-started':
                    clearWordChoiceCountdown();
                    state.round = message.round;
                    state.currentDrawer = message.drawer;
                    state.isMyTurn = message.drawer === state.playerId;
                    state.gameStarted = true;
                    document.getElementById('currentRound').textContent = message.round;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    resetDrawingData();
                    state.currentWord = '';
                    state.currentWordLength = 0;
                    state.hintsGiven = message.hintsGiven || 0;
                state.currentMask = (message.mask && message.mask.length) ? message.mask : '';
                state.revealedIndices = Array.isArray(message.revealedIndices) ? message.revealedIndices : [];
                state.guessedCorrectly = false;
                resetGuessedPlayers();
                    state.timeLeft = state.drawTime;
                    state.wordSelectionDuration = message.wordSelectionDuration || state.wordSelectionDuration || 0;
                    state.wordChoiceTimeLeft = message.wordChoiceTimeLeft ?? state.wordSelectionDuration ?? state.wordChoiceTimeLeft;
                    setDrawingEnabled(state.isMyTurn);
                    updatePlayersList();
                    updateWordDisplay();
                    const timerDisplay = document.getElementById('timer');
                    if (timerDisplay) {
                        timerDisplay.textContent = state.drawTime;
                    }
                    
                    if (state.isMyTurn && Array.isArray(message.wordChoices)) {
                        const choiceTime = message.wordChoiceTimeLeft ?? state.wordSelectionDuration ?? state.wordChoiceTimeLeft;
                        showWordChoices(message.wordChoices, choiceTime);
                        hideDrawerOverlay();
                    } else if (!state.isMyTurn) {
                        hideWordChoices();
                        const choiceTime = message.wordChoiceTimeLeft ?? state.wordSelectionDuration ?? state.wordChoiceTimeLeft;
                        showDrawerOverlay(choiceTime);
                    }
                    break;

                case 'word-selected':
                    hideWordChoices();
                    hideDrawerOverlay();
                    state.wordSelectionDuration = 0;
                    state.wordChoiceTimeLeft = 0;
                    if (message.autoSelected) {
                        addMessage('Time was up! A word was chosen automatically.', 'system');
                    }
                    state.currentWord = message.word;
                    state.currentWordLength = message.word.length;
                    state.currentMask = (message.mask && message.mask.length)
                        ? message.mask
                        : createEmptyMask(state.currentWord || state.currentWordLength);
                    state.revealedIndices = Array.isArray(message.revealedIndices) ? message.revealedIndices : [];
                    state.hintsGiven = message.hintsGiven || 0;
                    state.guessedCorrectly = state.isMyTurn ? false : state.guessedCorrectly;
                    updateWordDisplay();
                    startTimer(state.drawTime, { resetHints: true });
                    if (state.isMyTurn) {
                        addMessage(`Draw: ${message.word}`, 'system');
                    }
                    break;

                case 'draw':
                case 'fill':
                case 'clear':
                case 'stroke-end':
                case 'undo':
                    processCanvasEvent(message);
                    break;

                case 'guess':
                    addMessage(message.message, 'normal', message.playerName);
                    break;

                case 'correct-guess':
                    if (!(state.guessedPlayerIds instanceof Set)) {
                        state.guessedPlayerIds = new Set();
                    }
                    if (message.playerId) {
                        state.guessedPlayerIds.add(message.playerId);
                    }
                    state.players = message.players;
                    updatePlayersList();
                    
                    if (message.playerId === state.playerId) {
                        state.guessedCorrectly = true;
                        state.myScore = message.players.find(p => p.id === state.playerId).score;
                        document.getElementById('score').textContent = state.myScore;
                        addMessage(`You guessed correctly! +${message.points} points`, 'correct');
                        updateWordDisplay();
                    } else {
                        addMessage(`${message.playerName} guessed correctly! +${message.points} points`, 'correct');
                    }
                    break;

                case 'close-guess':
                    addMessage('Close!', 'system');
                    break;

                case 'hint':
                    state.hintsGiven = message.hintsGiven ?? state.hintsGiven;
                    if (message.mask !== undefined) {
                        state.currentMask = message.mask;
                    }
                    if (Array.isArray(message.revealedIndices)) {
                        state.revealedIndices = message.revealedIndices;
                    }
                    updateWordDisplay();
                    break;

                case 'round-ended':
                    clearInterval(timerInterval);
                    hideWordChoices();
                    state.isMyTurn = false;
                    setDrawingEnabled(false);
                    clearWordChoiceCountdown();
                    state.wordChoiceTimeLeft = 0;
                    state.wordSelectionDuration = 0;
                    state.currentWord = message.word || '';
                    state.currentWordLength = state.currentWord ? state.currentWord.length : 0;
                    state.currentMask = (message.mask && message.mask.length)
                        ? message.mask
                        : (state.currentWord ? buildClientMask(state.currentWord, [], { revealAll: true }) : state.currentMask);
                    if (Array.isArray(message.revealedIndices)) {
                        state.revealedIndices = message.revealedIndices;
                        state.hintsGiven = state.revealedIndices.length;
                    }
                    state.players = message.players;
                    updatePlayersList();
                    updateWordDisplay();
                    addMessage(`Round ended! The word was: ${message.word}`, 'system');
                    break;

                case 'game-ended':
                    clearInterval(timerInterval);
                    hideWordChoices();
                    clearWordChoiceCountdown();
                    state.isMyTurn = false;
                    resetDrawingData();
                    setDrawingEnabled(false);
                    state.gameStarted = false;
                    state.currentWord = '';
                    state.currentWordLength = 0;
                    state.hintsGiven = 0;
                    state.guessedCorrectly = false;
                    state.currentDrawer = null;
                    state.currentMask = '';
                    state.revealedIndices = [];
                    state.wordSelectionDuration = 0;
                    state.wordChoiceTimeLeft = 0;
                    resetGuessedPlayers();
                    state.players = message.players;
                    updatePlayersList();
                    updateWordDisplay();
                    addMessage('Game over! Check the final standings.', 'system');
                    showEndGameResults(message.finalScores);
                    break;

                case 'error':
                    alert(message.message);
                    break;
            }
        }

        function showScreen(screenId) {
            hideKickMenu();
            if (screenId !== 'gameScreen') {
                clearWordChoiceCountdown();
                state.wordChoiceTimeLeft = 0;
                updateWordChoiceSubtitle();
            }
            document.querySelectorAll('.lobby-screen').forEach(s => s.classList.remove('active'));
            document.getElementById('lobbyScreen').classList.remove('active');
            document.getElementById('roomSettingsScreen').classList.remove('active');
            document.getElementById('waitingRoomScreen').classList.remove('active');
            document.getElementById('gameScreen').classList.add('hidden');
            
            if (screenId === 'gameScreen') {
                document.getElementById('gameScreen').classList.remove('hidden');
            } else {
                document.getElementById(screenId).classList.add('active');
            }
        }

        // Event listeners
        document.addEventListener('DOMContentLoaded', () => {
            // Avatar selection
            const avatarOptions = document.querySelectorAll('.avatar-option');
            avatarOptions.forEach(option => {
                option.addEventListener('click', () => {
                    avatarOptions.forEach(o => o.classList.remove('active'));
                    option.classList.add('active');
                    state.playerColor = option.dataset.color;
                });
            });
            
            // Create room
            document.getElementById('createRoomBtn').addEventListener('click', () => {
                const playerName = document.getElementById('lobbyPlayerName').value.trim();
                if (!playerName) {
                    alert('Please enter your name!');
                    return;
                }
                state.playerName = playerName;
                
                if (!isConnected) {
                    alert('Not connected to server. Please wait...');
                    return;
                }

                showScreen('roomSettingsScreen');
            });

            // Join room
            document.getElementById('joinRoomBtn').addEventListener('click', () => {
                const playerName = document.getElementById('lobbyPlayerName').value.trim();
                const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
                
                if (!playerName) {
                    alert('Please enter your name!');
                    return;
                }
                
                if (!roomCode) {
                    alert('Please enter a room code!');
                    return;
                }

                if (!isConnected) {
                    alert('Not connected to server. Please wait...');
                    return;
                }

                state.playerName = playerName;
                sendMessage({
                    type: 'join-room',
                    roomCode: roomCode,
                    playerName: playerName,
                    playerColor: state.playerColor
                });
            });

            // Back to lobby
            document.getElementById('backToLobbyBtn').addEventListener('click', () => {
                showScreen('lobbyScreen');
            });

            // Start game from settings
            document.getElementById('startGameBtn').addEventListener('click', () => {
                const numRounds = parseInt(document.getElementById('numRounds').value);
                const drawTime = parseInt(document.getElementById('drawTime').value);
                const maxHints = parseInt(document.getElementById('maxHints').value);
                const wordChoiceTime = parseInt(document.getElementById('wordChoiceTime').value);

                if (numRounds < 1 || numRounds > 10) {
                    alert('Number of rounds must be between 1 and 10');
                    return;
                }
                if (drawTime < 30 || drawTime > 180) {
                    alert('Draw time must be between 30 and 180 seconds');
                    return;
                }
                if (maxHints < 0 || maxHints > 5) {
                    alert('Max hints must be between 0 and 5');
                    return;
                }
                if (wordChoiceTime < 5 || wordChoiceTime > 30) {
                    alert('Word choice time must be between 5 and 30 seconds');
                    return;
                }

                sendMessage({
                    type: 'create-room',
                    playerName: state.playerName,
                    playerColor: state.playerColor,
                    settings: {
                        numRounds: numRounds,
                        drawTime: drawTime,
                        maxHints: maxHints,
                        wordChoiceTime: wordChoiceTime
                    }
                });
            });

            // Start game from waiting room
            document.getElementById('startGameFromWaitingBtn').addEventListener('click', () => {
                if (state.players.length < 2) {
                    alert('Need at least 2 players to start!');
                    return;
                }

                sendMessage({
                    type: 'start-game'
                });
            });

            // Leave room
            document.getElementById('leaveRoomBtn').addEventListener('click', () => {
                sendMessage({ type: 'leave-room' });
                showScreen('lobbyScreen');
                state.roomCode = null;
                state.isHost = false;
                state.players = [];
            });

            // Connect to server
            connectWebSocket();
        });
    
