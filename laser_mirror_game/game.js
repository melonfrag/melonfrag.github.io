(() => {
  "use strict";

  const SIZE = 9;
  const BASES = {
    A: { x: 2, y: 2, label: "A" }, // 内部使用 0-based 坐标
    B: { x: 6, y: 6, label: "B" }
  };
  const DIRS = {
    up:    { dx: 0, dy: -1, glyph: "↑" },
    down:  { dx: 0, dy: 1, glyph: "↓" },
    left:  { dx: -1, dy: 0, glyph: "←" },
    right: { dx: 1, dy: 0, glyph: "→" }
  };

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");
  const state = {
    cells: [],
    current: "A",
    mode: "view",
    selectedMirror: "/",
    winner: null,
    laserPath: [],
    laserBusy: false,
    pendingChoice: null,
    gameMode: "two-player",
    aiThinking: false,
    requestCounter: 0,
    aiApplyingAction: false
  };

  function freshGame() {
    state.cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    state.current = "A";
    state.mode = "view";
    state.winner = null;
    state.laserPath = [];
    state.laserBusy = false;
    state.pendingChoice = null;
    state.aiThinking = false;
    state.cells[BASES.A.y][BASES.A.x] = { type: "base", owner: "A" };
    state.cells[BASES.B.y][BASES.B.x] = { type: "base", owner: "B" };
    render();
    setStatus(state.gameMode === "ai" ? "你执玩家 A。AI 将执玩家 B。" : "轮到玩家 A。可以放置镜子或发射激光。");
  }

  function startGame(mode = "two-player") {
    state.gameMode = mode;
    $("start-screen").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    freshGame();
  }

  function returnToMenu() {
    state.gameMode = "two-player";
    $("game-screen").classList.add("hidden");
    $("start-screen").classList.remove("hidden");
    $("choice-modal").classList.add("hidden");
    $("result-modal").classList.add("hidden");
  }

  function setStatus(message) {
    $("status-message").textContent = message;
  }

  function baseFor(player) { return BASES[player]; }
  function opponent(player) { return player === "A" ? "B" : "A"; }

  function adjacentOccupiedCount(player) {
    const b = baseFor(player);
    return [
      [b.x, b.y - 1], [b.x, b.y + 1], [b.x - 1, b.y], [b.x + 1, b.y]
    ].filter(([x, y]) => x >= 0 && x < SIZE && y >= 0 && y < SIZE && state.cells[y][x] !== null).length;
  }

  function isBaseNeighbour(x, y, player) {
    const b = baseFor(player);
    return (Math.abs(x - b.x) + Math.abs(y - b.y)) === 1;
  }

  function canPlace(x, y) {
    if (state.winner || state.laserBusy || state.cells[y][x] !== null) return false;
    for (const p of ["A", "B"]) {
      if (isBaseNeighbour(x, y, p) && adjacentOccupiedCount(p) >= 2) return false;
    }
    return true;
  }

  function placeMirror(x, y) {
    if (!state.aiApplyingAction && (state.aiThinking || (state.gameMode === "ai" && state.current === "B"))) return;
    if (!canPlace(x, y)) {
      setStatus("此处不能放置：格子已被占用，或会使基地周围占用格超过两个。");
      return;
    }
    state.cells[y][x] = { type: "mirror", owner: state.current, orientation: state.selectedMirror };
    finishTurn();
  }

  function finishTurn() {
    state.mode = "view";
    state.current = opponent(state.current);
    render();
    if (state.gameMode === "ai" && state.current === "B" && !state.winner) {
      state.aiThinking = true;
      render();
      setStatus("AI 正在分析棋盘……");
      window.setTimeout(runAITurn, 420);
    } else if (state.gameMode === "ai" && state.current === "A") {
      setStatus("轮到你了。");
    } else {
      setStatus(`轮到玩家 ${state.current}。`);
    }
  }

  function boardSnapshot() {
    return {
      boardSize: SIZE,
      currentPlayer: state.current,
      turnNumber: 1 + state.cells.flat().filter(c => c?.type === "mirror").length,
      bases: {
        A: { x: BASES.A.x + 1, y: BASES.A.y + 1 },
        B: { x: BASES.B.x + 1, y: BASES.B.y + 1 }
      },
      cells: state.cells.map(row => row.map(cell => cell ? { ...cell } : null)),
      rules: {
        maxOccupiedAdjacentToEachBase: 2,
        mirrorCanBePlacedOnce: true,
        ownMirrorChoices: ["reflect", "pass"],
        enemyMirrorBehavior: "reflect"
      }
    };
  }

  function makeAIRequest(type, extra = {}) {
    const request = {
      protocol: "laser-mirror-duel",
      version: "1.0",
      requestId: `lm-${Date.now()}-${++state.requestCounter}`,
      type,
      player: state.current,
      state: boardSnapshot(),
      ...extra
    };
    return request;
  }

  function legalAIActions() {
    const actions = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (canPlace(x, y)) {
        actions.push({ type: "place_mirror", x: x + 1, y: y + 1, orientation: "/" });
        actions.push({ type: "place_mirror", x: x + 1, y: y + 1, orientation: "\\" });
      }
    }
    for (const direction of Object.keys(DIRS)) actions.push({ type: "fire_laser", direction });
    return actions;
  }

  async function callAI(method, request) {
    const adapter = window.LaserAIAdapter || window.LaserMirrorAI;
    if (!adapter || typeof adapter[method] !== "function") throw new Error(`AI adapter missing ${method}().`);
    const response = await adapter[method](request);
    return window.LaserAIProtocol.validateResponse(response, request);
  }

  async function runAITurn() {
    if (state.current !== "B" || state.winner || state.gameMode !== "ai") return;
    const request = makeAIRequest("decide", { legalActions: legalAIActions() });
    try {
      let action;
      try {
        action = await callAI("decide", request);
      } catch (externalError) {
        console.warn("External AI failed; falling back to built-in AI.", externalError);
        if (window.LaserAIAdapter && window.LaserAIAdapter !== window.LaserMirrorAI) {
          action = await window.LaserAIProtocol.validateResponse(
            await window.LaserMirrorAI.decide(request), request
          );
        } else throw externalError;
      }
      state.aiThinking = false;
      if (action.type === "place_mirror") {
        state.selectedMirror = action.orientation;
        state.aiApplyingAction = true;
        placeMirror(action.x - 1, action.y - 1);
        state.aiApplyingAction = false;
      } else {
        render();
        await fireLaser(action.direction);
      }
    } catch (error) {
      state.aiThinking = false;
      render();
      setStatus(`AI 决策失败：${error.message}。请重试或返回主菜单。`);
      console.error(error);
    }
  }

  async function chooseAIMirror(x, y, direction) {
    const request = makeAIRequest("resolve_mirror", {
      laser: {
        position: { x: x + 1, y: y + 1 },
        direction: { dx: direction.dx, dy: direction.dy },
        path: state.laserPath.map(([px, py]) => ({ x: px + 1, y: py + 1 })),
        mirror: { owner: state.current, orientation: state.cells[y][x].orientation }
      },
      legalActions: [{ choice: "reflect" }, { choice: "pass" }]
    });
    try {
      return (await callAI("resolveMirror", request)).choice;
    } catch (error) {
      console.warn("AI mirror choice failed; using pass as safe fallback.", error);
      return "pass";
    }
  }

  function reflectDirection(dir, orientation) {
    // 坐标系 y 向下：/ 关于斜率 -1 的直线反射；\\ 关于斜率 +1 的直线反射
    if (orientation === "/") return { dx: -dir.dy, dy: -dir.dx };
    return { dx: dir.dy, dy: dir.dx };
  }

  async function fireLaser(directionName) {
    if (state.winner || state.laserBusy || state.aiThinking) return;
    const shooter = state.current;
    const base = baseFor(shooter);
    let dir = { dx: DIRS[directionName].dx, dy: DIRS[directionName].dy };
    let x = base.x + dir.dx;
    let y = base.y + dir.dy;
    const visitedStates = new Set();
    state.laserBusy = true;
    state.mode = "view";
    state.laserPath = [[base.x, base.y]];
    render();
    setStatus(`玩家 ${shooter} 发射激光……`);

    while (inside(x, y)) {
      const key = `${x},${y},${dir.dx},${dir.dy}`;
      if (visitedStates.has(key)) {
        setStatus("激光进入循环路径，本次发射结束。");
        break;
      }
      visitedStates.add(key);
      state.laserPath.push([x, y]);
      render();
      await delay(115);

      const cell = state.cells[y][x];
      if (cell && cell.type === "base") {
        if (cell.owner !== shooter) {
          state.winner = shooter;
          state.laserBusy = false;
          render();
          showResult(shooter);
          return;
        }
        setStatus("激光返回己方基地，本次发射结束。");
        break;
      }

      if (cell && cell.type === "mirror") {
        if (cell.owner !== shooter) {
          dir = reflectDirection(dir, cell.orientation);
        } else {
          const choice = state.gameMode === "ai" && shooter === "B"
            ? await chooseAIMirror(x, y, dir)
            : await askMirrorChoice();
          if (choice === "reflect") dir = reflectDirection(dir, cell.orientation);
        }
      }
      x += dir.dx;
      y += dir.dy;
    }

    if (!state.winner && !inside(x, y)) setStatus("激光离开棋盘，本次攻击结束。");
    state.laserBusy = false;
    render();
    if (!state.winner) finishTurn();
  }

  function inside(x, y) { return x >= 0 && x < SIZE && y >= 0 && y < SIZE; }
  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function askMirrorChoice() {
    return new Promise(resolve => {
      state.pendingChoice = resolve;
      $("choice-modal").classList.remove("hidden");
    });
  }

  function resolveMirrorChoice(choice) {
    $("choice-modal").classList.add("hidden");
    if (state.pendingChoice) {
      const resolve = state.pendingChoice;
      state.pendingChoice = null;
      resolve(choice);
    }
  }

  function showResult(winner) {
    $("result-title").textContent = `玩家 ${winner} 获胜！`;
    $("result-description").textContent = `玩家 ${winner} 的激光成功击中玩家 ${opponent(winner)} 的基地。`;
    $("result-modal").classList.remove("hidden");
  }

  function render() {
    $("turn-name").textContent = `玩家 ${state.current}`;
    $("turn-name").style.color = state.current === "A" ? "var(--mint)" : "var(--orange)";
    $("turn-hint").textContent = state.winner ? "游戏结束" :
      state.aiThinking ? "AI 正在思考，请稍候" :
      state.gameMode === "ai" ? (state.current === "A" ? "你执玩家 A，AI 执玩家 B" : "AI 回合") :
      state.mode === "place" ? "点击一个合法空格放置镜子" : "选择放置镜子或发射激光";
    document.querySelectorAll("#place-mode-btn, [data-dir], .mirror-choice").forEach(el => {
      el.disabled = state.aiThinking || state.laserBusy || state.winner ||
        (state.gameMode === "ai" && state.current === "B");
    });
    $("place-mode-btn").textContent = state.mode === "place" ? "取消放置模式" : "进入放置模式";
    $("place-mode-btn").classList.toggle("active", state.mode === "place");

    boardEl.innerHTML = "";
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const cell = state.cells[y][x];
        const el = document.createElement("button");
        el.type = "button";
        el.className = "cell";
        el.setAttribute("role", "gridcell");
        el.setAttribute("aria-label", `坐标 ${x + 1},${y + 1}`);
        if (!cell) el.classList.add("empty");
        if (state.laserPath.some(([px, py]) => px === x && py === y)) el.classList.add("laser-path");
        if (cell?.type === "base") {
          el.classList.add(cell.owner === "A" ? "base-a" : "base-b");
          el.innerHTML = `<span class="base-label">${cell.owner}</span>`;
        } else if (cell?.type === "mirror") {
          el.classList.add(cell.owner === "A" ? "mirror-a" : "mirror-b");
          el.classList.add(cell.orientation === "/" ? "orientation-slash" : "orientation-backslash");
          el.setAttribute("aria-label", `玩家 ${cell.owner} 的 ${cell.orientation === "/" ? "斜杠" : "反斜杠"}镜子`);
          el.title = `玩家 ${cell.owner} 的镜子 ${cell.orientation}`;
        } else if (state.mode === "place" && canPlace(x, y)) {
          el.classList.add("placeable");
        }
        if (state.mode === "place" && !cell &&
            !(state.gameMode === "ai" && state.current === "B") && !state.aiThinking) {
          el.addEventListener("click", () => placeMirror(x, y));
        }
        boardEl.appendChild(el);
      }
    }

    if (state.laserPath.length > 1) {
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("class", "laser-overlay");
      svg.setAttribute("viewBox", `0 0 ${SIZE * 100} ${SIZE * 100}`);
      svg.setAttribute("preserveAspectRatio", "none");
      for (let i = 1; i < state.laserPath.length; i++) {
        const [x1, y1] = state.laserPath[i - 1];
        const [x2, y2] = state.laserPath[i];
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", (x1 + 0.5) * 100);
        line.setAttribute("y1", (y1 + 0.5) * 100);
        line.setAttribute("x2", (x2 + 0.5) * 100);
        line.setAttribute("y2", (y2 + 0.5) * 100);
        line.setAttribute("class", i < state.laserPath.length - 1 ? "laser-segment complete" : "laser-segment");
        line.style.setProperty("--segment-length", "100");
        svg.appendChild(line);
      }
      boardEl.appendChild(svg);
    }
  }

  function setupAxes() {
    $("axis-top").innerHTML = Array.from({ length: SIZE }, (_, i) => `<span>${i + 1}</span>`).join("");
    $("axis-left").innerHTML = Array.from({ length: SIZE }, (_, i) => `<span>${i + 1}</span>`).join("");
  }

  $("two-player-btn").addEventListener("click", () => startGame("two-player"));
  $("ai-mode-btn").addEventListener("click", () => startGame("ai"));
  $("restart-btn").addEventListener("click", returnToMenu);
  $("play-again-btn").addEventListener("click", () => {
    $("result-modal").classList.add("hidden");
    freshGame();
  });
  $("result-menu-btn").addEventListener("click", returnToMenu);
  $("reflect-btn").addEventListener("click", () => resolveMirrorChoice("reflect"));
  $("pass-btn").addEventListener("click", () => resolveMirrorChoice("pass"));

  document.querySelectorAll(".mirror-choice").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedMirror = button.dataset.mirror === "slash" ? "/" : "\\";
      document.querySelectorAll(".mirror-choice").forEach(b => b.classList.toggle("selected", b === button));
    });
  });

  $("place-mode-btn").addEventListener("click", () => {
    if (state.winner || state.laserBusy || state.aiThinking || (state.gameMode === "ai" && state.current === "B")) return;
    state.mode = state.mode === "place" ? "view" : "place";
    render();
    setStatus(state.mode === "place" ? "请选择棋盘上的合法空格放置镜子。" : "已取消放置模式。");
  });

  document.querySelectorAll("[data-dir]").forEach(button => {
    button.addEventListener("click", () => {
      if (state.aiThinking || (state.gameMode === "ai" && state.current === "B")) return;
      if (state.mode === "place") {
        setStatus("请先取消放置模式，再发射激光。");
        return;
      }
      fireLaser(button.dataset.dir);
    });
  });

  setupAxes();
  freshGame();
})();
