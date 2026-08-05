import { Room } from "colyseus";
import GameModel from "../models/game.js";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { logError } from "../utils/logger.js";
import GameManager, {
    type PlayerRole,
    type PgnResult,
    type EndReason,
    type GameOverInfo,
} from "../services/GameManager.js";

interface MoveMessage {
    from: string;
    to: string;
    promotion?: string;
}

interface LegacyMoveMessage {
    position?: string[];
    move?: boolean;
}

class ChessRoom extends Room {
    gameData: unknown;
    private drawOfferBy: "wite" | "black" | null = null;
    private gm: GameManager | null = null;
    private isGameLoaded = false;
    /** Роли sessionId клиентов в комнате — быстрая диагностика состава комнаты в логах. */
    private sessionRoles = new Map<string, null | "wite" | "black">();
    /** setTimeout повторной проверки «комната осталась без участников» — сервер-сторонняя
     *  страховка от «вымёрших» комнат, держащих запущенные часы GameManager. */
    private emptyRecheckTimer: NodeJS.Timeout | null = null;
    /** Старт текущей паузы (ws-клиентов 0..1 из 2) — source of truth для сверки,
     *  какая из сторон на самом деле тянет время: серверные часы заморожены в paused,
     *  а фронт может продолжать гонять локальный отсчёт по стейту Redux. */
    private pausedAt: number | null = null;
    /** Финализируется ли комната прямо сейчас — барьер против ходов/финалов в середине finalize. */
    private finalizing = false;

    /** Короткая диагностика состава комнаты для логов. */
    private roomHealth(): string {
        return `clients=${this.clients.length} roles=${JSON.stringify(Object.fromEntries(this.sessionRoles))}`;
    }

    /** Вернуть живых клиентов комнаты, у кого уже назначена роль игрока. */
    private playersAlive(): any[] {
        return this.clients.filter((c: any) => Boolean(c && c.role));
    }

    /** Пустая ли комната С ТОЧКИ ЗРЕНИЯ ИГРОКОВ (ws-клиенты без роли не являются игроками). */
    private isEmptyOfPlayers(): boolean {
        return this.playersAlive().length === 0;
    }

    /** Через `graceMs` перепроверить: если в комнате всё ещё нет ни одного игрока —
     *  закрыть комнату (dispose остановит часы и снимет снапшот). Это и есть защита от
     *  «часы тикают в пустой комнате».
     */
    private scheduleEmptyRecheck(graceMs: number, reason: string): void {
        this.cancelEmptyRecheck();
        console.log(
            `[emptyRoom] scheduled in ${graceMs}ms | gameId:`, this.state?.idGame,
            "| roomId:", this.roomId,
            "| reason:", reason,
            "|", this.roomHealth()
        );
        this.emptyRecheckTimer = setTimeout(async () => {
            this.emptyRecheckTimer = null;
            if (this.isEmptyOfPlayers() && this.state?.result === "pending") {
                console.warn(
                    `[emptyRoom] room still empty of players after ${graceMs}ms → disconnect | gameId:`,
                    this.state?.idGame,
                    "| roomId:", this.roomId
                );
                try {
                    await this.disconnect();
                } catch (e) {
                    logError("scheduleEmptyRecheck.disconnect", e);
                }
            } else {
                console.log(
                    "[emptyRoom] recheck: players present or game finalized — room kept | gameId:",
                    this.state?.idGame,
                    "| roomId:", this.roomId,
                    "| result:", this.state?.result,
                    "|", this.roomHealth()
                );
            }
        }, graceMs);
    }

    private cancelEmptyRecheck(): void {
        if (this.emptyRecheckTimer) {
            clearTimeout(this.emptyRecheckTimer);
            this.emptyRecheckTimer = null;
        }
    }

    constructor() {
        super();
        this.maxClients = 2;
        this.gameData = null;
        (this as any).reconnectionTimeout = 60;

        // ДЕТЕКТИВ по багу «первый ход rejected GAME_FINISHED, state.result пустой»:
        // палим ВСЁ не-augmenting присвоение state (state = X). Любой код, который
        // перезаписывает state объектом без explicit result: "pending", даёт ровно
        // такой симптом. Colyseus-сетап через setState()/this.state= это видно;
        // патчи через setState({...}) тоже пройдут сюда через обертку setter'а.
        let internal: any = null;
        Object.defineProperty(this, "state", {
            get: () => internal,
            set: (v: any) => {
                const assigning = v;
                const marker = "[state-assign]";
                if (assigning && typeof assigning === "object") {
                    if (!Object.prototype.hasOwnProperty.call(assigning, "result")) {
                        console.warn(
                            marker,
                            "object assigned to state WITHOUT 'result' key | keys:",
                            Object.keys(assigning),
                            "| stack:", new Error("trace").stack?.split("\n").slice(2, 6)
                        );
                    } else if (
                        assigning.result !== "pending" &&
                        assigning.result !== undefined &&
                        assigning.result !== null
                    ) {
                        console.warn(
                            marker,
                            "state.result set to NON-pending:",
                            JSON.stringify(assigning.result),
                            "| prev:", JSON.stringify(internal?.result),
                            "| stack:", new Error("trace").stack?.split("\n").slice(2, 6)
                        );
                    }
                } else if (assigning !== undefined && assigning !== null) {
                    console.warn(
                        marker,
                        "non-object assigned to state | type:", typeof assigning,
                        "| value:", JSON.stringify(assigning),
                        "| stack:", new Error("trace").stack?.split("\n").slice(2, 6)
                    );
                }
                internal = assigning;
            },
            configurable: true,
            enumerable: true,
        });
    }

