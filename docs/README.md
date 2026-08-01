# Backend Documentation — api-world-chess

> Серверная часть шахматной платформы Chess World — Node.js + Express + Colyseus + MongoDB.

## Содержание

| Документ | Описание |
|----------|----------|
| [README.md](./README.md) | Этот файл — оглавление и быстрый старт |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Архитектура сервера, слои, потоки данных |
| [API.md](./API.md) | REST API эндпоинты |
| [WEBSOCKET.md](./WEBSOCKET.md) | WebSocket-протокол, Colyseus Room, события |
| [DATABASE.md](./DATABASE.md) | Модели MongoDB, подключения |
| [CONFIG.md](./CONFIG.md) | Конфигурация, переменные окружения |
| [GAME.md](./GAME.md) | Логика игрового процесса |

---

## Быстрый старт

```bash
cd api-world-chess

# Установка зависимостей
npm install

# Копирование шаблона окружения
cp .env.template .env
# Отредактировать .env: DB_HOST, JWT_SECRET_KEY

# Разработка (nodemon + tsx)
npm run dev

# Продакшн
npm run start
```

Сервер запускается на порту `5000` (по умолчанию).

## Технологический стек

| Компонент | Технология | Версия | Назначение |
|------------|-----------|--------|------------|
| Runtime | Node.js | ≥ 18 LTS | Серверная среда |
| HTTP-фреймворк | Express | 4.17+ | REST API |
| WebSocket-фреймворк | Colyseus | 0.16.x | Real-time комнаты |
| Схема сериализации | @colyseus/schema | 3.0.76 | Сериализация состояния |
| WebSocket-транспорт | @colyseus/ws-transport | 0.16.x | WS-транспорт |
| База данных | MongoDB + Mongoose | ≥ 6.0 | Пользователи, игры |
| Аутентификация | JWT + bcrypt | — | Токены, хеширование паролей |
| Валидация | Joi | ≥ 17.x | Валидация входных данных |
| Логирование | Morgan + кастомный logger | — | HTTP и ошибки WS |

## Структура проекта

```
api-world-chess/
├── src/
│   ├── server.ts             # Точка входа: Express + Colyseus
│   ├── config/
│   │   └── serverConfig.ts   # CORS, HTTP-сервер, Colyseus настройки
│   ├── controllers/
│   │   ├── user.ts           # Логика пользователей (CRUD)
│   │   └── game.ts           # Логика игровых сессий (REST)
│   ├── middleware/
│   │   ├── authenticate.ts   # JWT для REST
│   │   ├── authenticateWs.ts # JWT для WebSocket (util)
│   │   └── userValidation.ts # Joi валидация запросов
│   ├── models/
│   │   ├── user.ts           # Модель User (users_db)
│   │   └── game.ts           # Модель Game (game_db)
│   ├── rooms/
│   │   └── ChessRoom.ts      # Colyseus Room — игровая логика
│   ├── routers/
│   │   ├── auth.routes.ts    # Маршруты /auth/*
│   │   └── game.routes.ts    # Маршруты /game/*
│   ├── errors/
│   │   ├── createError.ts    # Фабрика ошибок
│   │   ├── index.ts          # Экспорт ошибок
│   │   └── statusCode.ts     # HTTP статус-коды
│   ├── responses/
│   │   ├── defaultResGame.ts # Шаблон игрового ответа
│   │   ├── defaultResponseData.ts # Шаблон стандартного ответа
│   │   └── index.ts          # Экспорт ответов
│   ├── utils/
│   │   ├── index.ts          # Экспорт утилит
│   │   └── logger.ts         # Файловый логгер ошибок WS
│   └── types/
│       └── express.d.ts      # Расширения Express types
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── WEBSOCKET.md
│   ├── DATABASE.md
│   ├── CONFIG.md
│   └── GAME.md
├── logs/
│   ├── errors.log
│   └── ws-errors.log
├── .env
├── .env.template
├── package.json
├── tsconfig.json
└── .gitignore
```

## Архитектурные принципы

- **Авторитарный сервер** — сервер валидирует каждый ход, рассылает обновления
- **Colyseus Rooms** — каждая партия изолирована в отдельной комнате
- **Две базы данных** — `users_db` (пользователи) и `game_db` (игры) на одном MongoDB
- **JWT аутентификация** — токен действителен 30 дней, передаётся в `Authorization: Bearer <token>`
- **In-memory state + MongoDB persistence** — игровое состояние в памяти, сохранение в БД при завершении/отключении
- **Автоматический старт игры** — при подключении второго игрока статус меняется на `"close"` и обоим рассылается `gameStart`
- **Origin verification** — Colyseus проверяет `Origin` заголовок при WebSocket handshake
- **Joi валидация** — все входные данные REST-эндпоинтов валидируются через Joi
