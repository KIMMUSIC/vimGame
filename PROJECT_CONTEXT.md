# VIM PUZZLE - 프로젝트 컨텍스트

> 이 문서는 다음 작업 시 프로젝트 전체를 빠르게 파악할 수 있도록 작성된 참고 자료입니다.
> 최종 업데이트: 2026-02-15

---

## 1. 프로젝트 개요

- **이름**: VIM PUZZLE (빔 퍼즐)
- **설명**: Vim 에디터의 명령어를 퍼즐로 학습하는 웹 기반 게임
- **기술 스택**: 순수 HTML + CSS + JavaScript (ES Modules, 외부 라이브러리 없음)
- **폰트**: Google Fonts — `Press Start 2P` (픽셀 아트 스타일)
- **저장소**: https://github.com/KIMMUSIC/vimGame.git
- **실행**: `python3 -m http.server 8080` 후 `http://localhost:8080`

---

## 2. 폴더 구조

```
vim-game/
├── index.html              # 메인 HTML (162줄) — 4개 화면 레이아웃
├── README.md               # 프로젝트 소개
├── PROJECT_CONTEXT.md      # 이 파일 (프로젝트 컨텍스트)
├── css/
│   ├── main.css            # 메인 스타일 (923줄) — CSS 변수, 레이아웃, 컴포넌트
│   └── animations.css      # 애니메이션 (257줄) — blink, shake, fade, CRT 효과
├── js/
│   ├── main.js             # 앱 진입점 (554줄) — 화면 전환, 키 처리, UI 연결
│   ├── engine.js           # Vim 엔진 (979줄) — 핵심! 모든 Vim 명령 에뮬레이션
│   ├── puzzle.js           # 퍼즐 관리자 (155줄) — 레벨 로드, 이동 카운트, 성공/실패 판정
│   ├── levels.js           # 레벨 데이터 (409줄) — 25개 레벨 정의 + 스테이지 메타데이터
│   ├── renderer.js         # UI 렌더링 (323줄) — 에디터, 커서, 명령어 팔레트, 상태바
│   └── audio.js            # 8bit 사운드 (70줄) — Web Audio API로 효과음 생성
└── screenshots/            # README용 게임 스크린샷 (6개 PNG)
```

---

## 3. 아키텍처 & 데이터 흐름

```
[index.html]  →  [main.js (App)]
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    [engine.js]   [puzzle.js]  [renderer.js]
    (VimEngine)  (PuzzleManager) (Renderer)
         │            │
         │            ▼
         │       [levels.js]
         │       (LEVELS, STAGES)
         │
         ▼
    [audio.js]
    (Audio8Bit)
```

### 핵심 흐름
1. **키 입력**: `main.js`의 `_handleGameKey(e)` → `resolveKey(e)`로 `e.code` → `key` 변환
2. **퍼즐 처리**: `puzzle.processKey(key)` → `engine.processKey(key, allowedCommands)`
3. **엔진 판정**: 모드에 따라 분기 (NORMAL → INSERT → VISUAL → COMMAND)
4. **상태 콜백**: `onStateChange` → `renderer.renderEditor()`, `onMovesChange` → `renderer.renderMoves()`
5. **성공/실패**: `puzzle._checkSolved()` → `currentText === targetText` 비교

---

## 4. 핵심 모듈 상세

### 4.1 engine.js — VimEngine (979줄)

Vim 에뮬레이션의 핵심. **단일 클래스, 31개 메서드**.