    async onCreate(options: { gameId?: string }): Promise<void> {
        console.log(
            "[onCreate] room created | roomId:", this.roomId,
            "| options.gameId:", options?.gameId
        );
        let initialState: {
            position: string[];
            move: boolean;
            playerWite: string;
            playerBlack: string;
            reitingWite: number;
            reitingBlack: number;
            timeWite: number;
            timeBlack: number;
            result: string;
            idGame: string;
            typeGame: string;
            timeControl: number;
            timePluse: number;
        } = {
            position: [],
            move: true,
            playerWite: "",
            playerBlack: "",
            reitingWite: 800,
            reitingBlack: 800,
            timeWite: 0,
            timeBlack: 0,
            result: "pending",
            idGame: this.roomId,
            typeGame: "standart",
            timeControl: 180,
            timePluse: 0,
        };

        if (options?.gameId) {
            try {
                const game = await GameModel.findById(options.gameId);
                if (game) {
                    initialState.idGame = game._id.toString();
                    // КРИТИЧНО: если документ в Mongo уже завершён — state комнаты
                    // обязан это отражать. Иначе (state.result оставался "pending")
                    // "воскрешённая" комната инициализировала GameManager по мёртвой
                    // игре, и первый ход отклонялся как GAME_FINISHED с тостом
                    // «Игра уже завершена» при визуально живой доске.
                    const dbResult = (game as { result?: string }).result;
                    if (dbResult && dbResult !== "pending") {
                        console.warn(
                            "[onCreate] Game document is already finished | gameId:",
                            initialState.idGame,
                            "| dbResult:",
                            dbResult
                        );
                        initialState.result = dbResult;
                    }
                    initialState.position = game.position as string[];
                    initialState.move = Boolean(game.move);
                    initialState.playerWite = game.nameWite || "";
                    initialState.playerBlack = game.nameBlack || "";
                    initialState.reitingWite = game.reitingWite || 800;
                    initialState.reitingBlack = game.reitingBlack || 800;
                    initialState.timeWite = game.timeWite || 0;
                    initialState.timeBlack = game.timeBlack || 0;
                    initialState.typeGame = game.typeGame || "standart";
                    // Нормализация legacy-минут в секунды (<60 означает старые записи в минутах)
                    const norm = (v: number | undefined | null) => {
                        const n = Number(v) || 0;
                        return n > 0 && n < 60 ? n * 60 : n;
                    };
                    initialState.timeControl = norm(game.timeControl);
                    initialState.timePluse = Number(game.timePluse) || 0; // инкремент всегда шёл в секундах
                    initialState.timeWite = norm(game.timeWite) || 0;
                    initialState.timeBlack = norm(game.timeBlack) || 0;

                    // Для партии без ещё сделанных ходов часы в state должны показывать
                    // ПОЛНЫЙ контроль времени, даже если в БД лежит 0 — иначе клиент
                    // при gameStarted получит 00:00 вместо выбранного режима.
                    const hasMoves = (game.moveHistory?.length ?? 0) > 0 || Boolean(game.pgn);
                    if (!hasMoves && initialState.timeControl > 0) {
                        if (!initialState.timeWite) initialState.timeWite = initialState.timeControl;
                        if (!initialState.timeBlack) initialState.timeBlack = initialState.timeControl;
                    }

                    // GameManager имеет смысл только для реально идущей партии;
                    // для завершённой в БД не поднимаем движок и часы вообще.
                    if (
                        initialState.result === "pending" &&
                        game.ownerWite &&
                        game.ownerBlack
                    ) {
                        this.restoreGameManager(game, initialState.idGame);

                        // Диагностика «часы пошли заново с полного контроля»: restore обязан
                        // вернуть значения БЛИЗКИЕ к сохранённому снапшоту (кроме защиты
                        // «битые часы при 0 ходов» → полный контроль, которая логируется ниже).
                        if (this.gm) {
                            const t = this.gm.getTimers();
                            const driftW = Math.abs(t.white - initialState.timeWite);
                            const driftB = Math.abs(t.black - initialState.timeBlack);
                            const suspicious = hasMoves && (driftW > 1 || driftB > 1);
                            console[suspicious ? "warn" : "log"](
                                "[restore] timers after GameManager.restore | gameId:", initialState.idGame,
                                "| gm:", JSON.stringify(t),
                                "| dbNormalized:", JSON.stringify({ white: initialState.timeWite, black: initialState.timeBlack }),
                                "| drift(s):", JSON.stringify({ white: driftW, black: driftB }),
                                "| hasMoves:", hasMoves,
                                "| moveHistory:", game.moveHistory?.length ?? 0,
                                "| paused:", Boolean(game.paused),
                                suspicious ? "| ⚠️ SUSPICIOUS drift — часы отличаются от снапшота" : ""
                            );
                        }

                        // Диагностика: подозрительные нулевые часы у партии без ходов
                        // — классический предвестник мгновенного падения флага.
                        if (
                            this.gm &&
                            !hasMoves &&
                            (this.gm.getTimers().white < initialState.timeControl ||
                                this.gm.getTimers().black < initialState.timeControl)
                        ) {
                            console.warn(
                                "[onCreate] GameManager restored with NON-FULL clocks on move-0 game | gameId:",
                                initialState.idGame,
                                "| timers:",
                                JSON.stringify(this.gm.getTimers()),
                                "| timeControl:",
                                initialState.timeControl,
                                "| db timeWite/timeBlack:",
                                game.timeWite,
                                game.timeBlack
                            );
                        }
                    }
                }
            } catch (e) {
                logError("onCreate: failed to load game", e);
            }
        }

        this.traceSetStateResult(initialState, "onCreate");
        this.setState(initialState);
        console.log(
            "[onCreate] state initialized | gameId:", this.state.idGame,
            "| result:", this.state.result,
            "| timeWite/timeBlack:", `${this.state.timeWite}s/${this.state.timeBlack}s`,
            "| gm:", this.gm ? `status=${this.gm.status} timers=${JSON.stringify(this.gm.getTimers())}` : "none",
            "|", this.roomHealth()
        );

        this.onMessage("make_move", (client, msg: MoveMessage) =>
            this.handleMakeMove(client, msg)
        );
        this.onMessage("gameMove", (client, msg: LegacyMoveMessage) =>
            this.handleLegacyGameMove(client, msg)
        );
        this.onMessage("resign_game", (client) => this.handleResignGame(client));
        this.onMessage("offer_draw", (client) => this.handleOfferDraw(client));
    }

