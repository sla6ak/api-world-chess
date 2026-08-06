# Архитектура сервера

## Обзор

Сервер — Node.js Express application с интегрированным Colyseus WebSocket-сервером. Обрабатывает REST API для авторизации и управления пользователями, а также WebSocket-коммуникацию для real-time игрового процесса.

## Слои приложения

```
┌─────────────────────────────────────────────┐
│              HTTP Layer                        │
│  ┌───────────────────────────────────────┐  │
│  │  Express + Morgan (HTTP logging)     │  │
│  │  ├─ /auth/*  (регистрация, логин)   │  │
│  │  └─ /game/*  (поиск, отмена)        │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│              WebSocket Layer                   │
│  ┌───────────────────────────────────────┐  │
│  │  Colyseus Server                       │  │
│  │  ├─ verifyClient (Origin check)       │  │
│  │  └─ chess_room (ChessRoom)            │  │
│  │     ├─ onAuth (JWT проверка)          │  │
│  │     ├─ onJoin (назначение стороны)    │  │
│  │     ├─ onMessage (ходы, поиск)        │  │
│  │     ├─ onLeave (отключение)            │  │
│  │     └─ onDispose (финальное сохранение)│  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│              Data Layer                        │
│  ┌───────────────────────────────────────┐  │
│  │  MongoDB                               │  │
│  │  ├─ users_db → User model             │  │
│  │  └─ game_db → Game model              │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│              Utilities                         │
│  ┌───────────────────────────────────────┐  │
│  │  createError — фабрика ошибок         │  │
│  │  statusCode — HTTP статус-коды        │  │
│  │  logger — файловое логирование WS     │  │
│  │  authenticate — JWT middleware (REST) │  │
│  │  authenticateWs — JWT util (WS)       │  │
│  │  userValidation — Joi схемы           │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Поток данных

### Регистрация

```
Client → POST /auth/signup → Joi validation → bcrypt.hash(password, 12)
  → UserModel.create() → 201 { user }
```

### Логин

```
Client → POST /auth/login → Joi validation → UserModel.findOne({ email })
  → bcrypt.compare(password, hash) → jwt.sign({ id }, JWT_SECRET_KEY, { expiresIn: "30d" })
  → UserModel.findByIdAndUpdate(_id, { token }) → 200 { user }
```

### WebSocket подключение

```
Client → WS handshake → verifyClient (Origin check)
  → ChessRoom.onAuth(client, options) → jwt.verify(token, JWT_SECRET_KEY)
    → client.userData = decoded user
    → client.role assigned ("wite" or "black")
  → ChessRoom.onJoin(client) → broadcast если оба игрока подключены
```

### Поиск игры

```
Client → REST POST /game/find → GameController.createSearchRoom()
  → GameModel.findOne({ statusGame: "open", result: "pending", ... })
    → Если найдена → назначить ownerBlack, statusGame: "close"
    → Если не найдена → GameModel.create({ statusGame: "open", ... })

Client → WS connect → ChessRoom.onJoin()
  → При подключении второго игрока → broadcast "gameStart" обоим клиентам

Client → WS "findGame" → ChessRoom.handleFindGame()
  → Если игра уже стартовала (this.gameData установлен) → обновить параметры, не рассылать gameStart повторно
  → Если игра не стартовала → сохранить в MongoDB и расслать gameStart
  → Если только один игрок → send "searching" ожидающему
```

### Игровой ход

```
Client → WS "game" → ChessRoom.handleGameMove()
  → Обновить this.state.position, this.state.move
  → this.broadcast("game", { ... }) → оба клиента получают обновление
```

### Завершение игры

```
Client → WS "gameOver" → ChessRoom.handleGameOver()
  → GameModel.findByIdAndUpdate(roomId, { result, dateGameOver })
  → this.broadcast("gameOver", { ... }) → оба клиента
  → onDispose → финальное сохранение (если result !== "pending")
```

### Отключение игрока

```
WebSocket close → ChessRoom.onLeave(client)
  → Если game status "open" → GameModel.deleteOne (удалить незапущенную)
  → Если game status "close" → GameModel.updateOne (сохранить позицию)
  → Уведомить оппонента
```

## Маршрутизация REST

```
/auth/signup   → POST → signupValidation → user.addNewUser
/auth/login    → POST → loginValidation  → user.userLogin
/auth/current  → GET  → authenticate     → user.getCurrentUser
/auth/logout   → POST → authenticate     → user.logOutUser
/auth/delete   → DELETE → authenticate   → user.delete

/game/find     → POST → authenticate   → game.createSearchRoom
/game/cancel   → POST → authenticate   → game.cancelSearchRoom
```

## Аутентификация

### REST (middleware `authenticate`)

```ts
// Извлекает JWT из Authorization header, верифицирует, ищет пользователя
// Устанавливает req.user на найденного пользователя
// Если токен невалиден или пользователь не найден → 401
```

### WebSocket (Colyseus `onAuth`)

```ts
// Извлекает JWT из options.token (передаётся при joinOrCreate)
// Верифицирует токен, находит пользователя
// Если валиден → client.userData = decoded, возвращает true
// Если невалиден → возвращает false (403)
```

> **Примечание:** `authenticateWs` в `src/middleware/authenticateWs.ts` — утилита для верификации JWT, но в текущей реализации `onAuth` ChessRoom выполняет верификацию напрямую, не вызывая `authenticateWs`.
