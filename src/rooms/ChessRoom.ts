import { Room } from "colyseus";
import GameModel from "../models/game.js";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { logError } from "../utils/logger.js";

class ChessRoom extends Room {
    gameData: unknown;

    constructor() {
        super();
        this.maxClients = 2;
        this.gameData = null;
    }

    async onCreate(options: { gameId?: string } | undefined): Promise<void> {
        // Якщо передано gameId — завантажуємо гру з MongoDB
        let initialGameId = this.roomId;
        let initialPosition: string[] = [];
        let initialMove = true;
        let initialPlayerWite = "";
        let initialPlayerBlack = "";
        let initialReitingWite = 800;
        let initialReitingBlack = 800;
        let initialTimeWite = 0;
        let initialTimeBlack = 0;
        let initialTypeGame = "standart";
        let initialTimeControl = 0;
        let initialTimePluse = 0;

        if (options?.gameId) {
            try {
                const game = await GameModel.findById(options.gameId);
                if (game) {
                    initialGameId = game._id.toString();
                    initialPosition = game.position || [];
                    initialMove = game.move !== undefined ? game.move : true;
                    initialPlayerWite = game.nameWite || "";
                    initialPlayerBlack = game.nameBlack || "";
                    initialReitingWite = game.reitingWite || 800;
                    initialReitingBlack = game.reitingBlack || 800;
                    initialTimeWite = game.timeWite || 0;
                    initialTimeBlack = game.timeBlack || 0;
                    initialTypeGame = game.typeGame || "standart";
                    initialTimeControl = game.timeControl || 0;
                    initialTimePluse = game.timePluse || 0;
                    console.log("[ChessRoom:onCreate] 📥 Loaded game from MongoDB | gameId:", initialGameId);
                }
            } catch (e) {
                logError("onCreate: failed to load game from MongoDB", e);
            }
        }

        this.setState({
            position: initialPosition,
            move: initialMove,
            playerWite: initialPlayerWite,
            playerBlack: initialPlayerBlack,
            reitingWite: initialReitingWite,
            reitingBlack: initialReitingBlack,
            timeWite: initialTimeWite,
            timeBlack: initialTimeBlack,
            result: "pending",
            idGame: initialGameId,
            typeGame: initialTypeGame,
            timeControl: initialTimeControl,
            timePluse: initialTimePluse,
        });

        // WS оброблює лише ходи під час активної партії
        this.onMessage("gameMove", (client, message) => {
            this.handleGameMove(client, message);
        });

        this.onMessage("gameOver", (client, message) => {
            this.handleGameOver(client, message);
        });
    }

    async onAuth(client: any, options: { token?: string }): Promise<boolean> {
        const token = options?.token;
        const clientIp = client.sessionId;

        if (!token) {
            console.log("[ChessRoom:onAuth] ❌ No token provided | sessionId:", clientIp);
            return false;
        }

        const { JWT_SECRET_KEY } = process.env as { JWT_SECRET_KEY: string };

        try {
            const { id } = jwt.verify(token, JWT_SECRET_KEY) as { id: string };
            const user = await User.findById(id);
            if (!user || user.token !== token) {
                console.log("[ChessRoom:onAuth] ❌ Auth failed — user not found or token mismatch | sessionId:", clientIp);
                return false;
            }
            client.userData = user;
            console.log("[ChessRoom:onAuth] ✅ Auth success | user:", user.name || "(unknown)", "| sessionId:", clientIp);
            return true;
        } catch (e) {
            console.log("[ChessRoom:onAuth] ❌ Auth failed | token invalid | sessionId:", clientIp, "| error:", e);
            return false;
        }
    }