#### 상태 (State)
```javascript
this.lines = [''];                    // 텍스트 라인 배열
this.cursor = { row: 0, col: 0 };     // 커서 위치
this.mode = 'NORMAL';                 // NORMAL | INSERT | VISUAL | VISUAL_LINE | COMMAND
this.undoStack = [];                  // Undo 스택 (lines + cursor 스냅샷)
this.commandBuffer = '';              // 진행중인 멀티키 명령 (예: "d", "dd", "ci")
this.clipboard = '';                  // 복사/삭제된 텍스트
this.visualAnchor = null;             // 비주얼 모드 시작 위치 { row, col }
this.commandLineBuffer = '';          // 명령 모드 입력 버퍼

// 반복 관련 상태
this._pendingCharCmd = null;          // 다음 문자를 기다리는 명령 (f/F/t/T/r)
this._lastFind = null;                // 마지막 검색 { cmd: 'f'|'F'|'t'|'T', char }
this._lastChange = null;              // 마지막 변경 { type: 'r'|'x'|'dd'|'cw', char?, text? }
this._cwStartCol = undefined;         // cw 삽입 시작 위치 (. 반복용)
```

#### 콜백 (Callbacks)
```javascript
this.onStateChange = null;            // 텍스트/커서 변경 시
this.onModeChange = null;             // 모드 전환 시
this.onCommand = null;                // 명령 실행 시
this.onCommandLineChange = null;      // 명령라인 입력 시
```

#### 메서드 목록
| 메서드 | 줄 | 역할 |
|--------|-----|------|
| `constructor()` | 6-32 | 초기 상태 설정 |
| `loadText(text)` | 34-49 | 텍스트 로드 및 상태 초기화 |
| `getText()` | 51-53 | 현재 텍스트 반환 (lines.join) |
| `getState()` | 55-63 | 렌더링용 전체 상태 반환 |
| `_saveUndo()` | 65-71 | Undo 스택에 현재 상태 저장 |
| `_clampCursor()` | 89-97 | 커서 범위 제한 |
| `getVisualRange()` | 99-121 | 비주얼 선택 영역 계산 |
| `processKey(key, allowed)` | 123-140 | **핵심 진입점** — 모드별 분기 |
| `_processInsertKey(key)` | 142-199 | INSERT 모드 키 처리 (문자 삽입, Backspace, Escape) |
| `_processCommandKey(key)` | 201-245 | COMMAND 모드 키 처리 (:명령) |
| `_executeCommandLine(cmd)` | 247-272 | :s 치환 명령 실행 |
| `_processVisualKey(key)` | 274-351 | VISUAL/VISUAL_LINE 모드 키 처리 |
| `_deleteVisualSelection()` | 353-389 | 비주얼 선택 영역 삭제 |
| `_yankVisualSelection()` | 391-410 | 비주얼 선택 영역 복사 |
| `_executePendingChar(char)` | 412-479 | `f/F/t/T/r` 후의 문자 처리 |
| `_processNormalKey(key)` | 481-500 | NORMAL 모드 진입점 → 버퍼 관리 → `_tryExecuteNormal` |
| `_isAllowed(cmd, allowed)` | 502-505 | 허용 명령어 체크 |
| `_tryExecuteNormal(buf, allowed)` | 507-816 | **핵심 명령 분기** (300+ 줄) |
| `_executeRepeatChange(allowed)` | 818-873 | `.` 명령 — 마지막 변경 반복 |
| `_changeInside(open, close)` | 875-889 | `ci(`, `ci"` 구현 |
| `_deleteInside(open, close)` | 891-904 | `di(`, `di"` 구현 |
| `_findInside(line, open, close)` | 906-948 | 중첩 구분자 내부 범위 찾기 |
| `_moveWordForward()` | 950-961 | `w` 단어 이동 |
| `_moveWordBackward()` | 963-975 | `b` 단어 이동 |

#### 지원하는 Vim 명령어
| 카테고리 | 명령어 |
|----------|--------|
| 이동 | `h` `j` `k` `l` `w` `b` `0` `$` `gg` `G` |
| 검색 이동 | `f{c}` `F{c}` `t{c}` `T{c}` `;` |
| 편집 | `x` `r{c}` `dd` `i` `A` `o` `cw` `.` |
| 텍스트 객체 | `ci(` `ci"` `di(` `di"` |
| 복사/붙여넣기 | `yy` `p` |
| 비주얼 모드 | `v` `V` + `d` `y` |
| 명령 모드 | `:s/찾/바꿈` |
| 기타 | `u` (undo) `Escape` |

