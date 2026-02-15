// ============================================================
// Main - App initialization and screen management
// ============================================================

import VimEngine from './engine.js';
import PuzzleManager from './puzzle.js';
import Renderer from './renderer.js';
import Audio8Bit from './audio.js';

// Map e.code → ASCII key (works regardless of IME/한글 input)
const CODE_TO_KEY = {
    KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f',
    KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l',
    KeyM: 'm', KeyN: 'n', KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r',
    KeyS: 's', KeyT: 't', KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x',
    KeyY: 'y', KeyZ: 'z',
    Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
    Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
    Backquote: '`', Space: ' ',
    Enter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
};

// Shift + code → shifted key (for special chars like :, $, etc.)
const SHIFT_CODE_TO_KEY = {
    Semicolon: ':', Digit4: '$', Digit6: '^', Minus: '_', Equal: '+',
    Digit9: '(', Digit0: ')', Quote: '"', Comma: '<', Period: '>',
    Slash: '?', Digit1: '!', Digit2: '@', Digit3: '#', Digit5: '%',
    Digit7: '&', Digit8: '*', BracketLeft: '{', BracketRight: '}',
    Backslash: '|', Backquote: '~',
    KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F',
    KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
    KeyM: 'M', KeyN: 'N', KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R',
    KeyS: 'S', KeyT: 'T', KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X',
    KeyY: 'Y', KeyZ: 'Z',
};

