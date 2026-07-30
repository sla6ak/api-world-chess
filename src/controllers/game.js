const GameModel = require("../models/game");
const gameStore = require("../games/gameStore");

class Game {
    async findCurentGame(req) {
        try {
            // Сначала проверяем in-memory хранилище
            const inMemoryGame = gameStore.findByUser(req.user._id);
            if (inMemoryGame) {
                return { ...inMemoryGame.state, _id: inMemoryGame.gameId, fromMemory: true };
            }

            // Если нет в памяти — ищем в MongoDB (переподключение или завершённая игра)
            let curentGame = null;
            if (req.color === "wite") {
                curentGame = await GameModel.findOne({
                    ownerWite: req.user._id,
                    result: "pending",
                });
            } else if (req.color === "black") {
                curentGame = await GameModel.findOne({
                    ownerBlack: req.user._id,
                    result: "pending",
                });
            } else {
                curentGame = await GameModel.findOne({
                    $or: [{ ownerWite: req.user._id }, { ownerBlack: req.user._id }],
                    result: "pending",
                });
            }
            return curentGame;
        } catch (error) {
            console.log(error);
        }
    }

    async createGame(req) {
        try {
            // Ищем открытую игру в in-memory хранилище
            const openGame = gameStore.findOpenGame(
                req.typeGame,
                req.timeControl,
                req.timePluse
            );

            if (openGame) {
                // Нашли оппонента в памяти — закрываем игру
                const { gameId, state } = openGame;
                let opponentId = null;
                let startGame = null;

                if (state.players.black?.userId) {
                    // Оппонент — чёрные, мы белые
                    opponentId = state.players.black.userId;
                    state.players.wite = {
                        ws: null,
                        userId: req.user._id,
                        name: req.user.name,
                        rating: req.user.currentReiting,
                    };
                    state.statusGame = "close";
                    startGame = await GameModel.findByIdAndUpdate(gameId, {
                        statusGame: "close",
                        nameWite: req.user.name,
                        ownerWite: req.user._id,
                        reitingWite: req.user.currentReiting,
                        position: state.position,
                    });
                } else if (state.players.wite?.userId) {
                    // Оппонент — белые, мы чёрные
                    opponentId = state.players.wite.userId;
                    state.players.black = {
                        ws: null,
                        userId: req.user._id,
                        name: req.user.name,
                        rating: req.user.currentReiting,
                    };
                    state.statusGame = "close";
                    startGame = await GameModel.findByIdAndUpdate(gameId, {
                        statusGame: "close",
                        nameBlack: req.user.name,
                        ownerBlack: req.user._id,
                        reitingBlack: req.user.currentReiting,
                        position: state.position,
                    });
                }

                // Обновляем in-memory состояние
                gameStore.set(gameId, state);

                return { game: startGame, opponentId };
            }

            // Оппонента нет — создаём новую игру в MongoDB (минимальная запись)
            let myNewGame;
            if (req.color === "wite") {
                myNewGame = {
                    ownerWite: req.user._id,
                    nameWite: req.user.name,
                    reitingWite: req.user.currentReiting,
                    typeGame: req.typeGame,
                    timeControl: req.timeControl,
                    timePluse: req.timePluse,
                    statusGame: "open",
                    position: [],
                };
            } else if (req.color === "black") {
                myNewGame = {
                    ownerBlack: req.user._id,
                    nameBlack: req.user.name,
                    reitingBlack: req.user.currentReiting,
                    typeGame: req.typeGame,
                    timeControl: req.timeControl,
                    timePluse: req.timePluse,
                    statusGame: "open",
                    position: [],
                };
            }

            const curentGame = await GameModel.create(myNewGame);

            // Создаём in-memory запись для этой игры
            gameStore.set(curentGame._id.toString(), {
                statusGame: "open",
                position: [],
                move: true,
                players: {
                    wite: curentGame.ownerWite
                        ? {
                              ws: null,
                              userId: curentGame.ownerWite,
                              name: curentGame.nameWite,
                              rating: curentGame.reitingWite,
                          }
                        : null,
                    black: curentGame.ownerBlack
                        ? {
                              ws: null,
                              userId: curentGame.ownerBlack,
                              name: curentGame.nameBlack,
                              rating: curentGame.reitingBlack,
                          }
                        : null,
                },
                typeGame: curentGame.typeGame,
                timeControl: curentGame.timeControl,
                timePluse: curentGame.timePluse,
            });

            return { game: curentGame, opponentId: null };
        } catch (error) {
            console.log(error);
        }
    }

    async gameCurent(req) {
        try {
            // Проверяем in-memory хранилище
            const inMemoryGame = gameStore.findByUser(req.user._id);
            if (inMemoryGame) {
                const { state, gameId } = inMemoryGame;
                return {
                    idGame: gameId,
                    position: state.position,
                    playerWite: state.players.wite?.name || "",
                    playerBlack: state.players.black?.name || "",
                    reitingWite: state.players.wite?.rating || 800,
                    reitingBlack: state.players.black?.rating || 800,
                    timeWite: state.timeControl || "",
                    timeBlack: state.timeControl || "",
                    move: state.move,
                    message: "game",
                };
            }

            // Если нет в памяти — ищем в MongoDB (для переподключения)
            let currentGame = null;
            if (req.color === "wite") {
                currentGame = await GameModel.findOne({
                    ownerWite: req.user._id,
                    result: "pending",
                });
            } else if (req.color === "black") {
                currentGame = await GameModel.findOne({
                    ownerBlack: req.user._id,
                    result: "pending",
                });
            } else {
                currentGame = await GameModel.findOne({
                    $or: [{ ownerWite: req.user._id }, { ownerBlack: req.user._id }],
                    result: "pending",
                });
            }

            if (currentGame) {
                return {
                    idGame: currentGame._id,
                    position: currentGame.position,
                    playerWite: currentGame.nameWite,
                    playerBlack: currentGame.nameBlack,
                    reitingWite: currentGame.reitingWite,
                    reitingBlack: currentGame.reitingBlack,
                    timeWite: currentGame.timeControl,
                    timeBlack: currentGame.timeControl,
                    move: currentGame.move,
                    message: "game",
                };
            }

            return null;
        } catch (error) {
            console.log(error);
        }
    }

    async saveGameResult(req) {
        try {
            const { gameId, result, position } = req;
            const update = { result, dateGameOver: new Date() };
            if (position) update.position = position;
            await GameModel.findByIdAndUpdate(gameId, update);
            // Удаляем из in-memory хранилища
            gameStore.delete(gameId);
        } catch (error) {
            console.log(error);
        }
    }

    async saveGameOnDisconnect(req) {
        try {
            const { gameId, position, move } = req;
            const update = { position, move };
            await GameModel.findByIdAndUpdate(gameId, update);
        } catch (error) {
            console.log(error);
        }
    }

    async deleteGame(req) {
        try {
            const deleteGame = await GameModel.findOneAndDelete({
                _id: req.gameId,
                statusGame: "open",
            });
            console.log(deleteGame);
        } catch (error) {
            console.log(error);
        }
    }
}

module.exports = new Game();