#### `_lastChange` 형식 (. 반복용)
```javascript
// r 명령
{ type: 'r', char: 'e' }

// x 명령
{ type: 'x' }

// dd 명령
{ type: 'dd' }

// cw 명령 + 입력 텍스트
{ type: 'cw', text: 'newWord' }
```

#### `processKey` 반환값
```javascript
{
  executed: boolean,     // 명령 실행 여부
  command: string,       // 실행된 명령 이름 (예: 'dd', 'f', 'cw')
  countsAsMove: boolean, // 이동 횟수에 포함되는지
  partial?: boolean,     // 멀티키 명령 대기 중 (예: 'd' 입력 후 'd' 대기)
}
```

---

### 4.2 main.js — App (554줄)

앱 전체 라이프사이클 관리. 화면 전환, 키 이벤트, UI 갱신.

#### resolveKey(e) — 한글 IME 대응
```javascript
// e.code (물리키) → key (논리키) 변환
// KeyA → 'a', Shift+KeyA → 'A', Shift+Semicolon → ':'
// CODE_TO_KEY: 일반 키 매핑
// SHIFT_CODE_TO_KEY: Shift 조합 매핑
```
> **중요**: `e.key` 대신 `e.code`를 사용하여 한글 IME 상태에서도 항상 영문 키 입력 보장

#### App 클래스 주요 필드
```javascript
this.engine = new VimEngine();
this.puzzle = new PuzzleManager(this.engine);
this.renderer = new Renderer();
this.audio = new Audio8Bit();
this.currentScreen = 'title';       // title | stages | levels | game
this.currentStage = 1;              // 현재 선택된 스테이지
this.currentLevelId = 1;            // 현재 플레이 중인 레벨 ID
this.hintVisible = false;           // 힌트 표시 여부
this.focusedItems = [];             // 현재 화면의 포커스 가능 아이템들
this.focusIndex = 0;                // 현재 포커스 인덱스
```

#### 주요 메서드
| 메서드 | 역할 |
|--------|------|
| `init()` | 콜백 연결, DOM ready 후 화면 초기화 |
| `_bindEvents()` | keydown 이벤트 + 버튼 클릭 바인딩 |
| `_handleSelectKey(e, screenType)` | h/j/k/l로 스테이지/레벨 선택 네비게이션 |
| `_findNextRow(direction)` | 그리드 레이아웃에서 위/아래 행 탐색 |
| `_updateFocus()` | 포커스 CSS 클래스 갱신 |
| `_activateCurrentItem(screenType)` | Enter 키 → 선택 항목 활성화 |
| `_handleGameKey(e)` | **게임 키 입력 처리** → `resolveKey(e)` → `puzzle.processKey(key)` |
| `_showScreen(name)` | 화면 전환 (CSS class 토글) |
| `_renderStageSelect()` | 스테이지 선택 UI 동적 생성 |
| `_renderLevelSelect(stageId)` | 챕터별 레벨 카드 그리드 생성 |
| `_startLevel(levelId)` | 레벨 시작 (puzzle 로드 + UI 셋업) |
| `_refreshGameUI()` | 에디터/타겟/명령어/이동수 한꺼번에 갱신 |
| `_showSuccessOverlay(level, moves)` | 성공 오버레이 (파티클 + 사운드) |
| `_showFailOverlay(level)` | 실패 오버레이 (리셋 유도) |
| `_goNextLevel()` | 다음 레벨로 이동 (같은 스테이지 내) |

#### 화면 전환 흐름
```
title → (any key) → stages → (Enter) → levels → (Enter) → game
  ↑                   ↑                   ↑                  │
  └── (Esc) ──────── └── (Esc) ──────── └── (Esc/BACK) ────┘
```

---

