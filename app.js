const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Конфигурация игры
const config = {
  width: 800,
  height: 600,
  cube: { x: 400, y: 300 },
  cashouts: [
    { x: 50, y: 50, color: "#FF3860" }, // Красный
    { x: 750, y: 50, color: "#2CE8F5" }, // Голубой
    { x: 50, y: 550, color: "#FFA630" }, // Оранжевый
    { x: 750, y: 550, color: "#A846A0" }, // Фиолетовый
  ],
};

const players = {};
const bullets = [];
let cube = { x: config.cube.x, y: config.cube.y, carrier: null };

function getRandomSpawnPoint(index) {
  return {
    x: config.cashouts[index].x + 20,
    y: config.cashouts[index].y + 20,
  };
}

function checkCollision(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < r1 + r2;
}

io.on("connection", (socket) => {
  console.log("New player connected:", socket.id);

  // Назначение цвета и позиции
  const playerCount = Object.keys(players).length;
  const colorIndex = playerCount % 4;

  players[socket.id] = {
    id: socket.id,
    ...getRandomSpawnPoint(colorIndex),
    radius: 15,
    speed: 3,
    rotation: 0,
    health: 100,
    color: config.cashouts[colorIndex].color,
    score: 0,
    cashout: colorIndex,
  };

  // Отправка начальных данных
  socket.emit("init", {
    player: players[socket.id],
    config,
    players,
    bullets,
    cube,
  });

  // Уведомление других игроков
  socket.broadcast.emit("playerConnected", players[socket.id]);

  // Движение игрока
  socket.on("move", (data) => {
    const player = players[socket.id];
    if (!player || player.health <= 0) return;

    const newX = player.x + data.dx * player.speed;
    const newY = player.y + data.dy * player.speed;

    // Границы карты
    if (
      newX >= 0 &&
      newX <= config.width &&
      newY >= 0 &&
      newY <= config.height
    ) {
      player.x = newX;
      player.y = newY;
      player.rotation = data.rotation;

      // Перенос куба, если игрок его несет
      if (cube.carrier === socket.id) {
        cube.x = player.x;
        cube.y = player.y;
        io.emit("cubeMoved", cube);
      }

      // Проверка доставки куба
      if (cube.carrier === socket.id) {
        const cashout = config.cashouts[player.cashout];
        if (checkCollision(player.x, player.y, 20, cashout.x, cashout.y, 30)) {
          player.score += 1;
          cube.carrier = null;
          cube.x = config.cube.x;
          cube.y = config.cube.y;
          io.emit("cubeDelivered", {
            playerId: socket.id,
            cube,
            score: player.score,
          });
        }
      }

      // Проверка поднятия куба
      if (
        !cube.carrier &&
        checkCollision(player.x, player.y, 15, cube.x, cube.y, 10)
      ) {
        cube.carrier = socket.id;
        io.emit("cubePicked", { playerId: socket.id });
      }

      io.emit("playerMoved", {
        id: socket.id,
        x: player.x,
        y: player.y,
        rotation: player.rotation,
      });
    }
  });

  // Выстрел
  socket.on("shoot", () => {
    const player = players[socket.id];
    if (!player || player.health <= 0) return;

    const bullet = {
      id: Date.now().toString(),
      x: player.x,
      y: player.y,
      rotation: player.rotation,
      speed: 7,
      owner: socket.id,
      color: player.color,
    };

    bullets.push(bullet);
    io.emit("bulletFired", bullet);
  });

  // Отключение игрока
  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    // Если игрок нес куб, он падает
    if (cube.carrier === socket.id) {
      cube.carrier = null;
      io.emit("cubeDropped", cube);
    }

    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });
});

// Игровой цикл
setInterval(() => {
  // Обновление пуль
  bullets.forEach((bullet, index) => {
    const dx = Math.sin(bullet.rotation) * bullet.speed;
    const dy = -Math.cos(bullet.rotation) * bullet.speed;

    bullet.x += dx;
    bullet.y += dy;

    // Проверка выхода за границы
    if (
      bullet.x < 0 ||
      bullet.x > config.width ||
      bullet.y < 0 ||
      bullet.y > config.height
    ) {
      bullets.splice(index, 1);
      io.emit("bulletRemoved", bullet.id);
      return;
    }

    // Проверка попадания в игрока
    for (const playerId in players) {
      if (playerId !== bullet.owner) {
        const player = players[playerId];

        if (
          player.health > 0 &&
          checkCollision(
            bullet.x,
            bullet.y,
            5,
            player.x,
            player.y,
            player.radius
          )
        ) {
          player.health -= 25;
          bullets.splice(index, 1);

          io.emit("playerHit", {
            playerId: playerId,
            health: player.health,
            bulletId: bullet.id,
          });

          if (player.health <= 0) {
            // Если игрок нес куб, он падает
            if (cube.carrier === playerId) {
              cube.carrier = null;
              cube.x = player.x;
              cube.y = player.y;
              io.emit("cubeDropped", cube);
            }

            // Возрождение игрока
            setTimeout(() => {
              const spawn = getRandomSpawnPoint(player.cashout);
              player.x = spawn.x;
              player.y = spawn.y;
              player.health = 100;
              io.emit("playerRespawned", {
                id: playerId,
                x: player.x,
                y: player.y,
                health: player.health,
              });
            }, 2000);

            io.emit("playerDied", playerId);
          }

          return;
        }
      }
    }
  });
}, 16);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