    /**
     * onJoin — завантажує стан гри з MongoDB за gameId.
     * Гравець отримує роль (white/black) на основі ownerWite/ownerBlack.
     */
    async onJoin(client: any, options: { gameId?: string } | undefined): Promise<void> {
        const userName = client.userData?.name;
        const userRating = client.userData?.currentReiting ?? 800;
        const userId = client.userData?._id;

        console.log("[ChessRoom:onJoin] 🟢", userName, "joined | roomId:", this.roomId,
            "| current players:", this.state.playerWite || "(empty)", "/", this.state.playerBlack || "(empty)");

        // Визначаємо gameId: спочатку з опцій options, потім з state
        const gameId = (options?.gameId) || this.state.idGame;
        let game = null;

        if (gameId) {
            try {
                game = await GameModel.findById(gameId);
            } catch (e) {
                logError("onJoin: failed to load game from MongoDB", e);
            }
        }

        // Якщо гра знайдена і має обох гравців — призначаємо ролі
        if (game && game.ownerWite && game.ownerBlack) {
            if (game.ownerWite.toString() === userId?.toString()) {
                this.state.playerWite = game.nameWite || userName || "";
                this.state.reitingWite = game.reitingWite || userRating;
                client.role = "wite";
                console.log("[ChessRoom:onJoin] 🎨", userName, "assigned as WHITE (from MongoDB)");
            } else if (game.ownerBlack.toString() === userId?.toString()) {
                this.state.playerBlack = game.nameBlack || userName || "";
                this.state.reitingBlack = game.reitingBlack || userRating;
                client.role = "black";
                console.log("[ChessRoom:onJoin] 🎨", userName, "assigned as BLACK (from MongoDB)");
            } else {
                console.log("[ChessRoom:onJoin] ❌", userName, "— not a participant of this game");
                return;
            }
        } else {
            // Гра ще не завантажена або не має обох гравців — немає доступу до ігрової кімнати
            console.log("[ChessRoom:onJoin] ❌ Game not ready | gameId:", gameId, "| hasBothPlayers:", !!(game && game.ownerWite && game.ownerBlack));
            return;
        }

        // Якщо обидва гравці в кімнаті — розсилаємо gameStart
        if (this.state.playerWite && this.state.playerBlack) {
            console.log("[ChessRoom:onJoin] ✅ Both players present, broadcasting 'gameStart' to all, idGame:", gameId);
            try {
                this.broadcast("gameStart", {
                    idGame: gameId || this.roomId,
                    position: this.state.position,
                    playerWite: this.state.playerWite,
                    playerBlack: this.state.playerBlack,
                    reitingWite: this.state.reitingWite,
                    reitingBlack: this.state.reitingBlack,
                    timeWite: this.state.timeWite,
                    timeBlack: this.state.timeBlack,
                    move: this.state.move,
                    typeGame: this.state.typeGame,
                    timeControl: this.state.timeControl,
                    timePluse: this.state.timePluse,
                    message: "gameStart",
                });
                console.log("[ChessRoom:onJoin] 📨 'gameStart' broadcast sent to all players");
            } catch (e) {
                logError("onJoin: failed to broadcast gameStart", e);
            }
        }
    }

    handleGameMove(client: any, message: { position?: string[]; move?: boolean }): void {
        const userName = client.userData?.name;
        console.log("[ChessRoom:handleGameMove] 📥 Incoming 'gameMove' from", userName, "| move:", message.move,
            "| position length:", message.position?.length);

        try {
            if (message.position) {
                this.state.position = message.position;
            }
            if (message.move !== undefined) {
                this.state.move = message.move;
            }

            console.log("[ChessRoom:handleGameMove] 📤 Broadcasting 'game' update to all players, move:", this.state.move);

            this.broadcast("game", {
                idGame: this.state.idGame || this.roomId,
                position: this.state.position,
                playerWite: this.state.playerWite,
                playerBlack: this.state.playerBlack,
                reitingWite: this.state.reitingWite,
                reitingBlack: this.state.reitingBlack,
                timeWite: this.state.timeWite,
                timeBlack: this.state.timeBlack,
                move: this.state.move,
                typeGame: this.state.typeGame,
                timeControl: this.state.timeControl,
                timePluse: this.state.timePluse,
                message: "game",
            });
            console.log("[ChessRoom:handleGameMove] ✅ 'game' broadcast sent");
        } catch (e) {
            logError("handleGameMove: broadcast error", e);
        }
    }