### 4.3 puzzle.js — PuzzleManager (155줄)

레벨 로딩, 이동 카운트, 성공/실패 판정, 진행 데이터 저장.

#### 주요 로직
- `processKey(key)`: 엔진에 키 전달 → `countsAsMove`이면 횟수 증가 → 성공/실패 체크
- `_checkSolved()`: `engine.getText() === level.targetText` 비교
- `saveLevelComplete()`: `localStorage('vim-puzzle-progress')` 에 JSON 저장
- 실패 조건: `movesUsed >= maxMoves && !solved`

#### 콜백
```javascript
this.onMovesChange = null;   // (used, max) → 이동 횟수 변경
this.onSolved = null;        // (level, moves) → 레벨 클리어
this.onFailed = null;        // (level, moves) → 레벨 실패
this.onCommandLog = null;    // (log[]) → 명령 로그 갱신
```

---

### 4.4 levels.js — 레벨 데이터 (409줄)

25개 레벨 정의 + 2개 스테이지 메타데이터.

#### 레벨 구조
```javascript
{
    id: number,                    // 고유 식별자 (1~25)
    stage: number,                 // 소속 스테이지 (1 또는 2)
    title: string,                 // 레벨 제목 (예: '⚡ 문자 찾기 리턴')
    chapter: string,               // 챕터 이름 (같은 챕터끼리 그룹)
    description: string,           // 설명 (\\n으로 줄바꿈)
    initialText: string,           // 초기 텍스트
    targetText: string,            // 목표 텍스트
    initialCursor: { row, col },   // 초기 커서 위치
    allowedCommands: string[],     // 사용 가능한 명령어 목록
    maxMoves: number,              // 최대 이동 횟수
    hint: string,                  // 힌트 텍스트
    newCommands: string[],         // 이 레벨에서 새로 소개하는 명령어
}
```

#### 스테이지 & 챕터 구조
```
Stage 1: Vim 기초 (12 레벨, ID 1~12)
├── Chapter 1: 이동의 기초      → L1(좌우), L2(삽입), L3(상하좌우)
├── Chapter 2: 빠른 이동        → L4(단어이동), L5(줄처음/끝)
├── Chapter 3: 삭제 마스터      → L6(줄삭제), L7(정밀삭제)
├── Chapter 4: 삽입의 기술      → L8(끝삽입A), L9(새줄o)
├── Chapter 5: 복사 & 붙여넣기  → L10(yy/p), L11(gg/G)
└── Chapter 6: 종합 도전        → L12(최종시험)

Stage 2: Vim 고급 (13 레벨, ID 13~25)
├── Chapter 7: 검색과 교체      → L13(f찾기), L14(r교체), L15(;반복), L16(.반복)
├── Chapter 8: 효율의 발견      → L17(⚡콜백), L18(cw), L19(⚡콜백)
├── Chapter 9: 구조 편집        → L20(ci(/di(), L21(ci")
├── Chapter 10: 비주얼 모드     → L22(v), L23(V)
├── Chapter 11: 명령 모드       → L24(:s)
└── Chapter 12: 종합 도전       → L25(⚡최종)
```

#### 콜백 레벨 (⚡ 표시)
이전에 기본 방법으로 풀었던 문제를 빡빡한 maxMoves로 재출제:
- **L17**: L13과 같은 유형 (세미콜론→콤마), maxMoves=6 → `f;→r,→;.→;.` 필수
- **L19**: cw로 같은 단어 3줄 교체, maxMoves=8 → `cw→.` 반복 필수
- **L25**: 모든 기술 총동원, maxMoves=16

#### STAGES 메타데이터
```javascript
const STAGES = [
    { id: 1, title: 'STAGE 1', subtitle: 'Vim 기초', color: 'var(--accent-green)' },
    { id: 2, title: 'STAGE 2', subtitle: 'Vim 고급', color: 'var(--accent-purple)' },
];
```

---

### 4.5 renderer.js — Renderer (323줄)

