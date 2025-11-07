
import {
  BallState,
  BallType,
  PlayerId,
  PlayerState,
  TurnResultType,
} from "./definitions";
import { BALL_DEFINITIONS } from "./entities";

type ToastKind = "info" | "success" | "foul" | "win";

export interface UIBindings {
  sidebar: HTMLElement;
  toast: HTMLElement;
  toastLabel: HTMLElement;
  toastText: HTMLElement;
  startOverlay: HTMLElement;
  winOverlay: HTMLElement;
  winOverlayTitle: HTMLElement;
  winOverlaySubtitle: HTMLElement;
  powerBar: HTMLElement;
  player1El: HTMLElement;
  player2El: HTMLElement;
  foulIndicator: HTMLElement;
  hintEl: HTMLElement;
}

let bindings: UIBindings | null = null;

const BALL_COLORS: Record<number, string> = BALL_DEFINITIONS.reduce(
  (acc, b) => {
    acc[b.id] = b.color;
    return acc;
  },
  {} as Record<number, string>
);

export const initUI = (): UIBindings => {
  const root = document.getElementById("game-root");
  if (!root) {
    throw new Error("Root element #game-root not found");
  }

  // Sidebar
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";

  sidebar.innerHTML = `
    <section class="sidebar-section">
      <div class="sidebar-header">
        <div>
          <div class="game-title">American Pool</div>
          <div class="game-subtitle">8-ball • точная физика • локальный мультиплеер</div>
        </div>
        <div class="sidebar-value">v1.0</div>
      </div>
    </section>

    <section class="sidebar-section">
      <div class="sidebar-header">
        <div class="sidebar-title">Счёт и статусы</div>
        <div class="sidebar-label">Правила 8-ball, честные удары</div>
      </div>
      <div class="scoreboard">
        <div class="player" data-player="1">
          <div class="player-label">
            <div class="player-name">Игрок 1</div>
            <div class="player-type" data-player-type="1">нет группы</div>
          </div>
          <div class="player-score" data-player-score="1">0</div>
          <div class="player-balls" data-player-balls="1"></div>
        </div>
        <div class="player" data-player="2">
          <div class="player-label">
            <div class="player-name">Игрок 2</div>
            <div class="player-type" data-player-type="2">нет группы</div>
          </div>
          <div class="player-score" data-player-score="2">0</div>
          <div class="player-balls" data-player-balls="2"></div>
        </div>
      </div>
      <div class="turn-indicator">
        <div class="turn-label">
          <div class="turn-dot"></div>
          <span id="turn-label-text">Ход Игрока 1</span>
        </div>
        <div class="foul-indicator" id="foul-indicator">Фол — биток с рукой</div>
      </div>
      <div class="power-container">
        <div class="power-label-row">
          <div>Сила удара</div>
          <div id="power-label">0%</div>
        </div>
        <div class="power-bar-outer">
          <div class="power-bar-inner" id="power-bar-inner"></div>
          <div class="power-marker" style="left: 25%"></div>
          <div class="power-marker" style="left: 50%"></div>
          <div class="power-marker" style="left: 75%"></div>
        </div>
      </div>
    </section>

    <section class="sidebar-section">
      <div class="sidebar-header">
        <div class="sidebar-title">Управление</div>
        <div class="sidebar-label">Точный кий с подсказкой траектории</div>
      </div>
      <div class="controls">
        <button class="btn primary" id="btn-new-game">
          <span class="icon">●</span>
          Новая партия
        </button>
        <button class="btn" id="btn-restart-rack">
          <span class="icon">↻</span>
          Переставить шары
        </button>
        <button class="btn" id="btn-toggle-guide">
          <span class="icon">☼</span>
          Линия прицела: Вкл
        </button>
      </div>
      <div class="hint" id="hint">
        Потяните мышь от битка назад, чтобы задать силу и направление удара.
        Отпустите — чтобы сыграть. После фола поставьте биток мышью.
      </div>
    </section>
  `;

  // Toast
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <div class="toast-label" id="toast-label">INFO</div>
    <div id="toast-text">Готов к игре.</div>
  `;

  // Start overlay
  const startOverlay = document.createElement("div");
  startOverlay.className = "overlay visible";
  startOverlay.id = "overlay-start";
  startOverlay.innerHTML = `
    <div class="overlay-card">
      <div class="overlay-title">American Pool • 8-ball</div>
      <div class="overlay-subtitle">
        Два игрока за одним столом. Честная физика, мягкие борта, реалистичный прицел.
      </div>
      <ul class="overlay-list">
        <li>Игроки ходят по очереди, начинающий — Игрок 1.</li>
        <li>Группа (цель: «полные» или «полосатые») закрепляется за игроком,
            когда он первым забьёт шар своей группы после разбоя.</li>
        <li>Попадание по своим шарам — ход продолжается при забитом шаре, иначе ход переходит.</li>
        <li>Фолы: биток забит, промах по своим, удар не по тому шару после выбора группы.</li>
        <li>Восемь забивается последней. Неправильное или раннее забивание восьмого — поражение.</li>
        <li>После фола — «биток с руки», установите мышью перед ударом.</li>
      </ul>
      <div class="overlay-actions">
        <button class="btn" id="btn-start-cancel">Закрыть</button>
        <button class="btn primary" id="btn-start-game">
          <span class="icon">►</span>
          Играть
        </button>
      </div>
    </div>
  `;

  // Win overlay
  const winOverlay = document.createElement("div");
  winOverlay.className = "overlay";
  winOverlay.id = "overlay-win";
  winOverlay.innerHTML = `
    <div class="overlay-card">
      <div class="overlay-title" id="win-title">Победа!</div>
      <div class="overlay-subtitle" id="win-subtitle">
        Стильная партия. Готовы сыграть ещё?
      </div>
      <div class="overlay-actions">
        <button class="btn" id="btn-win-close">Закрыть</button>
        <button class="btn primary" id="btn-win-restart">
          <span class="icon">↻</span>
          Новая партия
        </button>
      </div>
    </div>
  `;

  root.appendChild(sidebar);
  root.appendChild(toast);
  document.body.appendChild(startOverlay);
  document.body.appendChild(winOverlay);

  bindings = {
    sidebar,
    toast,
    toastLabel: toast.querySelector("#toast-label") as HTMLElement,
    toastText: toast.querySelector("#toast-text") as HTMLElement,
    startOverlay,
    winOverlay,
    winOverlayTitle: winOverlay.querySelector("#win-title") as HTMLElement,
    winOverlaySubtitle: winOverlay.querySelector(
      "#win-subtitle"
    ) as HTMLElement,
    powerBar: sidebar.querySelector("#power-bar-inner") as HTMLElement,
    player1El: sidebar.querySelector('[data-player="1"]') as HTMLElement,
    player2El: sidebar.querySelector('[data-player="2"]') as HTMLElement,
    foulIndicator: sidebar.querySelector(
      "#foul-indicator"
    ) as HTMLElement,
    hintEl: sidebar.querySelector("#hint") as HTMLElement,
  };

  return bindings;
};

export const getUI = (): UIBindings => {
  if (!bindings) throw new Error("UI not initialized");
  return bindings;
};

export const bindUIEvents = (
  onNewGame: () => void,
  onRestartRack: () => void,
  onToggleGuide: () => void,
  onStartGame: () => void,
  onCloseStart: () => void,
  onWinRestart: () => void,
  onWinClose: () => void
) => {
  const b = getUI();

  (document.getElementById("btn-new-game") as HTMLButtonElement).onclick =
    (e) => {
      e.preventDefault();
      onNewGame();
    };

  (document.getElementById(
    "btn-restart-rack"
  ) as HTMLButtonElement).onclick = (e) => {
    e.preventDefault();
    onRestartRack();
  };

  (document.getElementById(
    "btn-toggle-guide"
  ) as HTMLButtonElement).onclick = (e) => {
    e.preventDefault();
    onToggleGuide();
    const btn = e.currentTarget as HTMLButtonElement;
    const isOn = btn.textContent?.includes("Вкл");
    btn.innerHTML = `<span class="icon">☼</span> Линия прицела: ${
      isOn ? "Выкл" : "Вкл"
    }`;
  };

  (document.getElementById(
    "btn-start-game"
  ) as HTMLButtonElement).onclick = (e) => {
    e.preventDefault();
    b.startOverlay.classList.remove("visible");
    onStartGame();
  };

  (document.getElementById(
    "btn-start-cancel"
  ) as HTMLButtonElement).onclick = (e) => {
    e.preventDefault();
    b.startOverlay.classList.remove("visible");
    onCloseStart();
  };

  (document.getElementById(
    "btn-win-restart"
  ) as HTMLButtonElement).onclick = (e) => {
    e.preventDefault();
    b.winOverlay.classList.remove("visible");
    onWinRestart();
  };

  (document.getElementById(
    "btn-win-close"
  ) as HTMLButtonElement).onclick = (e) => {
    e.preventDefault();
    b.winOverlay.classList.remove("visible");
    onWinClose();
  };
};

let toastHideTimeout: number | null = null;

export const showToast = (kind: ToastKind, message: string) => {
  const { toast, toastLabel, toastText } = getUI();

  toastLabel.textContent =
    kind === "success"
      ? "УДАР"
      : kind === "foul"
      ? "ФОЛ"
      : kind === "win"
      ? "ПОБЕДА"
      : "INFO";

  toastText.textContent = message;

  toast.classList.remove("visible");
  void toast.offsetWidth;

  toast.classList.add("visible");

  if (toastHideTimeout !== null) {
    window.clearTimeout(toastHideTimeout);
  }

  const duration =
    kind === "win" ? 4000 : kind === "foul" ? 2600 : 1800;

  toastHideTimeout = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, duration);
};

export const updatePowerBar = (power01: number) => {
  const { powerBar } = getUI();
  const label = document.getElementById(
    "power-label"
  ) as HTMLElement | null;
  const pct = Math.round(power01 * 100);
  powerBar.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
};

export const updateTurnIndicator = (
  currentPlayer: PlayerId,
  foul: boolean
) => {
  const labelText = document.getElementById(
    "turn-label-text"
  ) as HTMLElement;
  const { player1El, player2El, foulIndicator } = getUI();

  labelText.textContent =
    currentPlayer === 1 ? "Ход Игрока 1" : "Ход Игрока 2";

  player1El.classList.toggle("active", currentPlayer === 1);
  player2El.classList.toggle("active", currentPlayer === 2);

  if (foul) {
    foulIndicator.classList.add("visible");
  } else {
    foulIndicator.classList.remove("visible");
  }
};

export const updateScoreboard = (
  players: PlayerState[],
  balls: BallState[]
) => {
  for (const player of players) {
    const scoreEl = document.querySelector(
      `[data-player-score="${player.id}"]`
    ) as HTMLElement;
    const typeEl = document.querySelector(
      `[data-player-type="${player.id}"]`
    ) as HTMLElement;
    const ballsEl = document.querySelector(
      `[data-player-balls="${player.id}"]`
    ) as HTMLElement;

    if (!scoreEl || !typeEl || !ballsEl) continue;

    scoreEl.textContent = `${player.score}`;

    if (!player.assignedType) {
      typeEl.textContent = "нет группы";
      typeEl.style.color = "#9ca3af";
    } else if (player.assignedType === BallType.Solid) {
      typeEl.textContent = "полные";
      typeEl.style.color = "#22c55e";
    } else {
      typeEl.textContent = "полосатые";
      typeEl.style.color = "#38bdf8";
    }

    ballsEl.innerHTML = "";
    for (const id of player.pocketed) {
      const chip = document.createElement("div");
      chip.className = "ball-chip";
      chip.style.backgroundColor =
        BALL_COLORS[id] || "rgba(148,163,253,0.4)";
      ballsEl.appendChild(chip);
    }
  }
};

export const showWinOverlay = (
  winner: PlayerState,
  loser: PlayerState,
  reason: string
) => {
  const { winOverlay, winOverlayTitle, winOverlaySubtitle } = getUI();
  winOverlayTitle.textContent = `Победил ${winner.name}`;
  winOverlaySubtitle.textContent = `${reason}  •  Итоговый счёт: ${winner.score} : ${loser.score}`;
  winOverlay.classList.add("visible");
};

export const setHint = (text: string) => {
  const { hintEl } = getUI();
  hintEl.textContent = text;
};
