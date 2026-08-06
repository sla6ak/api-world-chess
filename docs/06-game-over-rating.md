# 6. Расчёт Рейтинга и Завершение Партии (Game Over & Elo Rating)

## 6.1 Сценарии завершения

| # | Сценарий | Инициатор | Реализация | `endReason` | `result` |
|---|---|---|---|---|---|
| 1 | **Мат** | Движок после хода | `getGameOutcome(): chess.isCheckmate()` → тот, чей ход (заматованный), проиграл | `checkmate` | `1-0` / `0-1` |
| 2 | **Пат** | Движок после хода | `isStalemate()` | `stalemate` | `0.5-0.5` |
| 3 | **Ничья по правилам** | Движок после хода | `isThreefoldRepetition()` / `isDrawByFiftyMoves()` / `isInsufficientMaterial()`; `isDraw()` мапится в `stalemate` (неточность, см 6.5) | `threefold` / `fifty_move` / `insufficient_material` | `0.5-0.5` |
| 4 | **Ничья по соглашению** | Оба игрока по WS | `offer_draw`: первое предложение → флаг `drawOfferBy` + broadcast `draw_offered`; второе (от другой роли) → `gm.agreeDraw()` | `agreed_draw` | `0.5-0.5` |
| 5 | **Сдача** | Игрок по WS | `resign_game` → `gm.resign(role)` | `resignation` | победа соперника |
| 6 | **Падение флага** | Автоматика | `syncClocks` увидел `timers[ходящего] <= 0` при `hasAnyMove` → `onFlagFall` → `gm.loseOnTime(role)` | `timeout` | победа соперника |
| 7 | **Abandonment (брошенная партия)** | Автоматика | Игрок отсоединился → `handleDisconnect` → `paused` + `reconnectTimer(reconnectionTimeout=60с)` → `onAbandonment` → `gm.loseByAbandonment(role)` | `abandonment` | победа оставшегося |

**Не реализованные/частичные сценарии** — см. 6.5 (нет отдельного «отклонить ничью», нет offer/accept в противоход по правилам a la lichess и т.п.).

## 6.2 Edge-cases: оффлайн / дисконнект

### Один игрок отключился

1. `Colyseus` вызывает `ChessRoom.onLeave(client)`.
2. Если игра идёт (`result === "pending"` и есть `gm`):
   - `gm.handleDisconnect(role)`: `status → paused`, часы **останавливаются** (`lastTickAt = null`), взводится reconnect-таймер.

     > ⚠️ **Конфликт двух механизмов + скрытый off-by-default.** В конструкторе `ChessRoom` выставляется `(this as any).reconnectionTimeout = 60` — мёртвое кастомное поле (Colyseus для реконнекта использует `allowReconnection(client, seconds)`); GameManager же читает `this.opts.reconnectTimeoutMs ?? 0`. Ни в `restoreGameManager` (через `GameManager.restore`), ни в каком-либо другом месте `reconnectTimeoutMs` **не передаётся**. Итог фактический: `timeout > 0` всегда ложно ⇒ `setTimeout` не создаётся, `onAbandonment` никогда не сработает. **Abandonment-ветка мёртвая**, партия остаётся `paused` навсегда, победы по неявке не происходит. См. [07-known-issues.md](./07-known-issues.md).
   - `saveGameToDb(paused=true)` — аварийный снапшот (позиция, история, часы).
   - broadcast `opponent_disconnected {role}` — оставшийся видит тост.
3. Переподключение: клиент заново делает `joinOrCreate(gameId)`; в `onJoin` (оба игрока уже записаны) вызывается `gm.handleReconnect()` → `status → active`, `lastTickAt = Date.now()`; всем шлётся `gameStart` + `gameResumed {timers, fen}`.

### Оба отключились / комната выгружена

- Последний `onLeave`/таймаут Colyseus вызывает `onDispose` → если партия не `pending`, делается финальный `saveGameToDb`; иначе `gm.dispose()` (остановка часов в памяти).
- В БД остаётся `paused: true` со снапшотом. **Больше никто не тикает**: время не догорает, abandonment не наступает, Elo не меняется. Партия «заморожена» до возврата любого из игроков (восстановление через `getActiveGame` → `joinOrCreate`).

> 🚨 **Не реализовано:** фоновый «flag-detector» для полностью оффлайн-партий. Классический сценарий «соперник вышел, время догорело, мне присудили победу» — **отсутствует**. Время сгорает только пока жив GameManager.

### Timeout во время paused

Не обрабатывается специально: `syncClocks` возвращает `false`, если `status !== "active"`, поэтому во время паузы флаг физически не может упасть — время просто не тратится. Это умышленно (ждём реконнекта), но при сломанном abandonment-таймере (см. выше) приводит к «вечным паузам».

## 6.3 Elo-рейтинг

