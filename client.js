import * as THREE from "/vendor/three.module.js";

const canvas = document.querySelector("#world");
const lobby = document.querySelector("#lobby");
const hud = document.querySelector("#hud");
const errorBox = document.querySelector("#lobby-error");
const nameInput = document.querySelector("#player-name");
const roomInput = document.querySelector("#room-code");
const isTouch = window.matchMedia("(pointer: coarse)").matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111b25);
scene.fog = new THREE.FogExp2(0x111b25, 0.014);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 180);
camera.position.set(0, 1.65, 0);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

scene.add(new THREE.HemisphereLight(0x8faec6, 0x202029, 2.15));
const moonlight = new THREE.DirectionalLight(0xc4eaff, 3.1);
moonlight.position.set(-12, 24, 8);
moonlight.castShadow = true;
moonlight.shadow.mapSize.set(1024, 1024);
moonlight.shadow.camera.left = -30;
moonlight.shadow.camera.right = 30;
moonlight.shadow.camera.top = 30;
moonlight.shadow.camera.bottom = -30;
scene.add(moonlight);

const materials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x242c36, roughness: 0.84, metalness: 0.16 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x263544, roughness: 0.72, metalness: 0.28 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x121c27, roughness: 0.65, metalness: 0.35 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x3b4952, roughness: 0.7, metalness: 0.2 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x5b8586, emissive: 0x315757, emissiveIntensity: 0.65, roughness: 0.22, metalness: 0.35 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x46515b, roughness: 0.82, metalness: 0.08 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xb9a88d, roughness: 0.84 }),
  door: new THREE.MeshStandardMaterial({ color: 0x40372f, roughness: 0.8 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x49d9d0, emissive: 0x157e7c, emissiveIntensity: 1.8, roughness: 0.35 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffba72, emissive: 0x9d481e, emissiveIntensity: 1.5, roughness: 0.4 })
};
const colliders = [];
const remotePlayers = new Map();
const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xfff2a6, transparent: true, opacity: 0.92 });
const playerState = { id: null, room: "", x: 0, z: 0, yaw: 0, pitch: 0, health: 100, kills: 0, ammo: 30, reserve: 120 };
const keys = new Set();
let socket = null;
let joined = false;
let lastMoveSent = 0;
let lastShot = 0;
let reloading = false;
let moveInput = { x: 0, y: 0 };
let touchLookPointer = null;
let stickPointer = null;
let mouseAimPointer = null;
let lookTouchX = 0;
let lookTouchY = 0;
let mouseAimX = 0;
let mouseAimY = 0;
let toastTimer = null;

function box(width, height, depth, material, x, y, z, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (options.collider) colliders.push({ x, z, halfX: width / 2, halfZ: depth / 2 });
  return mesh;
}

