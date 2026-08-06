# 2. Схемы и Архитектура Приложения (System Architecture & Tree)

## 2.1 Дерево проекта

```
chess/
├── dev.sh / dev-config.json     # Локальный лаунчер: backend (:5000) → frontend (:3000)
├── docs/                        # Общая документация (этот каталог)
│
├── api-world-chess/             # ── BACKEND ──
│   └── src/
│       ├── server.ts            # Точка входа: HTTP-логирование, монтирование /auth и /game, 404 + error-handlers, listen(PORT)
│       ├── config/
│       │   └── serverConfig.ts  # Express app + http.Server + Colyseus Server(WebSocketTransport) на ОДНОМ порту;
│       │                        #   verifyClient (origin whitelist), define("chess_room").filterBy(["gameId"]), CORS, morgan
│       ├── routers/
│       │   ├── auth.routes.ts   # /auth: signup, login, current, logout, delete (JWT в Authorization: Bearer)
│       │   └── game.routes.ts   # /game: find, status/:gameId, active, cancel, :gameId/result (всё за authenticate)
│       ├── controllers/
│       │   ├── user.ts          # Регистрация (bcrypt 12), логин (JWT 30d, токен пишется в user.token), logout (token="")
│       │   └── game.ts          # Матчмейкинг: createSearchRoom / getGameStatus / cancelSearchRoom / getActiveGame / submitGameResult
│       ├── middleware/
│       │   ├── authenticate.ts  # REST-авторизация: Bearer JWT → verify → сверка user.token (single-session!)
│       │   ├── authenticateWs.ts# Заготовка WS-авторизации (фактически onAuth делает это сам)
│       │   └── userValidation.ts# Joi-схемы signup/login (email .com/.net, password 6..15)
│       ├── models/
│       │   ├── user.ts          # Mongoose-коннект → БД users_db: name, email, password, currentReiting, статистика, token
│       │   └── game.ts          # Mongoose-коннект → БД game_db: игроки, позиция, часы, pgn, moveHistory, result, endReason
│       ├── rooms/
│       │   └── ChessRoom.ts     # Ядро WS-логики: onCreate/onAuth/onJoin/onLeave/onDispose,
│       │                        #   хендлеры make_move/gameMove/resign_game/offer_draw, finalize + Elo, saveGameToDb
│       ├── services/
│       │   ├── GameManager.ts   # In-memory менеджер одной партии: chess.js-движок, часы (tick 1с),
│       │                        #   реконнект-таймер, ничьи/мат/таймаут/сдача, snapshot() для MongoDB
│       │   └── boardConverter.ts# flat-64-строка ↔ FEN; getGameOutcome(); rebuildChessFromHistory()
│       ├── utils/logger.ts      # logError → файловое логирование
│       ├── errors/, responses/  # createError(status, message), дефолтные ответы (частично legacy)
│       └── types/express.d.ts   # Расширение Request (req.user)
│
└── app-world-chess/             # ── FRONTEND ──
    └── src/
        ├── index.tsx            # Bootstrap: Provider(store) + PersistGate + ToastContainer
        ├── app/App.tsx          # Роутинг + глобальные подписки на WS-сообщения комнаты
        │                        #   (gameStart / game / gameOver / move_made / timers / gameResumed / draw_*),
        │                        #   авто-реконнект к активной партии при загрузке
        ├── config/testURL.ts    # BASE_URL (REST) и socketUrl; WS URL захардкожен также в services/client.ts
        ├── services/
        │   ├── client.ts        # new Colyseus.Client("ws://localhost:5000") — единая точка WS-подключения
        │   ├── roomManager.ts   # Синглтон-хранилище активной комнаты (setRoom/getRoom) — вне React-дерева
        │   └── wsMessages.ts    # Фабрики legacy-сообщений (idWs/event...) — частично мёртвый код
        ├── redux/
        │   ├── store.ts         # configureStore + redux-persist (whitelist: token, wsId, theme) + authApi.middleware
        │   ├── api/authApi.ts   # RTK Query: /auth/* + /game/find|cancel|active (Bearer из state.token)
        │   ├── slices/
        │   │   ├── room.ts      # Каноническое состояние активной партии: gameStarted, gameData{idGame, position, часы, ...}
        │   │   ├── gameEvents.ts# Машина статусов idle→searching→playing→gameover; searchGameId; drawOfferedBy
        │   │   ├── user.ts      # userName + stats {rating, gamesPlayed, wins, losses, draws, maxRating}
        │   │   ├── color.ts     # colorGame: "wite" | "black" — мой цвет в текущей партии
        │   │   ├── token.ts     # JWT (persisted)
        │   │   ├── wsID.ts      # legacy-срез (исторический idWs), фактически не используется новой логикой
        │   │   └── theme.ts     # Тема оформления (persisted)
        │   └── thunks/roomThunks.ts # startSearch/cancelSearch (REST) + connectToRoom/resignGame/offerDraw/... (WS)
        ├── features/game/
        │   ├── GameMenu.tsx     # Сетка контролей времени → startSearch → connectToRoom; баннер "уже есть активная игра"
        │   ├── ModalFindGame.tsx# Модалка "Searching for opponent"
        │   └── GameArea.tsx     # Доска + часы: локальный chess.js, оптимистичные ходы, подписки move_made/move_error,
        │                        #   локальный отсчёт 100 мс + жёсткая ресинхронизация по серверным таймерам
        ├── hooks/
        │   └── useCurrentGameNavigation.ts # Кнопка "Current game": GET /game/active → gameStartSuccess → connectToRoom → /game
        ├── helpers/
        │   ├── boardCoords.ts   # boardIndex ↔ клетка a1..h8
        │   ├── theme.ts         # resolvePlayerColor(myName, gameData) → "wite"|"black"; applyTheme
        │   ├── roomSerializer.ts# toGameData() — нормализация WS-сообщений в форму Redux gameData; parseGameOverEvent()
        │   ├── gameTypes.ts     # Типы (GameOverInfo и пр.)
        │   └── showFigure.ts    # Маппинг символа фигуры → ассет
        ├── components/          # UI: Layout, PlayerInfo (блоки игроков + часы + кнопки резин/ничья), Modal, Sidebar, ...
        └── pages/               # LoginPage, RegisterPage, DashboardPage (редирект /game или /home по curentG)
```

