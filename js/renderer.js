// ============================================================
// Renderer - UI 렌더링 (에디터, 상태바, 명령어 패널)
// ============================================================

class Renderer {
    constructor() {
        this.editorEl = null;
        this.targetEl = null;
        this.commandsEl = null;
        this.movesEl = null;
        this.modeEls = [];
        this.logEl = null;
        this.commandLineEl = null;
        this.statusbarLeftEl = null;
        this.cursorBlink = true;
        this._blinkInterval = null;
    }

    init() {
        this.editorEl = document.getElementById('editor-lines');
        this.targetEl = document.getElementById('target-lines');
        this.commandsEl = document.getElementById('command-palette');
        this.movesEl = document.getElementById('moves-display');
        this.modeEls = document.querySelectorAll('.mode-display');
        this.logEl = document.getElementById('command-log');
        this.commandLineEl = document.getElementById('command-line-input');
        this.statusbarLeftEl = document.querySelector('.statusbar-left');
        this._startBlink();
    }

    _startBlink() {
        if (this._blinkInterval) clearInterval(this._blinkInterval);
        this._blinkInterval = setInterval(() => {
            this.cursorBlink = !this.cursorBlink;
            const cursorEls = document.querySelectorAll('.cursor-char');
            cursorEls.forEach(el => {
                el.classList.toggle('cursor-off', !this.cursorBlink);
            });
        }, 530);
    }

    // --- Check if a position is in visual selection ---
    _isInVisualRange(row, col, state) {
        if (!state.visualAnchor) return false;
        const a = state.visualAnchor;
        const c = state.cursor;

        if (state.mode === 'VISUAL_LINE') {
            const startRow = Math.min(a.row, c.row);
            const endRow = Math.max(a.row, c.row);
            return row >= startRow && row <= endRow;
        }

        if (state.mode === 'VISUAL') {
            let start, end;
            if (a.row < c.row || (a.row === c.row && a.col <= c.col)) {
                start = a; end = c;
            } else {
                start = c; end = a;
            }

            if (row < start.row || row > end.row) return false;
            if (start.row === end.row) return col >= start.col && col <= end.col;
            if (row === start.row) return col >= start.col;
            if (row === end.row) return col <= end.col;
            return true;
        }

        return false;
    }

    renderEditor(state) {
        if (!this.editorEl) return;
        const { lines, cursor, mode } = state;

        let html = '';
        const maxLineNum = String(lines.length).length;

        lines.forEach((line, row) => {
            const lineNum = String(row + 1).padStart(maxLineNum, ' ');
            html += `<div class="editor-line${row === cursor.row ? ' active-line' : ''}">`;
            html += `<span class="line-number">${this._escapeHtml(lineNum)}</span>`;
            html += `<span class="line-content">`;

            if (line.length === 0) {
                if (row === cursor.row) {
                    const cursorClass = this._getCursorClass(mode);
                    html += `<span class="char cursor-char ${cursorClass}">&nbsp;</span>`;
                } else {
                    html += `<span class="char">&nbsp;</span>`;
                }
            } else {
                for (let col = 0; col < line.length; col++) {
                    const ch = line[col] === ' ' ? '&nbsp;' : this._escapeHtml(line[col]);
                    const isVisual = this._isInVisualRange(row, col, state);
                    let cls = 'char';
                    if (row === cursor.row && col === cursor.col) {
                        cls += ` cursor-char ${this._getCursorClass(mode)}`;
                    }
                    if (isVisual) cls += ' visual-highlight';
                    html += `<span class="${cls}">${ch}</span>`;
                }
                if (mode === 'INSERT' && row === cursor.row && cursor.col >= line.length) {
                    html += `<span class="char cursor-char cursor-insert">&nbsp;</span>`;
                }
            }

            html += `</span></div>`;
        });

        this.editorEl.innerHTML = html;
    }