Расчёт выполняется в `ChessRoom.finalizeAndBroadcast`, только если у партии оба владельца в БД:

```
E_w = 1 / (1 + 10^((R_b - R_w) / 400))
E_b = 1 / (1 + 10^((R_w - R_b) / 400))
K = 32

Победа белых:  R_w += 32·(1 - E_w);  R_b += 32·(0 - E_b)
Победа чёрных: R_w += 32·(0 - E_w);  R_b += 32·(1 - E_b)
Ничья:         R_w += 32·(0.5 - E_w); R_b += 32·(0.5 - E_b)

Округление — Math.round к целым.
```

Параллельно обновляется статистика `gamesPlayed/wins/losses/draws` и `maxRating = max(maxRating, current)`.

Особенности реализации:

- Рейтинг берётся из **документа User на момент финала** (`currentReiting`), а не из «снимка» `reitingWite/Black` партии — корректно для боевого Elo.
- `maxRating` поддерживается инкрементально.
- В коллекции `games` **не сохраняется** ни дельта рейтинга, ни рейтинги на финал — только result/endReason. История рейтинговых изменений не восстановима.
- WS-сообщение `gameOver` содержит `ratingChange: 0` — **заглушка** (TODO в коде). Клиент не может показать «+14 / −13».

## 6.4 Финализация в БД и очистка памяти

`finalizeAndBroadcast(info)`:

1. Guard: повторный вызов при `state.result !== "pending"` игнорируется (защита от гонок между `onFlagFall/onGameOver/resign`).
2. `setState({result, statusGame: "finished"})`.
3. Обновление двух пользователей в `users_db` (рейтинг + статистика).
4. broadcast **`gameOver`** `{status:"gameover", gameOverData:{result, winnerRole, endReason, ratingChange}}` — клиенты маппят в персональный `win/loss/draw` и уводят UI на `/home` (через `App.tsx handleGameOver`).
5. `saveGameToDb(false, info)` в `game_db.games`:
   - `result`, `endReason`, `dateGameOver: new Date()`
   - `pgn` (с заголовком `Result`, добавленным хаком `chess.header("Result", ...)`), `finalFen`
   - полный `moveHistory` (san/from/to/color/time/ts)
   - финальные `timeWite/timeBlack`, `position`, `move`, `paused:false`, `statusGame:"close"`
6. `gm.dispose(); gm = null` — остановка `setInterval`-часов и reconnect-таймера.

Дополнительные триггеры записи: `onLeave` (пауза-снапшот) и `onDispose` (финальная запись, если комната доехала до dispose с завершённой игрой).

> 🚨 **Неоптимизировано (сериализация очистки).** На время шагов 3–5 комната ещё принимает сообщения; между broadcast `gameOver` и `gm = null` возможен гоночный `make_move`, который попадёт в `handleMakeMove` с `state.result !== "pending"` и получит `GAME_FINISHED` — безопасно, но шумно. Глобальный lock/состояние `finalizing` отсутствует.

## 6.5 Что НЕ реализовано / работает некорректно (реестр)

> 🚨 **1. Abandonment-таймер не взводится** (передача `reconnectTimeoutMs` нигде не задана; см. 6.2). Поражение по неявке фактически выключено.

> 🚨 **2. Оффлайн-таймаут не обрабатывается.** При оффлайн обоих игроков партия бессрочно ждёт; часы не догорают.

> 🚨 **3. `ratingChange` в `gameOver` — всегда 0.** UI показывает заглушку; фактическая дельта есть только в БД пользователя.

> 🚨 **4. История рейтинга не хранится.** В `games` нет `ratingChange`/рейтингов на финал → нельзя восстановить «сколько я получил за эту партию» и статистику прогресса («график рейтинга»).

> 🚨 **5. Повторный `/game/:gameId/result` может перезаписать итог.** REST-эндпоинт `submitGameResult` не проверяет, что `result === "pending"`: любой участник (и только он) способен изменить финальный результат постфактум. Также `submitGameResult` не синхронизируется с `finalizeAndBroadcast` (два пути записи итога в БД, Elo считается только в WS-пути).

> ⚠️ **6. Ничья «по правилам» классифицируется грубо.** `chess.isDraw()` (прочие ничьи) приводится к `endReason: "stalemate"`, что искажает аналитику.

> ⚠️ **7. Нет отклонения ничьей.** Отдельного `decline_draw` нет: ничью «отклоняют» ходом (сервер шлёт `draw_cleared`), либо она висит до хода. Протокольно упрощено, но путаница у UI возможна.

> ⚠️ **8. `submitGameResult` и WS-финал используют разные источники истины.** Если обе системы сработают (например, клиент отправит REST результата раньше WS-бродкаста) — возможны расхождения (`endReason` останется пустым, Elo не посчитается). REST-эндпоинт по факту — legacy и должен быть зафикшен/удалён.
