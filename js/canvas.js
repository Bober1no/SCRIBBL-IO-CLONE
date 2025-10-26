// Canvas setup
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        let isMouseDown = false;
        let lastX = 0;
        let lastY = 0;
        let currentColor = '#000000';
        let brushSize = 3;
        let activeTool = 'brush';
        let actionHistory = [];
let kickMenu = null;
let kickMenuPlayerId = null;
let kickMenuAnchor = null;
let wordChoiceInterval = null;

        // Overlay elements
        const wordSelectOverlay = document.getElementById('wordSelectOverlay');
        const wordChoicesContainer = document.getElementById('wordChoices');
        const wordSelectTitle = document.getElementById('wordSelectTitle');
        const wordSelectSubtitle = document.getElementById('wordSelectSubtitle');
        const endGameOverlay = document.getElementById('endGameOverlay');
        const endGamePodium = document.getElementById('endGamePodium');
        const playAgainBtn = document.getElementById('playAgainBtn');
        const endGameModal = document.querySelector('#endGameOverlay .results-modal');
        const clearBtn = document.getElementById('clearBtn');
        const eraserBtn = document.getElementById('eraserBtn');
        const fillBtn = document.getElementById('fillBtn');
        const undoBtn = document.getElementById('undoBtn');
        const drawerOverlay = document.getElementById('drawerOverlay');
        const drawerOverlayTimer = document.getElementById('drawerOverlayTimer');
        const drawerOverlayTitle = document.getElementById('drawerOverlayTitle');
        let drawerChoiceInterval = null;

        let strokes = [];
        let currentStroke = [];

        function cloneSegment(segment) {
            return { ...segment };
        }

        function cloneStroke(stroke) {
            return stroke.map(cloneSegment);
        }

        function cloneImageData(imageData) {
            if (!imageData) return null;
            const copy = ctx.createImageData(imageData.width, imageData.height);
            copy.data.set(imageData.data);
            return copy;
        }

        function cloneAction(action) {
            if (Array.isArray(action)) {
                return cloneStroke(action);
            }
            if (action && action.type === 'fill') {
                return {
                    type: 'fill',
                    imageData: action.imageData ? cloneImageData(action.imageData) : null
                };
            }
            return null;
        }

        function captureSnapshot(includeCurrent = true) {
            const snapshot = strokes.map(cloneAction).filter(Boolean);
            if (includeCurrent && currentStroke.length > 0) {
                snapshot.push(cloneStroke(currentStroke));
            }
            return snapshot;
        }

        function restoreSnapshot(snapshot) {
            strokes = snapshot.map(cloneAction).filter(Boolean);
            currentStroke = [];
            redrawCanvas();
        }

        function setActiveTool(tool) {
            activeTool = tool;
            updateToolButtons();
        }

        function updateToolButtons() {
            if (eraserBtn) {
                eraserBtn.classList.toggle('active', activeTool === 'eraser');
            }
            if (fillBtn) {
                fillBtn.classList.toggle('active', activeTool === 'fill');
            }
            updateCanvasCursor();
        }

        function updateCanvasCursor() {
            if (!canvas) return;
            if (!state || !state.isMyTurn) {
                canvas.style.cursor = 'not-allowed';
                return;
            }
            canvas.style.cursor = activeTool === 'fill' ? 'cell' : 'crosshair';
        }

        function getCanvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (typeof event.offsetX === 'number' && typeof event.offsetY === 'number') {
        return {
            x: event.offsetX * scaleX,
            y: event.offsetY * scaleY
        };
    }

    const src = (event.touches && event.touches[0]) || event;
    const clientX = src.clientX;
    const clientY = src.clientY;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

        function clampToCanvas(value, max) {
            return Math.min(Math.max(Math.floor(value), 0), max);
        }

        function hexToRgba(hex) {
            if (typeof hex !== 'string') return null;
            let normalized = hex.replace('#', '');
            if (normalized.length === 3) {
                normalized = normalized.split('').map(ch => ch + ch).join('');
            }
            if (normalized.length !== 6) return null;
            const value = parseInt(normalized, 16);
            return [
                (value >> 16) & 255,
                (value >> 8) & 255,
                value & 255,
                255
            ];
        }

        function areColorsEqual(a, b) {
            if (!a || !b) return false;
            return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
        }

        function getPixelColor(data, x, y, width) {
            const offset = (y * width + x) * 4;
            return [
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3]
            ];
        }

        const TRANSPARENT_ALPHA_THRESHOLD = 200;

        function colorsMatch(data, offset, target, tolerance = 30) {
    if (!target) return false;

    const pixelAlpha = data[offset + 3];
    
    // If target is fully opaque/solid and pixel is semi-transparent (antialiased edge)
    // allow filling through it - be more aggressive with the threshold
    if (target[3] === 255 && pixelAlpha > 0 && pixelAlpha < 250) {
        return true;
    }
    
    // If target is transparent/background
    if (target[3] === 0) {
        // Match other transparent/semi-transparent pixels
        return pixelAlpha <= 250;
    }

    const rDiff = Math.abs(data[offset] - target[0]);
    const gDiff = Math.abs(data[offset + 1] - target[1]);
    const bDiff = Math.abs(data[offset + 2] - target[2]);
    const aDiff = Math.abs(data[offset + 3] - target[3]);

    return rDiff <= tolerance &&
           gDiff <= tolerance &&
           bDiff <= tolerance &&
           aDiff <= tolerance;
}

        function floodFill(imageData, startX, startY, targetColor, fillColor) {
    const { data, width, height } = imageData;
    const visited = new Uint8Array(width * height);
    const stack = [[startX, startY]];
    let changed = false;

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const index = y * width + x;
        if (visited[index]) continue;
        const offset = index * 4;
        
        if (!colorsMatch(data, offset, targetColor)) {
            continue;
        }

        visited[index] = 1;
        
        // Fill the pixel (including semi-transparent ones)
        data[offset] = fillColor[0];
        data[offset + 1] = fillColor[1];
        data[offset + 2] = fillColor[2];
        data[offset + 3] = fillColor[3];
        changed = true;

        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    return changed;
}

        function performFill(x, y, color, options = {}) {
            const { broadcast = false } = options;
            if (!canvas || !ctx) return false;

            const startXRaw = Number(x);
            const startYRaw = Number(y);
            if (!Number.isFinite(startXRaw) || !Number.isFinite(startYRaw)) {
                return false;
            }

            const startX = clampToCanvas(startXRaw, canvas.width - 1);
            const startY = clampToCanvas(startYRaw, canvas.height - 1);

            const hexColor = typeof color === 'string' && color.length ? color : '#000000';
            const fillColor = hexToRgba(hexColor);
            if (!fillColor) return false;

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const targetColor = getPixelColor(imageData.data, startX, startY, canvas.width);
            if (!targetColor) return false;

            if (areColorsEqual(targetColor, fillColor)) {
                return false;
            }

            const changed = floodFill(imageData, startX, startY, targetColor, fillColor);
            if (!changed) {
                return false;
            }

            ctx.putImageData(imageData, 0, 0);

            const storedImage = cloneImageData(imageData);
            if (storedImage) {
                strokes.push({ type: 'fill', imageData: storedImage });
            } else {
                strokes.push({ type: 'fill' });
            }
            actionHistory.push({ type: 'fill' });
            currentStroke = [];
            updateUndoState();

            if (broadcast) {
                sendMessage({
                    type: 'fill',
                    data: { x: startX, y: startY, color: hexColor }
                });
            }

            return true;
        }

        function removeLastFillAction() {
            for (let i = strokes.length - 1; i >= 0; i--) {
                const entry = strokes[i];
                if (!Array.isArray(entry) && entry && entry.type === 'fill') {
                    strokes.splice(i, 1);
                    break;
                }
            }
        }

        updateToolButtons();