    renderTarget(targetText) {
        if (!this.targetEl) return;
        const lines = targetText.split('\n');
        const maxLineNum = String(lines.length).length;
        let html = '';

        lines.forEach((line, row) => {
            const lineNum = String(row + 1).padStart(maxLineNum, ' ');
            html += `<div class="editor-line target-line">`;
            html += `<span class="line-number">${this._escapeHtml(lineNum)}</span>`;
            html += `<span class="line-content">`;
            if (line.length === 0) {
                html += `<span class="char">&nbsp;</span>`;
            } else {
                for (let col = 0; col < line.length; col++) {
                    const ch = line[col] === ' ' ? '&nbsp;' : this._escapeHtml(line[col]);
                    html += `<span class="char">${ch}</span>`;
                }
            }
            html += `</span></div>`;
        });

        this.targetEl.innerHTML = html;
    }

    renderDiff(state, targetText) {
        if (!this.editorEl) return;
        const { lines, cursor, mode } = state;
        const targetLines = targetText.split('\n');
        const maxLineNum = String(Math.max(lines.length, targetLines.length)).length;

        let html = '';
        lines.forEach((line, row) => {
            const lineNum = String(row + 1).padStart(maxLineNum, ' ');
            const targetLine = targetLines[row] || '';
            const isMatch = line === targetLine;

            html += `<div class="editor-line${row === cursor.row ? ' active-line' : ''}${isMatch ? ' line-correct' : ''}">`;
            html += `<span class="line-number">${this._escapeHtml(lineNum)}</span>`;
            html += `<span class="line-content">`;

            if (line.length === 0) {
                if (row === cursor.row) {
                    const cursorClass = this._getCursorClass(mode);
                    html += `<span class="char cursor-char ${cursorClass}">&nbsp;</span>`;
                } else {
                    html += `<span class="char">&nbsp;</span>`;
                }
            } else {
                for (let col = 0; col < line.length; col++) {
                    const ch = line[col] === ' ' ? '&nbsp;' : this._escapeHtml(line[col]);
                    const targetCh = targetLine[col];
                    const charMatch = line[col] === targetCh;
                    const isVisual = this._isInVisualRange(row, col, state);
                    let cls = 'char';
                    if (row === cursor.row && col === cursor.col) {
                        cls += ` cursor-char ${this._getCursorClass(mode)}`;
                    }
                    if (!charMatch && targetCh !== undefined) cls += ' char-wrong';
                    if (charMatch) cls += ' char-correct';
                    if (isVisual) cls += ' visual-highlight';
                    html += `<span class="${cls}">${ch}</span>`;
                }
                if (mode === 'INSERT' && row === cursor.row && cursor.col >= line.length) {
                    html += `<span class="char cursor-char cursor-insert">&nbsp;</span>`;
                }
            }

            html += `</span></div>`;
        });

        this.editorEl.innerHTML = html;
    }

    _getCursorClass(mode) {
        switch (mode) {
            case 'INSERT': return 'cursor-insert';
            case 'VISUAL':
            case 'VISUAL_LINE': return 'cursor-visual';
            case 'COMMAND': return 'cursor-command';
            default: return 'cursor-normal';
        }
    }

