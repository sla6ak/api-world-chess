# api-world-chess

Серверная часть шахматной платформы **Chess World**.

## Технологический стек

- **Node.js** — runtime
- **Express 4.17** — HTTP-фреймворк
- **Colyseus** — WebSocket-фреймворк для мультиплеерных игр (замена `ws`)
- **`@colyseus/schema` `3.0.76`** — схема сериализации состояния (одинаковая версия на клиенте и сервере)
- **MongoDB + Mongoose** — база данных (два подключения: `users_db`, `game_db`)
- **JWT** — аутентификация
- **bcrypt** — хеширование паролей
- **Joi** — валидация входных данных
- **Morgan** — HTTP-логирование

### Colyseus

[Colyseus](https://docs.colyseus.io/) — open-source Node.js-фреймворк для построения авторитарных игровых серверов с real-time state synchronization, matchmaking и встроенной поддержкой переподключения.

Ключевые особенности для данного проекта:

- **Rooms** — каждая игровая сессия изолирована в отдельной комнате
- **Schema-based State** — состояние игры описывается через `Schema` классы, автоматическая синхронизация с клиентами
- **Lifecycle hooks** — `onCreate`, `onJoin`, `onLeave`, `onDispose` для управления игровым циклом
- **Reconnection** — встроенная поддержка переподключения игроков с восстановлением позиции
- **Matchmaking** — встроенный поиск оппонентов по фильтрам (тип игры, контроль времени)

## Структура проекта

```
api-world-chess/
├── server.js
├── src/
│   ├── app.js                  # Приложение Express + Colyseus Server
│   ├── config/
│   │   └── serverConfig.js     # CORS, HTTP-сервер, Colyseus настройки
│   ├── controllers/
│   │   ├── user.js             # Логика пользователей
│   │   └── game.js             # Логика игровых сессий (REST)
│   ├── games/
│   │   └── gameStore.js        # In-memory хранилище активных комнат
│   ├── helpers/
│   │   ├── errors/             # createError, statusCode
│   │   ├── defaultResGame/     # Шаблон игрового ответа
│   │   ├── defaultResponseData/# Шаблон стандартного ответа
│   │   └── logger/             # Файловый логгер ошибок
│   ├── middleware/
│   │   ├── authenticate.js     # JWT для REST
│   │   ├── authenticateWs.js   # JWT для WebSocket
│   │   └── userValidation.js   # Валидация Joi
│   ├── models/
│   │   ├── user.js             # Модель User
│   │   └── game.js             # Модель Game
│   ├── routers/
│   │   └── auth.routes.js      # Маршруты авторизации
│   └── rooms/
│       └── ChessRoom.js        # Colyseus комната для шахматной партии
├── docs/
│   └── server/
│       ├── README.md           # Этот файл
│       ├── API.md              # REST API
│       ├── WEBSOCKET.md        # Протокол WebSocket
│       ├── DATABASE.md         # Модели данных
│       └── CONFIG.md           # Конфигурация и окружение
├── logs/
│   └── ws-errors.log
└── .env
```

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Копирование шаблона окружения
cp .env.template .env
# Отредактировать .env: DB_HOST, JWT_SECRET_KEY

# Разработка
npm run dev

# Продакшн
npm run start
```

Сервер запускается на порту `5000` (по умолчанию).

## Авторизация

Все REST-маршруты `/auth` доступны без токена. Для защищённых маршрутов передавайте JWT в заголовке:

```
Authorization: Bearer <token>
```

Токен действителен 30 дней.

## Лицензия

ISC
