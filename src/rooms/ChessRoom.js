const { Room } = require("colyseus");
const GameModel = require("../models/game");

class ChessRoom extends Room {
    constructor() {
        super();
        this.maxClients = 2;
        this.gameData = null;
    }

    onCreate(options) {
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
    }

    async onAuth(client, options) {
        const token = options.token;
        if (!token) return false;

        const jwt = require("jsonwebtoken");
        const { JWT_SECRET_KEY } = process.env;

        try {
            const decoded = jwt.verify(token, JWT_SECRET_KEY);
            client.userData = decoded;
            return true;
        } catch (e) {
            return false;
        }
    }

    async onJoin(client, options) {
        const userName = client.userData.name;
        const userRating = client.userData.currentReiting;

        if (this.state.playerWite === "") {
            this.state.playerWite = userName;
            this.state.reitingWite = userRating;
            client.role = "wite";
        } else if (this.state.playerBlack === "") {
            this.state.playerBlack = userName;
            this.state.reitingBlack = userRating;
            client.role = "black";
        }

        // Если оба игрока подключились — начинаем игру
        if (this.state.playerWite && this.state.playerBlack) {
            this.lockRoom();

            // Сохраняем игру в MongoDB
            this.gameData = await GameModel.findByIdAndUpdate(
                this.roomId,
                {
                    statusGame: "close",
                    nameWite: this.state.playerWite,
                    ownerWite: client.userData._id,
                    reitingWite: this.state.reitingWite,
                    nameBlack: this.state.playerBlack,
                    ownerBlack: client.userData._id,
                    reitingBlack: this.state.reitingBlack,
                },
                { new: true }
            );
        }
    }

    onMessage(client, message) {
        switch (message.event) {
            case "startApp":
                this.handleStartApp(client, message);
                break;
            case "startGame":
                this.handleStartGame(client, message);
                break;
            case "game":
                this.handleGameMove(client, message);
                break;
        }
    }

    handleStartApp(client, message) {
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

    handleStartGame(client, message) {
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

    handleGameMove(client, message) {
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

    async onLeave(client, consented) {
        const role = client.role;
        const opponentRole = role === "wite" ? "black" : "wite";
        const opponentClient = this.clients.find((c) => c.role === opponentRole);

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

    async onDispose() {
        // Финальное сохранение результата в MongoDB
        if (this.gameData) {
            await GameModel.findByIdAndUpdate(this.roomId, {
                result: this.state.result,
                dateGameOver: new Date(),
            });
        }
    }
}

module.exports = ChessRoom;