    renderCommands(allowedCommands, usedCommands) {
        if (!this.commandsEl) return;

        const cmdDescriptions = {
            'h': '← 좌', 'j': '↓ 하', 'k': '↑ 상', 'l': '→ 우',
            'w': 'w 단어→', 'b': 'b ←단어',
            'x': 'x 삭제', 'dd': 'dd 줄삭제',
            'i': 'i 삽입', 'A': 'A 끝삽입', 'o': 'o 새줄',
            'yy': 'yy 복사', 'p': 'p 붙여넣기',
            'u': 'u 되돌리기',
            '0': '0 줄처음', '$': '$ 줄끝',
            'gg': 'gg 맨위', 'G': 'G 맨아래',
            'f': 'f→ 찾기', 'F': 'F← 찾기',
            't': 't→ 직전', 'T': 'T← 직전',
            'r': 'r 교체', ';': '; 찾기반복', '.': '. 변경반복',
            'cw': 'cw 단어변경',
            'ci(': 'ci( 괄호변경', 'di(': 'di( 괄호삭제',
            'ci"': 'ci" 따옴표변경', 'di"': 'di" 따옴표삭제',
            'v': 'v 비주얼', 'V': 'V 줄비주얼',
            'd': 'd 삭제', 'y': 'y 복사',
            ':s': ':s 치환',
        };

        let html = '';
        allowedCommands.forEach(cmd => {
            const used = usedCommands.filter(c => c === cmd || c.startsWith(cmd)).length;
            html += `<div class="cmd-key${used > 0 ? ' cmd-used' : ''}">`;
            html += `<span class="cmd-label">${cmdDescriptions[cmd] || cmd}</span>`;
            if (used > 0) html += `<span class="cmd-count">×${used}</span>`;
            html += `</div>`;
        });

        this.commandsEl.innerHTML = html;
    }

    renderMoves(used, max) {
        if (!this.movesEl) return;
        const remaining = max - used;
        let html = `<span class="moves-label">남은 횟수</span>`;
        html += `<span class="moves-dots">`;
        for (let i = 0; i < max; i++) {
            html += `<span class="move-dot${i < used ? ' dot-used' : ''}"></span>`;
        }
        html += `</span>`;
        html += `<span class="moves-count ${remaining <= 3 ? 'moves-warning' : ''}">${remaining}/${max}</span>`;
        this.movesEl.innerHTML = html;
    }

    renderMode(mode) {
        const modeTexts = {
            'NORMAL': '-- NORMAL --',
            'INSERT': '-- INSERT --',
            'VISUAL': '-- VISUAL --',
            'VISUAL_LINE': '-- V-LINE --',
            'COMMAND': '-- COMMAND --',
        };
        const modeClasses = {
            'NORMAL': 'mode-normal',
            'INSERT': 'mode-insert',
            'VISUAL': 'mode-visual',
            'VISUAL_LINE': 'mode-visual',
            'COMMAND': 'mode-command',
        };

        this.modeEls.forEach(el => {
            el.textContent = modeTexts[mode] || '-- NORMAL --';
            el.className = `mode-display mode-indicator ${modeClasses[mode] || 'mode-normal'}`;
        });

        // Show/hide command line
        if (this.commandLineEl) {
            this.commandLineEl.classList.toggle('active', mode === 'COMMAND');
        }

        // Update editor body class for cursor style
        const editorBody = document.getElementById('editor-lines');
        if (editorBody) {
            editorBody.dataset.mode = mode.toLowerCase();
        }
    }

    renderCommandLine(text) {
        if (!this.commandLineEl) return;
        const display = this.commandLineEl.querySelector('.command-line-text');
        if (display) {
            display.textContent = ':' + text;
        }
    }

    renderCommandLog(log) {
        if (!this.logEl) return;
        const recent = log.slice(-12);
        this.logEl.innerHTML = recent.map(c =>
            `<span class="log-cmd">${this._escapeHtml(c)}</span>`
        ).join('');
        this.logEl.scrollLeft = this.logEl.scrollWidth;
    }

    showMessage(text, type = 'info') {
        const overlay = document.getElementById('message-overlay');
        if (!overlay) return;

        overlay.innerHTML = `<div class="message message-${type}">
      <div class="message-icon">${type === 'success' ? '★' : type === 'fail' ? '✖' : 'ℹ'}</div>
      <div class="message-text">${text}</div>
    </div>`;
        overlay.classList.add('show');

        setTimeout(() => {
            overlay.classList.remove('show');
        }, type === 'success' ? 3000 : 2000);
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    destroy() {
        if (this._blinkInterval) clearInterval(this._blinkInterval);
    }
}

export default Renderer;