function makeHouse(x, z, style) {
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: style.wall,
    roughness: 0.9,
    metalness: 0.02
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: style.roof,
    roughness: 0.88,
    metalness: 0.04
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: style.accent,
    roughness: 0.82
  });
  const width = 7;
  const depth = 6.4;
  const wallHeight = 3.2;
  const front = z - depth / 2;
  const back = z + depth / 2;

  box(width, 0.28, depth, materials.trim, x, 0.14, z);
  box(width - 0.35, 0.14, depth - 0.35, materials.dark, x, 0.34, z);
  box(0.24, wallHeight, depth, wallMaterial, x - width / 2 + 0.12, 1.95, z, { collider: true });
  box(0.24, wallHeight, depth, wallMaterial, x + width / 2 - 0.12, 1.95, z);
  box(width, wallHeight, 0.24, wallMaterial, x, 1.95, back - 0.12);

  const doorWidth = 1.25;
  const frontSideWidth = (width - doorWidth) / 2;
  const sideOffset = (doorWidth + frontSideWidth) / 2;
  box(frontSideWidth, wallHeight, 0.24, wallMaterial, x - sideOffset, 1.95, front + 0.12);
  box(frontSideWidth, wallHeight, 0.24, wallMaterial, x + sideOffset, 1.95, front + 0.12);
  box(doorWidth, 1.02, 0.24, wallMaterial, x, 3.04, front + 0.12);

  box(doorWidth + 0.14, 2.18, 0.12, materials.door, x, 1.44, front - 0.08);
  box(doorWidth + 0.4, 0.16, 0.52, materials.trim, x, 0.42, front - 0.28);
  box(doorWidth + 0.28, 0.12, 0.12, accentMaterial, x, 2.61, front - 0.12);
  for (const side of [-1, 1]) {
    box(0.12, 2.2, 0.14, materials.trim, x + side * (doorWidth / 2 + 0.13), 1.45, front - 0.12);
    box(1.2, 0.95, 0.08, materials.dark, x + side * 2.1, 2.05, front - 0.12);
    box(0.98, 0.72, 0.05, materials.glass, x + side * 2.1, 2.05, front - 0.17);
    box(0.07, 0.98, 0.08, materials.trim, x + side * 2.1, 2.05, front - 0.21);
    box(1.2, 0.07, 0.08, materials.trim, x + side * 2.1, 2.05, front - 0.21);
  }

  for (const side of [-1, 1]) {
    for (const offset of [-1.65, 1.65]) {
      box(0.08, 1, 1.15, materials.glass, x + side * (width / 2 + 0.015), 2.08, z + offset);
      box(0.1, 1.14, 0.08, accentMaterial, x + side * (width / 2 + 0.07), 2.08, z + offset);
      box(0.1, 0.08, 1.24, accentMaterial, x + side * (width / 2 + 0.07), 2.08, z + offset);
    }
  }

  for (const end of [-1, 1]) {
    const gable = new THREE.Shape();
    gable.moveTo(-3.38, 0);
    gable.lineTo(3.38, 0);
    gable.lineTo(0, 2.18);
    gable.closePath();
    const gableMesh = new THREE.Mesh(new THREE.ShapeGeometry(gable), wallMaterial);
    gableMesh.position.set(x, 3.55, z + end * (depth / 2 - 0.05));
    if (end > 0) gableMesh.rotation.y = Math.PI;
    gableMesh.castShadow = true;
    gableMesh.receiveShadow = true;
    scene.add(gableMesh);
  }

  const roofAngle = Math.atan2(2.5, 3.85);
  for (const side of [-1, 1]) {
    const roofSlope = box(4.65, 0.22, depth + 0.55, roofMaterial, x + side * 1.04, 4.2, z);
    roofSlope.rotation.z = -side * roofAngle;
    box(0.22, 0.14, depth + 0.2, materials.trim, x + side * 3.43, 3.57, z);
  }
  box(0.17, 0.24, depth + 0.75, accentMaterial, x, 5.47, z);

  box(0.72, 1.3, 0.72, materials.dark, x + 2.05, 4.15, z + 1.45);
  box(0.82, 0.1, 0.82, accentMaterial, x + 2.05, 4.85, z + 1.45);
  colliders.push({ x, z, halfX: width / 2, halfZ: depth / 2 });
}

function buildArena() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), materials.floor);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(48, 48, 0x3a696f, 0x34414c);
  grid.position.y = 0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  scene.add(grid);

  box(48, 5, 0.8, materials.wall, 0, 2.5, -24);
  box(48, 5, 0.8, materials.wall, 0, 2.5, 24);
  box(0.8, 5, 48, materials.wall, -24, 2.5, 0);
  box(0.8, 5, 48, materials.wall, 24, 2.5, 0);
  box(48, 0.13, 0.16, materials.cyan, 0, 0.18, -23.5, { castShadow: false });
  box(48, 0.13, 0.16, materials.cyan, 0, 0.18, 23.5, { castShadow: false });

  const houses = [
    { x: -15, z: -15, wall: 0xc2b49d, roof: 0x574a45, accent: 0xe3d4b9 },
    { x: 15, z: -15, wall: 0x8d9c9c, roof: 0x414d53, accent: 0xc2d1ca },
    { x: -15, z: 15, wall: 0xb3a28c, roof: 0x694d42, accent: 0xe1c8a3 },
    { x: 15, z: 15, wall: 0x9ca9a9, roof: 0x4e5054, accent: 0xd4d2c8 }
  ];
  for (const house of houses) {
    makeHouse(house.x, house.z, house);
  }

  const cover = [
    [-9, -8, 5.3, 2.3, 2.1], [8, -8, 4, 2.1, 2], [-8, 8, 4.5, 2.8, 2.5],
    [9, 8, 5, 2.1, 2.4], [0, -12, 2.1, 2.4, 5], [0, 12, 2.1, 2.4, 5],
    [-14, 0, 2.3, 2, 5], [14, 0, 2.3, 2, 5], [-3, 0, 3.2, 1.7, 2.1], [4, 3, 3, 2.2, 2.2]
  ];
  for (const [x, z, width, height, depth] of cover) {
    box(width, height, depth, materials.crate, x, height / 2, z, { collider: true });
    box(width * 0.82, 0.1, 0.09, materials.cyan, x, height * 0.72, z + depth / 2 + 0.012, { castShadow: false });
  }

  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const x = i * 8.5;
    box(0.24, 4.8, 0.24, materials.dark, x, 2.4, -21.9, { castShadow: false });
    box(0.24, 0.08, 0.24, i % 2 ? materials.cyan : materials.amber, x, 4.7, -21.9, { castShadow: false });
    box(0.24, 4.8, 0.24, materials.dark, x, 2.4, 21.9, { castShadow: false });
    box(0.24, 0.08, 0.24, i % 2 ? materials.amber : materials.cyan, x, 4.7, 21.9, { castShadow: false });
  }

  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const radius = 26 + (i % 2) * 3;
    const h = 8 + (i % 4) * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    box(2.8, h, 2.8, i % 3 === 0 ? materials.dark : materials.wall, x, h / 2, z, { castShadow: false });
    box(3, 0.12, 3, i % 2 ? materials.cyan : materials.amber, x, h + 0.06, z, { castShadow: false });
  }

  for (const [x, z, color] of [[-19, -19, 0x45dcd2], [19, 19, 0x45dcd2], [19, -19, 0xffae66], [-19, 19, 0xffae66]]) {
    const lamp = new THREE.PointLight(color, 62, 26, 2);
    lamp.position.set(x, 3.5, z);
    scene.add(lamp);
  }
}