DOM 조작 전담. 에디터, 타겟, 명령어 팔레트, 이동 카운트, 모드, 로그 렌더링.

#### DOM 요소 바인딩
```javascript
this.editorEl    = '#editor-lines'
this.targetEl    = '#target-lines'
this.commandsEl  = '#command-palette'
this.movesEl     = '#moves-display'
this.modeEls     = '.mode-display' (복수)
this.logEl       = '#command-log'
this.commandLineEl = '#command-line-input'
this.descEl      = '#level-desc'
```

#### 주요 메서드
| 메서드 | 역할 |
|--------|------|
| `renderEditor(state)` | 에디터 영역 렌더 — 줄번호, 문자 하이라이팅, 커서, 비주얼 선택 |
| `renderTarget(targetText)` | 목표 텍스트 렌더 |
| `renderDiff(state, targetText)` | 에디터 + 타겟 diff 비교 (맞는 글자 초록, 틀린 글자 빨강) |
| `renderCommands(allowed, used)` | 명령어 팔레트 — 사용 가능/사용된 명령어 표시 |
| `renderMoves(used, max)` | 이동 횟수 바 (남은 횟수 초록 블록, 사용한 횟수 회색 블록) |
| `renderMode(mode)` | 모드 표시 (NORMAL/INSERT/VISUAL/COMMAND) + CSS 클래스 |
| `renderCommandLine(text)` | 명령 라인 `:` 입력 표시 |
| `renderCommandLog(log)` | 명령 로그 (실행된 명령 뱃지 나열) |
| `showMessage(text, type)` | 메시지 오버레이 (성공/실패/에러) |

#### 커서 스타일
```
NORMAL:      블록 커서 (초록 배경)
INSERT:      바 커서 (왼쪽 보더 깜빡임)
VISUAL:      블록 커서 (보라) + 선택 영역 하이라이트
VISUAL_LINE: 블록 커서 + 전체 줄 선택 하이라이트
```

#### 명령어 설명 맵
```javascript
const cmdDescriptions = {
    'h': '← 좌', 'j': '↓ 하', 'k': '↑ 상', 'l': '→ 우',
    'w': 'w 단어→', 'b': 'b ←단어', 'x': 'x 삭제', 'dd': 'dd 줄삭제',
    'i': 'i 삽입', 'A': 'A 끝삽입', 'o': 'o 새줄',
    'yy': 'yy 복사', 'p': 'p 붙여넣기', 'u': 'u 되돌리기',
    '0': '0 줄처음', '$': '$ 줄끝', 'gg': 'gg 맨위', 'G': 'G 맨아래',
    'f': 'f→ 찾기', 'F': 'F← 찾기', 't': 't→ 직전', 'T': 'T← 직전',
    'r': 'r 교체', ';': '; 찾기반복', '.': '. 변경반복',
    'cw': 'cw 단어변경',
    'ci(': 'ci( 괄호변경', 'di(': 'di( 괄호삭제',
    'ci"': 'ci" 따옴표변경', 'di"': 'di" 따옴표삭제',
    'v': 'v 비주얼', 'V': 'V 줄비주얼',
    'd': 'd 삭제', 'y': 'y 복사', ':s': ':s 치환',
};
```

---

### 4.6 audio.js — Audio8Bit (70줄)

Web Audio API 기반 8bit 사운드 이펙트.

```javascript
class Audio8Bit {
    keyPress()    // 800Hz, 0.05s — 키 입력음
    move()        // 440Hz, 0.04s — 이동음
    error()       // 150Hz, 0.2s (sawtooth) — 에러음
    success()     // C-E-G-C 아르페지오 — 성공 팡파레
    levelStart()  // 330→440Hz 2연타 — 레벨 시작
    fail()        // 300→200Hz 하강 — 실패음
    toggle()      // 사운드 on/off 토글
}
```

---

## 5. index.html 구조 (162줄)

