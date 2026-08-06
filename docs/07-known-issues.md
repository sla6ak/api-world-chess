# 7. Сводный реестр проблем (Known Issues, Bugs & Technical Debt)

Единая таблица багов, уязвимостей и неоптимизаций, выявленных при аудите. Детальный разбор каждого пункта — в профильных документах (ссылки в таблице).

**Шкалы:**
- **Severity:** 🔴 critical — ломает игру/безопасность; 🟠 major — заметная деградация/логические дыры; 🟡 minor — качество, долг, мусор.
- **Effort:** S (часы) / M (день) / L (спринт).

---

## 7.1 Безопасность и целостность игры

| ID | Severity | Проблема | Локация | Effort | Подробности |
|---|---|---|---|---|---|
| KI-01 | 🔴 | Legacy-хендлер `gameMove` принимает произвольную позицию без валидации роли, очереди и легальности — полный чит-вектор (перестановка доски одним WS-сообщением) | `rooms/ChessRoom.ts` `handleLegacyGameMove`, `GameManager.applyLegacyPosition` | M | [05-move-flow.md §5.6](./05-move-flow.md) |
| KI-02 | 🔴 | `POST /game/:gameId/result` позволяет участнику перезаписать финальный результат без проверки `result === "pending"` и без пересчёта Elo → рассинхрон с WS-финализацией | `controllers/game.ts` `submitGameResult` | S | [06-game-over-rating.md §6.5](./06-game-over-rating.md) |
| KI-03 | 🟠 | Само-матч: `/game/find` не исключает собственные открытые заявки → пользователь матчится сам с собой (белые == чёрные == один uid) | `controllers/game.ts` `createSearchRoom` | S | [03-matchmaking.md §3.3](./03-matchmaking.md) |
| KI-04 | 🟠 | Race condition матчинга: `findOne` + `findByIdAndUpdate` не атомарны → два игрока могут одновременно стать `ownerBlack` одной заявки | `controllers/game.ts` | S | [03-matchmaking.md §3.3](./03-matchmaking.md) |
| KI-05 | 🟠 | REST-авторизация по `userName.length` на фронте и single-session JWT на бэке: любой второй логин инвалидирует первые сессии (включая WS посреди партии). Нет multi-device, нет смены вкладки | `middleware/authenticate.ts`, `PrivateRoute/PublicRoute` | M | [03-matchmaking.md §3.3](./03-matchmaking.md) |
| KI-06 | 🟡 | Несколько активных партий на пользователя: сервер не проверяет `result:"pending"` у заявителя перед матчингом | `controllers/game.ts` | S | [03-matchmaking.md §3.3](./03-matchmaking.md) |

## 7.2 Игровая логика / таймеры

| ID | Severity | Проблема | Локация | Effort | Подробности |
|---|---|---|---|---|---|
| KI-07 | 🔴 | Abandonment-таймер мёртв: `reconnectTimeoutMs` нигде не передаётся в GameManager (всегда `?? 0`), а заявленное `(this as any).reconnectionTimeout = 60` — не Colyseus API. Поражение по неявке не работает | `rooms/ChessRoom.ts`, `services/GameManager.ts` | S | [06-game-over-rating.md §6.2](./06-game-over-rating.md) |
| KI-08 | 🟠 | Оффлайн-падение флага не поддержано: если GameManager не жив (оба игрока оффлайн, комната выгружена), часы не догорают, партия висит `paused:true` вечно; нет фонового «flag-detector»/worker | архитектурный пробел | L | [04-clock.md §4.5](./04-clock.md), [06 §6.2](./06-game-over-rating.md) |
| KI-09 | 🟠 | Legacy-нормализация «< 60 → минуты» ломает реальный режим 30 секунд при восстановлении из БД (`30s` превращается в `30min`) | `rooms/ChessRoom.ts`, `controllers/game.ts`, `GameManager.restore` | S (миграция БД) | [04-clock.md §4.1](./04-clock.md) |
| KI-10 | 🟡 | Накопительная точность часов ок (Date.now-дельта), но зернистость 1 с + `Math.floor` округляет дробь в пользу ходящего; нет защиты от «накрутки» при потоке ходов быстрее 1 с | `GameManager.syncClocks` | S | [04-clock.md §4.5](./04-clock.md) |
| KI-11 | 🟡 | Инкремент не ограничен сверху (нет «капа» Фишера/Капабланки) | `GameManager.handleMove` | S | [04-clock.md §4.5](./04-clock.md) |

## 7.3 Рейтинг и история

| ID | Severity | Проблема | Локация | Effort | Подробности |
|---|---|---|---|---|---|
| KI-12 | 🟠 | `ratingChange: 0` — заглушка в WS-событии `gameOver`, UI не показывает реальную дельту | `ChessRoom.finalizeAndBroadcast` | S | [06 §6.5](./06-game-over-rating.md) |
| KI-13 | 🟠 | В `games` не сохраняется дельта/рейтинги на финал → история рейтинга невосстановима, графики невозможны | `ChessRoom.saveGameToDb`, `models/game.ts` | M | [06 §6.5](./06-game-over-rating.md) |
| KI-14 | 🟡 | `chess.isDraw()` мапится в `endReason="stalemate"` — искажение аналитики по ничьим | `services/boardConverter.ts` `getGameOutcome` | S | [06 §6.5](./06-game-over-rating.md) |
| KI-15 | 🟡 | Статистика «Recent Games» на фронте — пустая таблица (нет API истории партий) | `features/home/Statistics.tsx` | M | — |