    private restoreGameManager(gameDoc: unknown, gameId?: string): void {
        // ВАЖНО: this.state ещё НЕ существует на момент вызова из onCreate
        // (setState вызывается позже) — раньше здесь читали this.state.idGame
        // и GameManager создавался с id=undefined.
        const initialId = (this as any).state?.idGame as string | undefined ?? gameId ?? this.roomId;
        console.log(
            "[restore] GameManager.restore begin | gameId:", initialId,
            "| from paused:", Boolean((gameDoc as any)?.paused),
            "| db timeWite/timeBlack:", `${(gameDoc as any)?.timeWite}/${(gameDoc as any)?.timeBlack}`,
            "| db timeControl:", (gameDoc as any)?.timeControl,
            "| moveHistory:", (gameDoc as any)?.moveHistory?.length ?? 0
        );
        try {
            this.gameData = gameDoc;
            this.gm = GameManager.restore(initialId, gameDoc as any, {
                onTick: (timers) => this.broadcast("timers", timers),
                onFlagFall: (loserRole) => this.handleFlagFall(loserRole),
                onGameOver: (info) => {
                    void this.finalizeAndBroadcast(info);
                },
                onAbandonment: (role) => {
                    void this.handleAbandonment(role);
                },
            });
            console.log(
                "[restore] GameManager restored | gameId:", initialId,
                "| status:", this.gm?.status,
                "| timers:", this.gm ? JSON.stringify(this.gm.getTimers()) : "n/a",
                "| lastMoveTimestamp:", this.gm?.lastMoveTimestamp
            );
        } catch (e) {
            logError("GM restore failed", e);
        }
    }

    async onAuth(client: any, options: { token?: string }): Promise<boolean> {
        if (!options?.token) return false;
        try {
            const { id } = jwt.verify(
                options.token,
                process.env.JWT_SECRET_KEY as string
            ) as { id: string };
            const user = await User.findById(id);
            if (!user || user.token !== options.token) return false;
            client.userData = user;
            return true;
        } catch {
            return false;
        }
    }