4개 화면(screen) + 메시지 오버레이로 구성. CSS class `active`로 표시/숨김 전환.

```html
<body>
  <!-- 1. Title Screen (#title-screen) -->
  <div id="title-screen" class="screen active">
    .title-art (VIM 아스키 아트)
    .title-logo (PUZZLE 네온 텍스트)
    .title-prompt (PRESS ANY KEY TO START)
    #btn-start, #btn-sound
  </div>

  <!-- 2. Stage Select (#stages-screen) -->
  <div id="stages-screen" class="screen">
    #stages-container → (동적 생성: .stage-card)
  </div>

  <!-- 3. Level Select (#levels-screen) -->
  <div id="levels-screen" class="screen">
    #chapters-container → (동적 생성: .chapter-section > .level-card)
  </div>

  <!-- 4. Game Screen (#game-screen) -->
  <div id="game-screen" class="screen">
    .game-topbar (#game-level-num, #game-level-title, #btn-reset, #btn-hint, #btn-back)
    .game-main (grid: 1fr 300px)
      .game-left
        .editor-panel (#editor-lines) + .mode-display
        .target-panel (#target-lines)
      .game-right
        #level-desc, #moves-display, #command-palette, #command-log, #hint-text
    .game-statusbar (.mode-display, #command-line-input, 조작 안내)
  </div>

  <!-- Message Overlay -->
  <div id="message-overlay"></div>

  <script type="module" src="js/main.js"></script>
</body>
```

---

## 6. CSS 구조

### main.css (923줄)
```
CSS 변수 (커스텀 프로퍼티):
  --bg-dark: #0a0e17          --bg-panel: #0d1320
  --bg-editor: #0f1726        --bg-header: #111827
  --accent-green: #39ff6e     --accent-cyan: #00e5ff
  --accent-red: #ff4060       --accent-yellow: #ffe040
  --accent-purple: #b060ff    --border: #1e293b
  --text-primary: #c8d6e5     --text-bright: #ffffff
  --text-dim: #4a5568         --font-size: 10px
  --pixel: 2px                --gap: 8px

주요 섹션:
  1. 전역 스타일 (body, scanline overlay)
  2. Title Screen (.title-art, .title-logo, .title-prompt)
  3. Stage Select (.stage-card, .stage-progress-bar)
  4. Level Select (.chapter-section, .level-card)
  5. Game Layout (.game-topbar, .game-main grid, .game-left, .game-right)
  6. Editor (.editor-line, .char, .cursor-char, 커서 모드별 스타일)
  7. Sidebar (.sidebar-section, .cmd-key, .moves-bar, .log-item)
  8. Status Bar (.game-statusbar, .command-line-input)
  9. Buttons (.pixel-btn, hover/active 효과)
  10. Message Overlay (.message-overlay, .success-content, .fail-content)
```

### animations.css (257줄)
```
@keyframes 목록:
  blink        — 깜빡임 (프롬프트, 경고)
  titlePulse   — 타이틀 네온 글로우
  shake        — 에러 시 화면 흔들림
  starBurst    — 성공 별 이펙트
  pixelFloat   — 파티클 떠오르기
  glowPulse    — 성공 글로우
  fadeIn       — 페이드인
  slideInRight — 오른쪽에서 슬라이드
  flashRed     — 에러 플래시
  typewriter   — 타이핑 효과
  crtOn        — CRT 전원 켜기 효과
  keyPop       — 키 눌림 효과
  dotConsume   — 점 소비 효과
  cursorBarBlink — INSERT 커서 깜빡임
```

---

## 7. 데이터 저장

- **저장 위치**: `localStorage`
- **키**: `vim-puzzle-progress`
- **형식**: `[{ id: number, moves: number }, ...]`
- **갱신 조건**: 레벨 클리어 시 기존 기록보다 적은 moves일 때만 갱신

---

## 8. 키 입력 처리 상세