function makeLabel(name, color) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 384;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext("2d");
  context.fillStyle = "rgba(4, 11, 18, .82)";
  context.fillRect(16, 12, 352, 70);
  context.fillStyle = color;
  context.fillRect(16, 12, 5, 70);
  context.fillStyle = "#f4f7fa";
  context.font = "bold 34px Arial";
  context.textAlign = "center";
  context.fillText(name.slice(0, 18), 196, 59);
  const texture = new THREE.CanvasTexture(labelCanvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.25, 0.56, 1);
  sprite.position.y = 2.45;
  return sprite;
}

function makePlayerModel(data) {
  const group = new THREE.Group();
  const color = new THREE.Color(data.color || "#66f2e3");
  const armor = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: 0x131a22, roughness: 0.62, metalness: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.63, 4, 8), armor);
  body.position.y = 1;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), black);
  head.position.y = 1.63;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.085, 0.12), materials.cyan);
  visor.position.set(0, 1.67, -0.17);
  group.add(visor);
  const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.8), black);
  weapon.position.set(0.36, 1.05, -0.42);
  group.add(weapon);
  const label = makeLabel(data.name, data.color);
  group.add(label);
  group.userData = { body, label, targetX: data.x, targetZ: data.z, targetYaw: data.yaw, data };
  group.position.set(data.x, 0, data.z);
  group.rotation.y = data.yaw;
  scene.add(group);
  return group;
}

function updateRemote(data) {
  if (data.id === playerState.id) return;
  let model = remotePlayers.get(data.id);
  if (!model) {
    model = makePlayerModel(data);
    remotePlayers.set(data.id, model);
  }
  model.userData.targetX = data.x;
  model.userData.targetZ = data.z;
  model.userData.targetYaw = data.yaw;
  model.userData.data = data;
  model.visible = !data.dead;
}

function setPlayers(players) {
  const present = new Set();
  for (const player of players) {
    present.add(player.id);
    updateRemote(player);
  }
  for (const [id, model] of remotePlayers) {
    if (!present.has(id)) {
      removePlayerModel(model);
      remotePlayers.delete(id);
    }
  }
  renderScoreboard(players);
}

function removePlayerModel(model) {
  scene.remove(model);
  model.traverse((item) => {
    if (item.geometry) item.geometry.dispose();
    if (item.material && item.material !== materials.cyan) {
      if (item.material.map) item.material.map.dispose();
      item.material.dispose();
    }
  });
}