    async onJoin(client: any, options: { gameId?: string }): Promise<void> {
        const userName = client.userData?.name || "Unknown";
        const gameId = options?.gameId || (this.state.idGame as string);
        console.log(
            "[onJoin] attempt | roomId:", this.roomId,
            "| sessionId:", client.sessionId,
            "| user:", userName,
            "| requested gameId:", gameId,
            "| room gameId:", this.state?.idGame,
            "|", this.roomHealth()
        );

        try {
            const game = await GameModel.findById(gameId);
            if (!game) {
                console.log("[join] Game not found | user:", userName, "| gameId:", gameId);
                return client.leave(1000);
            }

            const uid = String(client.userData._id);
            const isWhite = game.ownerWite ? String(game.ownerWite) === uid : false;
            const isBlack = game.ownerBlack ? String(game.ownerBlack) === uid : false;

            if (!isWhite && !isBlack) {
                console.log("[join] Not a participant | user:", userName, "| gameId:", gameId);
                return client.leave(1000);
            }

            client.role = isWhite ? "wite" : "black";
            this.sessionRoles.set(client.sessionId, client.role);
            this.cancelEmptyRecheck();

            // Аудит состава комнаты по ролям — основная дыра была здесь: второй коннект того же
            // userId (две вкладки) перезаписывал себе role и ломал cleanup при disconnect.
            const sameUidAlive = this.clients.filter(
                (c: any) => c.sessionId !== client.sessionId && String(c.userData?._id) === uid
            ).length;
            if (sameUidAlive > 0) {
                console.warn(
                    "[onJoin] ⚠️ DUPLICATE userId in room (self-match or double tab) | gameId:", gameId,
                    "| user:", userName,
                    "| sessions of this uid:", sameUidAlive + 1,
                    "|", this.roomHealth()
                );
            }
            const whites = this.clients.filter((c: any) => c.role === "wite").length;
            const blacks2 = this.clients.filter((c: any) => c.role === "black").length;
            if (whites > 1 || blacks2 > 1 || whites + blacks2 > 2) {
                console.warn(
                    "[onJoin] ⚠️ IMPOSSIBLE room composition | gameId:", gameId,
                    `| wite:${whites} black:${blacks2}`,
                    "|", this.roomHealth()
                );
            }
            console.log(
                "[onJoin] role assigned | user:", userName,
                "| role:", client.role,
                "| sessionId:", client.sessionId,
                "|", this.roomHealth()
            );

            // Нормализация legacy-минут (<60 при >0) в секунды.
            const norm = (v: number | null | undefined) => {
                const n = Number(v) || 0;
                return n > 0 && n < 60 ? n * 60 : n;
            };
            const tc = norm(game.timeControl);
            const tw = norm(game.timeWite);
            const tb = norm(game.timeBlack);
            const hasMoves = (game.moveHistory?.length ?? 0) > 0 || Boolean(game.pgn);

            // КРИТИЧНО: setState в Colyseus 0.16 — это REPLACE всей state, не merge!
            // Без явного `result` поле `this.state.result` стирается в undefined,
            // и первый же ход отклоняется как GAME_FINISHED на живой доске.
            const currentResult = this.state?.result ?? "pending";
            this.setState({
                playerWite: game.nameWite || "",
                playerBlack: game.nameBlack || "",
                reitingWite: game.reitingWite || 800,
                reitingBlack: game.reitingBlack || 800,
                idGame: gameId,
                timeControl: tc,
                timePluse: Number(game.timePluse) || 0,
                typeGame: game.typeGame || "standart",
                result: currentResult,
                // Клиент получает стартовое время, даже если GameManager ещё не создан
                // (первый игрок ждёт соперника) — страхуемся от 00:00 на часах.
                // Если ходов не было, а в БД нули/битые значения — берём полный контроль.
                timeWite: this.gm?.getTimers().white ?? ((!hasMoves && !tw) ? tc : (tw || tc || 180)),
                timeBlack: this.gm?.getTimers().black ?? ((!hasMoves && !tb) ? tc : (tb || tc || 180)),
            });

            if (!options?.gameId) {
                console.error("[onJoin] gameId missing — this should not happen");
                return client.leave(1000);
            }

            // Доп. setup после setState: восполняем через gm-lazy-access.
            console.log(
                "[onJoin] state after refresh | result:", this.state?.result,
                "| keys:", Object.keys(this.state || {}).join(","),
                "| timeWite/timeBlack:", `${this.state.timeWite}s/${this.state.timeBlack}s`
            );

            const bothInRoom =
                Boolean(this.state.playerWite) && Boolean(this.state.playerBlack);

            if (game.result && game.result !== "pending") {
                console.warn(
                    "[onJoin] Game already finished in DB — kicking | user:", userName,
                    "| gameId:", gameId,
                    "| result:", game.result,
                    "| endReason:", (game as any).endReason
                );
                return client.leave(4001);
            }

            if (bothInRoom) {
                // GameManager создаём только когда оба игрока назначены.
                // Иначе P1, подключившийся во время поиска, получал комнату
                // без движка и его ходы молча игнорировались.
                if (!this.gm) {
                    this.restoreGameManager(game);
                }
                // Уведомляем обоих, что второй игрок подключился — это триггерит
                // navigate("/game") у ожидающего P1 на фронте.
                if (this.clients.length > 1) {
                    this.broadcast("opponent_joined", {
                        playerWite: this.state.playerWite,
                        playerBlack: this.state.playerBlack,
                    });
                }
                // Снимаем паузу, когда оба игрока в комнате: до фикса второй игрок мог
                // потеряться за «paused» навсегда (часы шли, а UI-статус не снимался).
                // Резюмируем ТОЛЬКО если комната действительно содержит обе роли
                // WS-клиентов сейчас — иначе бы вечно ловили resume у одиночного
                // игрока (state.playerWite/playerBlack заданы, но комната пуста).
                const bothWsPresent =
                    this.playersAlive().filter((c: any) => Boolean(c.role)).length >= 2;
                const resumed = bothWsPresent ? this.gm?.handleReconnect() || false : false;
                if (resumed) this.pausedAt = null;
                this.broadcast("gameStart", this.broadcastState());
                if (resumed && this.gm) {
                    // Сервер снимает паузу — пауза окончена.
                    this.pausedAt = null;
                    this.broadcast("gameResumed", {
                        timers: this.gm.getTimers(),
                        fen: this.gm.currentFen,
                        // КЛЮЧЕВОЕ поле синхронизации часов: timestamp момента, с которого
                        // снова идёт отсчёт. Иначе клиент, чьи локальные часы тикали во
                        // время чужого оффлайна, проигрывал разницу сетевого пинга +
                        // времени форка Redux-тика — именно так выглядит «часы пошли заново».
                        lastMoveTimestamp: this.gm.lastMoveTimestamp,
                    });
                }
            } else {
                // Первый игрок остаётся в комнате и ждёт соперника —
                // НЕ кикаем его (раньше здесь был client.leave — корень бага с ходами).
                // Часы при этом должны быть ПОЛНЫМИ: если в БД легаси-мусор, а GameManager ещё
                // не создан (второй игрок не вошёл), state не должен подсовывать клиенту 0:00.
                if (!this.gm && !hasMoves && tc > 0) {
                    if (this.state.timeWite !== tc || this.state.timeBlack !== tc) {
                        // Раньше здесь было `this.setState({ timeWite: tc, timeBlack: tc })`
                        // — стирало остальные поля state. Частичное обновление через setter:
                        this.state.timeWite = tc;
                        this.state.timeBlack = tc;
                        console.log(
                            "[join] normalized clocks to full control while waiting | gameId:", gameId,
                            "| timeControl:", tc
                        );
                    }
                }
                console.log("[join] Player waits for opponent | user:", userName, "| gameId:", gameId,
                    "|", this.roomHealth());

                // СТРАХОВКА: если одиночный ждущий (waiter) отвалился, а соперник так и не пришёл —
                // комната существует бесконечно без игроков (autoDispose Colyseus запускает таймер
                // в бэкграунде, но только если комната действительно пуста; кроме того, без этой
                // проверки «сиротские» текущие реконнекты создают дубли через joinOrCreate → часы).
                if (this.isEmptyOfPlayers()) {
                    this.scheduleEmptyRecheck(
                        65_000,
                        "lone player left while waiting for opponent"
                    );
                }
            }
        } catch (e) {
            logError("onJoin", e);
            client.leave(1000);
        }
    }

