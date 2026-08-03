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

    constructor() {
        super();
        this.maxClients = 2;
        this.gameData = null;
        (this as any).reconnectionTimeout = 60;
    }

    async onCreate(options: { gameId?: string }): Promise<void> {
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
                    initialState.position = game.position as string[];
                    initialState.move = Boolean(game.move);
                    initialState.playerWite = game.nameWite || "";
                    initialState.playerBlack = game.nameBlack || "";
                    initialState.reitingWite = game.reitingWite || 800;
                    initialState.reitingBlack = game.reitingBlack || 800;
                    initialState.timeWite = game.timeWite || 0;
                    initialState.timeBlack = game.timeBlack || 0;
                    initialState.typeGame = game.typeGame || "standart";
                    initialState.timeControl = game.timeControl || 0;
                    initialState.timePluse = game.timePluse || 0;

                    if (game.ownerWite && game.ownerBlack) {
                        this.restoreGameManager(game);
                    }
                }
            } catch (e) {
                logError("onCreate: failed to load game", e);
            }
        }

        this.setState(initialState);

        this.onMessage("make_move", (client, msg: MoveMessage) =>
            this.handleMakeMove(client, msg)
        );
        this.onMessage("gameMove", (client, msg: LegacyMoveMessage) =>
            this.handleLegacyGameMove(client, msg)
        );
        this.onMessage("resign_game", (client) => this.handleResignGame(client));
        this.onMessage("offer_draw", (client) => this.handleOfferDraw(client));
    }

    private restoreGameManager(gameDoc: unknown): void {
        const initialId = this.state.idGame as string;
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
            console.log("[ChessRoom] Restored GameManager | gameId:", initialId);
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

        try {
            const game = await GameModel.findById(gameId);
            if (!game || !game.ownerWite || !game.ownerBlack) {
                console.log("[join] Game not ready | user:", userName, "| gameId:", gameId);
                return client.leave(1000);
            }

            const uid = String(client.userData._id);
            const isWhite = String(game.ownerWite) === uid;
            const isBlack = String(game.ownerBlack) === uid;

            if (!isWhite && !isBlack) {
                console.log("[join] Not a participant | user:", userName, "| gameId:", gameId);
                return client.leave(1000);
            }

            client.role = isWhite ? "wite" : "black";

            this.setState({
                playerWite: game.nameWite || "",
                playerBlack: game.nameBlack || "",
                reitingWite: game.reitingWite || 800,
                reitingBlack: game.reitingBlack || 800,
                idGame: gameId,
                timeControl: game.timeControl || 0,
                timePluse: game.timePluse || 0,
                typeGame: game.typeGame || "standart",
            });

            if (!options?.gameId) {
                console.error("[onJoin] gameId missing — this should not happen");
                return client.leave(1000);
            }

            if (!this.gm) {
                this.restoreGameManager(game);
            }

            const bothInRoom =
                (this.state.playerWite as string) && (this.state.playerBlack as string);

            if (bothInRoom) {
                const resumed = this.gm?.handleReconnect() || false;
                this.broadcast("gameStart", this.broadcastState());
                if (resumed && this.gm) {
                    this.broadcast("gameResumed", {
                        timers: this.gm.getTimers(),
                        fen: this.gm.currentFen,
                    });
                }
            }
        } catch (e) {
            logError("onJoin", e);
            client.leave(1000);
        }
    }

    private handleMakeMove(client: any, message: MoveMessage): void {
        if (!this.gm || this.state.result !== "pending") return;

        const res = this.gm.handleMove(client.role as PlayerRole, message);

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

        this.setState({
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
        });

        this.broadcast("game", this.broadcastState());

        if (this.drawOfferBy) {
            this.broadcast("draw_cleared", { reason: "move_played" });
            this.drawOfferBy = null;
        }
    }

    private handleLegacyGameMove(client: any, message: LegacyMoveMessage): void {
        if (!message.position || message.position.length === 0) return;

        if (message.move !== undefined) {
            this.setState({ move: message.move });
        }

        this.setState({
            position: message.position,
        });

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

    async onLeave(client: any, _consented: boolean): Promise<void> {
        if (this.state.result !== "pending" || !this.gm) return;

        const role = client.role as PlayerRole | undefined;
        if (!role) return;

        console.log("[onLeave]", role, "disconnected, pausing...");
        this.gm.handleDisconnect(role);

        try {
            await this.saveGameToDb(true);
        } catch (e) {
            logError("onLeave save", e);
        }

        this.broadcast("opponent_disconnected", { role });
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
            fen: this.gm?.currentFen,
            message: "game",
        };
    }

    private async finalizeAndBroadcast(info: GameOverInfo): Promise<void> {
        if (!info) return;
        if (this.state.result !== "pending") return;

        this.setState({
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
            console.log("[DB] Saved | paused:", paused, "| result:", info?.result);
        } catch (e) {
            logError("saveGameToDb", e);
        }
    }

    async onDispose(): Promise<void> {
        if (this.state.result !== "pending" && this.gm) {
            await this.saveGameToDb(false, this.gm.getGameOverInfo() ?? undefined);
        }
        this.gm?.dispose();
    }
}

export default ChessRoom;
