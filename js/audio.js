// ============================================================
// Audio - 8-bit sound effects via Web Audio API
// ============================================================

class Audio8Bit {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    _init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    _playTone(freq, duration, type = 'square', volume = 0.1) {
        if (!this.enabled) return;
        this._init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + duration);
    }

    keyPress() {
        this._playTone(800, 0.05, 'square', 0.06);
    }

    move() {
        this._playTone(440, 0.04, 'square', 0.04);
    }

    error() {
        this._playTone(150, 0.2, 'sawtooth', 0.08);
    }

    success() {
        if (!this.enabled) return;
        this._init();
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => this._playTone(freq, 0.15, 'square', 0.1), i * 100);
        });
    }

    levelStart() {
        this._playTone(330, 0.1, 'square', 0.08);
        setTimeout(() => this._playTone(440, 0.1, 'square', 0.08), 80);
    }

    fail() {
        this._playTone(300, 0.15, 'sawtooth', 0.08);
        setTimeout(() => this._playTone(200, 0.3, 'sawtooth', 0.08), 150);
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

export default Audio8Bit;
