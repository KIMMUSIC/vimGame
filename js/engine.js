// ============================================================
// VimEngine - Core Vim emulation engine
// ============================================================

class VimEngine {
  constructor() {
    this.lines = [''];
    this.cursor = { row: 0, col: 0 };
    this.mode = 'NORMAL'; // NORMAL | INSERT | VISUAL | VISUAL_LINE | COMMAND
    this.undoStack = [];
    this.commandBuffer = '';
    this.clipboard = '';
    this.onStateChange = null;
    this.onModeChange = null;
    this.onCommand = null;

    // Visual mode
    this.visualAnchor = null; // { row, col } - start of visual selection

    // Command mode
    this.commandLineBuffer = '';
    this.onCommandLineChange = null;

    // Pending char for f/F/t/T/r
    this._pendingCharCmd = null;

    // Last find (for ; repeat)
    this._lastFind = null; // { cmd: 'f'|'F'|'t'|'T', char: string }

    // Last change (for . repeat)
    this._lastChange = null; // { type: 'r'|'x'|'dd'|'cw', char?, text? }
  }

  // --- State management ---
  loadText(text) {
    this.lines = text.split('\n');
    if (this.lines.length === 0) this.lines = [''];
    this.cursor = { row: 0, col: 0 };
    this.mode = 'NORMAL';
    this.undoStack = [];
    this.commandBuffer = '';
    this.clipboard = '';
    this.visualAnchor = null;
    this.commandLineBuffer = '';
    this._pendingCharCmd = null;
    this._lastFind = null;
    this._lastChange = null;
    this._notify();
  }

  getText() {
    return this.lines.join('\n');
  }

  getState() {
    return {
      lines: this.lines.map(l => l),
      cursor: { ...this.cursor },
      mode: this.mode,
      visualAnchor: this.visualAnchor ? { ...this.visualAnchor } : null,
      commandLineBuffer: this.commandLineBuffer,
    };
  }

