const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const MAX_PLAYERS = 8;
const rooms = new Map();
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/client.js", "client.js"],
  ["/vendor/three.module.js", "node_modules/three/build/three.module.js"],
  ["/vendor/three.core.js", "node_modules/three/build/three.core.js"]
]);

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url, "http://localhost").pathname;
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  const fileName = publicFiles.get(pathname);
  if (!fileName) {
    response.writeHead(404).end("Not found");
    return;
  }

  const filePath = path.join(ROOT, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error(`Unable to read ${fileName}:`, error.message);
      response.writeHead(500).end("Unable to load game files");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)],
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/game") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, (websocket) => {
    sockets.emit("connection", websocket);
  });
});

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(room, message, exceptId) {
  const serialized = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.id !== exceptId && player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(serialized);
    }
  }
}

function safeName(value) {
  if (typeof value !== "string") return "Rookie";
  const cleaned = value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 18);
  return cleaned || "Rookie";
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from(crypto.randomBytes(5), (byte) => alphabet[byte % alphabet.length]).join("");
  } while (rooms.has(code));
  return code;
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    color: player.color,
    kills: player.kills,
    deaths: player.deaths,
    health: player.health,
    dead: player.dead
  };
}

function chooseSpawn(room) {
  const spawnPoints = [
    [0, -5], [0, 5], [-8, -4], [8, -4],
    [-8, 4], [8, 4], [-8, 0], [8, 0]
  ];
  const available = spawnPoints.filter(([x, z]) => {
    for (const player of room.players.values()) {
      if (Math.hypot(player.x - x, player.z - z) < 4) return false;
    }
    return true;
  });
  const candidates = available.length ? available : spawnPoints;
  const [x, z] = candidates[Math.floor(Math.random() * candidates.length)];
  const yaw = Math.abs(x) > Math.abs(z)
    ? (x < 0 ? Math.PI / 2 : -Math.PI / 2)
    : (z < 0 ? 0 : Math.PI);
  return { x, z, yaw };
}

function leaveRoom(player) {
  const room = player.room;
  if (!room) return;
  room.players.delete(player.id);
  player.room = null;
  broadcast(room, { type: "playerLeft", id: player.id });
  if (room.players.size === 0) rooms.delete(room.code);
}

function joinRoom(socket, message) {
  const creating = message.action === "create";
  const requestedCode = typeof message.code === "string" ? message.code.trim().toUpperCase() : "";
  const code = creating ? createRoomCode() : requestedCode;
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
    send(socket, { type: "error", message: "Enter a valid 5-character room code." });
    return;
  }

  let room = rooms.get(code);
  if (!room && !creating) {
    send(socket, { type: "error", message: "That room does not exist. Ask your friend to create one first." });
    return;
  }
  if (!room) {
    room = { code, players: new Map() };
    rooms.set(code, room);
  }
  if (room.players.size >= MAX_PLAYERS) {
    send(socket, { type: "error", message: "This room is full. Try another match." });
    return;
  }

  const spawn = chooseSpawn(room);
  const player = {
    id: crypto.randomUUID(),
    name: safeName(message.name),
    socket,
    room,
    ...spawn,
    color: ["#66f2e3", "#d0ff71", "#ff8d76", "#a996ff", "#ffcf70", "#72adff", "#fb7ac8", "#f4f4ee"][room.players.size],
    kills: 0,
    deaths: 0,
    health: 100,
    dead: false,
    lastMove: 0,
    lastShot: 0
  };

  room.players.set(player.id, player);
  socket.player = player;
  send(socket, {
    type: "joined",
    id: player.id,
    room: room.code,
    spawn: { x: player.x, z: player.z, yaw: player.yaw },
    players: Array.from(room.players.values(), publicPlayer)
  });
  broadcast(room, { type: "playerJoined", player: publicPlayer(player) }, player.id);
}

function handleMove(player, message) {
  if (player.dead) return;
  const now = Date.now();
  if (now - player.lastMove < 35) return;
  if (!Number.isFinite(message.x) || !Number.isFinite(message.z) || !Number.isFinite(message.yaw)) return;
  player.x = Math.max(-21, Math.min(21, message.x));
  player.z = Math.max(-21, Math.min(21, message.z));
  player.yaw = ((message.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  player.lastMove = now;
}

function handleShot(player) {
  const room = player.room;
  const now = Date.now();
  if (!room || player.dead || now - player.lastShot < 180) return;
  player.lastShot = now;

  let target = null;
  let nearest = 24;
  for (const candidate of room.players.values()) {
    if (candidate.id === player.id || candidate.dead) continue;
    const dx = candidate.x - player.x;
    const dz = candidate.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= nearest) continue;
    const aimX = -Math.sin(player.yaw);
    const aimZ = -Math.cos(player.yaw);
    const alignment = (dx * aimX + dz * aimZ) / (distance || 1);
    if (alignment >= Math.cos(0.09)) {
      target = candidate;
      nearest = distance;
    }
  }

  broadcast(room, {
    type: "shot",
    from: player.id,
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    target: target ? { x: target.x, z: target.z } : null
  });
  if (!target) return;

  target.health = Math.max(0, target.health - 34);
  send(player.socket, { type: "hitConfirm", victim: target.id, killed: target.health === 0 });
  send(target.socket, { type: "damage", health: target.health });
  if (target.health > 0) return;

  player.kills += 1;
  target.deaths += 1;
  target.dead = true;
  broadcast(room, {
    type: "kill",
    killer: player.id,
    killerName: player.name,
    victim: target.id,
    victimName: target.name,
    players: Array.from(room.players.values(), publicPlayer)
  });
  setTimeout(() => {
    if (!room.players.has(target.id)) return;
    Object.assign(target, chooseSpawn(room));
    target.health = 100;
    target.dead = false;
    broadcast(room, { type: "respawn", player: publicPlayer(target) });
    send(target.socket, {
      type: "damage",
      health: 100,
      respawned: true,
      x: target.x,
      z: target.z,
      yaw: target.yaw
    });
  }, 2200);
}

sockets.on("connection", (socket) => {
  socket.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(socket, { type: "error", message: "Invalid game message." });
      return;
    }
    if (!message || typeof message.type !== "string") return;
    const player = socket.player;
    if (message.type === "join" && !player) {
      joinRoom(socket, message);
    } else if (message.type === "move" && player) {
      handleMove(player, message);
    } else if (message.type === "shoot" && player) {
      handleShot(player);
    } else if (message.type === "leave" && player) {
      leaveRoom(player);
      socket.player = null;
    }
  });

  socket.on("close", () => {
    if (socket.player) leaveRoom(socket.player);
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

const snapshotTimer = setInterval(() => {
  for (const room of rooms.values()) {
    broadcast(room, {
      type: "state",
      players: Array.from(room.players.values(), publicPlayer)
    });
  }
}, 100);

server.listen(PORT, HOST, () => {
  console.log(`Neon Strike is ready at http://localhost:${PORT}`);
});

function shutdown() {
  clearInterval(snapshotTimer);
  sockets.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
