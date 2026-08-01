# Конфигурация — api-world-chess

## Переменные окружения

Файл `.env` (шаблон: `.env.template`):

```env
DB_HOST=mongodb://localhost:27017
PORT=5000
JWT_SECRET_KEY=your-secret-key-here
```

### `DB_HOST`

Строка подключения к MongoDB. Используется обоими подключениями (`users_db` и `game_db`).

Примеры:
```
mongodb://localhost:27017
mongodb://user:password@localhost:27017
mongodb+srv://user:password@cluster.mongodb.net
```

### `PORT`

Порт HTTP-сервера (Express) и WebSocket-сервера (Colyseus). По умолчанию `5000`.

### `JWT_SECRET_KEY`

Секретный ключ для подписи и верификации JWT токенов. Должен быть длинной и сложной строкой.

---

## Конфигурация сервера (`src/config/serverConfig.ts`)

### CORS

Разрешённые origins:

```ts
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://app-world-chess.vercel.app",
];
```

В режиме разработки (`NODE_ENV=development`) разрешены все `localhost` и `127.0.0.1` origins.

CORS настройки:
- **Methods:** `GET, POST, DELETE, PUT, PATCH, OPTIONS`
- **Allowed Headers:** `Content-Type, Authorization`
- **Credentials:** `true`

### Colyseus WebSocket

Транспорт: `WebSocketTransport` (на базе `ws`).

Проверка клиента (`verifyClient`):
- Проверяет заголовок `Origin`
- Если origin в `allowedOrigins` — разрешает
- Если origin не разрешён — отклоняет с `403 Forbidden`

### Определение комнаты

```ts
colyseusServer.define("chess_room", ChessRoom);
```

Комната `chess_room` — единственная комната на сервере.

### Логирование HTTP-запросов

- **Development:** формат `dev` (цветной, подробный)
- **Production:** формат `short` (компактный)
- Пропускает логирование 404-ответов

### Middleware

```ts
app.use(cors(optionCors));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));
```

---

## Структура проекта (файловая)

```
api-world-chess/
├── src/
│   ├── server.ts                  # Точка входа
│   ├── config/
│   │   └── serverConfig.ts        # Express + Colyseus конфигурация
│   ├── controllers/
│   │   ├── user.ts                # Пользователи (CRUD)
│   │   └── game.ts                # Игровые сессии (REST)
│   ├── middleware/
│   │   ├── authenticate.ts        # JWT middleware для REST
│   │   ├── authenticateWs.ts      # JWT утилита для WebSocket
│   │   └── userValidation.ts      # Joi валидация
│   ├── models/
│   │   ├── user.ts                # Mongoose User model
│   │   └── game.ts                # Mongoose Game model
│   ├── rooms/
│   │   └── ChessRoom.ts           # Colyseus Room
│   ├── routers/
│   │   ├── auth.routes.ts         # /auth/* маршруты
│   │   └── game.routes.ts         # /game/* маршруты
│   ├── errors/
│   │   ├── createError.ts         # Фабрика ошибок
│   │   ├── index.ts               # Экспорт
│   │   └── statusCode.ts          # HTTP статус-коды
│   ├── responses/
│   │   ├── defaultResGame.ts      # Шаблон игрового ответа
│   │   ├── defaultResponseData.ts # Шаблон стандартного ответа
│   │   └── index.ts               # Экспорт
│   ├── utils/
│   │   ├── index.ts               # Экспорт
│   │   └── logger.ts              # Файловый логгер WS-ошибок
│   └── types/
│       └── express.d.ts           # Расширения Express Request
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── WEBSOCKET.md
│   ├── DATABASE.md
│   ├── CONFIG.md
│   └── GAME.md
├── logs/
│   └── errors.log
├── .env
├── .env.template
├── package.json
├── tsconfig.json
└── .gitignore
```