    // Отладка: кто и когда ставит result в ""/undefined. Полноценный stacktrace нужен,
    // чтобы найти источник пустого state.result (state.result === "" ≠ "pending" →
    // первый ход отклоняется GAME_FINISHED на живой доске).
    private traceSetStateResult(patch: Record<string, unknown>, tag: string): void {
        if (!("result" in patch)) return;
        const val = patch.result;
        if (val !== "pending" && val !== undefined) {
            console.warn(
                `[state.result] ⚠️ NON-pending via ${tag} | gameId:`, this.state?.idGame,
                "| value:", JSON.stringify(val),
                "| type:", typeof val,
                "| prev:", JSON.stringify(this.state?.result),
                "| stack:", new Error("trace").stack?.split("\n").slice(2, 6)
            );
        } else if (val === "pending" && this.state?.result !== "pending") {
            console.log(
                `[state.result] ${tag} pending ← was ${JSON.stringify(this.state?.result)} | gameId:`,
                this.state?.idGame
            );
        }
    }

    private handleMakeMove(client: any, message: MoveMessage): void {
        console.log(
            "[move] incoming make_move | gameId:", this.state?.idGame,
            "| session:", client.sessionId,
            "| role:", client.role,
            "| state.result=", JSON.stringify(this.state?.result),
            "| state keys:", Object.keys(this.state ?? {}).length,
            "| payload:", JSON.stringify(message),
            "| gm:", this.gm ? this.gm.status : "none",
            "|", this.roomHealth()
        );
        if (this.finalizing) {
            console.warn("[move] rejected — room is finalizing right now | gameId:", this.state?.idGame);
            client.send("move_error", {
                code: "GAME_FINISHED",
                message: "Гра вже завершена",
                fen: this.gm?.currentFen,
                position: this.gm?.positionFlat,
                move: this.gm?.isWhiteMove,
            });
            return;
        }
        // Не молчим: клиент должен получить ошибку и ресинхронизироваться,
        // иначе у него останется "оптимистичный" ход, а оппонент ничего не увидит.
        if (this.state.result !== "pending") {
            console.warn(
                "[move] GAME_FINISHED rejected | gameId:", this.state.idGame,
                "| roomId:", this.roomId,
                "| state.result:", this.state.result,
                "| gm status:", this.gm ? (this.gm as any).status : "none",
                "| gm hasAnyMove:", this.gm ? (this.gm as any).hasAnyMove : "n/a",
                "| gm timers:", this.gm ? JSON.stringify(this.gm.getTimers()) : "n/a",
                "| clients:", this.clients.length
            );
            client.send("move_error", {
                code: "GAME_FINISHED",
                message: "Гра вже завершена",
                fen: this.gm?.currentFen,
                position: this.gm?.positionFlat,
                move: this.gm?.isWhiteMove,
            });
            return;
        }
        if (!this.gm) {
            console.warn("[move] GameManager is not initialized yet");
            client.send("move_error", {
                code: "GAME_NOT_READY",
                message: "Гра ще не почалась — зачекайте суперника",
            });
            return;
        }
        if (!client.role) {
            console.warn("[move] Client without role tried to move");
            client.send("move_error", {
                code: "NOT_A_PLAYER",
                message: "Ви не є учасником цієї партії",
                fen: this.gm.currentFen,
                position: this.gm.positionFlat,
                move: this.gm.isWhiteMove,
            });
            return;
        }

        const res = this.gm.handleMove(client.role as PlayerRole, message);

        console.log(
            "[move] engine result | ok:", res.ok,
            "| code:", res.ok ? "ok" : res.error?.code,
            "| gm.status:", this.gm.status,
            "| timers-before-broadcast:", this.gm ? JSON.stringify(this.gm.getTimers()) : "n/a"
        );

        if (!res.ok) {
            client.send("move_error", {
                code: res.error!.code,
                message: res.error!.message,
                fen: this.gm.currentFen,
                position: this.gm.positionFlat,
                move: this.gm.isWhiteMove,
            });
            return;
        }

        // ВАЖНО: setState в Colyseus 0.16 — это `this.state = obj` (полная replace),
        // не merge. Если здесь передать только {move, position}, после первого же хода
        // перезаписываются поля idGame/result/playerWite/... и чёрные получают
        // GAME_FINISHED rejected на живой доске именно потому, что state.result
        // становится undefined (см. последний «странный» лог вида state.gameId=().
        this.setState({
            ...this.state,
            move: this.gm.isWhiteMove,
            position: [this.gm.positionFlat],
        });

        this.broadcast("move_made", {
            move: { from: message.from, to: message.to, promotion: message.promotion },
            fen: this.gm.currentFen,
            position: this.gm.positionFlat,
            timers: this.gm.getTimers(),
            nextTurn: this.gm.turn,
            pgn: this.gm.currentPgn,
            lastMoveTimestamp: this.gm.lastMoveTimestamp,
        });

        this.broadcast("game", this.broadcastState());

        if (this.drawOfferBy) {
            this.broadcast("draw_cleared", { reason: "move_played" });
            this.drawOfferBy = null;
        }
    }

