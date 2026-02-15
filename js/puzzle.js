// ============================================================
// PuzzleManager - 퍼즐 로직 관리
// ============================================================

import { LEVELS, STAGES } from './levels.js';

class PuzzleManager {
    constructor(engine) {
        this.engine = engine;
        this.currentLevel = null;
        this.movesUsed = 0;
        this.commandLog = [];
        this.solved = false;
        this.failed = false;

        // Callbacks
        this.onMovesChange = null;
        this.onSolved = null;
        this.onFailed = null;
        this.onCommandLog = null;
    }

    getLevels() {
        return LEVELS;
    }

    getLevel(id) {
        return LEVELS.find(l => l.id === id);
    }

    getStages() {
        return STAGES;
    }

    getStageLevels(stageId) {
        return LEVELS.filter(l => l.stage === stageId);
    }

    getChapters(stageId) {
        const levels = stageId ? this.getStageLevels(stageId) : LEVELS;
        const chapters = [];
        const seen = new Set();
        for (const level of levels) {
            if (!seen.has(level.chapter)) {
                seen.add(level.chapter);
                chapters.push({
                    name: level.chapter,
                    levels: levels.filter(l => l.chapter === level.chapter),
                });
            }
        }
        return chapters;
    }

    getStageProgress(stageId) {
        const stageLevels = this.getStageLevels(stageId);
        const saved = this._loadProgress();
        const completed = stageLevels.filter(l => saved.some(s => s.id === l.id)).length;
        return { completed, total: stageLevels.length };
    }

    loadLevel(id) {
        const level = this.getLevel(id);
        if (!level) return false;

        this.currentLevel = level;
        this.movesUsed = 0;
        this.commandLog = [];
        this.solved = false;
        this.failed = false;

        this.engine.loadText(level.initialText);
        if (level.initialCursor) {
            this.engine.cursor = { ...level.initialCursor };
        }

        return true;
    }

    resetLevel() {
        if (this.currentLevel) {
            this.loadLevel(this.currentLevel.id);
        }
    }

    processKey(key) {
        if (!this.currentLevel || this.solved || this.failed) return null;

        const result = this.engine.processKey(key, this.currentLevel.allowedCommands);

        if (result.executed && result.countsAsMove) {
            this.movesUsed++;
            if (result.command) {
                this.commandLog.push(result.command);
                if (this.onCommandLog) this.onCommandLog(this.commandLog);
            }
            if (this.onMovesChange) this.onMovesChange(this.movesUsed, this.currentLevel.maxMoves);

            // Check win condition
            if (this._checkSolved()) {
                this.solved = true;
                if (this.onSolved) this.onSolved(this.currentLevel, this.movesUsed);
                return { ...result, solved: true };
            }

            // Check fail condition
            if (this.movesUsed >= this.currentLevel.maxMoves && !this.solved) {
                this.failed = true;
                if (this.onFailed) this.onFailed(this.currentLevel, this.movesUsed);
                return { ...result, failed: true };
            }
        }

        return result;
    }

    _checkSolved() {
        const currentText = this.engine.getText();
        return currentText === this.currentLevel.targetText;
    }

    getProgress() {
        const saved = this._loadProgress();
        return {
            completedLevels: saved,
            totalLevels: LEVELS.length,
        };
    }

    saveLevelComplete(levelId, moves) {
        const saved = this._loadProgress();
        const existing = saved.find(s => s.id === levelId);
        if (!existing || moves < existing.moves) {
            const filtered = saved.filter(s => s.id !== levelId);
            filtered.push({ id: levelId, moves });
            localStorage.setItem('vim-puzzle-progress', JSON.stringify(filtered));
        }
    }

    isLevelCompleted(levelId) {
        const saved = this._loadProgress();
        return saved.some(s => s.id === levelId);
    }

    _loadProgress() {
        try {
            return JSON.parse(localStorage.getItem('vim-puzzle-progress')) || [];
        } catch {
            return [];
        }
    }
}

export default PuzzleManager;
