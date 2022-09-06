const GameModel = require("../models/game");

class Game {
    async findCurentGame(req) {
        try {
            let curentGame = null;
            if (req.color === "wite") {
                curentGame = await GameModel.findOne({ ownerWite: req.user._id, result: "pending" });
            } else if (req.color === "black") {
                curentGame = await GameModel.findOne({ ownerBlack: req.user._id, result: "pending" });
            } else {
                return curentGame;
            }
            if (curentGame) {
                return curentGame;
            }
            return curentGame;
        } catch (error) {
            console.log(error);
        }
    }

    async createGame(req) {
        console.log("createGame req:", req);
        try {
            const opponentGame = await GameModel.findOne({
                statusGame: "open",
                typeGame: req.typeGame,
                timeControl: req.timeControl,
                timePluse: req.timePluse,
            });
            if (opponentGame) {
                console.log("we find opponent game!", opponentGame);
                let startGame = null;
                if (opponentGame.nameBlack === "") {
                    startGame = await GameModel.findByIdAndUpdate(opponentGame._id, {
                        statusGame: "close",
                        nameBlack: req.user.name,
                        ownerBlack: req.user._id,
                        reitingBlack: req.user.currentReiting,
                    });
                } else {
                    startGame = await GameModel.findByIdAndUpdate(opponentGame._id, {
                        statusGame: "close",
                        nameWite: req.user.name,
                        ownerWite: req.user._id,
                        reitingWite: req.user.currentReiting,
                    });
                }
                return startGame;
            }
            if (!opponentGame) {
                let myNewGame;
                if (req.color === "wite") {
                    myNewGame = {
                        ownerWite: "",
                        nameWite: "",
                        reitingWite: "",
                        ownerBlack: req.user._id,
                        reitingBlack: req.user.currentReiting,
                        nameBlack: req.user.name,
                        typeGame: req.typeGame,
                        timeControl: req.timeControl,
                        timePluse: req.timePluse,
                        statusGame: "open",
                    };
                } else if (req.color === "black") {
                    myNewGame = {
                        ownerBlack: "",
                        nameBlack: "",
                        reitingBlack: "",
                        ownerWite: req.user._id,
                        reitingWite: req.user.currentReiting,
                        nameWite: req.user.name,
                        typeGame: req.typeGame,
                        timeControl: req.timeControl,
                        timePluse: req.timePluse,
                        statusGame: "open",
                    };
                }
                const curentGame = await GameModel.create(myNewGame);
                return curentGame;
            }
        } catch (error) {
            console.log(error);
        }
    }

    async deleteGame(req) {
        try {
            const deleteGame = await GameModel.findOneAndDelete({ _id: req.gameId, statusGame: "open" });
            console.log(deleteGame);
        } catch (error) {
            console.log(error);
        }
    }
}

module.exports = new Game();