    private handleLegacyGameMove(client: any, message: LegacyMoveMessage): void {
        if (!message.position || message.position.length === 0) return;

        // НЕ используем setState(part) — см. комментарий в handleMakeMove (setState = replace).
        if (message.move !== undefined) {
            this.state.move = message.move;
        }
        this.state.position = message.position;

        if (this.gm && message.position) {
            const flat = Array.isArray(message.position)
                ? message.position[0]
                : message.position;
            if (typeof flat === "string" && this.gm) {
                this.gm.applyLegacyPosition(flat, Boolean(message.move ?? true));
            }
        }

        this.broadcast("game", this.broadcastState());
    }

    private handleFlagFall(loserRole: PlayerRole): void {
        console.warn(
            "[flagFall] | gameId:", this.state?.idGame,
            "| roomId:", this.roomId,
            "| loserRole:", loserRole,
            "| timers:", this.gm ? JSON.stringify(this.gm.getTimers()) : "n/a",
            "| hasAnyMove:", (this.gm as any)?.hasAnyMove,
            "| moveCount:", (this.gm as any)?.moveHistory?.length,
            "| state.result:", this.state?.result,
            "|", this.roomHealth()
        );
        if (!this.gm || this.state.result !== "pending") return;
        const info = this.gm.loseOnTime(loserRole);
        void this.finalizeAndBroadcast(info);
    }

    private async handleAbandonment(role: PlayerRole): Promise<void> {
        if (!this.gm || this.state.result !== "pending") return;
        const info = this.gm.loseByAbandonment(role);
        await this.finalizeAndBroadcast(info);
    }

    private async handleResignGame(client: any): Promise<void> {
        if (!this.gm || this.state.result !== "pending") return;
        const info = this.gm.resign(client.role as PlayerRole);
        await this.finalizeAndBroadcast(info);
    }

    private async handleOfferDraw(client: any): Promise<void> {
        if (!this.gm || this.state.result !== "pending") return;
        const role = client.role as PlayerRole;

        if (this.drawOfferBy === role) return;

        if (this.drawOfferBy && this.drawOfferBy !== role) {
            const info = this.gm.agreeDraw();
            this.drawOfferBy = null;
            await this.finalizeAndBroadcast(info);
            return;
        }

        this.drawOfferBy = role;
        this.broadcast("draw_offered", { byRole: role });
    }

