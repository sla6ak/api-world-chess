// const GameModel = require("../models/game");
const gameClass = require("../controllers/game");
const defaultResGame = require("../helpers/defaultResGame/defaultResGame");

const gameFindCurent = async (req) => {
    const mesRes = defaultResGame();
    const myCurentGame = await gameClass.findCurentGame(req);
    if (myCurentGame) {
        console.log("we find last game!");
        return { mesRes }; // сюда нужно переписать поля найденные в базе
    }
    console.log("we dont find last game");
    return { mesRes };
};
const game = async (req) => {
    const mesRes = defaultResGame();
    const newGame = await gameClass.createGame(req);
    if (newGame) {
        return { mesRes };
    }
    return { mesRes };
};

module.exports = { game, gameFindCurent };
