import { Room } from "colyseus";
import GameModel from "../models/game.js";
import jwt from "jsonwebtoken";
import { logError } from "../helpers/logger/logger.js";

class ChessRoom extends Room {
    gameData: unknown;

    constructor() {
        super();
        this.maxClients = 2;
        this.gameData = null;
    }

    onCreate(options: unknown): void {
        this.setState({
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
            timeControl: 0,
            timePluse: 0,
        });

        this.onMessage("findGame", (client, message) => {
            this.handleFindGame(client, message);
        });

        this.onMessage("startApp", (client, message) => {
            this.handleStartApp(client, message);
        });

        this.onMessage("startGame", (client, message) => {
            this.handleStartGame(client, message);
        });

        this.onMessage("cancelSearch", (client, message) => {
            this.handleCancelSearch(client, message);
        });

        this.onMessage("gameOver", (client, message) => {
            this.handleGameOver(client, message);
        });
    }

    async onAuth(client: any, options: { token?: string }): Promise<boolean> {
        const token = options?.token;
        if (!token) return false;

        const { JWT_SECRET_KEY } = process.env as { JWT_SECRET_KEY: string };

        try {
            const decoded = jwt.verify(token, JWT_SECRET_KEY);
            client.userData = decoded;
            return true;
        } catch {
            return false;
        }
    }

    async onJoin(client: any, options: unknown): Promise<void> {
        const userName = client.userData?.name;
        const userRating = client.userData?.currentReiting ?? 800;
        const userId = client.userData?._id;

        if (this.state.playerWite === "") {
            this.state.playerWite = userName ?? "";
            this.state.reitingWite = userRating;
            client.role = "wite";
        } else if (this.state.playerBlack === "") {
            this.state.playerBlack = userName ?? "";
            this.state.reitingBlack = userRating;
            client.role = "black";
        }

        // При подключении второго игрока — сохраняем игру в MongoDB, но НЕ стартуем автоматически
        // Игра стартует только когда оба игрока нажмут "findGame"
        if (this.state.playerWite && this.state.playerBlack) {
            try {
                await this.lock();

                const witeClient = this.clients.find((c: any) => c.role === "wite");

                this.gameData = await GameModel.findByIdAndUpdate(
                    this.roomId,
                    {
                        statusGame: "close",
                        nameWite: this.state.playerWite,
                        ownerWite: witeClient?.userData?._id,
                        reitingWite: this.state.reitingWite,
                        nameBlack: this.state.playerBlack,
                        ownerBlack: userId,
                        reitingBlack: this.state.reitingBlack,
                    },
                    { new: true, upsert: true }
                );
            } catch (e) {
                logError("onJoin: save game to MongoDB", e);
            }
        }
    }

