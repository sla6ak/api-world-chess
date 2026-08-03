/**
 * Конвертер между "плоским" представлением доски клиента (64 символа,
 * индекс 0 = a8 … 63 = h1, пустые клетки — '8' или '') и FEN для chess.js.
 *
 * Используется для миграции клиента на серверную валидацию ходов через chess.js,
 * без переписывания клиентской логики рендера доски.
 */
import { Chess } from "chess.js";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** a1..h8 клетка → индекс в плоской строке. */
export function squareToIndex(square: string): number {
    const file = square.charCodeAt(0) - 97; // a→0 … h→7
    const rank = Number(square[1]); // 1..8
    return (8 - rank) * 8 + file;
}

/** Индекс плоской строки → клетка a1..h8. */
export function indexToSquare(index: number): string {
    const file = String.fromCharCode(97 + (index % 8));
    const rank = 8 - Math.floor(index / 8);
    return `${file}${rank}`;
}

/**
 * Плоская строка (64 символа) + чей ход ('w' | 'b') → FEN.
 * Возвращает null, если строка некорректной длины.
 */
export function flatToFen(flat: string, turn: "w" | "b"): string | null {
    if (typeof flat !== "string" || flat.length !== 64) return null;

    const rows: string[] = [];
    for (let r = 0; r < 8; r++) {
        let row = "";
        let empties = 0;
        for (let c = 0; c < 8; c++) {
            const ch = flat[r * 8 + c];
            if (ch === "8" || ch === "" || ch === "1") {
                empties++;
            } else {
                if (empties > 0) {
                    row += String(empties);
                    empties = 0;
                }
                row += ch;
            }
        }
        if (empties > 0) row += String(empties);
        rows.push(row);
    }
    // плоский формат не хранит рокировки/взятие на проходе — базовые поля
    return `${rows.join("/")} ${turn} KQkq - 0 1`;
}

/** FEN (board-часть) → плоская строка длиной 64, пустые клетки — '8'. */
export function fenToFlat(fen: string): string {
    const boardPart = fen.split(" ")[0];
    let flat = "";
    for (const ch of boardPart) {
        if (ch === "/") continue;
        if (ch >= "1" && ch <= "8") {
            flat += "8".repeat(Number(ch));
        } else {
            flat += ch;
        }
    }
    return flat;
}

/** Плоская позиция → массив из одного элемента для совместимости со state.position. */
export function fenToPositionArray(fen: string): string[] {
    return [fenToFlat(fen)];
}

/**
 * Собрать статус завершения партии по chess.js.
 * Возвращает null, если партия продолжается.
 */
export function getGameOutcome(chess: Chess): {
    result: "1-0" | "0-1" | "0.5-0.5";
    endReason: "checkmate" | "stalemate" | "threefold" | "fifty_move" | "insufficient_material";
} | null {
    if (chess.isCheckmate()) {
        // Тот, чей ход — заматован
        return {
            result: chess.turn() === "w" ? "0-1" : "1-0",
            endReason: "checkmate",
        };
    }
    if (chess.isStalemate()) return { result: "0.5-0.5", endReason: "stalemate" };
    if (chess.isThreefoldRepetition()) return { result: "0.5-0.5", endReason: "threefold" };
    if (chess.isInsufficientMaterial()) return { result: "0.5-0.5", endReason: "insufficient_material" };
    if (chess.isDrawByFiftyMoves()) return { result: "0.5-0.5", endReason: "fifty_move" };
    if (chess.isDraw()) return { result: "0.5-0.5", endReason: "stalemate" };
    return null;
}

/**
 * Реконструировать экземпляр chess.js из сохранённой истории ходов (для восстановления после рестарта сервера).
 * Если pgn присутствует — используется он, иначе история moveHistory (SAN).
 */
export function rebuildChessFromHistory(pgn: string | undefined, moveHistory: Array<{ san?: string }> | undefined): Chess | null {
    const chess = new Chess();
    try {
        if (pgn) {
            chess.loadPgn(pgn);
            return chess;
        }
        if (moveHistory && moveHistory.length > 0) {
            for (const m of moveHistory) {
                if (m?.san) chess.move(m.san);
            }
            return chess;
        }
        return null;
    } catch {
        return null;
    }
}