function renderScoreboard(players) {
  const rows = document.querySelector("#score-rows");
  const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  document.querySelector("#player-count").textContent = `${players.length} / 8`;
  rows.replaceChildren();
  for (const player of sorted) {
    const row = document.createElement("div");
    row.className = "score-row";
    const name = document.createElement("span");
    name.className = player.id === playerState.id ? "you" : "";
    name.textContent = `${player.name}${player.id === playerState.id ? " (YOU)" : ""}`;
    const stats = document.createElement("small");
    stats.textContent = `${player.kills} K  /  ${player.deaths} D`;
    row.append(name, stats);
    rows.append(row);
  }
}

function notify(text) {
  const toast = document.querySelector("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function addFeed(text) {
  const item = document.createElement("div");
  item.textContent = text;
  document.querySelector("#feed").prepend(item);
  setTimeout(() => item.remove(), 5200);
}

function showError(message) {
  errorBox.textContent = message;
}

function connect(action, code) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    showError("You are already connected to a match.");
    return;
  }
  showError("");
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/game`);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "join",
      action,
      code,
      name: nameInput.value.trim() || "Rookie"
    }));
  });
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      notify("Received an invalid message from the match server.");
      return;
    }
    handleMessage(message);
  });
  socket.addEventListener("error", () => showError("Could not connect to the match server."));
  socket.addEventListener("close", () => {
    if (joined) {
      joined = false;
      exitMatch(false);
      notify("Connection to the match server was lost.");
    }
  });
}

function handleMessage(message) {
  if (message.type === "error") {
    showError(message.message);
    if (!joined && socket) {
      socket.close();
      socket = null;
    }
    return;
  }
  if (message.type === "joined") {
    playerState.id = message.id;
    playerState.room = message.room;
    playerState.x = message.spawn.x;
    playerState.z = message.spawn.z;
    playerState.yaw = message.spawn.yaw;
    playerState.health = 100;
    playerState.kills = 0;
    playerState.ammo = 30;
    playerState.reserve = 120;
    joined = true;
    lobby.classList.add("hidden");
    hud.classList.remove("hidden");
    document.querySelector("#hud-room").textContent = message.room;
    document.querySelector("#touch-controls").classList.toggle("hidden", !isTouch);
    camera.position.set(playerState.x, 1.65, playerState.z);
    if (!isTouch) canvas.focus({ preventScroll: true });
    setPlayers(message.players);
    updateAmmo();
    document.querySelector("#match-hint").textContent = isTouch ? "JOYSTICK MOVE · DRAG AIM · FIRE" : "WASD MOVE · MOUSE AIM · CLICK FIRE";
    notify(`MATCH READY // ROOM ${message.room}`);
    document.querySelector("#mouse-start").classList.toggle("hidden", isTouch);
    return;
  }
  if (message.type === "state") {
    setPlayers(message.players);
  } else if (message.type === "playerJoined") {
    updateRemote(message.player);
    addFeed(`${message.player.name} joined the match`);
  } else if (message.type === "playerLeft") {
    const model = remotePlayers.get(message.id);
    if (model) {
      scene.remove(model);
      remotePlayers.delete(message.id);
    }
  } else if (message.type === "shot") {
    drawTracer(message);
  } else if (message.type === "hitConfirm") {
    showHitmarker(message.killed);
  } else if (message.type === "damage") {
    playerState.health = message.health;
    document.querySelector("#health").textContent = String(message.health);
    document.querySelector("#health-bar").style.width = `${message.health}%`;
    if (message.respawned) {
      playerState.x = message.x;
      playerState.z = message.z;
      playerState.yaw = message.yaw;
      camera.position.set(playerState.x, 1.65, playerState.z);
      updateCamera();
      notify("RESPAWNED // BACK IN THE FIGHT");
    } else if (message.health <= 0) {
      notify("ELIMINATED // RESPAWNING");
    }
  } else if (message.type === "kill") {
    for (const player of message.players) {
      if (player.id === playerState.id) playerState.kills = player.kills;
      updateRemote(player);
    }
    renderScoreboard(message.players);
    addFeed(`${message.killerName} eliminated ${message.victimName}`);
  } else if (message.type === "respawn") {
    updateRemote(message.player);
  }
}

function drawTracer(message) {
  const start = new THREE.Vector3(message.x, 1.38, message.z);
  const end = message.target
    ? new THREE.Vector3(message.target.x, 1.15, message.target.z)
    : new THREE.Vector3(
      message.x - Math.sin(message.yaw) * 17,
      1.25,
      message.z - Math.cos(message.yaw) * 17
    );
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), tracerMaterial);
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    line.geometry.dispose();
  }, 95);
}

