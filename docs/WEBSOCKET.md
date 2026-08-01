# WebSocket Протокол — ChessRoom

## Подключение

Colyseus сервер определяет комнату `chess_room`. Клиент подключается через Colyseus client SDK:

```ts
const client = new Colyseus.Client("ws://localhost:5000");
const room = await client.joinOrCreate("chess_room", { token: jwtToken });
```

### Проверка Origin

Colyseus `WebSocketTransport` проверяет заголовок `Origin` при handshake. Разрешены:

- `http://localhost:3000`
- `http://localhost:5173`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`
- `https://app-world-chess.vercel.app`

В режиме разработки (`NODE_ENV=development`) разрешены все `localhost` и `127.0.0.1` origins.

---

## Аутентификация (onAuth)

При подключении клиент передаёт JWT токен в опциях:

```ts
room = await client.joinOrCreate("chess_room", { token: jwtToken });
```

Внутри `ChessRoom.onAuth()` токен верифицируется через `jwt.verify(token, JWT_SECRET_KEY)`. Если валиден — `client.userData` устанавливается на декодированный объект пользователя, метод возвращает `true`. Если невалиден — возвращает `false` (клиент получает 403).

---

## Состояние комнаты (Room State)

При создании комнаты (`onCreate`) устанавливается начальное состояние:

```ts
{
  position: ["rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR"],
  move: true,
  playerWite: "",
  playerBlack: "",
  reitingWite: 800,
  reitingBlack: 800,
  timeWite: 0,
  timeBlack: 0,
  result: "pending",
  idGame: this.roomId,
  typeGame: "standart",
  timeControl: 0,
  timePluse: 0,
}
```

| Поле           | Тип      | По умолчанию | Описание |
|----------------|----------|-------------|----------|
| `position`     | string[] | `["rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR"]` | Шахматная доска (FEN-подобная нотация) |
| `move`         | boolean  | `true`      | Чей ход (`true` = белые) |
| `playerWite`   | string   | `""`        | Имя белого игрока |
| `playerBlack`  | string   | `""`        | Имя чёрного игрока |
| `reitingWite`  | number   | `800`       | Рейтинг белого |
| `reitingBlack` | number   | `800`       | Рейтинг чёрного |
| `timeWite`     | number   | `0`         | Оставшееся время белых (сек) |
| `timeBlack`    | number   | `0`         | Оставшееся время чёрных (сек) |
| `result`       | string   | `"pending"` | Результат: `"pending"`, `"1-0"`, `"0-1"`, `"0.5-0.5"` |
| `idGame`       | string   | `roomId`    | ID комнаты |
| `typeGame`     | string   | `"standart"`| Тип игры |
| `timeControl`  | number   | `0`         | Контроль времени |
| `timePluse`    | number   | `0`         | Плюс времени за ход |

---

## Назначение сторон (onJoin)

При подключении первого игрока ему назначается роль `"wite"` (белые). При подключении второго — `"black"` (чёрные). Если оба игрока уже в комнате — назначение не происходит.

При подключении второго игрока создаётся запись в MongoDB (`game_db`, коллекция `game`):

```ts
{
  statusGame: "close",
  nameWite: playerWite,
  ownerWite: witeClient.userData._id,
  reitingWite: reitingWite,
  nameBlack: playerBlack,
  ownerBlack: userId,
  reitingBlack: reitingBlack,
}
```

> **Важно:** Игра стартует автоматически при подключении второго игрока. Событие `gameStart` с данными о соперниках рассылается обоим клиентам сразу после подключения второго игрока.

---

## События (на вход от клиента → сервер)

### `findGame`

Клиент отправляет запрос на поиск/старт игры.

**Параметры:**

| Поле          | Тип    | Описание |
|---------------|--------|----------|
| `token`       | string | JWT токен |
| `color`       | string | Желаемая сторона (`"wite"` или `"black"`) |
| `typeGame`    | string | Тип игры |
| `timeControl` | number | Контроль времени |
| `timePluse`   | number | Плюс времени за ход |

**Логика:**

1. Если игрок ещё не назначен — назначается свободной стороне
2. Если оба игрока в комнате и игра ещё не стартовала (`this.gameData` не установлен) — сохраняет игру в MongoDB и рассылает `gameStart` обоим
3. Если оба игрока в комнате и игра уже стартовала (`this.gameData` установлен из `onJoin`) — обновляет параметры поиска в MongoDB, повторная рассылка `gameStart` не происходит
4. Если только один игрок — отправляет `searching` ожидающему клиенту

### `startApp`

Клиент запрашивает текущее состояние игры.

**Параметры:** произвольные (не используются)

**Ответ:** сервер отправляет `mesRes` с полем `message: "game"` и текущим состоянием (позиция, стороны, рейтинги, время, ход).

> **Примечание:** Ответ сериализуется через `JSON.stringify()` и отправляется через `client.send()` — это нестандартный Colyseus паттерн (обычно используют `client.send(eventName, data)`).

