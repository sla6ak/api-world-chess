# Модели базы данных

## Два подключения к MongoDB

Сервер использует два отдельных подключения к одному MongoDB-серверу:

| Подключение | `dbName`   | Назначение |
|-------------|-----------|------------|
| `usersDbConnection` | `users_db` | Пользователи |
| `gameDbConnection`  | `game_db`  | Игры |

Оба подключения создаются в `src/models/` при импорте моделей.

---

## Модель User (`users_db`)

**Файл:** `src/models/user.ts`

**Коллекция:** `user`

### Схема

| Поле                | Тип                        | Обязательное | По умолчанию | Описание |
|---------------------|----------------------------|-------------|-------------|----------|
| `name`              | `String`                   | Да          | —           | Имя пользователя |
| `email`             | `String`                   | Да          | —           | Email (unique) |
| `password`          | `String`                   | Да          | —           | Хеш пароля (bcrypt, salt 12) |
| `currentReiting`    | `Number`                   | Нет         | `800`       | Текущий рейтинг |
| `gamesPlayed`       | `Number`                   | Нет         | `0`         | Всего сыграно партий |
| `wins`              | `Number`                   | Нет         | `0`         | Побед |
| `losses`            | `Number`                   | Нет         | `0`         | Поражений |
| `draws`             | `Number`                   | Нет         | `0`         | Ничьих |
| `maxRating`         | `Number`                   | Нет         | `800`       | Максимальный рейтинг |
| `token`             | `String`                   | Нет         | `""`        | JWT токен |
| `lastColor`         | `String`                   | Нет         | `"black"`   | Последняя выбранная сторона |
| `requireVerificationEmail` | `Boolean`           | Нет         | —           | Требуется верификация email |
| `verify`            | `Boolean`                  | Нет         | —           | Подтверждён ли email |
| `createdAt`         | `Date`                     | —           | auto        | Timestamp (mongoose) |
| `updatedAt`         | `Date`                     | —           | auto        | Timestamp (mongoose) |

**Настройки:**
- `versionKey: false`
- `timestamps: true`

### Пример документа

```json
{
  "_id": "664f1a2b3c4d5e6f78901234",
  "name": "Player1",
  "email": "player1@example.com",
  "password": "$2b$12$...",
  "currentReiting": 1250,
  "gamesPlayed": 42,
  "wins": 25,
  "losses": 12,
  "draws": 5,
  "maxRating": 1300,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "lastColor": "white",
  "requireVerificationEmail": false,
  "verify": true,
  "createdAt": "2024-01-15T12:00:00.000Z",
  "updatedAt": "2024-06-10T08:30:00.000Z"
}
```

---

## Модель Game (`game_db`)

**Файл:** `src/models/game.ts`

**Коллекция:** `game`

### Схема

| Поле            | Тип                          | Обязательное | По умолчанию | Описание |
|-----------------|------------------------------|-------------|-------------|----------|
| `statusGame`    | `String` (enum)              | Нет         | `"open"`    | `"open"` — поиск оппонента, `"close"` — игра начата |
| `position`      | `Array`                      | Нет         | `["rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR"]` | Начальная позиция |
| `typeGame`      | `String`                     | Нет         | `"standart"`| Тип игры |
| `timeControl`   | `Number`                     | Нет         | `180`       | Контроль времени (секунды) |
| `timePluse`     | `Number`                     | Нет         | `2`         | Плюс времени за ход (секунды) |
| `nameWite`      | `String`                     | Нет         | `""`        | Имя белого игрока |
| `reitingWite`   | `Number`                     | Нет         | `800`       | Рейтинг белого |
| `nameBlack`     | `String`                     | Нет         | `""`        | Имя чёрного игрока |
| `reitingBlack`  | `Number`                     | Нет         | `800`       | Рейтинг чёрного |
| `ownerWite`     | `ObjectId` → `user`          | Нет         | —           | Владелец белых |
| `ownerBlack`    | `ObjectId` → `user`          | Нет         | —           | Владелец чёрных |
| `result`        | `String` (enum)              | Нет         | `"pending"` | `"pending"`, `"1-0"`, `"0-1"`, `"0.5-0.5"` |
| `createdAt`     | `Date`                       | —           | auto        | Timestamp (mongoose) |
| `updatedAt`     | `Date`                       | —           | auto        | Timestamp (mongoose) |

**Поля, отсутствующие в схеме, но используемые динамически:**

| Поле          | Где используется | Описание |
|---------------|------------------|----------|
| `timeWite`   | `ChessRoom.state` | Оставшееся время белых (сек) |
| `timeBlack`  | `ChessRoom.state` | Оставшееся время чёрных (сек) |
| `dateGameOver` | MongoDB (динамически) | Дата завершения игры, устанавливается через `findByIdAndUpdate` при `gameOver` и `onDispose` |

**Настройки:**
- `versionKey: false`
- `timestamps: true`

### Пример документа

```json
{
  "_id": "664f1a2b3c4d5e6f78901234",
  "statusGame": "close",
  "position": ["rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR"],
  "typeGame": "standart",
  "timeControl": 180,
  "timePluse": 2,
  "nameWite": "Player1",
  "reitingWite": 1250,
  "nameBlack": "Player2",
  "reitingBlack": 1100,
  "ownerWite": "664f1a...",
  "ownerBlack": "664f2b...",
  "result": "pending",
  "dateGameOver": null,
  "createdAt": "2024-06-10T08:00:00.000Z",
  "updatedAt": "2024-06-10T08:05:00.000Z"
}
```

> **Примечание:** Поле `dateGameOver` отсутствует в схеме, но устанавливается динамически при завершении игры через `GameModel.findByIdAndUpdate`.
