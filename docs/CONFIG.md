# Конфигурация

## Переменные окружения

Файл `.env` (на основе `.env.template`):

```env
DB_HOST=mongodb+srv://<user>:<password>@cluster0.example.mongodb.net/?appName=Cluster0
PORT=5000
JWT_SECRET_KEY=<your-secret-key>
```

| Переменная | Описание | По умолчанию |
|-----------|---------|-------------|
| `DB_HOST` | URI MongoDB | — (обязательна) |
| `PORT` | Порт HTTP-сервера | `5000` |
| `JWT_SECRET_KEY` | Секрет для подписи JWT | — (обязательна) |

### Подключение к базе данных

- `users_db` — пользователи (модель `User`)
- `game_db` — игровые сессии (модель `Game`)

Обе базы создаются автоматически при первом подключении.

## Логирование

### HTTP (Morgan)

- **Development** (`NODE_ENV=development`): формат `dev` (цветной, детальный)
- **Production** (`NODE_ENV=production`): формат `short` (краткий)
- 404-ответы пропускаются

### WebSocket-ошибки (файловый логгер)

**Файл:** `src/helpers/logger/logger.js`

Все ошибки WebSocket записываются в `logs/ws-errors.log`:

```
[2024-07-30T11:09:41.865Z] [WebSocket connection rejected (origin: http://evil.com)] Error: Forbidden
[2024-07-30T11:12:04.385Z] [WebSocket error for client abc-123] Error: ...
```

Директория `logs/` создаётся автоматически.

## CORS

Настроен в `src/config/serverConfig.js`:

- Разрешённые origin'ы: `localhost:3000`, `localhost:5173`, `127.0.0.1:3000`, `127.0.0.1:5173`, `app-world-chess.vercel.app`
- Credentials: включены
- Методы: `GET`, `POST`, `DELETE`, `PUT`, `PATCH`, `OPTIONS`
- Заголовки: `Content-Type`, `Authorization`

## Colyseus

Сервер использует **[Colyseus](https://docs.colyseus.io/)** — Node.js-фреймворк для мультиплеерных игр.

### Проверка Origin

Colyseus проверяет заголовок `Origin` при handshake через настройку `server` → `verifyClient`. Неразрешённые origin'ы получают 403 Forbidden.

### Обработка ошибок

- `server.on("error", ...)` — глобальный обработчик ошибок Colyseus
- `room.on("error", ...)` — обработчик ошибок отдельной комнаты
- `room.on("unhandledException", ...)` — перехват необработанных исключений в lifecycle-методах
- Colyseus автоматически обрабатывает парсинг сообщений, десериализацию Schema и отправку патчей
- Ошибки WebSocket логируются в `logs/ws-errors.log`

### Reconnection

Colyseus предоставляет встроенную поддержку переподключения:

- `room.allowReconnection(client, milliseconds)` — разрешает переподключение в течение указанного времени
- При автоматическом переподключении клиент получает текущее состояние без повторной синхронизации
- В `onReconnect` можно восстановить пользовательские данные
