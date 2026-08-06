# api-world-chess

Серверная часть шахматной платформы **Chess World**.

Node.js + Express + Colyseus + MongoDB.

## Быстрый старт

```bash
cd api-world-chess
npm install
cp .env.template .env   # отредактировать DB_HOST и JWT_SECRET_KEY
npm run dev             # разработка (nodemon + tsx)
npm run start           # продакшен
```

Сервер запускается на порту `5000` (по умолчанию).

## Стек

| Компонент | Технология |
|------------|-----------|
| Runtime | Node.js ≥ 18 LTS |
| HTTP | Express 4.17+ |
| WebSocket | Colyseus 0.16.x |
| База данных | MongoDB + Mongoose |
| Аутентификация | JWT + bcrypt |
| Валидация | Joi |

## Структура проекта

```
src/
├── server.ts                  # Точка входа
├── config/serverConfig.ts     # CORS, HTTP + Colyseus сервер
├── controllers/               # Бизнес-логика
│   ├── user.ts                # Пользователи
│   └── game.ts                # Игровые сессии
├── middleware/                # Middleware
│   ├── authenticate.ts        # JWT для REST
│   ├── authenticateWs.ts      # JWT утилита для WS
│   └── userValidation.ts      # Joi валидация
├── models/                    # Mongoose модели
│   ├── user.ts                # User (users_db)
│   └── game.ts                # Game (game_db)
├── rooms/
│   └── ChessRoom.ts           # Colyseus Room — игровая логика
├── routers/                   # Express маршруты
│   ├── auth.routes.ts         # /auth/*
│   └── game.routes.ts         # /game/*
├── errors/                    # Обработка ошибок
│   ├── createError.ts
│   ├── statusCode.ts
│   └── index.ts
├── responses/                 # Шаблоны ответов
│   ├── defaultResGame.ts
│   ├── defaultResponseData.ts
│   └── index.ts
├── utils/                     # Утилиты
│   ├── logger.ts
│   └── index.ts
└── types/
    └── express.d.ts           # Расширения Express
```

## Документация

Все документы находятся в `docs/`:

| Документ | Описание |
|----------|----------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Архитектура сервера, слои, потоки данных |
| [API.md](./docs/API.md) | REST API эндпоинты |
| [WEBSOCKET.md](./docs/WEBSOCKET.md) | WebSocket-протокол, Colyseus Room, события |
| [DATABASE.md](./docs/DATABASE.md) | Модели MongoDB, подключения |
| [CONFIG.md](./docs/CONFIG.md) | Конфигурация, переменные окружения |
| [GAME.md](./docs/GAME.md) | Логика игрового процесса |

## Маршруты REST

```
POST   /auth/signup     Регистрация
POST   /auth/login      Логин
GET    /auth/current    Текущий пользователь
POST   /auth/logout     Выход
DELETE /auth/delete     Удаление аккаунта

POST   /game/find       Найти/создать комнату поиска
POST   /game/cancel     Отменить поиск
```

## WebSocket

- Комната: `chess_room`
- Аутентификация: JWT через `onAuth`
- События от клиента: `findGame`, `startApp`, `startGame`, `game`, `gameOver`, `cancelSearch`
- События от сервера: `gameStart`, `game`, `searching`, `search_cancelled`, `search_cancelled_by_opponent`, `gameOver`
