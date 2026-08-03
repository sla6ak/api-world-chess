/**
 * GameManager — изолированный in-memory менеджер состояния одной шахматной партии.
 *
 * Ответственность (см. PLAN.md):
 *  - хранение активной партии в памяти без обращений к MongoDB на каждый ход;
 *  - строгая валидация ходов через chess.js (цвет фигуры, очерёдность, легальность);
 *  - учёт часов / таймеров (timeControl + increment);
 *  - определение естественного завершения партии (мат, пат, ничьи по правилам);
 *  - для разрывов соединения: статус paused + таймер ожидания переподключения;
 *  - сериализация снимка партии для аварийного/финального сохранения в MongoDB.
 *
 * Класс не знает ничего о транспорте (Colyseus/WebSocket) — все сетевые эффекты
 * выполняются через callback-хуки, которые назначает ChessRoom.
 */
import { Chess } from "chess.js";
import {
    START_FEN,
    fenToFlat,
    flatToFen,
    getGameOutcome,
    rebuildChessFromHistory,
} from "./boardConverter.js";

export type PgnResult = "1-0" | "0-1" | "0.5-0.5";
export type PlayerRole = "wite" | "black";
export type GameStatus = "active" | "paused" | "finished";
export type EndReason =
    | "checkmate"
    | "stalemate"
    | "threefold"
    | "fifty_move"
    | "insufficient_material"
    | "timeout"
    | "resignation"
    | "agreed_draw"
    | "abandonment";

export interface Timers {
    white: number; // секунды
    black: number;
}

export interface MoveRecord {
    san: string;
    from: string;
    to: string;
    color: "w" | "b";
    time: number; // timestamp (ms) хода
}

export interface GameOverInfo {
    result: "1-0" | "0-1" | "0.5-0.5";
    endReason: EndReason;
    winnerRole: PlayerRole | null;
}

export interface GameManagerOptions {
    gameId: string;
    timeControl: number; // секунды на партию
    timePluse: number; // инкремент за ход, секунды
    /** Время ожидания переподключения, мс (0 — отключено). */
    reconnectTimeoutMs?: number;
    /** Вызывается каждую секунду работы часов. */
    onTick?: (timers: Timers) => void;
    /** Вызывается, когда у игрока истекло время. Флаг, который ставит syncClocks. */
    onFlagFall?: (loserRole: PlayerRole) => void;
    /** Вызывается при естественном завершении партии (мат/пат/ничьи). */
    onGameOver?: (info: GameOverInfo) => void;
    /** Вызывается, когда истёк таймер переподключения ушедшего игрока. */
    onAbandonment?: (role: PlayerRole) => void;
}

export interface DbSnapshot {
    position: string[];
    move: boolean; // true — ход белых (совместимость с существующей схемой)
    moveHistory: Array<{ san: string; from: string; to: string; color: string; time: number; ts: number }>;
    pgn: string;
    timeWite: number;
    timeBlack: number;
    paused: boolean;
    statusGame: "open" | "close";
}

export interface MoveInput {
    from: string;
    to: string;
    promotion?: string;
}

export interface MoveValidationError {
    code: "NOT_YOUR_TURN" | "WRONG_COLOR" | "INVALID_MOVE" | "GAME_FINISHED";
    message: string;
}

class GameManager {
    readonly gameId: string;
    status: GameStatus = "active";

    private chess: Chess;
    private timers: Timers;
    private readonly increment: number;
    private moveHistory: MoveRecord[] = [];
    private lastTickAt: number | null = null;
    private tickInterval: NodeJS.Timeout | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private gameOverInfo: GameOverInfo | null = null;
    private readonly opts: GameManagerOptions;

    constructor(opts: GameManagerOptions, chess?: Chess, timers?: Partial<Timers>, history?: MoveRecord[]) {
        this.opts = opts;
        this.gameId = opts.gameId;
        this.chess = chess ?? new Chess(START_FEN);
        this.timers = {
            white: timers?.white ?? opts.timeControl,
            black: timers?.black ?? opts.timeControl,
        };
        this.increment = opts.timePluse ?? 0;
        this.moveHistory = history ?? [];

        this.startClock();
    }