    async onLeave(client: any, consented: boolean): Promise<void> {
        const role = client.role as PlayerRole | undefined;
        console.log(
            "[onLeave] | roomId:", this.roomId,
            "| gameId:", this.state?.idGame,
            "| sessionId:", client.sessionId,
            "| role:", role ?? "(none)",
            "| consented:", consented,
            "| user:", client.userData?.name || "Unknown",
            "| before:", this.roomHealth()
        );
        this.sessionRoles.delete(client.sessionId);

        // Досрочно финализированная комната или комната без движка — просто фиксируем выход.
        if (this.state.result !== "pending" || !this.gm) {
            console.log(
                "[onLeave] no-op (already finalized or no GM) | gameId:", this.state?.idGame,
                "| after:", this.roomHealth()
            );
            return;
        }

        // consented=true = клиент намеренно вышел (room.leave(true)) — точно кик/навигация.
        // F5/обрыв соединения = consented=false — лечится через reconnection-timeout.
        if (!consented && role && this.state.result === "pending") {
            try {
                console.log(
                    "[onLeave] allowReconnection(60s) for | role:", role,
                    "| sessionId:", client.sessionId
                );
                await (this as any).allowReconnection(client, 60);
                console.log(
                    "[onLeave] ✅ reconnected in time | role:", role,
                    "| after:", this.roomHealth()
                );
                return; // Игрок вернулся — не паузим НИЧЕГО (честная пауза будет у нового join)
            } catch {
                console.log(
                    "[onLeave] reconnection window expired for | role:", role,
                    "| proceeding to pause"
                );
                // Игрок не вернулся за 60 с → падение в истинную паузу (ниже).
            }
        }

        if (!role) {
            console.warn(
                "[onLeave] client had NO role (duplicate-tab session?) | gameId:", this.state?.idGame,
                "| after:", this.roomHealth()
            );
        } else {
            // Если уходящий — дубликат того же userId, что ещё жив в комнате (вторая вкладка),
            // паузить партию НЕЛЬЗЯ: игрок фактически на месте.
            const sameUidAlive = this.clients.some(
                (c: any) => c.sessionId !== client.sessionId && String(c.userData?._id) === String(client.userData?._id)
            );
            if (sameUidAlive) {
                console.log(
                    "[onLeave] skipped pause — same userId still connected (other tab) | gameId:",
                    this.state?.idGame,
                    "| role:", role,
                    "| after:", this.roomHealth()
                );
            } else {
                console.log("[onLeave]", role, "disconnected, pausing... | gameId:", this.state.idGame);
                this.gm.handleDisconnect(role);
                if (this.pausedAt === null) this.pausedAt = Date.now();

                try {
                    await this.saveGameToDb(true);
                } catch (e) {
                    logError("onLeave save", e);
                }

                this.broadcast("opponent_disconnected", { role });
            }
        }

        // Если после ухода в комнате не осталось НИ ОДНОГО живого игрока —
        // комната заморожена с тикающим GameManager. Colyseus диспозит её по
        // autoDispose, но без гарантии по времени; ставим серверную страховку на
        // повторную проверку: кто-то вернулся — live и дальше, никого — чистим комнату.
        if (this.isEmptyOfPlayers()) {
            // Более долгий grace, чем окно allowReconnection, чтобы у игрока был шанс
            // восстановиться ДО того, как вся комната будет уничтожена.
            this.scheduleEmptyRecheck(
                65_000,
                role ? `player ${role} left — no players remain` : "last ws-client had no role"
            );
        }
    }

    private broadcastState() {
        return {
            idGame: this.state.idGame,
            position: this.state.position,
            playerWite: this.state.playerWite,
            playerBlack: this.state.playerBlack,
            reitingWite: this.state.reitingWite,
            reitingBlack: this.state.reitingBlack,
            timeWite: this.gm?.getTimers().white ?? this.state.timeWite,
            timeBlack: this.gm?.getTimers().black ?? this.state.timeBlack,
            move: this.gm?.isWhiteMove ?? this.state.move,
            typeGame: this.state.typeGame,
            timeControl: this.state.timeControl,
            timePluse: this.state.timePluse,
            lastMoveTimestamp: this.gm?.lastMoveTimestamp,
            fen: this.gm?.currentFen,
            /** Пауза по серверу: null если игра активна, иначе ms-timestamp начала паузы.
             *  Клиент обязан остановить локальный отсчёт пока значение не null. */
            pausedSince: this.pausedAt,
            message: "game",
        };
    }

