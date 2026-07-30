# WebSocket

## Технология

Сервер использует **[Colyseus](https://docs.colyseus.io/)** — Node.js-фреймворк для построения авторитарных игровых серверов с real-time state synchronization. Colyseus заменяет ручную реализацию на базе `ws` и предоставляет:

- **Rooms** — изолированные игровые сессии
- **Schema-based State** — автоматическая синхронизация состояния с клиентами
- **Matchmaking** — встроенный поиск оппонентов
- **Reconnection** — автоматическое переподключение с восстановлением позиции
- **Lifecycle hooks** — `onCreate`, `onJoin`, `onLeave`, `onDispose`

## Подключение

```
ws://localhost:5000/
```

Colyseus клиент подключается через SDK (`@colyseus/client`). Серверный WebSocket endpoint автоматически обрабатывает handshake, синхронизацию состояния и reconnection.

## Проверка Origin

При handshake Colyseus проверяет заголовок `Origin`. Подключения с неразрешённых origin'ов отклоняются с кодом **403 Forbidden**.

Разрешённые origin'ы:

- `http://localhost:3000`
- `http://localhost:5173`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:5173`
- `https://app-world-chess.vercel.app`

Все отклонённые подключения логируются в `logs/ws-errors.log`.

## Rooms

Каждая шахматная партия — это отдельная **Room** (`ChessRoom`). Room изолирует игроков одной партии от других.

### Lifecycle

| Событие | Описание |
|---------|----------|
| `onCreate` | Комната создана матчмейкером. Инициализация начального состояния |
| `onAuth` | Проверка JWT-токена клиента перед подключением |
| `onJoin` | Клиент успешно подключился |
| `onMessage` | Клиент отправил сообщение (ход, переподключение) |
| `onLeave` | Клиент покинул комнату (согласованное или неожиданное отключение) |
| `onDispose` | Комната уничтожается — финальное сохранение в MongoDB |

### Пример ChessRoom

```typescript
import { Room, Client } from "colyseus";
import { Schema, type } from "@colyseus/schema";

class ChessState extends Schema {
    @type("string") position = "";
    @type("boolean") move = true;
    @type("string") playerWite = "";
    @type("string") playerBlack = "";
    @type("number") reitingWite = 800;
    @type("number") reitingBlack = 800;
    @type("number") timeWite = 180;
    @type("number") timeBlack = 180;
    @type("string") result = "pending";
}

export class ChessRoom extends Room<ChessState> {
    maxClients = 2;

    onCreate(options) {
        this.setState(new ChessState());
        // Начальная позиция или пустая доска
    }

    onAuth(client, options, req) {
        // Проверка JWT из заголовка или query
        const token = req.headers.authorization?.split(" ")[1];
        const user = verifyToken(token);
        if (!user) return false;
        client.userData = user;
        return true;
    }

    onJoin(client, options) {
        // Игрок подключился
    }

    onMessage(client, message) {
        switch (message.event) {
            case "startApp":
                this.handleStartApp(client, message);
                break;
            case "startGame":
                this.handleStartGame(client, message);
                break;
            case "game":
                this.handleGameMove(client, message);
                break;
        }
    }

    onLeave(client, consented) {
        // Сохранить состояние в MongoDB
    }

    onDispose() {
        // Финальное сохранение результата в MongoDB
    }
}
```

## Протокол сообщений

Все сообщения — JSON-объекты. Клиент отправляет события через поле `event`.

### `startApp`

Отправляется при подключении или переподключении. Сервер возвращает текущую игровую сессию, если она есть.

```json
{
  "event": "startApp",
  "token": "<JWT_TOKEN>",
  "color": "wite"
}
```

### `startGame`

Начать новую игру или найти оппонента.

```json
{
  "event": "startGame",
  "token": "<JWT_TOKEN>",
  "color": "wite",
  "typeGame": "standart",
  "timeControl": 180,
  "timePluse": 2
}
```

### `game`

Отправить ход.

```json
{
  "event": "game",
  "token": "<JWT_TOKEN>",
  "position": ["rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR"],
  "move": "e2e4"
}
```

## События сервера

### Приветствие

Отправляется автоматически при подключении.

```json
{
  "mesRes": {
    "message": "ws connect",
    "idWs": "<uuid>"
  }
}
```

### Результат `startApp`

Текущая игровая сессия или пустой ответ.

```json
{
  "mesRes": {
    "idGame": "<game_id>",
    "position": [...],
    "playerWite": "WhitePlayer",
    "playerBlack": "BlackPlayer",
    "reitingWite": 1200,
    "reitingBlack": 1150,
    "timeWite": 180,
    "timeBlack": 180,
    "move": true,
    "message": "game"
  }
}
```

### Результат `startGame`

```json
{
  "mesRes": {
    "idGame": "<game_id>",
    "message": "startGame",
    "opponentId": "<opponent_user_id>",
    "typeGame": "standart",
    "timeControl": 180,
    "timePluse": 2,
    "playerWite": "WhitePlayer",
    "playerBlack": "BlackPlayer",
    "reitingWite": 1200,
    "reitingBlack": 1150
  }
}
```

### Результат `game`

Обновлённая позиция после хода. Колyseus автоматически синхронизирует изменения state со всеми подключёнными клиентами.

```json
{
  "mesRes": {
    "idGame": "<game_id>",
    "position": [...],
    "playerWite": "WhitePlayer",
    "playerBlack": "BlackPlayer",
    "reitingWite": 1200,
    "reitingBlack": 1150,
    "timeWite": 175,
    "timeBlack": 180,
    "move": false,
    "message": "game"
  }
}
```

## Обработка ошибок

Все ошибки WebSocket логируются в `logs/ws-errors.log`:

- Ошибки подключения (неверный origin)
- Ошибки парсинга JSON
- Ошибки аутентификации
- Ошибки при отправке сообщений клиенту
- Ошибки уровня сервера

Colyseus также предоставляет встроенные механизмы:
- `onUnhandledException` — перехват необработанных исключений в lifecycle-методах
- Автоматическое логирование ошибок соединений