function showHitmarker(killed) {
  const marker = document.querySelector("#hitmarker");
  marker.style.color = killed ? "#d0ff71" : "#ffffff";
  marker.classList.remove("show");
  void marker.offsetWidth;
  marker.classList.add("show");
}

function updateAmmo() {
  document.querySelector("#ammo").innerHTML = `${playerState.ammo}<span>/${playerState.reserve}</span>`;
  const bars = document.querySelector("#ammo-bars");
  bars.replaceChildren();
  for (let i = 0; i < 30; i++) {
    const bar = document.createElement("i");
    if (i >= playerState.ammo) bar.className = "empty";
    bars.append(bar);
  }
}

function beginReload() {
  if (!joined || reloading || playerState.ammo === 30 || playerState.reserve <= 0) return;
  reloading = true;
  notify("RELOADING");
  setTimeout(() => {
    const amount = Math.min(30 - playerState.ammo, playerState.reserve);
    playerState.ammo += amount;
    playerState.reserve -= amount;
    reloading = false;
    updateAmmo();
  }, 1250);
}

function fire() {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN || reloading) return;
  const now = performance.now();
  if (now - lastShot < 190) return;
  if (playerState.ammo <= 0) {
    beginReload();
    return;
  }
  lastShot = now;
  playerState.ammo -= 1;
  updateAmmo();
  socket.send(JSON.stringify({ type: "shoot" }));
}

function collides(x, z) {
  if (Math.abs(x) > 21.5 || Math.abs(z) > 21.5) return true;
  return colliders.some((item) => Math.abs(x - item.x) < item.halfX + 0.48 && Math.abs(z - item.z) < item.halfZ + 0.48);
}

function movePlayer(delta) {
  if (!joined || playerState.health <= 0) return;
  let forward = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  let strafe = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  forward += -moveInput.y;
  strafe += moveInput.x;
  const length = Math.hypot(forward, strafe);
  if (length > 1) {
    forward /= length;
    strafe /= length;
  }
  const speed = (keys.has("ShiftLeft") ? 8.3 : 6) * delta;
  const nextX = playerState.x + (-Math.sin(playerState.yaw) * forward + Math.cos(playerState.yaw) * strafe) * speed;
  const nextZ = playerState.z + (-Math.cos(playerState.yaw) * forward - Math.sin(playerState.yaw) * strafe) * speed;
  if (!collides(nextX, playerState.z)) playerState.x = nextX;
  if (!collides(playerState.x, nextZ)) playerState.z = nextZ;
  camera.position.set(playerState.x, 1.65, playerState.z);

  const now = performance.now();
  if (now - lastMoveSent > 50 && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "move",
      x: playerState.x,
      z: playerState.z,
      yaw: playerState.yaw
    }));
    lastMoveSent = now;
  }
}

function updateCamera() {
  camera.rotation.order = "YXZ";
  camera.rotation.y = playerState.yaw;
  camera.rotation.x = playerState.pitch;
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - (animate.last || now)) / 1000, 0.05);
  animate.last = now;
  movePlayer(delta);
  updateCamera();
  for (const model of remotePlayers.values()) {
    model.position.x += (model.userData.targetX - model.position.x) * Math.min(delta * 12, 1);
    model.position.z += (model.userData.targetZ - model.position.z) * Math.min(delta * 12, 1);
    let angle = model.rotation.y;
    let difference = model.userData.targetYaw - angle;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    model.rotation.y += difference * Math.min(delta * 10, 1);
  }
  renderer.render(scene, camera);
}

buildArena();
animate();

document.querySelector("#create-room").addEventListener("click", () => connect("create", ""));
document.querySelector("#join-room").addEventListener("click", () => connect("join", roomInput.value));
roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 5);
});
roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connect("join", roomInput.value);
});
document.querySelector("#leave-room").addEventListener("click", () => exitMatch(true));
document.querySelector("#copy-room").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(playerState.room);
    notify("ROOM CODE COPIED");
  } catch {
    notify(`ROOM CODE // ${playerState.room}`);
  }
});
document.querySelector("#touch-fire").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  fire();
});
document.querySelector("#touch-reload").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  beginReload();
});

function exitMatch(sendLeave) {
  if (sendLeave && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "leave" }));
    socket.close();
  }
  document.exitPointerLock?.();
  socket = null;
  joined = false;
  playerState.id = null;
  for (const model of remotePlayers.values()) removePlayerModel(model);
  remotePlayers.clear();
  hud.classList.add("hidden");
  lobby.classList.remove("hidden");
  document.querySelector("#touch-controls").classList.add("hidden");
}