    private async finalizeAndBroadcast(info: GameOverInfo): Promise<void> {
        if (!info) return;
        if (this.state.result !== "pending") return;
        if (this.finalizing) {
            console.warn(
                "[finalize] ⚠️ duplicate finalize suppressed | gameId:", this.state?.idGame,
                "| endReason:", info.endReason
            );
            return;
        }
        this.finalizing = true;

        console.warn(
            "[finalize] game over | gameId:", this.state.idGame,
            "| roomId:", this.roomId,
            "| result:", info.result,
            "| endReason:", info.endReason,
            "| winnerRole:", info.winnerRole,
            "| moveCount:", (this.gm as any)?.moveHistory?.length,
            "| timers:", this.gm ? JSON.stringify(this.gm.getTimers()) : "n/a",
            "|", this.roomHealth()
        );
        this.traceSetStateResult({ result: info.result }, "finalizeAndBroadcast");
        // setState = replace. Сохраняем остальные поля через spread, иначе после тех-игр
        // при завершении партии client получит state без idGame/playerWite/...
        this.setState({
            ...this.state,
            result: info.result,
            statusGame: "finished",
        });

        // Обновляем статистику и рейтинг игроков в MongoDB
        try {
            const game = await GameModel.findById(this.state.idGame);
            if (game && game.ownerWite && game.ownerBlack) {
                const white = await User.findById(game.ownerWite);
                const black = await User.findById(game.ownerBlack);
                if (white && black) {
                    white.gamesPlayed += 1;
                    black.gamesPlayed += 1;

                    const wOld = white.currentReiting;
                    const bOld = black.currentReiting;
                    const E_w = 1 / (1 + Math.pow(10, (bOld - wOld) / 400));
                    const E_b = 1 / (1 + Math.pow(10, (wOld - bOld) / 400));

                    if (info.result === "1-0") {
                        white.currentReiting = Math.round(wOld + 32 * (1 - E_w));
                        black.currentReiting = Math.round(bOld + 32 * (0 - E_b));
                        white.wins += 1;
                        black.losses += 1;
                    } else if (info.result === "0-1") {
                        white.currentReiting = Math.round(wOld + 32 * (0 - E_w));
                        black.currentReiting = Math.round(bOld + 32 * (1 - E_b));
                        white.losses += 1;
                        black.wins += 1;
                    } else {
                        white.currentReiting = Math.round(wOld + 32 * (0.5 - E_w));
                        black.currentReiting = Math.round(bOld + 32 * (0.5 - E_b));
                        white.draws += 1;
                        black.draws += 1;
                    }

                    white.maxRating = Math.max(white.maxRating, white.currentReiting);
                    black.maxRating = Math.max(black.maxRating, black.currentReiting);

                    await white.save();
                    await black.save();
                    console.log(
                        "[rating]",
                        white.name,
                        white.currentReiting,
                        "vs",
                        black.name,
                        black.currentReiting
                    );
                }
            }
        } catch (e) {
            logError("finalizeGame rating", e);
        }

        this.broadcast("gameOver", {
            status: "gameover",
            gameOverData: {
                result: info.result,
                winnerRole: info.winnerRole,
                endReason: info.endReason,
                ratingChange: 0, // TODO: можно вернуть фактическое изменение для UI
            },
        });

        await this.saveGameToDb(false, info);
        this.gm?.dispose();
        this.gm = null;
        this.finalizing = false;
    }

    private async saveGameToDb(paused: boolean, info?: GameOverInfo): Promise<void> {
        if (!this.gm) return;

        const snapshot = this.gm.snapshot(paused);

        const update: Record<string, unknown> = {
            position: snapshot.position,
            move: snapshot.move,
            moveHistory: snapshot.moveHistory,
            pgn: snapshot.pgn,
            timeWite: snapshot.timeWite,
            timeBlack: snapshot.timeBlack,
            paused: snapshot.paused,
            statusGame: snapshot.statusGame,
            finalFen: this.gm.currentFen,
        };

        if (!paused && info) {
            update.result = info.result;
            update.endReason = info.endReason;
            update.dateGameOver = new Date();
        } else {
            update.endReason = "";
        }

        try {
            await GameModel.findByIdAndUpdate(this.state.idGame, update);
            console.log(
                "[DB] Saved | paused:", paused, "| result:", info?.result,
                "| timeWite/timeBlack:", `${update.timeWite}/${update.timeBlack}`,
                "| statusGame:", update.statusGame
            );
        } catch (e) {
            logError("saveGameToDb", e);
        }
    }

    async onDispose(): Promise<void> {
        console.warn(
            "[onDispose] room disposed | roomId:", this.roomId,
            "| gameId:", this.state?.idGame,
            "| result:", this.state?.result,
            "| gm:", this.gm ? this.gm.status : "none",
            "| sessions remaining:", this.sessionRoles.size
        );
        this.cancelEmptyRecheck();
        if (this.gm && this.state.result === "pending") {
            // Комната выгружается, а партия в БД ещё не финализирована —
            // сохраняем СНАПШОТ С ПАУЗОЙ, иначе следующий restore увидит
            // устаревшие/старое-положение поля и часы «поедут» от старого значения.
            try {
                await this.saveGameToDb(true);
            } catch (e) {
                logError("onDispose save", e);
            }
        } else if (this.state.result !== "pending" && this.gm) {
            await this.saveGameToDb(false, this.gm.getGameOverInfo() ?? undefined);
        }
        this.gm?.dispose();
    }
}

export default ChessRoom;