    /**
     * Обработчик поиска игры
     * Проверяет, что оба игрока в комнате готовы, и стартует игру
     */
    async handleFindGame(client: any, message: { token?: string; color?: string; typeGame?: string; timeControl?: number; timePluse?: number }): Promise<void> {
        const userName = client.userData?.name;
        const userRating = client.userData?.currentReiting ?? 800;
        const userId = client.userData?._id;

        // Сохраняем параметры поиска в состояние комнаты
        if (message.typeGame) this.state.typeGame = message.typeGame;
        if (message.timeControl !== undefined) this.state.timeControl = message.timeControl;
        if (message.timePluse !== undefined) this.state.timePluse = message.timePluse;

        const currentWite = this.state.playerWite;
        const currentBlack = this.state.playerBlack;

        // Если текущий игрок ещё не назначен — назначаем
        if (client.role === "" || !client.role) {
            if (currentWite === "" && currentBlack === "") {
                this.state.playerWite = userName ?? "";
                this.state.reitingWite = userRating;
                client.role = "wite";
            } else if (currentWite !== "" && currentBlack === "") {
                this.state.playerBlack = userName ?? "";
                this.state.reitingBlack = userRating;
                client.role = "black";
            }
        }

        // Если оба игрока теперь в комнате — запускаем игру
        if (this.state.playerWite && this.state.playerBlack) {
            try {
                await this.lock();

                const witeClient = this.clients.find((c: any) => c.role === "wite");

                // Сохраняем игру в MongoDB
                this.gameData = await GameModel.findByIdAndUpdate(
                    this.roomId,
                    {
                        statusGame: "close",
                        typeGame: this.state.typeGame,
                        timeControl: this.state.timeControl,
                        timePluse: this.state.timePluse,
                        nameWite: this.state.playerWite,
                        ownerWite: witeClient?.userData?._id,
                        reitingWite: this.state.reitingWite,
                        nameBlack: this.state.playerBlack,
                        ownerBlack: userId,
                        reitingBlack: this.state.reitingBlack,
                    },
                    { new: true, upsert: true }
                );

                // Уведомляем обоих игроков об успешном начале игры
                this.broadcast("gameStart", {
                    idGame: this.roomId,
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
            } catch (e) {
                logError("handleFindGame: start game error", e);
            }
        } else {
            // Ждём второго игрока — отправляем статус поиска
            try {
                client.send("searching", {
                    searchData: {
                        typeGame: this.state.typeGame,
                        timeControl: this.state.timeControl,
                        timePluse: this.state.timePluse,
                    },
                });
            } catch (e) {
                logError("handleFindGame: failed to send searching status", e);
            }
        }
    }

    handleStartApp(client: any, message: unknown): void {
        const role = client.role;

        if (!role) {
            try {
                client.send(
                    JSON.stringify({
                        mesRes: { message: "not_in_game" },
                    })
                );
            } catch (e) {
                logError("handleStartApp: failed to send not_in_game", e);
            }
            return;
        }

        try {
            client.send(
                JSON.stringify({
                    mesRes: {
                        idGame: this.roomId,
                        position: this.state.position,
                        playerWite: this.state.playerWite,
                        playerBlack: this.state.playerBlack,
                        reitingWite: this.state.reitingWite,
                        reitingBlack: this.state.reitingBlack,
                        timeWite: this.state.timeWite,
                        timeBlack: this.state.timeBlack,
                        move: this.state.move,
                        message: "game",
                    },
                })
            );
        } catch (e) {
            logError("handleStartApp: failed to send game data", e);
        }
    }

    handleStartGame(client: any, message: unknown): void {
        try {
            // Отправляем всем текущую позицию через правильное Colyseus-событие
            this.broadcast("game", {
                idGame: this.roomId,
                position: this.state.position,
                playerWite: this.state.playerWite,
                playerBlack: this.state.playerBlack,
                reitingWite: this.state.reitingWite,
                reitingBlack: this.state.reitingBlack,
                timeWite: this.state.timeWite,
                timeBlack: this.state.timeBlack,
                move: this.state.move,
                message: "game",
            });
        } catch (e) {
            logError("handleStartGame: broadcast error", e);
        }
    }

    handleGameMove(client: any, message: { position?: string[]; move?: boolean }): void {
        try {
            // Обновляем позицию в состоянии
            if (message.position) {
                this.state.position = message.position;
            }
            if (message.move !== undefined) {
                this.state.move = message.move;
            }

            // Рассылаем обновление обоим игрокам через правильное Colyseus-событие
            this.broadcast("game", {
                idGame: this.roomId,
                position: this.state.position,
                playerWite: this.state.playerWite,
                playerBlack: this.state.playerBlack,
                reitingWite: this.state.reitingWite,
                reitingBlack: this.state.reitingBlack,
                timeWite: this.state.timeWite,
                timeBlack: this.state.timeBlack,
                move: this.state.move,
                message: "game",
            });
        } catch (e) {
            logError("handleGameMove: broadcast error", e);
        }
    }

    async onLeave(client: any, consented: boolean): Promise<void> {
        const role = client.role;
        const opponentRole = role === "wite" ? "black" : "wite";
        const opponentClient = this.clients.find((c: any) => c.role === opponentRole);

        if (opponentClient) {
            try {
                opponentClient.send(
                    JSON.stringify({
                        mesRes: {
                            message: "opponent_disconnected",
                            opponentRole: role,
                        },
                    })
                );
            } catch (e) {
                logError("onLeave: failed to send to opponent", e);
            }
        }

        // Сохраняем текущее состояние в MongoDB при отключении
        if (this.gameData) {
            try {
                await GameModel.findByIdAndUpdate(this.roomId, {
                    position: this.state.position,
                    move: this.state.move,
                });
            } catch (e) {
                logError("onLeave: failed to save game state", e);
            }
        }
    }

    /**
     * Обработчик отмены поиска
     * По ID находит созданную и не начатую игру в MongoDB, удаляет её,
     * уведомляет обоих клиентов и закрывает комнату
     */
    async handleCancelSearch(client: any, message: unknown): Promise<void> {
        const userId = client.userData?._id;
        const { gameId } = message as { gameId?: string } ?? {};

        if (!userId) {
            logError("handleCancelSearch", "userId is undefined, cannot cancel search");
            return;
        }

        let cancelledGameId: string | null = null;

        try {
            // Находим и удаляем незапущенную игру из MongoDB по ID
            if (gameId) {
                try {
                    const gameToDelete = await GameModel.findOneAndDelete({
                        _id: gameId,
                        statusGame: "open",
                        result: "pending",
                    });
                    if (gameToDelete) {
                        cancelledGameId = gameToDelete._id.toString();
                    }
                } catch (e) {
                    logError("handleCancelSearch: DB delete error", e);
                }
            } else {
                logError("handleCancelSearch", "gameId is missing in cancel request");
            }

            // Уведомляем отменившего клиента, что поиск отменён
            try {
                client.send(
                    JSON.stringify({
                        mesRes: {
                            message: "search_cancelled",
                        },
                    })
                );
            } catch (e) {
                logError("handleCancelSearch: failed to notify cancelling client", e);
            }

            // Уведомляем оппонента (если он есть и ещё в комнате), что поиск отменён
            try {
                const opponentClient = this.clients.find((c: any) => c !== client);
                if (opponentClient) {
                    opponentClient.send(
                        JSON.stringify({
                            mesRes: {
                                message: "search_cancelled_by_opponent",
                            },
                        })
                    );
                }
            } catch (e) {
                logError("handleCancelSearch: failed to notify opponent", e);
            }
        } catch (e) {
            logError("handleCancelSearch: unexpected error", e);
        }

        // Закрываем комнату — отключаем всех клиентов
        try {
            await this.disconnect();
        } catch (e) {
            logError("handleCancelSearch: disconnect error", e);
        }
    }

    /**
     * Обработчик завершения игры
     * Получает результат от клиента и рассылает gameOver обоим игрокам
     */
    async handleGameOver(client: any, message: { result: string; ratingChange: number }): Promise<void> {
        const role = client.role;
        if (!role) return;

        try {
            // Обновляем результат в состоянии комнаты
            this.state.result = message.result;

            // Определяем результат для текущего клиента (от его перспективы)
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

            // Сохраняем в MongoDB
            if (this.gameData) {
                try {
                    await GameModel.findByIdAndUpdate(this.roomId, {
                        result: message.result,
                        dateGameOver: new Date(),
                    });
                } catch (e) {
                    logError("handleGameOver: save game result error", e);
                }
            }

            // Уведомляем обоих игроков о завершении игры
            this.broadcast("gameOver", {
                status: "gameover",
                gameOverData: {
                    result: clientResult,
                    ratingChange: message.ratingChange,
                    finalResult: message.result,
                    message: "gameOver",
                },
            });
        } catch (e) {
            logError("handleGameOver: unexpected error", e);
        }
    }

    async onDispose(): Promise<void> {
        // Финальное сохранение результата в MongoDB (только для завершённых игр, не для отменённых)
        if (this.gameData && this.state.result !== "pending") {
            try {
                await GameModel.findByIdAndUpdate(this.roomId, {
                    result: this.state.result,
                    dateGameOver: new Date(),
                });
            } catch (e) {
                logError("onDispose: failed to save game result", e);
            }
        }
    }
}

export default ChessRoom;