## 2.2 Схема логических блоков

```mermaid
flowchart LR
    subgraph CLIENT["Client (app-world-chess :3000)"]
        UI["React UI\nGameMenu / GameArea"]
        RS["Redux Store\nroom / gameEvents / user / color"]
        CJS["Colyseus.js Client\n(services/client.ts)"]
        CHESS["chess.js (local mirror)"]
        UI <--> RS
        UI <--> CHESS
        UI <--> CJS
    end

    subgraph SERVER["Server (api-world-chess :5000)"]
        subgraph EXP["Express (REST)"]
            AUTH["/auth/*\nsignup, login, current,\nlogout, delete"]
            GAME["/game/*\nfind, status, active, cancel, result"]
            JWT["middleware/authenticate\nBearer JWT + user.token check"]
        end
        subgraph COLY["Colyseus Gateway (WS)"]
            ROOM["ChessRoom\nmaxClients=2, filterBy(gameId)"]
        end
        subgraph MEM["In-Memory"]
            GM["GameManager\nchess.js + timers + reconnect timer"]
        end
    end

    subgraph DB["MongoDB (DB_HOST)"]
        UDB[("users_db.users")]
        GDB[("game_db.games")]
    end

    AUTH --> UDB
    GAME --> JWT --> GDB
    CJS -- "REST /game/find, /auth/*" --> EXP
    CJS -- "WS: make_move, resign_game, offer_draw" --> ROOM
    ROOM -- "broadcast: gameStart, move_made,\ntimers, gameOver, draw_offered, ..." --> CJS
    ROOM <--> GM
    GAME -->|create/update game doc| GDB
    ROOM -.->|final write / disconnect snapshot| GDB
    ROOM -->|Elo update on finalize| UDB

    RS -. "navigate('/game')" .-> UI
```

## 2.3 Жизненный цикл партии (крупными мазками)

