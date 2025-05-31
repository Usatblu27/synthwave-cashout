const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const joinButton = document.getElementById("joinButton");
const joinScreen = document.querySelector(".join-screen");
const scoreboard = document.querySelector(".scoreboard");

// Размеры canvas
canvas.width = 800;
canvas.height = 600;

// Состояние игры
let gameState = {
  player: null,
  players: {},
  bullets: [],
  cube: { x: 400, y: 300, carrier: null },
  config: null,
  keys: {},
  socket: null,
};

// Подключение к серверу
joinButton.addEventListener("click", () => {
  gameState.socket = io();
  joinScreen.style.display = "none";

  // Обработчики событий от сервера
  gameState.socket.on("init", (data) => {
    gameState.player = data.player;
    gameState.players = data.players;
    gameState.bullets = data.bullets;
    gameState.cube = data.cube;
    gameState.config = data.config;

    // Начало игрового цикла
    requestAnimationFrame(gameLoop);
  });

  gameState.socket.on("playerConnected", (player) => {
    gameState.players[player.id] = player;
  });

  gameState.socket.on("playerMoved", (data) => {
    if (gameState.players[data.id]) {
      gameState.players[data.id].x = data.x;
      gameState.players[data.id].y = data.y;
      gameState.players[data.id].rotation = data.rotation;
    }
  });

  gameState.socket.on("bulletFired", (bullet) => {
    gameState.bullets.push(bullet);
  });

  gameState.socket.on("bulletRemoved", (bulletId) => {
    gameState.bullets = gameState.bullets.filter((b) => b.id !== bulletId);
  });

  gameState.socket.on("playerHit", (data) => {
    if (gameState.players[data.playerId]) {
      gameState.players[data.playerId].health = data.health;
    }
  });

  gameState.socket.on("playerDied", (playerId) => {
    // Эффект смерти можно добавить здесь
  });

  gameState.socket.on("playerRespawned", (data) => {
    if (gameState.players[data.id]) {
      gameState.players[data.id].x = data.x;
      gameState.players[data.id].y = data.y;
      gameState.players[data.id].health = data.health;
    }
  });

  gameState.socket.on("playerDisconnected", (playerId) => {
    delete gameState.players[playerId];
  });

  gameState.socket.on("cubePicked", (data) => {
    gameState.cube.carrier = data.playerId;
  });

  gameState.socket.on("cubeDropped", (cube) => {
    gameState.cube = cube;
  });

  gameState.socket.on("cubeDelivered", (data) => {
    gameState.cube = data.cube;
    if (gameState.players[data.playerId]) {
      gameState.players[data.playerId].score = data.score;
    }
    updateScoreboard();
  });

  // Управление с клавиатуры
  window.addEventListener("keydown", (e) => {
    gameState.keys[e.key] = true;

    // Стрельба на пробел
    if (e.key === " " && gameState.player && gameState.player.health > 0) {
      gameState.socket.emit("shoot");
    }
  });

  window.addEventListener("keyup", (e) => {
    gameState.keys[e.key] = false;
  });
});

// Игровой цикл
function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function update() {
  if (!gameState.player || gameState.player.health <= 0) return;

  let dx = 0;
  let dy = 0;
  let rotation = 0;

  if (gameState.keys["ArrowUp"] || gameState.keys["w"]) dy -= 1;
  if (gameState.keys["ArrowDown"] || gameState.keys["s"]) dy += 1;
  if (gameState.keys["ArrowLeft"] || gameState.keys["a"]) dx -= 1;
  if (gameState.keys["ArrowRight"] || gameState.keys["d"]) dx += 1;

  // Нормализация диагонального движения
  if (dx !== 0 && dy !== 0) {
    const length = Math.sqrt(dx * dx + dy * dy);
    dx /= length;
    dy /= length;
  }

  // Расчет поворота
  if (dx !== 0 || dy !== 0) {
    rotation = Math.atan2(dx, -dy);
  }

  if (dx !== 0 || dy !== 0) {
    gameState.socket.emit("move", { dx, dy, rotation });
  }

  // Обновление пуль
  gameState.bullets.forEach((bullet) => {
    const dx = Math.sin(bullet.rotation) * bullet.speed;
    const dy = -Math.cos(bullet.rotation) * bullet.speed;
    bullet.x += dx;
    bullet.y += dy;
  });
}