### `startGame`

Клиент запрашивает рассылку текущего состояния всем игрокам в комнате.

**Параметры:** произвольные (не используются)

**Действие:** `this.broadcast("game", { ... })` — рассылает текущее состояние обоим клиентам.

### `gameOver`

Клиент сообщает о завершении игры.

**Параметры:**

| Поле            | Тип    | Описание |
|-----------------|--------|----------|
| `result`        | string | Результат: `"1-0"`, `"0-1"`, `"0.5-0.5"` |
| `ratingChange`  | number | Изменение рейтинга для текущего клиента |

**Действие:**

1. Обновляет `this.state.result`
2. Определяет результат для текущего клиента (`"win"`, `"loss"`, `"draw"`)
3. Сохраняет результат и дату завершения в MongoDB
4. Рассылает `gameOver` обоим клиентам с данными о результате

> **Примечание:** Метод `handleGameMove` определён в `ChessRoom.ts` (обрабатывает `position` и `move`), но **не зарегистрирован** как обработчик `onMessage`. В текущей реализации ходы не обрабатываются на сервере — клиентская сторона управляет позицией, а сервер только рассылает текущее состояние по запросу (`startGame`).

### `cancelSearch`

Клиент отменяет поиск игры.

**Параметры:**

| Поле      | Тип    | Описание |
|-----------|--------|----------|
| `gameId`  | string | `_id` игры для удаления |

**Действие:**

1. Находит и удаляет незапущенную игру из MongoDB (`statusGame: "open"`, `result: "pending"`)
2. Отправляет `search_cancelled` отменившему клиенту
3. Если оппонент в комнате — отправляет `search_cancelled_by_opponent`
4. Закрывает комнату (`this.disconnect()`)

---

## События (на выход от сервера → клиент)

| Событие                   | Описание |
|---------------------------|----------|
| `gameStart`               | Игра началась — полная информация о партии |
| `game`                    | Обновление состояния игры (позиция, стороны, рейтинги, время, ход) |
| `searching`               | Ожидание второго игрока |
| `search_cancelled`        | Поиск отменён (отправляется отменившему) |
| `search_cancelled_by_opponent` | Поиск отменён оппонентом |
| `gameOver`                | Игра завершена — результат и изменение рейтинга |

> **Примечание:** Событие `game` — единственный способ сервера рассылать обновления состояния. Метод `handleGameMove` определён в `ChessRoom.ts`, но не зарегистрирован как обработчик `onMessage` — в текущей реализации сервер не обрабатывает ходы автоматически.

### Формат `gameStart`

```json
{
  "idGame": "roomId",
  "position": [...],
  "playerWite": "Name1",
  "playerBlack": "Name2",
  "reitingWite": 800,
  "reitingBlack": 800,
  "timeWite": 0,
  "timeBlack": 0,
  "move": true,
  "typeGame": "standart",
  "timeControl": 180,
  "timePluse": 2,
  "message": "gameStart"
}
```

### Формат `game`

```json
{
  "idGame": "roomId",
  "position": [...],
  "playerWite": "Name1",
  "playerBlack": "Name2",
  "reitingWite": 800,
  "reitingBlack": 800,
  "timeWite": 0,
  "timeBlack": 0,
  "move": true,
  "message": "game"
}
```

### Формат `gameOver`

```json
{
  "status": "gameover",
  "gameOverData": {
    "result": "win" | "loss" | "draw",
    "ratingChange": 12,
    "finalResult": "1-0" | "0-1" | "0.5-0.5",
    "message": "gameOver"
  }
}
```

### Формат `searching`

```json
{
  "searchData": {
    "typeGame": "standart",
    "timeControl": 180,
    "timePluse": 2
  }
}
```

### Формат `mesRes` (startApp, cancelSearch)

```json
{
  "mesRes": {
    "message": "game" | "not_in_game" | "search_cancelled" | "search_cancelled_by_opponent" | "opponent_disconnected",
    "idGame": "...",
    "position": [...],
    "playerWite": "...",
    "playerBlack": "...",
    "reitingWite": 800,
    "reitingBlack": 800,
    "timeWite": 0,
    "timeBlack": 0,
    "move": true,
    "opponentRole": "wite" | "black"
  }
}
```

---

## Жизненный цикл комнаты

### onDispose

Вызывается при уничтожении комнаты (после отключения всех клиентов). Если игра завершена (`result !== "pending"`), финально сохраняет результат в MongoDB.

### onLeave

Вызывается при отключении клиента. Логика:

1. Если отключившийся — белые или чёрные — уведомляет оппонента через `mesRes` с `message: "opponent_disconnected"` и `opponentRole`
2. Если игра не начата (`statusGame: "open"`, `result: "pending"`) — удаляет запись из MongoDB
3. Если игра начата — сохраняет текущее состояние (`position`, `move`) в MongoDB