### resolveKey 함수 (main.js:40-57)
한글 IME 문제 해결을 위해 `e.key` 대신 `e.code` 사용:

```javascript
function resolveKey(e) {
    // 1. Shift 조합: SHIFT_CODE_TO_KEY에서 매핑 (: $ ^ 등)
    // 2. 일반 키: CODE_TO_KEY에서 매핑 (a-z, 0-9, Enter, Escape 등)
    // 3. 매핑 실패: e.key 폴백
    if (e.shiftKey && SHIFT_CODE_TO_KEY[e.code]) return SHIFT_CODE_TO_KEY[e.code];
    if (CODE_TO_KEY[e.code]) return CODE_TO_KEY[e.code];
    return e.key;
}
```

### 각 화면별 키 처리
- **title**: 아무 키 → stages로 이동
- **stages**: h/j/k/l 네비게이션, Enter → levels, Esc → title
- **levels**: h/j/k/l 네비게이션, Enter → game, Esc → stages
- **game**: `resolveKey(e)` → `puzzle.processKey(key)`, 결과에 따라 UI 갱신

---

## 9. 알려진 구현 패턴 & 주의사항

### 명령어 허용 시스템
- 각 레벨은 `allowedCommands` 배열로 사용 가능한 명령어를 명시
- `engine._isAllowed(cmd, allowed)`로 체크: `!allowed || allowed.includes(cmd)`
- 허용되지 않은 명령어 입력 시 무시 + 에러 사운드

### Pending Char 패턴
`f`, `F`, `t`, `T`, `r` 명령은 2키 조합:
1. 첫 번째 키 → `_pendingCharCmd` 설정
2. 다음 키 → `_executePendingChar(char)` 에서 처리
3. Escape → 취소

### _lastChange 추적
`.` 명령 반복을 위해 변경 명령 실행 시 상태 저장:
- `r{c}` → `{ type: 'r', char: c }`
- `x` → `{ type: 'x' }`
- `dd` → `{ type: 'dd' }`
- `cw` + 입력 → `{ type: 'cw', text: '입력문자열' }` (INSERT 모드 종료 시 캡처)

### cw INSERT 텍스트 캡처
`cw` 실행 시 `_cwStartCol`에 INSERT 시작 위치를 저장.
INSERT 모드에서 Escape 시 `_cwStartCol`이 정의되어 있으면:
```javascript
const insertedText = this.lines[this.cursor.row].slice(this._cwStartCol, this.cursor.col);
this._lastChange = { type: 'cw', text: insertedText };
this._cwStartCol = undefined;
```

---

## 10. 향후 확장 시 참고

### 새 레벨 추가 방법
1. `levels.js`의 `LEVELS` 배열에 새 레벨 객체 추가
2. `id` 는 기존 최대값 + 1
3. `stage` 번호 지정
4. `chapter` 이름으로 자동 그룹핑 (같은 이름 = 같은 챕터)
5. `allowedCommands`에 사용 가능한 명령어 목록
6. `maxMoves`로 난이도 조절

### 새 Vim 명령어 추가 방법
1. `engine.js`의 `_tryExecuteNormal()`에 명령 분기 추가
2. 멀티키 명령이면 `partial: true` 반환 추가
3. `_lastChange` 추적 필요하면 저장 로직 추가
4. `renderer.js`의 `cmdDescriptions`에 한국어 설명 추가
5. 해당 명령어를 사용하는 레벨을 `levels.js`에 추가

### 새 스테이지 추가 방법
1. `levels.js`의 `STAGES` 배열에 새 스테이지 객체 추가
2. 새 레벨들의 `stage` 값을 새 스테이지 ID로 설정

### 모듈 의존성 순서
```
levels.js  ← (데이터만, 의존 없음)
audio.js   ← (독립)
engine.js  ← (독립)
renderer.js ← (독립)
puzzle.js  ← engine.js, levels.js
main.js    ← engine.js, puzzle.js, renderer.js, audio.js, levels.js(간접)
```