```mermaid
sequenceDiagram
    participant P1 as Клиент P1 (белые)
    participant P2 as Клиент P2 (чёрные)
    participant API as REST /game
    participant WS as ChessRoom (Colyseus)
    participant GM as GameManager
    participant DB as MongoDB game_db

    P1->>API: POST /game/find (timeControl, timePluse)
    API->>DB: create statusGame=open, ownerWite=P1
    P1->>WS: joinOrCreate(chess_room, {token, gameId})
    WS->>DB: findById(gameId), проверка owner
    Note over P1,WS: P1 ждёт в комнате (без GameManager)
    P2->>API: POST /game/find (те же параметры)
    API->>DB: findOne(open, ownerBlack=null) → assign ownerBlack=P2, statusGame=close
    P2->>WS: joinOrCreate(chess_room, {token, gameId})
    WS->>GM: restore(gameId, doc) — часы полные
    WS-->>P1: opponent_joined + gameStart
    WS-->>P2: gameStart
    Note over P1,P2: navigate('/game'), локальный chess.js ← START_FEN

    loop Партия
        P1->>WS: make_move {from, to, promotion}
        WS->>GM: handleMove(role, move) — валидация chess.js
        GM-->>WS: ok | {error}
        WS-->>P1: move_made {fen, timers, nextTurn, pgn}
        WS-->>P2: move_made {…то же…}
        Note over GM: каждую секунду tick → syncClocks
        WS-->>P1: timers {white, black}
        WS-->>P2: timers {white, black}
    end

    alt Завершение (мат / resign / timeout / draw)
        GM-->>WS: onGameOver / onFlagFall / onAbandonment
        WS->>DB: финальная запись (result, endReason, pgn, dateGameOver)
        WS->>DB: обновление рейтинга users_db (Elo K=32)
        WS-->>P1: gameOver {result, winnerRole, endReason}
        WS-->>P2: gameOver {…}
        Note over P1,P2: navigate('/home')
    end

    alt Дисконнект игрока
        P2--xWS: socket closed
        WS->>GM: handleDisconnect(role) → paused + reconnectTimer
        WS->>DB: аварийный snapshot (paused=true)
        WS-->>P1: opponent_disconnected
        GM-->>WS: onAbandonment (через reconnectionTimeout=60с)
    end
```

## 2.4 Модель состояний (state machines)

### Redux `gameEvents.status` (клиент)

```
idle ──setSearchMode──▶ searching ──(gameStart WS)──▶ playing ──(gameOver WS)──▶ gameover ──resetGameEvents──▶ idle
  ▲                        │                                                              │
  └────── resetGameEvents ◀┘ (cancel поиска / не удалось подключиться к комнате)          │
  ◀──────────────────────────  (есть также auto-reset при вызове startSearch) ─────────────┘
```

Ключевой маппинг источников истины:

| Данные | Клиент (Redux) | WS-комната (Colyseus state) | In-Memory (GameManager) | MongoDB (`games`) |
|---|---|---|---|---|
| Позиция | `room.gameData.fen` / `position[]` | `state.position`, `state.move` | `chess.js` instance | `position`, `move`, `pgn`, `moveHistory`, `finalFen` |
| Часы (pxт) | `room.gameData.timeWite/timeBlack` + локальный ref-таймер | `state.timeWite/timeBlack` | `timers {white, black}`, tick 1с | `timeWite`, `timeBlack` (снапшот) |
| Статус | `gameEvents.status` | `state.result` (`pending` или финальный), `state.statusGame` | `status` active/paused/finished | `result` + `endReason` |
| Игроки | `gameData.playerWite/playerBlack` | state поля | — | `ownerWite/ownerBlack`, `name*`, `reiting*` |
| Мой цвет | `colorGame` + селектор `selectPlayerColor` | `client.role` ("wite"/"black") | — | `owner*` сравнение |

### ChessRoom / GameManager `status`

```
(комната создана, ждёт P2) → [restore] active ⇄ paused (onLeave/handleReconnect)
                                       │
              ┌── мат/пат/ничьи ───────┼── resign ──┬── timeout (flagFall) ──┬── abandonment
              ▼                        ▼            ▼                        ▼
                          finished → finalizeAndBroadcast → MongoDB + Elo → gm.dispose()
```

## 2.5 Транспортные замечания

- **Один порт — два протокола.** Express и Colyseus делят `http.Server`: HTTP — `/auth`, `/game`; WS — апгрейд Colyseus по тому же :5000. `verifyClient` проверяет `Origin` по whitelist.
- **`filterBy(["gameId"])`.** Colyseus маршрутизирует `joinOrCreate("chess_room", {gameId})` в одну и ту же комнату для одного и того же mongo-`gameId` (roomId Colyseus ≠ gameId; фронт после коннекта диспатчит `connectRoomSuccess({roomId: gameId})` — фактически хранит **mongo id**, см. [07-known-issues.md](./07-known-issues.md)).
- **State комнаты — plain object**, не @colyseus/schema. Синхронизация состояния делается вручную через `broadcast(...)`; сгенерированный Colyseus state-патчинг не используется (room.setState просто обновляет локальный объект, доступный `this.state`).
- **Двойные подписки на клиенте.** Подписки на `move_made`/`move_error` есть и в `App.tsx` (запись в Redux), и в `GameArea.tsx` (локальный движок/часы). Это осознанное разделение зон ответственности, но источник рассинхронизации при забытых зависимостях хуков — см. реестр проблем.
