const GameModel = require("../models/game");

class Game {
    async findCurentGame(req) {
        try {
            let curentGame = null;
            if (req.color === "wite") {
                curentGame = await GameModel.findOne({ ownerWite: req.user._id });
            } else {
                curentGame = await GameModel.findOne({ ownerBlack: req.user._id });
            }
            if (curentGame) {
                return curentGame;
            }
            return null;
        } catch (error) {
            console.log(error);
        }
    }

    async createGame(req) {
        try {
            const curentGame = await GameModel.findOne({});
            if (!curentGame) {
                const curentGame = await GameModel.create({});
                return curentGame;
            }
        } catch (error) {
            console.log(error);
        }
    }
}

module.exports = new Game();
