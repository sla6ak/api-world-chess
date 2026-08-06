# 1. Стек Технологий (Tech Stack)

Версии зафиксированы по `package.json` обоих проектов.

## 1.1 Backend — `api-world-chess`

Node.js + TypeScript (запуск через `tsx`, dev через `nodemon`). ES-модули (`import ... from "*.js"`).

| Библиотека | Версия | Роль | Документация |
|---|---|---|---|
| colyseus | ^0.16.5 | Ядро WS-фреймворка: комнаты, state, broadcast | https://docs.colyseus.io/ |
| @colyseus/ws-transport | ^0.16.5 | WebSocket-транспорт поверх `ws`, поверх того же HTTP-сервера, что и Express | https://docs.colyseus.io/server/transport |
| @colyseus/auth | ^0.17.9 | Пакет установлен, **фактически не используется** (авторизация самописная через JWT в `onAuth`) | https://docs.colyseus.io/authentication/ |
| @colyseus/core, @colyseus/schema | ^0.16.24 / ^3.0.76 | Транзитивные зависимости Colyseus (state-схемы в проекте не используются — state комнаты хранится как plain object) | https://docs.colyseus.io/state/schema |
| @colyseus/redis-driver, @colyseus/redis-presence | ^0.17.7 | Установлены «впрок» для горизонтального масштабирования, **не подключены** | https://docs.colyseus.io/scalability/ |
| @colyseus/uwebsockets-transport | ^0.17.21 | Установлен «впрок», не используется (используется ws-транспорт) | https://docs.colyseus.io/server/transport |
| express | 4.17.1 | REST API (`/auth`, `/game`) | https://expressjs.com/ |
| mongoose | ^6.3.4 | ODM для MongoDB; **два подключения**: БД `users_db` и `game_db` | https://mongoosejs.com/docs/ |
| chess.js | ^1.4.0 | Шахматный движок: валидация ходов, FEN/PGN, мат/пат/ничьи | https://github.com/jhlywa/chess.js |
| jsonwebtoken | ^8.5.1 | Выдача/проверка JWT (срок 30 дней) | https://github.com/auth0/node-jsonwebtoken |
| bcrypt | ^5.0.1 | Хеширование паролей (12 раундов) | https://github.com/kelektiv/node.bcrypt.js |
| joi | ^17.6.0 | Валидация тел авторизационных запросов | https://joi.dev/api/ |
| cors | 2.8.5 | CORS-политика для HTTP | https://github.com/expressjs/cors |
| morgan | ^1.10.0 | HTTP-логирование | https://github.com/expressjs/morgan |
| body-parser | — | `urlencoded` парсер (JSON идёт встроенным `express.json()`) | https://github.com/expressjs/body-parser |
| uuid | ^8.3.2 | Установлен, фактически не используется | https://github.com/uuidjs/uuid |
| dotenv, cross-env | ^16 / ^7 | ENV-конфигурация (`PORT`, `DB_HOST`, `JWT_SECRET_KEY`) | https://github.com/motdotla/dotenv |

> 🚨 **Неоптимизировано:** половина colyseus-пакетов (`auth`, `redis-*`, `uwebsockets-transport`), а также `uuid`, `ws` (через `wsMessages` legacy) числятся зависимостями, но мёртвый груз — увеличивают время установки и поверхность аудита.

## 1.2 Frontend — `app-world-chess`

React 18 (CRA 5 + `react-app-rewired`), TypeScript, CSS Modules.

| Библиотека | Версия | Роль | Документация |
|---|---|---|---|
| react / react-dom | ^18.3.1 | UI-фреймворк | https://react.dev/ |
| react-router-dom | ^6.30.4 | Маршрутизация (`/home`, `/game`, `/statistic`, `/login`, `/register`) | https://reactrouter.com/ |
| @reduxjs/toolkit | ^2.12.0 | Стейт-менеджмент: slices + RTK Query (`authApi`) | https://redux-toolkit.js.org/ |
| react-redux | ^9.3.0 | Связка React ↔ Redux | https://react-redux.js.org/ |
| redux-persist | ^6.0.0 | Персист в `localStorage` (whitelist: `token`, `wsId`, `theme`) | https://github.com/rt2zz/redux-persist |
| colyseus.js | ^0.16.22 | WS-клиент Colyseus (`Client.joinOrCreate`, `room.send`, `room.onMessage`) | https://docs.colyseus.io/client/ |
| chess.js | ^1.4.0 | Локальное зеркало позиции: подсветка легальных ходов, оптимистичный рендер | https://github.com/jhlywa/chess.js |
| @mui/material, @mui/icons-material | ^5.18.0 | Иконки и часть UI-примитивов | https://mui.com/material-ui/ |
| @emotion/react, @emotion/styled | ^11.14 | Требуется MUI (css-in-js) | https://emotion.sh/ |
| formik | ^2.4.9 | Формы логина/регистрации | https://formik.org/docs |
| yup | ^1.7.1 | Схемы валидации форм | https://github.com/jquense/yup |
| react-toastify | ^11.0.5 | Тосты (ошибки ходов, старт/конец игры, ничьи) | https://fkhadra.github.io/react-toastify/ |
| react-use-websocket | ^4.6.1 | Установлен, **не используется** (остаток до-Colyseus эпохи) | https://github.com/robtaussig/react-use-websocket |
| spinners-react | ^1.0.11 | Спиннер в модалке поиска игры | https://github.com/adexin/spinners-react |
| react-media | ^1.10.0 | Медиа-запросы для адаптивности (мобильный хедер) | https://github.com/ReactTraining/react-media |
| modern-normalize | ^3.0.1 | CSS-сброс | https://github.com/sindresorhus/modern-normalize |
| react-scripts (CRA) | 5.0.1 | Сборка; кастомизации через `customize-cra`/`react-app-rewired` (`config-overrides.js`) | https://create-react-app.dev/ |

## 1.3 Инфраструктура / БД

- **MongoDB** (через Mongoose 6): одна строка подключения `DB_HOST`, **две логические базы** — `users_db` (коллекция `users`) и `game_db` (коллекция `games`). Оба `createConnection` инициируются на импорте модулей моделей.
  Документация: https://www.mongodb.com/docs/
- **Локальный запуск:** `dev.sh` + `dev-config.json` поднимают backend (`npm run dev`, :5000) и frontend (`npm start`, :3000). `BASE_URL = "/"` на фронте означает, что REST-запросы уходят на тот же origin (:3000); проксирование на :5000 в CRA-конфиге явно не задано — см. реестр проблем. WS — напрямую `ws://localhost:5000` (hardcode в `src/services/client.ts`).
- **Продакшен (заявлен):** фронт — Vercel (`app-world-chess.vercel.app`), бэкенд URL в коде закомментирован (Heroku). Hardcode WS-URL — известная проблема, см. [07-known-issues.md](./07-known-issues.md).