  _saveUndo() {
    this.undoStack.push({
      lines: this.lines.map(l => l),
      cursor: { ...this.cursor },
    });
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  _notify() {
    if (this.onStateChange) this.onStateChange(this.getState());
  }

  _notifyMode() {
    if (this.onModeChange) this.onModeChange(this.mode);
  }

  _notifyCommand(cmd) {
    if (this.onCommand) this.onCommand(cmd);
  }

  _notifyCommandLine() {
    if (this.onCommandLineChange) this.onCommandLineChange(this.commandLineBuffer);
  }

  _clampCursor() {
    if (this.cursor.row < 0) this.cursor.row = 0;
    if (this.cursor.row >= this.lines.length) this.cursor.row = this.lines.length - 1;
    const maxCol = this.mode === 'INSERT'
      ? this.lines[this.cursor.row].length
      : Math.max(0, this.lines[this.cursor.row].length - 1);
    if (this.cursor.col < 0) this.cursor.col = 0;
    if (this.cursor.col > maxCol) this.cursor.col = maxCol;
  }

  // --- Get visual selection range ---
  getVisualRange() {
    if (!this.visualAnchor) return null;
    const a = this.visualAnchor;
    const c = this.cursor;

    if (this.mode === 'VISUAL_LINE') {
      const startRow = Math.min(a.row, c.row);
      const endRow = Math.max(a.row, c.row);
      return { startRow, startCol: 0, endRow, endCol: this.lines[endRow].length - 1, type: 'line' };
    }

    // Character-wise visual
    let start, end;
    if (a.row < c.row || (a.row === c.row && a.col <= c.col)) {
      start = { ...a };
      end = { ...c };
    } else {
      start = { ...c };
      end = { ...a };
    }
    return { startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col, type: 'char' };
  }

  // --- Command processing ---
  processKey(key, allowedCommands) {
    // Pending char command (f/F/t/T)
    if (this._pendingCharCmd) {
      return this._executePendingChar(key, allowedCommands);
    }

    if (this.mode === 'INSERT') {
      return this._processInsertKey(key, allowedCommands);
    }
    if (this.mode === 'COMMAND') {
      return this._processCommandKey(key, allowedCommands);
    }
    if (this.mode === 'VISUAL' || this.mode === 'VISUAL_LINE') {
      return this._processVisualKey(key, allowedCommands);
    }
    return this._processNormalKey(key, allowedCommands);
  }

  // --- INSERT MODE ---
  _processInsertKey(key, allowedCommands) {
    if (key === 'Escape') {
      // If we came from cw, capture inserted text for . repeat
      if (this._cwStartCol !== undefined) {
        const insertedText = this.lines[this.cursor.row].slice(this._cwStartCol, this.cursor.col);
        this._lastChange = { type: 'cw', text: insertedText };
        this._cwStartCol = undefined;
      }
      this.mode = 'NORMAL';
      this.cursor.col = Math.max(0, this.cursor.col - 1);
      this._clampCursor();
      this._notifyMode();
      this._notify();
      return { executed: true, command: 'Esc', countsAsMove: false };
    }

    if (key === 'Backspace') {
      const r = this.cursor.row;
      const c = this.cursor.col;
      if (c > 0) {
        this.lines[r] = this.lines[r].slice(0, c - 1) + this.lines[r].slice(c);
        this.cursor.col--;
      } else if (r > 0) {
        const prevLen = this.lines[r - 1].length;
        this.lines[r - 1] += this.lines[r];
        this.lines.splice(r, 1);
        this.cursor.row--;
        this.cursor.col = prevLen;
      }
      this._notify();
      return { executed: true, command: null, countsAsMove: false };
    }

    if (key === 'Enter') {
      const r = this.cursor.row;
      const c = this.cursor.col;
      const rest = this.lines[r].slice(c);
      this.lines[r] = this.lines[r].slice(0, c);
      this.lines.splice(r + 1, 0, rest);
      this.cursor.row++;
      this.cursor.col = 0;
      this._notify();
      return { executed: true, command: null, countsAsMove: false };
    }

    // Regular character
    if (key.length === 1) {
      const r = this.cursor.row;
      const c = this.cursor.col;
      this.lines[r] = this.lines[r].slice(0, c) + key + this.lines[r].slice(c);
      this.cursor.col++;
      this._notify();
      return { executed: true, command: null, countsAsMove: false };
    }

    return { executed: false, command: null, countsAsMove: false };
  }

  // --- COMMAND MODE ---
  _processCommandKey(key, allowedCommands) {
    if (key === 'Escape') {
      this.mode = 'NORMAL';
      this.commandLineBuffer = '';
      this._notifyMode();
      this._notifyCommandLine();
      this._notify();
      return { executed: true, command: 'Esc', countsAsMove: false };
    }

    if (key === 'Enter') {
      const cmd = this.commandLineBuffer;
      this.commandLineBuffer = '';
      this.mode = 'NORMAL';
      this._notifyMode();
      this._notifyCommandLine();

      // Execute command
      const result = this._executeCommandLine(cmd, allowedCommands);
      this._notify();
      return result;
    }

    if (key === 'Backspace') {
      if (this.commandLineBuffer.length > 0) {
        this.commandLineBuffer = this.commandLineBuffer.slice(0, -1);
      } else {
        // Exit command mode if buffer is empty
        this.mode = 'NORMAL';
        this._notifyMode();
      }
      this._notifyCommandLine();
      return { executed: true, command: null, countsAsMove: false };
    }

    // Regular character
    if (key.length === 1) {
      this.commandLineBuffer += key;
      this._notifyCommandLine();
      return { executed: true, command: null, countsAsMove: false };
    }

    return { executed: false, command: null, countsAsMove: false };
  }

  _executeCommandLine(cmd, allowedCommands) {
    // :s/old/new - substitute on current line
    const subMatch = cmd.match(/^s\/([^/]*)\/([^/]*)$/);
    if (subMatch) {
      if (!this._isAllowed(':s', allowedCommands)) return { executed: false };
      const [, search, replace] = subMatch;
      const row = this.cursor.row;
      const line = this.lines[row];
      if (line.includes(search)) {
        this._saveUndo();
        this.lines[row] = line.replace(search, replace);
        this._clampCursor();
        this._notifyCommand(':s/' + search + '/' + replace);
        return { executed: true, command: ':s', countsAsMove: true };
      }
      return { executed: false };
    }

    // :wq - treated as level clear check (no-op, game checks automatically)
    if (cmd === 'wq' || cmd === 'w' || cmd === 'q') {
      this._notifyCommand(':' + cmd);
      return { executed: true, command: ':' + cmd, countsAsMove: false };
    }

    return { executed: false };
  }

  // --- VISUAL MODE ---
  _processVisualKey(key, allowedCommands) {
    if (key === 'Escape') {
      this.mode = 'NORMAL';
      this.visualAnchor = null;
      this._notifyMode();
      this._notify();
      return { executed: true, command: 'Esc', countsAsMove: false };
    }

    // Movement in visual mode
    switch (key) {
      case 'h':
        this.cursor.col--;
        this._clampCursor();
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
      case 'j':
        this.cursor.row++;
        this._clampCursor();
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
      case 'k':
        this.cursor.row--;
        this._clampCursor();
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
      case 'l':
        this.cursor.col++;
        this._clampCursor();
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
      case 'w':
        this._moveWordForward();
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
      case 'b':
        this._moveWordBackward();
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
      case '0':
        this.cursor.col = 0;
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
      case '$':
        this.cursor.col = Math.max(0, this.lines[this.cursor.row].length - 1);
        this._notify();
        return { executed: true, command: null, countsAsMove: false };
    }

    // Delete selection
    if (key === 'd') {
      if (!this._isAllowed('d', allowedCommands)) return { executed: false };
      this._saveUndo();
      this._deleteVisualSelection();
      this.mode = 'NORMAL';
      this.visualAnchor = null;
      this._clampCursor();
      this._notifyMode();
      this._notifyCommand(this.mode === 'VISUAL_LINE' ? 'V+d' : 'v+d');
      this._notify();
      return { executed: true, command: 'v+d', countsAsMove: true };
    }

    // Yank selection
    if (key === 'y') {
      if (!this._isAllowed('y', allowedCommands)) return { executed: false };
      this._yankVisualSelection();
      this.mode = 'NORMAL';
      this.visualAnchor = null;
      this._notifyMode();
      this._notifyCommand('v+y');
      this._notify();
      return { executed: true, command: 'v+y', countsAsMove: true };
    }

    return { executed: false, command: null, countsAsMove: false };
  }

  _deleteVisualSelection() {
    const range = this.getVisualRange();
    if (!range) return;

    if (range.type === 'line') {
      // Store to clipboard
      this.clipboard = this.lines.slice(range.startRow, range.endRow + 1).join('\n');
      this.lines.splice(range.startRow, range.endRow - range.startRow + 1);
      if (this.lines.length === 0) this.lines = [''];
      this.cursor.row = Math.min(range.startRow, this.lines.length - 1);
      this.cursor.col = 0;
    } else {
      // Character-wise delete
      if (range.startRow === range.endRow) {
        const line = this.lines[range.startRow];
        this.clipboard = line.slice(range.startCol, range.endCol + 1);
        this.lines[range.startRow] = line.slice(0, range.startCol) + line.slice(range.endCol + 1);
        this.cursor.row = range.startRow;
        this.cursor.col = range.startCol;
      } else {
        // Multi-line
        const firstPart = this.lines[range.startRow].slice(0, range.startCol);
        const lastPart = this.lines[range.endRow].slice(range.endCol + 1);
        const deletedLines = [this.lines[range.startRow].slice(range.startCol)];
        for (let r = range.startRow + 1; r < range.endRow; r++) {
          deletedLines.push(this.lines[r]);
        }
        deletedLines.push(this.lines[range.endRow].slice(0, range.endCol + 1));
        this.clipboard = deletedLines.join('\n');

        this.lines[range.startRow] = firstPart + lastPart;
        this.lines.splice(range.startRow + 1, range.endRow - range.startRow);
        this.cursor.row = range.startRow;
        this.cursor.col = range.startCol;
      }
    }
  }

  _yankVisualSelection() {
    const range = this.getVisualRange();
    if (!range) return;

    if (range.type === 'line') {
      this.clipboard = this.lines.slice(range.startRow, range.endRow + 1).join('\n');
    } else {
      if (range.startRow === range.endRow) {
        this.clipboard = this.lines[range.startRow].slice(range.startCol, range.endCol + 1);
      } else {
        const parts = [this.lines[range.startRow].slice(range.startCol)];
        for (let r = range.startRow + 1; r < range.endRow; r++) {
          parts.push(this.lines[r]);
        }
        parts.push(this.lines[range.endRow].slice(0, range.endCol + 1));
        this.clipboard = parts.join('\n');
      }
    }
    this.cursor = { row: range.startRow, col: range.startCol };
  }

  // --- Pending char command (f/F/t/T/r) ---
  _executePendingChar(char, allowedCommands) {
    const cmd = this._pendingCharCmd;
    this._pendingCharCmd = null;

    if (char === 'Escape') {
      return { executed: true, command: 'Esc', countsAsMove: false };
    }

    if (char.length !== 1) return { executed: false };

    // r{char} - replace character under cursor
    if (cmd === 'r') {
      this._saveUndo();
      const line = this.lines[this.cursor.row];
      if (this.cursor.col < line.length) {
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + char + line.slice(this.cursor.col + 1);
        this._lastChange = { type: 'r', char: char };
        this._notifyCommand('r' + char);
        this._notify();
        return { executed: true, command: 'r', countsAsMove: true };
      }
      return { executed: false };
    }

    const line = this.lines[this.cursor.row];
    let found = -1;

    if (cmd === 'f') {
      found = line.indexOf(char, this.cursor.col + 1);
      if (found !== -1) {
        this.cursor.col = found;
        this._lastFind = { cmd: 'f', char: char };
        this._notifyCommand('f' + char);
        this._notify();
        return { executed: true, command: 'f', countsAsMove: true };
      }
    } else if (cmd === 'F') {
      found = line.lastIndexOf(char, this.cursor.col - 1);
      if (found !== -1) {
        this.cursor.col = found;
        this._lastFind = { cmd: 'F', char: char };
        this._notifyCommand('F' + char);
        this._notify();
        return { executed: true, command: 'F', countsAsMove: true };
      }
    } else if (cmd === 't') {
      found = line.indexOf(char, this.cursor.col + 1);
      if (found !== -1 && found > 0) {
        this.cursor.col = found - 1;
        this._lastFind = { cmd: 't', char: char };
        this._notifyCommand('t' + char);
        this._notify();
        return { executed: true, command: 't', countsAsMove: true };
      }
    } else if (cmd === 'T') {
      found = line.lastIndexOf(char, this.cursor.col - 1);
      if (found !== -1) {
        this.cursor.col = found + 1;
        this._lastFind = { cmd: 'T', char: char };
        this._notifyCommand('T' + char);
        this._notify();
        return { executed: true, command: 'T', countsAsMove: true };
      }
    }

    return { executed: false };
  }

  // --- NORMAL MODE ---
  _processNormalKey(key, allowedCommands) {
    this.commandBuffer += key;
    const buf = this.commandBuffer;

    const result = this._tryExecuteNormal(buf, allowedCommands);

    if (result.executed) {
      this.commandBuffer = '';
      this._notify();
      return result;
    }

    if (result.partial) {
      return { executed: false, command: null, countsAsMove: false };
    }

    this.commandBuffer = '';
    return { executed: false, command: null, countsAsMove: false };
  }

  _isAllowed(cmd, allowedCommands) {
    if (!allowedCommands) return true;
    return allowedCommands.includes(cmd);
  }

  _tryExecuteNormal(buf, allowed) {
    // Multi-char commands first - handle partials
    if (buf === 'd') return { executed: false, partial: true };
    if (buf === 'g') return { executed: false, partial: true };
    if (buf === 'y') return { executed: false, partial: true };
    if (buf === 'c') return { executed: false, partial: true };

    // ci and di partials
    if (buf === 'ci') return { executed: false, partial: true };
    if (buf === 'di') return { executed: false, partial: true };

    // dd
    if (buf === 'dd') {
      if (!this._isAllowed('dd', allowed)) return { executed: false };
      this._saveUndo();
      this.clipboard = this.lines[this.cursor.row];
      if (this.lines.length === 1) {
        this.lines[0] = '';
      } else {
        this.lines.splice(this.cursor.row, 1);
      }
      this._clampCursor();
      this.cursor.col = 0;
      this._lastChange = { type: 'dd' };
      this._notifyCommand('dd');
      return { executed: true, command: 'dd', countsAsMove: true };
    }

    // yy
    if (buf === 'yy') {
      if (!this._isAllowed('yy', allowed)) return { executed: false };
      this.clipboard = this.lines[this.cursor.row];
      this._notifyCommand('yy');
      return { executed: true, command: 'yy', countsAsMove: true };
    }

    // gg
    if (buf === 'gg') {
      if (!this._isAllowed('gg', allowed)) return { executed: false };
      this.cursor.row = 0;
      this.cursor.col = 0;
      this._notifyCommand('gg');
      return { executed: true, command: 'gg', countsAsMove: true };
    }

    // cw - change word
    if (buf === 'cw') {
      if (!this._isAllowed('cw', allowed)) return { executed: false };
      this._saveUndo();
      // Delete to end of word, enter insert mode
      const line = this.lines[this.cursor.row];
      let end = this.cursor.col;
      while (end < line.length && /\w/.test(line[end])) end++;
      this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + line.slice(end);
      this.mode = 'INSERT';
      this._cwStartCol = this.cursor.col; // Track for . repeat
      this._notifyMode();
      this._notifyCommand('cw');
      return { executed: true, command: 'cw', countsAsMove: true };
    }

    // ci( - change inside parens
    if (buf === 'ci(') {
      if (!this._isAllowed('ci(', allowed)) return { executed: false };
      return this._changeInside('(', ')');
    }

    // ci" - change inside quotes
    if (buf === 'ci"' || buf === 'ci\u0022') {
      if (!this._isAllowed('ci"', allowed)) return { executed: false };
      return this._changeInside('"', '"');
    }

    // di( - delete inside parens
    if (buf === 'di(') {
      if (!this._isAllowed('di(', allowed)) return { executed: false };
      return this._deleteInside('(', ')');
    }

    // di" - delete inside quotes
    if (buf === 'di"') {
      if (!this._isAllowed('di"', allowed)) return { executed: false };
      return this._deleteInside('"', '"');
    }

    // Single-char commands
    if (buf.length !== 1) return { executed: false };

    switch (buf) {
      case 'h':
        if (!this._isAllowed('h', allowed)) return { executed: false };
        this.cursor.col--;
        this._clampCursor();
        this._notifyCommand('h');
        return { executed: true, command: 'h', countsAsMove: true };

      case 'j':
        if (!this._isAllowed('j', allowed)) return { executed: false };
        this.cursor.row++;
        this._clampCursor();
        this._notifyCommand('j');
        return { executed: true, command: 'j', countsAsMove: true };

      case 'k':
        if (!this._isAllowed('k', allowed)) return { executed: false };
        this.cursor.row--;
        this._clampCursor();
        this._notifyCommand('k');
        return { executed: true, command: 'k', countsAsMove: true };

      case 'l':
        if (!this._isAllowed('l', allowed)) return { executed: false };
        this.cursor.col++;
        this._clampCursor();
        this._notifyCommand('l');
        return { executed: true, command: 'l', countsAsMove: true };

      case 'w': {
        if (!this._isAllowed('w', allowed)) return { executed: false };
        this._moveWordForward();
        this._notifyCommand('w');
        return { executed: true, command: 'w', countsAsMove: true };
      }

      case 'b': {
        if (!this._isAllowed('b', allowed)) return { executed: false };
        this._moveWordBackward();
        this._notifyCommand('b');
        return { executed: true, command: 'b', countsAsMove: true };
      }

      case 'x':
        if (!this._isAllowed('x', allowed)) return { executed: false };
        this._saveUndo();
        if (this.lines[this.cursor.row].length > 0) {
          this.lines[this.cursor.row] =
            this.lines[this.cursor.row].slice(0, this.cursor.col) +
            this.lines[this.cursor.row].slice(this.cursor.col + 1);
          this._clampCursor();
        }
        this._lastChange = { type: 'x' };
        this._notifyCommand('x');
        return { executed: true, command: 'x', countsAsMove: true };

      case 'i':
        if (!this._isAllowed('i', allowed)) return { executed: false };
        this._saveUndo();
        this.mode = 'INSERT';
        this._notifyMode();
        this._notifyCommand('i');
        return { executed: true, command: 'i', countsAsMove: true };

      case 'A':
        if (!this._isAllowed('A', allowed)) return { executed: false };
        this._saveUndo();
        this.mode = 'INSERT';
        this.cursor.col = this.lines[this.cursor.row].length;
        this._notifyMode();
        this._notifyCommand('A');
        return { executed: true, command: 'A', countsAsMove: true };

      case 'o':
        if (!this._isAllowed('o', allowed)) return { executed: false };
        this._saveUndo();
        this.lines.splice(this.cursor.row + 1, 0, '');
        this.cursor.row++;
        this.cursor.col = 0;
        this.mode = 'INSERT';
        this._notifyMode();
        this._notifyCommand('o');
        return { executed: true, command: 'o', countsAsMove: true };

      case 'p':
        if (!this._isAllowed('p', allowed)) return { executed: false };
        if (this.clipboard !== '') {
          this._saveUndo();
          this.lines.splice(this.cursor.row + 1, 0, this.clipboard);
          this.cursor.row++;
          this.cursor.col = 0;
          this._notifyCommand('p');
          return { executed: true, command: 'p', countsAsMove: true };
        }
        return { executed: false };

      case 'u':
        if (!this._isAllowed('u', allowed)) return { executed: false };
        if (this.undoStack.length > 0) {
          const state = this.undoStack.pop();
          this.lines = state.lines;
          this.cursor = state.cursor;
          this._notifyCommand('u');
          return { executed: true, command: 'u', countsAsMove: true };
        }
        return { executed: false };

      case '0':
        if (!this._isAllowed('0', allowed)) return { executed: false };
        this.cursor.col = 0;
        this._notifyCommand('0');
        return { executed: true, command: '0', countsAsMove: true };

      case '$':
        if (!this._isAllowed('$', allowed)) return { executed: false };
        this.cursor.col = Math.max(0, this.lines[this.cursor.row].length - 1);
        this._notifyCommand('$');
        return { executed: true, command: '$', countsAsMove: true };

      case 'G':
        if (!this._isAllowed('G', allowed)) return { executed: false };
        this.cursor.row = this.lines.length - 1;
        this.cursor.col = 0;
        this._clampCursor();
        this._notifyCommand('G');
        return { executed: true, command: 'G', countsAsMove: true };

      // f/F/t/T - wait for next char
      case 'f':
        if (!this._isAllowed('f', allowed)) return { executed: false };
        this._pendingCharCmd = 'f';
        return { executed: true, command: null, countsAsMove: false };

      case 'F':
        if (!this._isAllowed('F', allowed)) return { executed: false };
        this._pendingCharCmd = 'F';
        return { executed: true, command: null, countsAsMove: false };

      case 't':
        if (!this._isAllowed('t', allowed)) return { executed: false };
        this._pendingCharCmd = 't';
        return { executed: true, command: null, countsAsMove: false };

      case 'T':
        if (!this._isAllowed('T', allowed)) return { executed: false };
        this._pendingCharCmd = 'T';
        return { executed: true, command: null, countsAsMove: false };

      // r - replace char (wait for next char)
      case 'r':
        if (!this._isAllowed('r', allowed)) return { executed: false };
        this._pendingCharCmd = 'r';
        return { executed: true, command: null, countsAsMove: false };

      // ; - repeat last f/F/t/T
      case ';':
        if (!this._isAllowed(';', allowed)) return { executed: false };
        if (this._lastFind) {
          const { cmd, char } = this._lastFind;
          this._pendingCharCmd = null;
          // Simulate the find without going through pending
          const line = this.lines[this.cursor.row];
          let found = -1;
          if (cmd === 'f') {
            found = line.indexOf(char, this.cursor.col + 1);
            if (found !== -1) this.cursor.col = found;
          } else if (cmd === 'F') {
            found = line.lastIndexOf(char, this.cursor.col - 1);
            if (found !== -1) this.cursor.col = found;
          } else if (cmd === 't') {
            found = line.indexOf(char, this.cursor.col + 1);
            if (found !== -1 && found > 0) this.cursor.col = found - 1;
            else found = -1;
          } else if (cmd === 'T') {
            found = line.lastIndexOf(char, this.cursor.col - 1);
            if (found !== -1) this.cursor.col = found + 1;
          }
          if (found !== -1) {
            this._notifyCommand(';');
            return { executed: true, command: ';', countsAsMove: true };
          }
        }
        return { executed: false };

      // . - repeat last change
      case '.':
        if (!this._isAllowed('.', allowed)) return { executed: false };
        if (this._lastChange) {
          return this._executeRepeatChange(allowed);
        }
        return { executed: false };

      // v - enter visual mode
      case 'v':
        if (!this._isAllowed('v', allowed)) return { executed: false };
        this.mode = 'VISUAL';
        this.visualAnchor = { ...this.cursor };
        this._notifyMode();
        this._notifyCommand('v');
        return { executed: true, command: 'v', countsAsMove: true };

      // V - enter visual line mode
      case 'V':
        if (!this._isAllowed('V', allowed)) return { executed: false };
        this.mode = 'VISUAL_LINE';
        this.visualAnchor = { ...this.cursor };
        this._notifyMode();
        this._notifyCommand('V');
        return { executed: true, command: 'V', countsAsMove: true };

      // : - enter command mode
      case ':':
        this.mode = 'COMMAND';
        this.commandLineBuffer = '';
        this._notifyMode();
        this._notifyCommandLine();
        return { executed: true, command: null, countsAsMove: false };

      default:
        return { executed: false };
    }
  }

  // --- Repeat last change (.) ---
  _executeRepeatChange(allowed) {
    const lc = this._lastChange;
    if (!lc) return { executed: false };

    if (lc.type === 'r' && lc.char) {
      this._saveUndo();
      const line = this.lines[this.cursor.row];
      if (this.cursor.col < line.length) {
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + lc.char + line.slice(this.cursor.col + 1);
        this._notifyCommand('.');
        return { executed: true, command: '.', countsAsMove: true };
      }
      return { executed: false };
    }

    if (lc.type === 'x') {
      this._saveUndo();
      if (this.lines[this.cursor.row].length > 0) {
        this.lines[this.cursor.row] =
          this.lines[this.cursor.row].slice(0, this.cursor.col) +
          this.lines[this.cursor.row].slice(this.cursor.col + 1);
        this._clampCursor();
      }
      this._notifyCommand('.');
      return { executed: true, command: '.', countsAsMove: true };
    }

    if (lc.type === 'dd') {
      this._saveUndo();
      this.clipboard = this.lines[this.cursor.row];
      if (this.lines.length === 1) {
        this.lines[0] = '';
      } else {
        this.lines.splice(this.cursor.row, 1);
      }
      this._clampCursor();
      this.cursor.col = 0;
      this._notifyCommand('.');
      return { executed: true, command: '.', countsAsMove: true };
    }

    if (lc.type === 'cw' && lc.text !== undefined) {
      this._saveUndo();
      const line = this.lines[this.cursor.row];
      let end = this.cursor.col;
      while (end < line.length && /\w/.test(line[end])) end++;
      this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + lc.text + line.slice(end);
      this.cursor.col = this.cursor.col + lc.text.length;
      this._clampCursor();
      this._notifyCommand('.');
      return { executed: true, command: '.', countsAsMove: true };
    }

    return { executed: false };
  }

  // --- Change inside delimiters ---
  _changeInside(open, close) {
    const line = this.lines[this.cursor.row];
    const { start, end } = this._findInside(line, open, close);
    if (start === -1) return { executed: false };

    this._saveUndo();
    this.lines[this.cursor.row] = line.slice(0, start) + line.slice(end);
    this.cursor.col = start;
    this.mode = 'INSERT';
    this._notifyMode();
    const cmdName = 'ci' + open;
    this._notifyCommand(cmdName);
    return { executed: true, command: cmdName, countsAsMove: true };
  }

  _deleteInside(open, close) {
    const line = this.lines[this.cursor.row];
    const { start, end } = this._findInside(line, open, close);
    if (start === -1) return { executed: false };

    this._saveUndo();
    this.clipboard = line.slice(start, end);
    this.lines[this.cursor.row] = line.slice(0, start) + line.slice(end);
    this.cursor.col = Math.min(start, Math.max(0, this.lines[this.cursor.row].length - 1));
    const cmdName = 'di' + open;
    this._notifyCommand(cmdName);
    this._notify();
    return { executed: true, command: cmdName, countsAsMove: true };
  }

  _findInside(line, open, close) {
    // Find the enclosing delimiters around cursor
    let openIdx = -1;
    let closeIdx = -1;

    if (open === close) {
      // For quotes - find first and second occurrence
      let first = -1;
      let second = -1;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === open) {
          if (first === -1) {
            first = i;
          } else {
            second = i;
            // Check if cursor is between these two
            if (this.cursor.col >= first && this.cursor.col <= second) {
              openIdx = first;
              closeIdx = second;
              break;
            }
            first = -1;
            second = -1;
          }
        }
      }
    } else {
      // For parentheses - find matching pair around cursor
      for (let i = this.cursor.col; i >= 0; i--) {
        if (line[i] === open) { openIdx = i; break; }
      }
      if (openIdx !== -1) {
        let depth = 0;
        for (let i = openIdx; i < line.length; i++) {
          if (line[i] === open) depth++;
          if (line[i] === close) { depth--; if (depth === 0) { closeIdx = i; break; } }
        }
      }
    }

    if (openIdx === -1 || closeIdx === -1) return { start: -1, end: -1 };
    return { start: openIdx + 1, end: closeIdx };
  }

  _moveWordForward() {
    const line = this.lines[this.cursor.row];
    let c = this.cursor.col;
    while (c < line.length && /\w/.test(line[c])) c++;
    while (c < line.length && /\W/.test(line[c])) c++;
    if (c >= line.length && this.cursor.row < this.lines.length - 1) {
      this.cursor.row++;
      this.cursor.col = 0;
    } else {
      this.cursor.col = Math.min(c, Math.max(0, line.length - 1));
    }
  }

  _moveWordBackward() {
    const line = this.lines[this.cursor.row];
    let c = this.cursor.col;
    if (c === 0 && this.cursor.row > 0) {
      this.cursor.row--;
      this.cursor.col = Math.max(0, this.lines[this.cursor.row].length - 1);
      return;
    }
    c--;
    while (c > 0 && /\W/.test(line[c])) c--;
    while (c > 0 && /\w/.test(line[c - 1])) c--;
    this.cursor.col = Math.max(0, c);
  }
}

export default VimEngine;