function render() {
  // Очистка canvas
  ctx.fillStyle = "#0f0f1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Рисование сетки в стиле synthwave
  ctx.strokeStyle = "rgba(44, 232, 245, 0.1)";
  ctx.lineWidth = 1;
  const gridSize = 40;

  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Рисование кэшаутов
  gameState.config.cashouts.forEach((cashout) => {
    ctx.beginPath();
    ctx.arc(cashout.x, cashout.y, 30, 0, Math.PI * 2);
    ctx.fillStyle = cashout.color + "40";
    ctx.fill();
    ctx.strokeStyle = cashout.color;
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // Рисование куба
  if (!gameState.cube.carrier) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(gameState.cube.x - 10, gameState.cube.y - 10, 20, 20);
    ctx.strokeStyle = "#2CE8F5";
    ctx.lineWidth = 2;
    ctx.strokeRect(gameState.cube.x - 10, gameState.cube.y - 10, 20, 20);
  }

  // Рисование пуль
  gameState.bullets.forEach((bullet) => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = bullet.color;
    ctx.fill();

    // Эффект свечения
    ctx.shadowColor = bullet.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // Рисование игроков
  Object.values(gameState.players).forEach((player) => {
    // Тело игрока
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);

    if (player.health <= 0) {
      ctx.fillStyle = player.color + "60";
    } else {
      ctx.fillStyle = player.color;
    }

    ctx.fill();

    // Эффект свечения для живых игроков
    if (player.health > 0) {
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Индикатор направления
    if (player.health > 0) {
      const noseX = player.x + Math.sin(player.rotation) * player.radius;
      const noseY = player.y - Math.cos(player.rotation) * player.radius;

      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(noseX, noseY);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Индикатор здоровья
    if (player.health > 0 && player.health < 100) {
      ctx.beginPath();
      ctx.arc(
        player.x,
        player.y,
        player.radius + 5,
        0,
        Math.PI * 2 * (player.health / 100)
      );
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Игрок с кубом
    if (gameState.cube.carrier === player.id) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(player.x - 8, player.y - 15, 16, 10);
      ctx.strokeStyle = "#2CE8F5";
      ctx.lineWidth = 1;
      ctx.strokeRect(player.x - 8, player.y - 15, 16, 10);
    }

    // Имя игрока (счет)
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      player.score.toString(),
      player.x,
      player.y + player.radius + 15
    );
  });

  // Рисование UI
  if (gameState.player) {
    // Индикатор здоровья
    ctx.fillStyle = "#FF3860";
    ctx.fillRect(20, canvas.height - 30, gameState.player.health * 2, 10);
    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeRect(20, canvas.height - 30, 200, 10);

    // Текст "HEALTH"
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    ctx.fillText("HEALTH", 20, canvas.height - 35);

    // Индикатор куба
    if (gameState.cube.carrier === gameState.player.id) {
      ctx.fillStyle = "#2CE8F5";
      ctx.font = "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText("CUBE ACQUIRED!", canvas.width / 2, 30);
    }
  }
}

function updateScoreboard() {
  scoreboard.innerHTML = "<h3>SCORES</h3>";

  Object.values(gameState.players)
    .sort((a, b) => b.score - a.score)
    .forEach((player) => {
      const scoreItem = document.createElement("div");
      scoreItem.className = "score-item";

      const colorCircle = document.createElement("div");
      colorCircle.className = "score-color";
      colorCircle.style.backgroundColor = player.color;

      const scoreText = document.createElement("span");
      scoreText.textContent = `Player ${player.cashout + 1}: ${player.score}`;

      scoreItem.appendChild(colorCircle);
      scoreItem.appendChild(scoreText);
      scoreboard.appendChild(scoreItem);
    });
}