function resolveKey(e) {
    // For special keys, always use e.key
    if (['Enter', 'Escape', 'Backspace', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        return e.key;
    }
    // If e.key is a single ASCII printable char, it's reliable (English mode)
    if (e.key.length === 1 && e.key.charCodeAt(0) >= 32 && e.key.charCodeAt(0) <= 126) {
        return e.key;
    }
    // Otherwise, fall back to code mapping (한글 IME active)
    if (e.shiftKey && SHIFT_CODE_TO_KEY[e.code]) {
        return SHIFT_CODE_TO_KEY[e.code];
    }
    if (CODE_TO_KEY[e.code]) {
        return CODE_TO_KEY[e.code];
    }
    return e.key;
}

class App {
    constructor() {
        this.engine = new VimEngine();
        this.puzzle = new PuzzleManager(this.engine);
        this.renderer = new Renderer();
        this.audio = new Audio8Bit();
        this.currentScreen = 'title';
        this.hintVisible = false;

        // Stage/Level select navigation
        this.selectedStage = null;
        this.focusedIndex = 0; // Currently focused card index
        this._selectableItems = []; // List of selectable items on current screen
    }

    init() {
        this.renderer.init();
        this._bindEvents();
        this._showScreen('title');
        this._renderStageSelect();

        // Wire up callbacks
        this.engine.onStateChange = (state) => {
            if (this.puzzle.currentLevel) {
                this.renderer.renderDiff(state, this.puzzle.currentLevel.targetText);
            }
        };

        this.engine.onModeChange = (mode) => {
            this.renderer.renderMode(mode);
        };

        this.engine.onCommandLineChange = (text) => {
            this.renderer.renderCommandLine(text);
        };

        this.puzzle.onMovesChange = (used, max) => {
            this.renderer.renderMoves(used, max);
            if (this.puzzle.currentLevel) {
                this.renderer.renderCommands(
                    this.puzzle.currentLevel.allowedCommands,
                    this.puzzle.commandLog
                );
            }
        };

        this.puzzle.onCommandLog = (log) => {
            this.renderer.renderCommandLog(log);
        };

        this.puzzle.onSolved = (level, moves) => {
            this.audio.success();
            this.puzzle.saveLevelComplete(level.id, moves);
            this._showSuccessOverlay(level, moves);
            this._renderStageSelect();
        };

        this.puzzle.onFailed = (level, moves) => {
            this.audio.fail();
            this._showFailOverlay(level);
        };
    }

    _bindEvents() {
        document.addEventListener('keydown', (e) => {
            // Prevent browser defaults for game keys
            if (this.currentScreen === 'game') {
                if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                }
                this._handleGameKey(e);
                return;
            }

            if (this.currentScreen === 'title') {
                this.audio.keyPress();
                this._showScreen('stages');
                return;
            }

            if (this.currentScreen === 'stages') {
                e.preventDefault();
                this._handleSelectKey(e, 'stages');
                return;
            }

            if (this.currentScreen === 'levels') {
                e.preventDefault();
                this._handleSelectKey(e, 'levels');
                return;
            }
        });

        // Button events
        document.getElementById('btn-start')?.addEventListener('click', () => {
            this.audio.keyPress();
            this._showScreen('stages');
        });

        document.getElementById('btn-back')?.addEventListener('click', () => {
            this.audio.keyPress();
            this._showScreen('levels');
        });

        document.getElementById('btn-reset')?.addEventListener('click', () => {
            this.audio.levelStart();
            this.puzzle.resetLevel();
            this.hintVisible = false;
            this._updateHint();
            this._refreshGameUI();
        });

        document.getElementById('btn-hint')?.addEventListener('click', () => {
            this.hintVisible = !this.hintVisible;
            this._updateHint();
        });

        document.getElementById('btn-sound')?.addEventListener('click', () => {
            const enabled = this.audio.toggle();
            const btn = document.getElementById('btn-sound');
            btn.textContent = enabled ? '♪ ON' : '♪ OFF';
        });
    }

    // --- h/j/k/l Navigation for stage/level select ---
    _handleSelectKey(e, screenType) {
        const key = resolveKey(e);

        if (key === 'Escape') {
            this.audio.keyPress();
            if (screenType === 'levels') {
                this._showScreen('stages');
            } else {
                this._showScreen('title');
            }
            return;
        }

        if (key === 'Enter' || key === ' ') {
            this.audio.keyPress();
            this._activateCurrentItem(screenType);
            return;
        }

        // h/j/k/l navigation
        const items = this._selectableItems;
        if (items.length === 0) return;

        let newIndex = this.focusedIndex;

        switch (key) {
            case 'h':
            case 'ArrowLeft':
                newIndex = Math.max(0, this.focusedIndex - 1);
                break;
            case 'l':
            case 'ArrowRight':
                newIndex = Math.min(items.length - 1, this.focusedIndex + 1);
                break;
            case 'j':
            case 'ArrowDown':
                // Move down - try to find item in next row
                newIndex = this._findNextRow(1);
                break;
            case 'k':
            case 'ArrowUp':
                // Move up
                newIndex = this._findNextRow(-1);
                break;
            default:
                return;
        }

        if (newIndex !== this.focusedIndex) {
            this.audio.keyPress();
            this.focusedIndex = newIndex;
            this._updateFocus();
        }
    }

    _findNextRow(direction) {
        const items = this._selectableItems;
        if (items.length === 0) return 0;

        const currentEl = items[this.focusedIndex];
        if (!currentEl) return this.focusedIndex;

        const currentRect = currentEl.getBoundingClientRect();
        const currentCenterX = currentRect.left + currentRect.width / 2;

        // Find items in the next/previous row
        let bestIndex = this.focusedIndex;
        let bestDistance = Infinity;

        for (let i = 0; i < items.length; i++) {
            const rect = items[i].getBoundingClientRect();
            const isNextRow = direction > 0
                ? rect.top > currentRect.bottom - 5
                : rect.bottom < currentRect.top + 5;

            if (isNextRow) {
                const centerX = rect.left + rect.width / 2;
                const distance = Math.abs(centerX - currentCenterX) + Math.abs(rect.top - currentRect.top);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = i;
                }
            }
        }

        return bestIndex;
    }

    _updateFocus() {
        // Remove all focused
        document.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));

        // Add focused to current
        const items = this._selectableItems;
        if (items[this.focusedIndex]) {
            items[this.focusedIndex].classList.add('focused');
            items[this.focusedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    _activateCurrentItem(screenType) {
        const items = this._selectableItems;
        const el = items[this.focusedIndex];
        if (!el) return;

        if (screenType === 'stages') {
            const stageId = parseInt(el.dataset.stage);
            if (stageId) {
                this.selectedStage = stageId;
                this._renderLevelSelect(stageId);
                this._showScreen('levels');
            }
        } else if (screenType === 'levels') {
            const levelId = parseInt(el.dataset.level);
            if (levelId) {
                this.audio.levelStart();
                this._startLevel(levelId);
            }
        }
    }

    _handleGameKey(e) {
        if (this.puzzle.solved || this.puzzle.failed) {
            if (e.key === 'Enter') {
                const overlay = document.getElementById('message-overlay');
                overlay.classList.remove('show');
                if (this.puzzle.solved) {
                    this._goNextLevel();
                } else {
                    this.puzzle.resetLevel();
                    this.hintVisible = false;
                    this._updateHint();
                    this._refreshGameUI();
                }
            }
            if (e.key === 'Escape') {
                const overlay = document.getElementById('message-overlay');
                overlay.classList.remove('show');
                this._showScreen('levels');
            }
            return;
        }

        let key = resolveKey(e);

        // Don't process modifier combos
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        e.preventDefault();

        const result = this.puzzle.processKey(key);
        if (result && result.executed) {
            if (result.countsAsMove) {
                this.audio.move();
            } else {
                this.audio.keyPress();
            }
        } else if (key !== 'Shift') {
            this.audio.error();
            const editorBody = document.querySelector('.editor-body');
            if (editorBody) {
                editorBody.classList.add('flash-error');
                setTimeout(() => editorBody.classList.remove('flash-error'), 300);
            }
        }
    }

    _showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(`${name}-screen`);
        if (screen) {
            screen.classList.add('active');
            if (name !== 'title') screen.classList.add('crt-on');
        }
        this.currentScreen = name;

        // Update selectable items for keyboard nav
        if (name === 'stages') {
            this._selectableItems = Array.from(document.querySelectorAll('.stage-card'));
            this.focusedIndex = 0;
            this._updateFocus();
        } else if (name === 'levels') {
            this._selectableItems = Array.from(document.querySelectorAll('#chapters-container .level-card'));
            this.focusedIndex = 0;
            this._updateFocus();
        }
    }

    _renderStageSelect() {
        const container = document.getElementById('stages-container');
        if (!container) return;

        const stages = this.puzzle.getStages();
        let html = '';

        stages.forEach(stage => {
            const progress = this.puzzle.getStageProgress(stage.id);
            const allComplete = progress.completed === progress.total;

            html += `<div class="stage-card${allComplete ? ' completed' : ''}" data-stage="${stage.id}" style="--stage-color: ${stage.color}">`;
            html += `<div class="stage-card-header">`;
            html += `<div class="stage-title">${stage.title}</div>`;
            html += `<div class="stage-subtitle">${stage.subtitle}</div>`;
            html += `</div>`;
            html += `<div class="stage-desc">${stage.description}</div>`;
            html += `<div class="stage-progress">`;
            html += `<div class="stage-progress-bar"><div class="stage-progress-fill" style="width:${(progress.completed / progress.total) * 100}%"></div></div>`;
            html += `<span class="stage-progress-text">${progress.completed}/${progress.total}</span>`;
            html += `</div>`;
            html += `</div>`;
        });

        container.innerHTML = html;

        // Bind clicks
        container.querySelectorAll('.stage-card').forEach(card => {
            card.addEventListener('click', () => {
                const stageId = parseInt(card.dataset.stage);
                this.audio.keyPress();
                this.selectedStage = stageId;
                this._renderLevelSelect(stageId);
                this._showScreen('levels');
            });
        });
    }

    _renderLevelSelect(stageId) {
        const container = document.getElementById('chapters-container');
        if (!container) return;

        stageId = stageId || this.selectedStage || 1;
        const chapters = this.puzzle.getChapters(stageId);
        let html = '';

        chapters.forEach(chapter => {
            html += `<div class="chapter-group fade-in">`;
            html += `<div class="chapter-title">▸ ${chapter.name}</div>`;
            html += `<div class="chapter-levels">`;

            chapter.levels.forEach(level => {
                const completed = this.puzzle.isLevelCompleted(level.id);
                html += `<div class="level-card${completed ? ' completed' : ''}" data-level="${level.id}">`;
                html += `<div class="level-number">LEVEL ${String(level.id).padStart(2, '0')}</div>`;
                html += `<div class="level-title">${level.title}</div>`;
                if (level.newCommands && level.newCommands.length > 0) {
                    html += `<div class="level-new-cmds">`;
                    level.newCommands.forEach(cmd => {
                        html += `<span class="new-cmd-badge">+${cmd}</span>`;
                    });
                    html += `</div>`;
                }
                html += `</div>`;
            });

            html += `</div></div>`;
        });

        container.innerHTML = html;

        // Bind level card clicks
        container.querySelectorAll('.level-card').forEach(card => {
            card.addEventListener('click', () => {
                const levelId = parseInt(card.dataset.level);
                this.audio.levelStart();
                this._startLevel(levelId);
            });
        });
    }

    _startLevel(levelId) {
        if (!this.puzzle.loadLevel(levelId)) return;

        const level = this.puzzle.currentLevel;
        this.hintVisible = false;

        // Update game screen info
        document.getElementById('game-level-num').textContent = `LEVEL ${String(level.id).padStart(2, '0')}`;
        document.getElementById('game-level-title').textContent = level.title;
        document.getElementById('level-desc').textContent = level.description;

        // Update hint
        document.getElementById('hint-text').textContent = level.hint;
        this._updateHint();

        this._refreshGameUI();
        this._showScreen('game');

        // Render target
        this.renderer.renderTarget(level.targetText);
    }

    _refreshGameUI() {
        const state = this.engine.getState();
        const level = this.puzzle.currentLevel;
        if (!level) return;

        this.renderer.renderDiff(state, level.targetText);
        this.renderer.renderMoves(this.puzzle.movesUsed, level.maxMoves);
        this.renderer.renderMode(this.engine.mode);
        this.renderer.renderCommands(level.allowedCommands, this.puzzle.commandLog);
        this.renderer.renderCommandLog(this.puzzle.commandLog);
    }

    _updateHint() {
        const section = document.getElementById('hint-section');
        if (section) {
            section.classList.toggle('show', this.hintVisible);
        }
    }

    _showSuccessOverlay(level, moves) {
        const overlay = document.getElementById('message-overlay');
        const stars = moves <= Math.ceil(level.maxMoves * 0.5) ? '★★★' :
            moves <= Math.ceil(level.maxMoves * 0.75) ? '★★☆' : '★☆☆';

        overlay.innerHTML = `
      <div class="message message-success">
        <div class="message-icon">${stars}</div>
        <div class="message-text">
          LEVEL CLEAR!<br>
          <span style="font-size:9px;color:var(--accent-cyan)">
            ${moves}회 사용 / 최대 ${level.maxMoves}회
          </span>
        </div>
        <div class="message-buttons">
          <button class="pixel-btn btn-small" onclick="document.getElementById('message-overlay').classList.remove('show');window.app._goNextLevel()">NEXT ▸</button>
          <button class="pixel-btn btn-small" onclick="document.getElementById('message-overlay').classList.remove('show');window.app._showScreen('levels')">LEVELS</button>
        </div>
      </div>
    `;
        overlay.classList.add('show');
    }

    _showFailOverlay(level) {
        const overlay = document.getElementById('message-overlay');
        overlay.innerHTML = `
      <div class="message message-fail">
        <div class="message-icon">✖</div>
        <div class="message-text">
          횟수 초과!<br>
          <span style="font-size:9px;color:var(--text-dim)">
            다시 도전해보세요
          </span>
        </div>
        <div class="message-buttons">
          <button class="pixel-btn btn-small" onclick="document.getElementById('message-overlay').classList.remove('show');window.app.puzzle.resetLevel();window.app._refreshGameUI()">RETRY</button>
          <button class="pixel-btn btn-small" onclick="document.getElementById('message-overlay').classList.remove('show');window.app._showScreen('levels')">LEVELS</button>
        </div>
      </div>
    `;
        overlay.classList.add('show');
    }

    _goNextLevel() {
        const current = this.puzzle.currentLevel;
        if (!current) return;
        const levels = this.puzzle.getStageLevels(current.stage);
        const idx = levels.findIndex(l => l.id === current.id);
        if (idx < levels.length - 1) {
            this._startLevel(levels[idx + 1].id);
        } else {
            this._showScreen('levels');
        }
    }
}

// Global init
const app = new App();
window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