document.addEventListener("keydown", (event) => {
  if (joined && ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
  if (event.code === "Tab" && joined) {
    event.preventDefault();
    document.querySelector("#scoreboard").classList.remove("hidden");
  } else if (event.code === "KeyR" && joined) {
    beginReload();
  }
});
document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "Tab") document.querySelector("#scoreboard").classList.add("hidden");
});
document.addEventListener("mousemove", (event) => {
  if (!joined || isTouch || document.pointerLockElement !== canvas) return;
  playerState.yaw -= event.movementX * 0.0022;
  playerState.pitch = THREE.MathUtils.clamp(playerState.pitch - event.movementY * 0.0018, -1.15, 1.15);
});
canvas.addEventListener("pointerdown", (event) => {
  if (!joined || isTouch || document.pointerLockElement === canvas) return;
  mouseAimPointer = event.pointerId;
  mouseAimX = event.clientX;
  mouseAimY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== mouseAimPointer) return;
  playerState.yaw -= (event.clientX - mouseAimX) * 0.004;
  playerState.pitch = THREE.MathUtils.clamp(playerState.pitch - (event.clientY - mouseAimY) * 0.003, -1.15, 1.15);
  mouseAimX = event.clientX;
  mouseAimY = event.clientY;
});
function stopMouseAim(event) {
  if (event.pointerId === mouseAimPointer) mouseAimPointer = null;
}
canvas.addEventListener("pointerup", stopMouseAim);
canvas.addEventListener("pointercancel", stopMouseAim);
document.querySelector("#mouse-start").addEventListener("click", () => {
  if (!joined) return;
  try {
    const lockRequest = canvas.requestPointerLock?.();
    if (lockRequest && typeof lockRequest.catch === "function") {
      lockRequest.catch(() => notify("CLICK THE GAME AREA TO AIM"));
    }
  } catch {
    notify("CLICK THE GAME AREA TO AIM");
  }
});
canvas.addEventListener("click", () => {
  if (joined && !isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) fire();
});
document.addEventListener("pointerlockchange", () => {
  if (!joined || isTouch) return;
  const hasMouseControl = document.pointerLockElement === canvas;
  document.querySelector("#mouse-start").classList.toggle("hidden", hasMouseControl);
  if (!hasMouseControl) notify("CLICK TO CAPTURE MOUSE");
});

const stick = document.querySelector("#move-stick");
const knob = stick.querySelector(".stick-knob");
stick.addEventListener("pointerdown", (event) => {
  stickPointer = event.pointerId;
  stick.setPointerCapture(event.pointerId);
  updateStick(event);
});
stick.addEventListener("pointermove", (event) => {
  if (event.pointerId === stickPointer) updateStick(event);
});
function updateStick(event) {
  const bounds = stick.getBoundingClientRect();
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  const max = bounds.width * 0.31;
  const scale = Math.min(1, max / (Math.hypot(dx, dy) || 1));
  moveInput = { x: dx * scale / max, y: dy * scale / max };
  knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}
function resetStick(event) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null;
  moveInput = { x: 0, y: 0 };
  knob.style.transform = "";
}
stick.addEventListener("pointerup", resetStick);
stick.addEventListener("pointercancel", resetStick);

const lookZone = document.querySelector("#look-zone");
lookZone.addEventListener("pointerdown", (event) => {
  if (!joined) return;
  touchLookPointer = event.pointerId;
  lookTouchX = event.clientX;
  lookTouchY = event.clientY;
  lookZone.setPointerCapture(event.pointerId);
});
lookZone.addEventListener("pointermove", (event) => {
  if (event.pointerId !== touchLookPointer) return;
  playerState.yaw -= (event.clientX - lookTouchX) * 0.006;
  playerState.pitch = THREE.MathUtils.clamp(playerState.pitch - (event.clientY - lookTouchY) * 0.004, -1, 1);
  lookTouchX = event.clientX;
  lookTouchY = event.clientY;
});
function stopLook(event) {
  if (event.pointerId === touchLookPointer) touchLookPointer = null;
}
lookZone.addEventListener("pointerup", stopLook);
lookZone.addEventListener("pointercancel", stopLook);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
});
window.addEventListener("blur", () => keys.clear());
