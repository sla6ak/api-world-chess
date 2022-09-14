const GameModel = require("../models/game");
const gameClass = require("../controllers/game");
const defaultResGame = require("../helpers/defaultResGame/defaultResGame");

const gameFindCurent = async (req) => {
    console.log("--- finding a current game, req:", req);
    const mesRes = defaultResGame();
    const myCurentGame = await gameClass.findCurentGame(req);
    if (myCurentGame) {
        console.log("we find last game!");
        mesRes.position = myCurentGame.position;
        mesRes.playerWite = myCurentGame.nameWite;
        mesRes.playerBlack = myCurentGame.nameBlack;
        mesRes.reitingWite = myCurentGame.reitingWite;
        mesRes.reitingBlack = myCurentGame.reitingBlack;
        mesRes.timeWite = myCurentGame.timeWite;
        mesRes.timeBlack = myCurentGame.timeBlack;
        mesRes.move = myCurentGame.true;
        mesRes.idGame = myCurentGame._id;
        mesRes.message = "game";
        return { mesRes }; // сюда нужно переписать поля найденные в базе
    }
    console.log("we dont find last game");
    return { mesRes };
};

const gameStart = async (req) => {
    console.log("client start game");
    const mesRes = defaultResGame();
    const newGame = await gameClass.createGame(req);
    if (newGame) {
        return { mesRes: newGame };
    }
    return { mesRes };
};

const gameStop = async (_id) => {
    console.log("client stop game");
    result = await gameClass.deleteGame(_id);
    if (result) {
        return result;
    }
    return "something wrong";
};

const gameCurent = async (req) => {
    console.log("client game movie");
    const mesRes = defaultResGame();
    const newGame = await gameClass.createGame(req);
    if (newGame) {
        return { mesRes };
    }
    return { mesRes };
};

module.exports = { gameStart, gameStop, gameCurent, gameFindCurent };