    /** Восстановить менеджер из снимка MongoDB (после рестарта сервера / реконнекта). */
    static restore(gameId: string, doc: {
        timeControl?: number;
        timePluse?: number;
        timeWite?: number;
        timeBlack?: number;
        pgn?: string;
        moveHistory?: Array<{ san?: string }>;
        paused?: boolean;
        result?: string;
    }, opts: Omit<GameManagerOptions, "gameId" | "timeControl" | "timePluse">): GameManager {
        const chess = rebuildChessFromHistory(doc.pgn, doc.moveHistory) ?? new Chess(START_FEN);
        const gm = new GameManager(
            {
                gameId,
                timeControl: doc.timeControl ?? 180,
                timePluse: doc.timePluse ?? 0,
                ...opts,
            },
            chess,
            { white: doc.timeWite ?? 180, black: doc.timeBlack ?? 180 },
            [],
        );
        gm.status = doc.paused ? "paused" : "active";
        return gm;
    }

    /** Текущий чей ход: 'w' | 'b'. */
    get turn(): "w" | "b" {
        return this.chess.turn();
    }

    /** Сейчас ход белых? (совместимость со старым полем `move`). */
    get isWhiteMove(): boolean {
        return this.chess.turn() === "w";
    }

    get currentFen(): string {
        return this.chess.fen();
    }

    get currentPgn(): string {
        return this.chess.pgn();
    }

    /** Плоская позиция для клиентов. */
    get positionFlat(): string {
        return fenToFlat(this.currentFen);
    }

    getTimers(): Timers {
        this.syncClocks();
        return { ...this.timers };
    }

    getGameOverInfo(): GameOverInfo | null {
        return this.gameOverInfo;
    }

    /**
     * Синхронизировать часы с фактическим прошедшим временем.
     * Возвращает true, если у кого-то упал флаг (время вышло).
     */
    private syncClocks(): boolean {
        if (this.status !== "active" || this.lastTickAt === null) return false;

        const now = Date.now();
        const elapsed = Math.floor((now - this.lastTickAt) / 1000);
        if (elapsed <= 0) return false;

        this.lastTickAt = now;
        const key = this.chess.turn() === "w" ? "white" : "black";
        this.timers[key] = Math.max(0, this.timers[key] - elapsed);

        if (this.timers[key] <= 0) {
            this.opts.onFlagFall?.(key === "white" ? "wite" : "black");
            return true;
        }
        return false;
    }

    /** Запуск 1-секундного тика часов. */
    private startClock(): void {
        this.stopClock();
        this.lastTickAt = Date.now();
        this.tickInterval = setInterval(() => {
            this.syncClocks();
            this.opts.onTick?.(this.getTimers());
        }, 1000);
    }

    private stopClock(): void {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    /**
     * Строгая проверка и совершение хода (описание в PLAN.md, п. 2).
     * Возвращает { ok:true } при успехе или { ok:false, error } при отказе.
     */
    handleMove(role: PlayerRole, move: MoveInput): { ok: boolean; error?: MoveValidationError; gameOver?: GameOverInfo } {
        if (this.status === "finished") {
            return { ok: false, error: { code: "GAME_FINISHED", message: "Game is already finished" } };
        }
        if (this.gameOverInfo) {
            return { ok: false, error: { code: "GAME_FINISHED", message: "Game is already finished" } };
        }

        const isWhiteRole = role === "wite";

        // 1+2. Очерёдность + строгий запрет ходить чужим цветом:
        if (this.chess.turn() !== (isWhiteRole ? "w" : "b")) {
            return { ok: false, error: { code: "NOT_YOUR_TURN", message: "Not your turn" } };
        }

        // Дополнительная защита от читерства: фигура на исходной клетке должна быть нашего цвета.
        const piece = move.from ? this.chess.get(move.from as any) : null;
        if (piece && piece.color !== (isWhiteRole ? "w" : "b")) {
            return { ok: false, error: { code: "WRONG_COLOR", message: "You can move only your own pieces" } };
        }

        // Фиксируем часы до выполнения хода.
        this.syncClocks();
        if (this.gameOverInfo) {
            return { ok: false, error: { code: "GAME_FINISHED", message: "Time is over" } };
        }

        // 3. Валидация хода через chess.js.
        let made;
        try {
            made = this.chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion ?? "q",
            });
        } catch {
            made = null;
        }
        if (!made) {
            return { ok: false, error: { code: "INVALID_MOVE", message: "Invalid move" } };
        }