    async handleGameOver(client: any, message: { result: string; ratingChange: number }): Promise<void> {
        const role = client.role;
        const userName = client.userData?.name;
        if (!role) {
            console.log("[ChessRoom:handleGameOver] ❌ No role for", userName, ", ignoring");
            return;
        }

        console.log("[ChessRoom:handleGameOver] 📥 Incoming 'gameOver' from", userName, "| result:", message.result, "| ratingChange:", message.ratingChange);

        try {
            this.state.result = message.result;

            let clientResult: "win" | "loss" | "draw";
            if (message.result === "0.5-0.5") {
                clientResult = "draw";
            } else if (
                (role === "wite" && message.result === "1-0") ||
                (role === "black" && message.result === "0-1")
            ) {
                clientResult = "win";
            } else {
                clientResult = "loss";
            }

            console.log("[ChessRoom:handleGameOver] 📊", userName, "result:", clientResult);

            if (this.gameData) {
                try {
                    await GameModel.findByIdAndUpdate(this.state.idGame || this.roomId, {
                        result: message.result,
                        dateGameOver: new Date(),
                    });
                    console.log("[ChessRoom:handleGameOver] ✅ Game result saved to MongoDB");
                } catch (e) {
                    logError("handleGameOver: save game result error", e);
                }
            }

            console.log("[ChessRoom:handleGameOver] 📤 Broadcasting 'gameOver' to all players");
            this.broadcast("gameOver", {
                status: "gameover",
                gameOverData: {
                    result: clientResult,
                    ratingChange: message.ratingChange,
                    finalResult: message.result,
                    message: "gameOver",
                },
            });
            console.log("[ChessRoom:handleGameOver] ✅ 'gameOver' broadcast sent");
        } catch (e) {
            logError("handleGameOver: unexpected error", e);
        }
    }

    async onLeave(client: any, consented: boolean): Promise<void> {
        const role = client.role;
        const userName = client.userData?.name;
        const userId = client.userData?._id;
        const opponentRole = role === "wite" ? "black" : "wite";
        const opponentClient = this.clients.find((c: any) => c.role === opponentRole);

        console.log("[ChessRoom:onLeave] 🔴", userName, "left | role:", role, "| opponent:", opponentRole || "(none)", "| consented:", consented);

        if (opponentClient) {
            try {
                console.log("[ChessRoom:onLeave] 📤 Notifying opponent", opponentClient.userData?.name, "about disconnection");
                opponentClient.send("opponent_disconnected", {
                    opponentRole: role,
                });
                console.log("[ChessRoom:onLeave] ✅ 'opponent_disconnected' sent to", opponentClient.userData?.name);
            } catch (e) {
                logError("onLeave: failed to send to opponent", e);
            }
        }

        // Зберігаємо стан гри в MongoDB при відключенні (для активних ігор)
        const gameId = this.state.idGame || this.roomId;
        if (userId && this.gameData) {
            try {
                await GameModel.findByIdAndUpdate(gameId, {
                    position: this.state.position,
                    move: this.state.move,
                });
                console.log("[ChessRoom:onLeave] 💾 Game state saved to MongoDB for game", gameId);
            } catch (e) {
                logError("onLeave: failed to save game state", e);
            }
        }
    }

    async onDispose(): Promise<void> {
        console.log("[ChessRoom:onDispose] 🧹 Room disposing | roomId:", this.roomId, "| result:", this.state.result);
        if (this.gameData && this.state.result !== "pending") {
            try {
                await GameModel.findByIdAndUpdate(this.state.idGame || this.roomId, {
                    result: this.state.result,
                    dateGameOver: new Date(),
                });
                console.log("[ChessRoom:onDispose] ✅ Final game result saved to MongoDB");
            } catch (e) {
                logError("onDispose: failed to save game result", e);
            }
        } else {
            console.log("[ChessRoom:onDispose] ⏭️ No final save needed (game pending or no gameData)");
        }
    }
}

export default ChessRoom;
