/* Laser Mirror Duel - External AI protocol helpers (v1.0) */
(() => {
  "use strict";
  const VERSION = "1.0";
  function makeResponse(request, action) {
    return {
      protocol: "laser-mirror-duel",
      version: VERSION,
      requestId: request.requestId,
      action
    };
  }
  function validateResponse(response, request) {
    if (!response || response.protocol !== "laser-mirror-duel" ||
        response.version !== VERSION || response.requestId !== request.requestId ||
        !response.action || typeof response.action !== "object") {
      throw new Error("AI response does not match protocol v1.0.");
    }
    const a = response.action;
    if (request.type === "decide") {
      if (a.type === "place_mirror") {
        if (!Number.isInteger(a.x) || !Number.isInteger(a.y) ||
            !["/", "\\"].includes(a.orientation)) throw new Error("Invalid place_mirror action.");
      } else if (a.type === "fire_laser") {
        if (!["up", "down", "left", "right"].includes(a.direction)) throw new Error("Invalid fire_laser action.");
      } else throw new Error("Unknown AI action type.");
      const legal = request.legalActions || [];
      if (!legal.some(x => {
        const ak = Object.keys(a), xk = Object.keys(x);
        return ak.length === xk.length && ak.every(k => Object.prototype.hasOwnProperty.call(x, k) && x[k] === a[k]);
      })) {
        throw new Error("AI returned an action that is not in legalActions.");
      }
    } else if (request.type === "resolve_mirror") {
      if (!["reflect", "pass"].includes(a.choice) ||
          !(request.legalActions || []).some(x => x.choice === a.choice)) {
        throw new Error("Invalid mirror choice.");
      }
    } else {
      throw new Error("Unknown request type.");
    }
    return a;
  }
  window.LaserAIProtocol = Object.freeze({ VERSION, makeResponse, validateResponse });
})();