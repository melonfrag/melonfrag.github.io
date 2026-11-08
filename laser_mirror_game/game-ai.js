/* Laser Mirror Duel - Strategic built-in AI v2.
 * Strategy:
 *  - Treat every laser state as (cell, direction); reflections are reversible.
 *  - At a mirror owned by the shooter, consider BOTH legal choices (reflect/pass).
 *  - At an opponent-owned mirror, reflection is mandatory.
 *  - Score every legal placement from BOTH players' perspectives. A mirror is
 *    evaluated as our controllable mirror for B and a mandatory reflector for A.
 */
(() => {
  "use strict";
  const P = window.LaserAIProtocol;
  const SIZE = 9;
  const DIRS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 }
  };
  const DIR_LIST = Object.entries(DIRS);
  const opponent = p => p === "A" ? "B" : "A";
  const inside = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  const keyOf = (x, y, dx, dy) => `${x},${y},${dx},${dy}`;
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function reflect(d, orientation) {
    // In screen coordinates (+y downward), both mirror transforms are involutions:
    // reflect(reflect(d, mirror), mirror) === d.
    return orientation === "/"
      ? { dx: -d.dy, dy: -d.dx }
      : { dx: d.dy, dy: d.dx };
  }

  function cloneWithMirror(snapshot, action, owner) {
    const cells = snapshot.cells.map(row => row.map(cell => cell ? { ...cell } : null));
    cells[action.y - 1][action.x - 1] = {
      type: "mirror", owner, orientation: action.orientation
    };
    return { ...snapshot, cells };
  }

  /*
   * Explore all physically/legal ray continuations from a base.
   * `forcedFirst` is used when deciding whether to reflect or pass at the
   * currently-hit own mirror. `start` and `initial` use 1-based coordinates.
   */
  function trace(snapshot, shooter, start, initial, options = {}) {
    const targetOwner = opponent(shooter);
    const target = snapshot.bases[targetOwner];
    const ownBase = snapshot.bases[shooter];
    const queue = [{
      x: start.x - 1 + initial.dx,
      y: start.y - 1 + initial.dy,
      dx: initial.dx, dy: initial.dy, distance: 1,
      closest: Infinity
    }];
    const seen = new Set();
    let bestHit = Infinity;
    let bestClosest = Infinity;
    let explored = 0;
    let bestEscapeDistance = Infinity;

    for (let head = 0; head < queue.length; head++) {
      const n = queue[head];
      if (!inside(n.x, n.y)) continue;
      const k = keyOf(n.x, n.y, n.dx, n.dy);
      if (seen.has(k)) continue;
      seen.add(k);
      explored++;

      const distToTarget = Math.abs(n.x - (target.x - 1)) +
                           Math.abs(n.y - (target.y - 1));
      if (distToTarget < bestClosest) bestClosest = distToTarget;

      const cell = snapshot.cells[n.y][n.x];
      if (cell?.type === "base") {
        if (cell.owner === targetOwner) bestHit = Math.min(bestHit, n.distance);
        continue;
      }

      const push = d => queue.push({
        x: n.x + d.dx, y: n.y + d.dy, dx: d.dx, dy: d.dy,
        distance: n.distance + 1
      });

      if (cell?.type === "mirror") {
        if (cell.owner === shooter) {
          // A player's own mirror is a genuine decision point, not a fixed optic.
          push(n);
          push(reflect(n, cell.orientation));
        } else {
          // Opponent-owned mirrors always reflect.
          push(reflect(n, cell.orientation));
        }
      } else {
        push(n);
      }
    }

    // Distances are measured in grid steps. `bestHit` is the tactical result;
    // `bestClosest` is a weak positional signal if no winning path exists.
    return {
      hitDistance: Number.isFinite(bestHit) ? bestHit : null,
      closest: Number.isFinite(bestClosest) ? bestClosest : SIZE * 2,
      states: explored,
      routePotential: Number.isFinite(bestHit)
        ? 1 / (bestHit + 1)
        : 0
    };
  }

  function analyzePlayer(snapshot, player) {
    const base = snapshot.bases[player];
    const directions = DIR_LIST.map(([name, d]) => {
      const result = trace(snapshot, player, base, d);
      return { direction: name, ...result };
    });
    const reachable = directions.filter(x => x.hitDistance !== null);
    const shortest = reachable.length
      ? Math.min(...reachable.map(x => x.hitDistance))
      : null;
    const routeCount = reachable.length;
    const routeQuality = reachable.reduce((sum, r) => sum + 1 / (r.hitDistance + 1), 0);
    const bestNear = Math.min(...directions.map(x => x.closest));
    return {
      directions, shortest, routeCount, routeQuality, bestNear,
      // Multiple independent firing directions matter: the opponent cannot
      // defend every approach with a single mirror placement.
      value: (shortest === null ? 0 : 240 / (shortest + 2)) +
             routeQuality * 42 +
             Math.max(0, 4 - bestNear) * 2.5 +
             routeCount * 7
    };
  }

  function immediateWinningAction(snapshot, player) {
    const analysis = analyzePlayer(snapshot, player);
    const winning = analysis.directions
      .filter(x => x.hitDistance !== null)
      .sort((a, b) => a.hitDistance - b.hitDistance);
    return winning.length
      ? { type: "fire_laser", direction: winning[0].direction }
      : null;
  }

  function placementScore(snapshot, action, player) {
    const beforeUs = analyzePlayer(snapshot, player);
    const beforeThem = analyzePlayer(snapshot, opponent(player));
    const candidate = cloneWithMirror(snapshot, action, player);
    const afterUs = analyzePlayer(candidate, player);
    const afterThem = analyzePlayer(candidate, opponent(player));

    // Crucial asymmetry:
    // - From our perspective this is our mirror, so we may pass OR reflect.
    // - From the opponent's perspective this is an enemy mirror, so it MUST reflect.
    // Thus a placement can accidentally create a profitable reflected route for them.
    const ownGain = afterUs.value - beforeUs.value;
    const enemyGain = afterThem.value - beforeThem.value;

    // Reward strong own attack routes, penalize any opponent route even more.
    // The delta terms identify whether this particular mirror opens a new lane.
    let score = afterUs.value * 0.72
              - afterThem.value * 1.28
              + ownGain * 0.58
              - enemyGain * 1.12;

    // Penalize creating a short, direct winning shot for the opponent.
    if (afterThem.shortest !== null) {
      score -= afterThem.shortest <= 4 ? 180 : afterThem.shortest <= 7 ? 95 : 35;
    }
    // Prefer positions that preserve more than one possible attack route.
    score += Math.max(0, afterUs.routeCount - 1) * 8;
    score -= Math.max(0, afterThem.routeCount - 1) * 11;

    // Mild positional tie-breaker only; strategy is dominated by optical analysis.
    const centerDistance = Math.abs(action.x - 5.5) + Math.abs(action.y - 5.5);
    score -= centerDistance * 0.12;

    // Do not spend a scarce adjacent-base slot unless it materially improves
    // attack/defence. The engine already enforces the hard two-neighbour rule.
    const b = snapshot.bases[player];
    const adjacent = Math.abs(action.x - b.x) + Math.abs(action.y - b.y) === 1;
    if (adjacent && ownGain < 8) score -= 7;

    return { score, ownGain, enemyGain, afterUs, afterThem };
  }

  function chooseDecision(request) {
    const s = request.state;
    const player = request.player;

    // Always take a verified winning shot before placing anything.
    const win = immediateWinningAction(s, player);
    if (win && request.legalActions.some(a =>
      a.type === "fire_laser" && a.direction === win.direction)) return win;

    const placements = request.legalActions.filter(a => a.type === "place_mirror");
    if (!placements.length) {
      // If no mirror placement is legal, fire the direction with the strongest
      // reachable route; otherwise choose a deterministic legal fallback.
      const analysis = analyzePlayer(s, player);
      const best = [...analysis.directions].sort((a, b) =>
        (a.hitDistance ?? 999) - (b.hitDistance ?? 999) ||
        a.closest - b.closest
      )[0];
      return { type: "fire_laser", direction: best.direction };
    }

    let bestAction = placements[0];
    let bestScore = -Infinity;
    for (const action of placements) {
      const result = placementScore(s, action, player);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestAction = action;
      }
    }
    return bestAction;
  }

  function chooseMirror(request) {
    const { laser, player, state } = request;
    const mirror = laser.mirror;
    const incoming = laser.direction;
    const options = [
      { choice: "reflect", direction: reflect(incoming, mirror.orientation) },
      { choice: "pass", direction: incoming }
    ];

    const scored = options.map(option => {
      const result = trace(
        state,
        player,
        laser.position,
        option.direction
      );
      const score = result.hitDistance !== null
        ? 10000 - result.hitDistance * 20
        : -result.closest * 15 + Math.min(result.states, 100) * 0.015;
      return { ...option, score, result };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].choice;
  }

  window.LaserMirrorAI = Object.freeze({
    protocolVersion: "1.0",
    async decide(request) {
      return P.makeResponse(request, chooseDecision(request));
    },
    async resolveMirror(request) {
      return P.makeResponse(request, { choice: chooseMirror(request) });
    },
    // Exposed read-only for diagnostics and future AI adapters.
    analyze(snapshot, player) {
      return analyzePlayer(snapshot, player);
    }
  });
})();