## 7.4 Инфраструктура / БД / перформанс

| ID | Severity | Проблема | Локация | Effort | Подробности |
|---|---|---|---|---|---|
| KI-16 | 🟠 | В схеме `gameSchema` нет ни одного индекса — матчинг (`statusGame,result,typeGame,timeControl,timePluse,ownerBlack`) и `getActiveGame` (`ownerWite/ownerBlack + result`) идут полным сканом | `models/game.ts` | S | [03 §3.3](./03-matchmaking.md) |
| KI-17 | 🟠 | Hardcoded WS-URL `ws://localhost:5000` в `services/client.ts` и закомментированный прод-URL — деплой на Vercel не сможет подключиться без правки кода; нет env-конфигурации | `app-world-chess/src/services/client.ts` | S | [01-tech-stack.md §1.3](./01-tech-stack.md) |
| KI-18 | 🟡 | `BASE_URL = "/"` на фронте без явного proxy в CRA (в dev-mode REST едет на :3000, где фронт, а не бэк) | `config/testURL.ts` + отсутствие `proxy` в package.json | S | [01 §1.3](./01-tech-stack.md) |
| KI-19 | 🟡 | Заявки-«сироты»: если вкладка поиска закрылась, документ `open/pending` висит в БД бессрочно (нет TTL-индекса/очистки) | архитектура + `models/game.ts` | S | [03 §3.7](./03-matchmaking.md) |
| KI-20 | 🟡 | Дублированный бродкаст после хода: и `move_made`, и `game` несут одни и те же поля — лишний трафик и два пути обновления Redux | `ChessRoom.handleMakeMove`, `App.tsx` | S | [05 §5.7](./05-move-flow.md) |

## 7.5 Клиентская архитектура / техдолг

| ID | Severity | Проблема | Локация | Effort |
|---|---|---|---|---|
| KI-21 | 🟡 | `connectRoomSuccess({roomId})` сохраняет **mongo gameId** в поле `roomId` — семантика сломана, Colyseus `roomId` теряется (реконнект-логика полагается на совпадение) | `GameMenu.tsx`, `App.tsx` | S |
| KI-22 | 🟡 | Синглтон `roomManager` (вне React) + двойные подписки в `App.tsx` и `GameArea.tsx` с ручной выгрузкой — хрупко при HMR и быстрых переходах | `services/roomManager.ts`, `App.tsx`, `GameArea.tsx` | M |
| KI-23 | 🟡 | `redux-persist` whitelist включает `wsId` (legacy) и `token`, но **не** `room`/`gameEvents`: после F5 UI считает, что игры нет, и делает `GET /game/active` — два источника истины могут разойтись | `redux/store.ts` | M |
| KI-24 | 🟡 | Мёртвый код: `wsID` slice, `services/wsMessages.ts`, `pollingInterval` в `gameEvents`, `react-use-websocket`, половина `@colyseus/*` пакетов, `responses/` | разное | S |
| KI-25 | 🟡 | Опечатки как публичный контракт: `wite`, `reiting`, `timePluse`, `curentG`, `standart`, `dublePassword`, `gameRegim` — размножены по API/БД/UI; переименование требует миграции | повсеместно | L |
| KI-26 | 🟡 | Нет выбора фигуры для промоушна — авто-ферзь (недо-промоушн невозможен) | `GameArea.autoPromotionSquare` | S |
| KI-27 | 🟡 | Нет `decline_draw` — ничья отклоняется только ходом или висит | `ChessRoom.handleOfferDraw` | S |
| KI-28 | 🟡 | Режим `fisher` — только ключ матчинга; стартовая позиция Fischer Random не генерируется | `GameMenu`, `ChessRoom` | M |
| KI-29 | 🟡 | Логирование ВСЕГО (включая тела запросов с паролями в `[AuthRouter]`, JWT-префиксы в `authenticateWs`) — утечка чувствительных данных в логи | `server.ts`, routers, middleware | S |
| KI-30 | 🟡 | Нет тестов (ни unit на GameManager, ни интеграционных на комнату); при этом вся критическая логика времени/рейтинга — ручная | всё | L |

## 7.6 Рекомендуемый порядок исправления (roadmap-предложение)

1. **KI-01, KI-02** — закрыть чит-вектора валидации (быстрые точечные изменения).
2. **KI-07** — починить abandonment (передать `reconnectTimeoutMs` из constructor-опций `restoreGameManager`).
3. **KI-16** — добавить индексы (`{ statusGame, result, typeGame, timeControl, timePluse }` и `{ ownerWite, result }` / `{ ownerBlack, result }`).
4. **KI-03, KI-04, KI-06** — консолидировать матчинг в один атомарный `findOneAndUpdate` с исключением себя и проверкой активной партии.
5. **KI-17, KI-18** — env-конфигурация URL (CRA `REACT_APP_*` / `.env`), вернуть корректное проксирование.
6. **KI-08** — воркер оффлайн-таймаутов (cron по `paused:true` + TTL заявок-«сирот» KI-19).
7. **KI-12, KI-13** — прокидывать реальную дельту Elo в `gameOver` и хранить в документе партии.
8. Зачистка техдолга (KI-20–KI-30) — по остаточному принципу, начиная с KI-29 (санитизация логов).
