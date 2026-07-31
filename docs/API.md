# REST API

Базовый URL: `http://localhost:5000`

Все маршруты авторизации префиксированы `/auth`.

## CORS

Разрешённые origin'ы:

| Origin | Назначение |
|--------|-----------|
| `http://localhost:3000` | React dev server |
| `http://localhost:5173` | Vite dev server |
| `http://127.0.0.1:3000` | React dev (альтернативный) |
| `http://127.0.0.1:5173` | Vite dev (альтернативный) |
| `https://app-world-chess.vercel.app` | Продакшн |

Поддерживаются credentials (Authorization header, cookies).

## Регистрация

**`POST /auth/signup`**

Требования: `email`, `name`, `password` (минимум 6 символов).

```json
{
  "email": "player@example.com",
  "name": "PlayerName",
  "password": "securePass123"
}
```

Успех (`201`):

```json
{
  "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
  "name": "PlayerName",
  "email": "player@example.com",
  "currentReiting": 800,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Ошибки:
- `400` — невалидные данные (Joi)
- `409` — email уже занят

## Авторизация

**`POST /auth/login`**

```json
{
  "email": "player@example.com",
  "password": "securePass123"
}
```

Успех (`200`):

```json
{
  "user": {
    "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "name": "PlayerName",
    "email": "player@example.com",
    "currentReiting": 800,
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

Ошибки:
- `400` — невалидные данные
- `401` — неверный email/password или не подтверждён email

## Текущий пользователь

**`GET /auth/current`**

Заголовок: `Authorization: Bearer <token>`

Успех (`200`):

```json
{
  "user": {
    "email": "player@example.com",
    "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "name": "PlayerName",
    "currentReiting": 800,
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

Ошибки:
- `401` — токен невалиден или отсутствует
- `404` — пользователь не найден

## Выход

**`POST /auth/logout`**

Заголовок: `Authorization: Bearer <token>`

Успех (`200`):

```json
{
  "message": "Logout success"
}
```

## Удаление аккаунта

**`DELETE /auth/delete`**

Заголовок: `Authorization: Bearer <token>`

Успех (`200`):

```json
{
  "user": { ... }
}
```

Ошибки:
- `401` — не авторизован
- `404` — пользователь не найден

---

## Отмена поиска игры

**`POST /game/cancel`**

Заголовок: `Authorization: Bearer <token>`

Тело запроса:

```json
{
  "gameId": "64a1b2c3d4e5f6a7b8c9d0e1"
}
```

Успех (`200`):

```json
{
  "message": "Search cancelled, game deleted",
  "gameId": "64a1b2c3d4e5f6a7b8c9d0e1"
}
```

Ошибки:
- `400` — `gameId` не передан
- `401` — не авторизован
- `404` — игра не найдена или уже начата
- `500` — ошибка сервера

> Удаляет из БД созданную, но не начатую игру (`statusGame: "open"`, `result: "pending"`) по её ID.
