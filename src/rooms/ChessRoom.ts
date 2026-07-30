import { Room } from "colyseus";
import GameModel from "../models/game.js";
import jwt from "jsonwebtoken";

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
        });

        this.onMessage("startApp", (client, message) => {
            this.handleStartApp(client, message);
        });

        this.onMessage("startGame", (client, message) => {
            this.handleStartGame(client, message);
        });

        this.onMessage("game", (client, message) => {
            this.handleGameMove(client, message);
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
        const userRating = client.userData?.currentReiting;

        if (this.state.playerWite === "") {
            this.state.playerWite = userName ?? "";
            this.state.reitingWite = userRating ?? 800;
            client.role = "wite";
        } else if (this.state.playerBlack === "") {
            this.state.playerBlack = userName ?? "";
            this.state.reitingBlack = userRating ?? 800;
            client.role = "black";
        }

        // Если оба игрока подключились — начинаем игру
        if (this.state.playerWite && this.state.playerBlack) {
            await this.lock();

            // Сохраняем игру в MongoDB
            this.gameData = await GameModel.findByIdAndUpdate(
                this.roomId,
                {
                    statusGame: "close",
                    nameWite: this.state.playerWite,
                    ownerWite: client.userData?._id,
                    reitingWite: this.state.reitingWite,
                    nameBlack: this.state.playerBlack,
                    ownerBlack: client.userData?._id,
                    reitingBlack: this.state.reitingBlack,
                },
                { new: true }
            );
        }
    }

    handleStartApp(client: any, message: unknown): void {
        const role = client.role;

        if (!role) {
            client.send(JSON.stringify({ mesRes: { message: "not_in_game" } }));
            return;
        }

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
    }

    handleStartGame(client: any, message: unknown): void {
        // Отправляем всем текущую позицию
        this.broadcast(
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
    }

    handleGameMove(client: any, message: { position?: string[]; move?: boolean }): void {
        // Обновляем позицию в состоянии
        if (message.position) {
            this.state.position = message.position;
        }
        if (message.move !== undefined) {
            this.state.move = message.move;
        }

        // Рассылаем обновление обоим игрокам
        this.broadcast(
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
    }

    async onLeave(client: any, consented: boolean): Promise<void> {
        const role = client.role;
        const opponentRole = role === "wite" ? "black" : "wite";
        const opponentClient = this.clients.find((c: any) => c.role === opponentRole);

        if (opponentClient) {
            opponentClient.send(
                JSON.stringify({
                    mesRes: {
                        message: "opponent_disconnected",
                        opponentRole: role,
                    },
                })
            );
        }

        // Сохраняем текущее состояние в MongoDB при отключении
        if (this.gameData) {
            await GameModel.findByIdAndUpdate(this.roomId, {
                position: this.state.position,
                move: this.state.move,
            });
        }
    }

    async onDispose(): Promise<void> {
        // Финальное сохранение результата в MongoDB
        if (this.gameData) {
            await GameModel.findByIdAndUpdate(this.roomId, {
                result: this.state.result,
                dateGameOver: new Date(),
            });
        }
    }
}

export default ChessRoom;