        this.moveHistory.push({
            san: made.san,
            from: made.from,
            to: made.to,
            color: made.color,
            time: Date.now(),
        });

        // Инкремент за ход.
        if (this.increment > 0) {
            const key = made.color === "w" ? "white" : "black";
            this.timers[key] += this.increment;
        }

        // Старт отсчёта времени для следующего игрока.
        this.lastTickAt = Date.now();

        // 4. Проверка естественного завершения партии.
        const outcome = getGameOutcome(this.chess);
        if (outcome) {
            return {
                ok: true,
                gameOver: this.finishGame(outcome.result, outcome.endReason as EndReason),
            };
        }

        return { ok: true };
    }

    /** Сдаться (role проигрывает). */
    resign(role: PlayerRole): GameOverInfo {
        const result = role === "wite" ? "0-1" : "1-0";
        return this.finishGame(result, "resignation");
    }

    /** Ничья по согласию. */
    agreeDraw(): GameOverInfo {
        return this.finishGame("0.5-0.5", "agreed_draw");
    }

    /** Поражение из-за истекшего времени (loserRole проигрывает). */
    loseOnTime(loserRole: PlayerRole): GameOverInfo {
        const result = loserRole === "wite" ? "0-1" : "1-0";
        return this.finishGame(result, "timeout");
    }

    /** Поражение из-за не вернувшегося после disconnect игрока. */
    loseByAbandonment(role: PlayerRole): GameOverInfo {
        const result = role === "wite" ? "0-1" : "1-0";
        return this.finishGame(result, "abandonment");
    }

    private finishGame(result: "1-0" | "0-1" | "0.5-0.5", endReason: EndReason): GameOverInfo {
        this.stopClock();
        this.clearReconnectTimer();
        this.status = "finished";
        const info: GameOverInfo = {
            result,
            endReason,
            winnerRole:
                result === "0.5-0.5" ? null : result === "1-0" ? "wite" : "black",
        };
        // Финальное PGN с результатом (chess.js требует header Result — ставим через pgn-хак).
        try {
            this.chess.header("Result", result);
        } catch {
            // некритично
        }
        this.gameOverInfo = info;
        this.opts.onGameOver?.(info);
        return info;
    }

    /** Пауза при разрыве соединения + таймер возврата. */
    handleDisconnect(role: PlayerRole): void {
        if (this.status === "finished") return;
        this.status = "paused";
        this.lastTickAt = null;
        this.clearReconnectTimer();

        const timeout = this.opts.reconnectTimeoutMs ?? 0;
        if (timeout > 0) {
            this.reconnectTimer = setTimeout(() => {
                this.opts.onAbandonment?.(role);
            }, timeout);
        }
    }

    /** Восстановление после переподключения. Возвращает true, если игра снова активна. */
    handleReconnect(): boolean {
        if (this.status !== "paused") return this.status === "active";
        this.clearReconnectTimer();
        this.status = "active";
        this.lastTickAt = Date.now();
        return true;
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /** Снимок состояния для сохранения в MongoDB (аварийное/финальное). */
    snapshot(paused = this.status === "paused"): DbSnapshot {
        return {
            position: [this.positionFlat],
            move: this.chess.turn() === "w",
            moveHistory: this.moveHistory.map((m) => ({ ...m, ts: m.time })),
            pgn: this.currentPgn,
            timeWite: this.timers.white,
            timeBlack: this.timers.black,
            paused,
            statusGame: "close",
        };
    }

    /** Совместимость: проверить/применить ход, отправленный старым клиентом (плоская позиция + флаг хода). */
    applyLegacyPosition(positionFlat: string, isWhiteMove: boolean): { ok: boolean; error?: MoveValidationError } {
        const turn = isWhiteMove ? "w" : "b";
        const fen = flatToFen(positionFlat, turn);
        if (!fen) {
            return { ok: false, error: { code: "INVALID_MOVE", message: "Invalid position payload" } };
        }
        try {
            this.chess.load(fen);
            this.lastTickAt = Date.now();
            // Нет истории ходов для legacy-режима — часы всё же продолжают тикать
            return { ok: true };
        } catch {
            return { ok: false, error: { code: "INVALID_MOVE", message: "Invalid position payload" } };
        }
    }

    dispose(): void {
        this.stopClock();
        this.clearReconnectTimer();
    }
}

export default GameManager;
