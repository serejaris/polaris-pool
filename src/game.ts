
import {
  AimState,
  BallState,
  BallType,
  GameConfig,
  PlayerId,
  PlayerState,
  TurnResultType,
  TurnSummary,
} from "./definitions";
import {
  createDefaultConfig,
  createInitialBalls,
  createPockets,
} from "./entities";
import {
  applyPhysicsStep,
  clamp,
  deepCloneBalls,
  length,
  normalize,
} from "./utils";
import {
  bindUIEvents,
  initUI,
  setHint,
  showToast,
  showWinOverlay,
  updatePowerBar,
  updateScoreboard,
  updateTurnIndicator,
} from "./ui";

export interface Game {
  start: () => void;
}

interface InternalState {
  cfg: GameConfig;
  balls: BallState[];
  pockets: { x: number; y: number; radius: number }[];
  players: PlayerState[];
  currentPlayerId: PlayerId;
  guideEnabled: boolean;
  isSimulating: boolean;
  pendingFoulBallInHand: boolean;
  cueBallId: number;
  lastTime: number;
  aim: AimState;
  allowInput: boolean;
  firstHitBallId: number | null;
  pocketedThisTurn: number[];
  eightBallPocketedThisTurn: boolean;
  winnerDeclared: boolean;
}

export const createGame = (canvas: HTMLCanvasElement): Game => {
  // Initialize UI (sidebar, overlays, toast)
  initUI();

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  const cfg = createDefaultConfig();
  const pockets = createPockets(cfg);

  let state: InternalState = createFreshState();

  function createFreshState(): InternalState {
    const balls = createInitialBalls(cfg);
    const players: PlayerState[] = [
      {
        id: 1,
        name: "Игрок 1",
        assignedType: null,
        pocketed: [],
        score: 0,
      },
      {
        id: 2,
        name: "Игрок 2",
        assignedType: null,
        pocketed: [],
        score: 0,
      },
    ];
    return {
      cfg,
      balls,
      pockets,
      players,
      currentPlayerId: 1,
      guideEnabled: true,
      isSimulating: false,
      pendingFoulBallInHand: false,
      cueBallId: 0,
      lastTime: performance.now(),
      aim: {
        isAiming: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        power: 0,
      },
      allowInput: true,
      firstHitBallId: null,
      pocketedThisTurn: [],
      eightBallPocketedThisTurn: false,
      winnerDeclared: false,
    };
  }

  const getCueBall = (): BallState =>
    state.balls.find((b) => b.id === state.cueBallId)!;

  const respawnCueBallIfPocketed = () => {
    const cue = getCueBall();
    if (!cue.inPocket) return;
    const { width, height } = cfg.table;
    cue.inPocket = false;
    cue.vx = 0;
    cue.vy = 0;
    cue.x = width * 0.25;
    cue.y = height / 2;
  };

  const newGame = () => {
    state = createFreshState();
    showToast("info", "Новая партия. Игрок 1 начинает с разбития. Удачи!");
    updateScoreboard(state.players, state.balls);
    updateTurnIndicator(state.currentPlayerId, false);
    setHint(
      "Потяните мышь от битка назад, чтобы задать силу и направление. Отпустите — чтобы сыграть."
    );
  };

  const resetRack = () => {
    const cueBall = getCueBall();
    const newBalls = createInitialBalls(cfg);
    const cueNew = newBalls.find((b) => b.id === 0)!;

    // Keep existing cue-ball object, so references remain valid
    cueBall.x = cueNew.x;
    cueBall.y = cueNew.y;
    cueBall.vx = 0;
    cueBall.vy = 0;
    cueBall.inPocket = false;

    const othersNew = newBalls.filter((b) => b.id !== 0);
    state.balls = [cueBall, ...othersNew];

    state.currentPlayerId = 1;
    state.players.forEach((p) => {
      p.assignedType = null;
      p.pocketed = [];
      p.score = 0;
    });

    state.pendingFoulBallInHand = false;
    state.firstHitBallId = null;
    state.pocketedThisTurn = [];
    state.eightBallPocketedThisTurn = false;
    state.winnerDeclared = false;

    showToast("info", "Шары переставлены. Новое разбитие.");
    updateScoreboard(state.players, state.balls);
    updateTurnIndicator(state.currentPlayerId, false);
    setHint(
      "Разбитие: наведите на биток, потяните назад и отпустите для удара."
    );
  };

  const toggleGuide = () => {
    state.guideEnabled = !state.guideEnabled;
    setHint(
      state.guideEnabled
        ? "Линия прицела включена. Потяните мышь от битка назад."
        : "Линия прицела выключена. Ориентируйтесь по положению мыши."
    );
  };

  const markFirstHit = (ballId: number) => {
    if (state.firstHitBallId === null) {
      state.firstHitBallId = ballId;
    }
  };

  const markPocketed = (ballId: number) => {
    state.pocketedThisTurn.push(ballId);
    if (ballId === 8) {
      state.eightBallPocketedThisTurn = true;
    }
  };

  const getBallType = (id: number): BallType => {
    const ball = state.balls.find((b) => b.id === id);
    return ball?.type ?? BallType.Cue;
  };

  const countRemainingGroupBalls = (
    type: BallType.Solid | BallType.Stripe
  ): number =>
    state.balls.filter((b) => b.type === type && !b.inPocket).length;

  const handleTurnEnd = (): TurnSummary => {
    const { players } = state;
    const current = players.find((p) => p.id === state.currentPlayerId)!;
    const opponent = players.find((p) => p.id !== state.currentPlayerId)!;

    let foul = false;
    let foulReason = "";
    let winnerId: PlayerId | undefined;
    const ballsPocketed = [...state.pocketedThisTurn];

    const cuePocketed = ballsPocketed.includes(state.cueBallId);
    if (cuePocketed) {
      foul = true;
      foulReason = "биток забит";
    }

    const eightPocketed = state.eightBallPocketedThisTurn;
    const nonCuePocketed = ballsPocketed.filter((id) => id !== state.cueBallId);

    // Assign groups on first scoring shot
    if (!current.assignedType && !opponent.assignedType) {
      const solids = nonCuePocketed.filter(
        (id) => getBallType(id) === BallType.Solid
      );
      const stripes = nonCuePocketed.filter(
        (id) => getBallType(id) === BallType.Stripe
      );
      if (solids.length || stripes.length) {
        if (solids.length > stripes.length) {
          current.assignedType = BallType.Solid;
          opponent.assignedType = BallType.Stripe;
          showToast(
            "success",
            `${current.name}: полные • ${opponent.name}: полосатые`
          );
        } else if (stripes.length > solids.length) {
          current.assignedType = BallType.Stripe;
          opponent.assignedType = BallType.Solid;
          showToast(
            "success",
            `${current.name}: полосатые • ${opponent.name}: полные`
          );
        }
      }
    }

    // Track pocketed balls to players
    for (const id of nonCuePocketed) {
      const type = getBallType(id);
      if (type === BallType.Solid || type === BallType.Stripe) {
        if (current.assignedType === type) {
          current.pocketed.push(id);
          current.score++;
        } else if (opponent.assignedType === type) {
          opponent.pocketed.push(id);
          opponent.score++;
        }
      }
    }

    const allCurrentGroupDown =
      !!current.assignedType &&
      countRemainingGroupBalls(current.assignedType) === 0;

    // First-hit rule
    if (!foul && state.firstHitBallId !== null) {
      const firstType = getBallType(state.firstHitBallId);

      if (eightPocketed) {
        // 8-ball shot
        if (!allCurrentGroupDown) {
          foul = true;
          foulReason = "ранний удар по восьмому шару — поражение";
          winnerId = opponent.id;
        } else if (
          firstType !== current.assignedType &&
          firstType !== BallType.Eight
        ) {
          foul = true;
          foulReason =
            "неверное первое касание перед забитием восьмого — поражение";
          winnerId = opponent.id;
        }
      } else {
        // Normal shot
        if (!current.assignedType) {
          if (firstType === BallType.Eight) {
            foul = true;
            foulReason = "первое касание — восьмой шар до выбора группы";
          }
        } else {
          if (firstType !== current.assignedType) {
            foul = true;
            foulReason = "первое касание не своим шаром";
          }
        }
      }
    }

    // 8-ball pocket evaluation if no winner yet
    if (!winnerId && eightPocketed) {
      if (!allCurrentGroupDown) {
        winnerId = opponent.id;
        foul = true;
        foulReason = "восьмой забит до всех своих шаров — поражение";
      } else if (foul) {
        winnerId = opponent.id;
      } else {
        winnerId = current.id;
      }
    }

    // Turn continuity
    let turnKeeps = false;
    if (!winnerId && !foul) {
      const ownPocketed = nonCuePocketed.some(
        (id) => getBallType(id) === current.assignedType
      );
      if (ownPocketed) {
        turnKeeps = true;
      }
    }

    // Ball in hand
    if (foul && !winnerId) {
      state.pendingFoulBallInHand = true;
      respawnCueBallIfPocketed();
    }

    updateScoreboard(state.players, state.balls);

    if (winnerId) {
      state.winnerDeclared = true;
      const winner = players.find((p) => p.id === winnerId)!;
      const loser = players.find((p) => p.id !== winnerId)!;
      const reason =
        winnerId === current.id && eightPocketed && !foul
          ? "Чистое забитие восьмого шара."
          : foulReason || "Стратегическая победа.";
      showToast("win", `${winner.name} побеждает! ${reason}`);
      showWinOverlay(winner, loser, reason);
      return {
        type: TurnResultType.GameWon,
        message: reason,
        winnerId,
        ballsPocketed,
      };
    }

    if (foul) {
      showToast(
        "foul",
        `Фол: ${foulReason || "нарушение правил"}. Биток с руки у соперника.`
      );
      setHint(
        "Фол. Переместите биток мышью в безопасную позицию и выполните удар."
      );
    } else if (turnKeeps) {
      showToast("success", "Вы продолжаете ход — точный удар!");
      setHint("Ваш ход продолжается. Найдите выгодный следующий удар.");
    } else {
      showToast("info", "Ход переходит сопернику.");
      setHint(
        "Смена хода. Новый игрок: наведите на биток, потяните назад и ударьте."
      );
    }

    return {
      type: foul ? TurnResultType.Foul : TurnResultType.Normal,
      message: foul
        ? foulReason || "Фол"
        : turnKeeps
        ? "Ход остаётся"
        : "Ход переходит",
      foulReason: foul ? foulReason : undefined,
      turnKeeps,
      ballsPocketed,
    };
  };

  const endTurnAndSwitchIfNeeded = () => {
    const summary = handleTurnEnd();

    if (summary.type === TurnResultType.GameWon) {
      state.allowInput = false;
      return;
    }

    if (!summary.turnKeeps) {
      state.currentPlayerId = state.currentPlayerId === 1 ? 2 : 1;
    }

    state.firstHitBallId = null;
    state.pocketedThisTurn = [];
    state.eightBallPocketedThisTurn = false;

    updateTurnIndicator(
      state.currentPlayerId,
      state.pendingFoulBallInHand
    );
  };

  // Input state
  const inputState = {
    mouseX: 0,
    mouseY: 0,
    isMouseDown: false,
  };

  const screenToTable = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = cfg.table.width / rect.width;
    const scaleY = cfg.table.height / rect.height;
    return {
      x: (x - rect.left) * scaleX,
      y: (y - rect.top) * scaleY,
    };
  };

  const onMouseDown = (e: MouseEvent) => {
    if (!state.allowInput || state.isSimulating || state.winnerDeclared) {
      return;
    }

    const { x, y } = screenToTable(e.clientX, e.clientY);
    inputState.isMouseDown = true;
    inputState.mouseX = x;
    inputState.mouseY = y;

    const cue = getCueBall();

    if (state.pendingFoulBallInHand) {
      // Place cue ball with click
      cue.x = clamp(
        x,
        cfg.table.railThickness + cue.radius,
        cfg.table.width - cfg.table.railThickness - cue.radius
      );
      cue.y = clamp(
        y,
        cfg.table.railThickness + cue.radius,
        cfg.table.height - cfg.table.railThickness - cue.radius
      );
      cue.inPocket = false;
      state.pendingFoulBallInHand = false;
      updateTurnIndicator(state.currentPlayerId, false);
      showToast("info", "Биток установлен. Прицеливайтесь и бейте.");
      return;
    }

    // Start aiming if click near cue ball
    const dx = x - cue.x;
    const dy = y - cue.y;
    const dist = length(dx, dy);
    if (dist <= cue.radius * 2.4) {
      state.aim.isAiming = true;
      state.aim.startX = cue.x;
      state.aim.startY = cue.y;
      state.aim.currentX = x;
      state.aim.currentY = y;
      state.aim.power = 0;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    const { x, y } = screenToTable(e.clientX, e.clientY);
    inputState.mouseX = x;
    inputState.mouseY = y;

    if (state.aim.isAiming) {
      state.aim.currentX = x;
      state.aim.currentY = y;

      const dx = state.aim.startX - x;
      const dy = state.aim.startY - y;
      const dist = length(dx, dy);
      const power = clamp(dist / 260, 0, state.cfg.maxShotPower);
      state.aim.power = power;
      updatePowerBar(power);
    }
  };

  const onMouseUp = () => {
    inputState.isMouseDown = false;

    if (state.aim.isAiming) {
      const cue = getCueBall();
      const dx = cue.x - state.aim.currentX;
      const dy = cue.y - state.aim.currentY;
      const dir = normalize(dx, dy);
      const power = state.aim.power;

      if (power > 0.02 && dir.len > 0.01) {
        const speed = power * state.cfg.powerToVelocity;
        cue.vx = dir.x * speed;
        cue.vy = dir.y * speed;

        state.isSimulating = true;
        state.allowInput = false;
        state.firstHitBallId = null;
        state.pocketedThisTurn = [];
        state.eightBallPocketedThisTurn = false;

        showToast(
          "success",
          "Удар выполнен. Ждём, пока шары остановятся..."
        );
      }

      state.aim.isAiming = false;
      state.aim.power = 0;
      updatePowerBar(0);
    }
  };

  const attachInput = () => {
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const detachInput = () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  // Rendering helpers

  const drawTable = () => {
    const { width, height, railThickness, pocketRadius } = cfg.table;

    // Ensure canvas scaled to table
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background (subtle)
    ctx.fillStyle = "#020204";
    ctx.fillRect(0, 0, width, height);

    // Wooden rail
    ctx.fillStyle = "#3b2714";
    ctx.fillRect(0, 0, width, height);

    // Inner felt
    const innerX = railThickness;
    const innerY = railThickness;
    const innerW = width - railThickness * 2;
    const innerH = height - railThickness * 2;

    const feltGradient = ctx.createLinearGradient(
      innerX,
      innerY,
      innerX,
      innerY + innerH
    );
    feltGradient.addColorStop(0, "#15803d");
    feltGradient.addColorStop(1, "#065f46");
    ctx.fillStyle = feltGradient;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Soft vignette
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      50,
      width / 2,
      height / 2,
      width / 1.1
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = vignette;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Center line
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(width * 0.5, innerY + 10);
    ctx.lineTo(width * 0.5, innerY + innerH - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pockets
    const pocketColor = "#020204";
    for (const p of pockets) {
      const grad = ctx.createRadialGradient(
        p.x,
        p.y,
        4,
        p.x,
        p.y,
        p.radius
      );
      grad.addColorStop(0, "rgba(17,24,39,0.9)");
      grad.addColorStop(1, "#020204");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pocketColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius - 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rail inner bevel
    ctx.strokeStyle = "rgba(148,163,253,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      innerX + 2,
      innerY + 2,
      innerW - 4,
      innerH - 4
    );
  };

  const drawBall = (ball: BallState) => {
    if (ball.inPocket) return;
    const { x, y, radius, color, secondaryColor, type } =
      ball;

    // Shadow
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.ellipse(
      x + 2,
      y + radius * 0.55,
      radius * 0.9,
      radius * 0.55,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    // Base sphere
    const grad = ctx.createRadialGradient(
      x - radius * 0.4,
      y - radius * 0.6,
      radius * 0.2,
      x,
      y,
      radius * 1.1
    );
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.14, color);
    grad.addColorStop(1, "#020617");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Stripes
    if (type === BallType.Stripe && secondaryColor) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.96, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = secondaryColor;
      ctx.fillRect(
        x - radius * 1.2,
        y - radius * 0.4,
        radius * 2.4,
        radius * 0.8
      );
      ctx.restore();
    }

    // Cue ball special (subtle)
    if (type === BallType.Cue) {
      ctx.fillStyle = "rgba(15,23,42,0.18)";
      ctx.beginPath();
      ctx.arc(
        x - radius * 0.35,
        y - radius * 0.55,
        radius * 0.35,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Number circle
    if (type !== BallType.Cue) {
      ctx.save();
      ctx.fillStyle =
        type === BallType.Eight ? "#111827" : "#f9fafb";
      ctx.beginPath();
      ctx.arc(
        x - radius * 0.06,
        y - radius * 0.05,
        radius * 0.5,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle =
        type === BallType.Eight ? "#f9fafb" : "#111827";
      ctx.font = `${radius * 0.9}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${ball.id}`,
        x - radius * 0.06,
        y - radius * 0.05
      );
      ctx.restore();
    }
  };

  const drawAimGuide = () => {
    if (!state.guideEnabled || !state.aim.isAiming) return;

    const cue = getCueBall();
    if (cue.inPocket) return;

    const dx = cue.x - state.aim.currentX;
    const dy = cue.y - state.aim.currentY;
    const dir = normalize(dx, dy);
    if (!dir.len) return;

    const maxLen = state.cfg.aimLineMaxLength;
    const endX = cue.x + dir.x * maxLen;
    const endY = cue.y + dir.y * maxLen;

    // Main line
    ctx.save();
    ctx.strokeStyle = "rgba(248,250,252,0.14)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Glowing overlay
    ctx.strokeStyle = "rgba(245,197,66,0.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.restore();
  };

  const render = () => {
    drawTable();
    for (const ball of state.balls) {
      drawBall(ball);
    }
    drawAimGuide();
  };

  // Collision instrumentation for first-hit detection
  const detectFirstHitAndPockets = (
    prevBalls: BallState[],
    nextBalls: BallState[]
  ) => {
    const cuePrev = prevBalls.find((b) => b.id === state.cueBallId)!;
    const cueNext = nextBalls.find((b) => b.id === state.cueBallId)!;

    for (const prev of prevBalls) {
      const next = nextBalls.find((b) => b.id === prev.id)!;

      // Pocket detection (transition to inPocket)
      if (!prev.inPocket && next.inPocket) {
        markPocketed(next.id);
      }

      // First contact detection
      if (
        state.firstHitBallId === null &&
        prev.id !== state.cueBallId &&
        !prev.inPocket &&
        !next.inPocket
      ) {
        const beforeDx = prev.x - cuePrev.x;
        const beforeDy = prev.y - cuePrev.y;
        const afterDx = next.x - cueNext.x;
        const afterDy = next.y - cueNext.y;
        const beforeDist = Math.sqrt(
          beforeDx * beforeDx + beforeDy * beforeDy
        );
        const afterDist = Math.sqrt(
          afterDx * afterDx + afterDy * afterDy
        );
        const radiusSum = prev.radius + cuePrev.radius;

        if (beforeDist > radiusSum && afterDist <= radiusSum + 0.5) {
          markFirstHit(prev.id);
        }
      }
    }
  };

  // Game loop
  const step = (time: number) => {
    const dt = Math.min((time - state.lastTime) / 1000, 0.033);
    state.lastTime = time;

    if (state.isSimulating) {
      const before = deepCloneBalls(state.balls);

      const { anyMoving } = applyPhysicsStep(
        state.balls,
        state.cfg,
        state.pockets,
        dt
      );

      detectFirstHitAndPockets(before, state.balls);

      if (!anyMoving) {
        state.isSimulating = false;
        state.allowInput = !state.winnerDeclared;
        endTurnAndSwitchIfNeeded();
      }
    }

    render();
    requestAnimationFrame(step);
  };

  // Hook up UI buttons
  bindUIEvents(
    () => {
      // New game
      newGame();
    },
    () => {
      // Restart rack
      resetRack();
    },
    () => {
      // Toggle guide
      toggleGuide();
    },
    () => {
      // Start game from overlay
      newGame();
    },
    () => {
      // Close start overlay without reset
      showToast(
        "info",
        "Вы можете начать играть. Разбейте пирамиду первым ударом."
      );
    },
    () => {
      // Win overlay restart
      newGame();
    },
    () => {
      // Win overlay close
      showToast(
        "info",
        "Партия завершена. Нажмите «Новая партия», чтобы сыграть ещё."
      );
    }
  );

  return {
    start: () => {
      attachInput();
      updateScoreboard(state.players, state.balls);
      updateTurnIndicator(state.currentPlayerId, false);
      setHint(
        "Добро пожаловать в American Pool. Нажмите «Играть» или просто начните с разбития."
      );
      state.lastTime = performance.now();
      requestAnimationFrame(step);
    },
  };
};
