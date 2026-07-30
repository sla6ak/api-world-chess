const gameClass = require("../controllers/game");
const defaultResGame = require("../helpers/defaultResGame/defaultResGame");

const gameFindCurent = async (req) => {
    const mesRes = defaultResGame();
    const myCurentGame = await gameClass.findCurentGame(req);
    if (myCurentGame) {
        mesRes.position = myCurentGame.position;
        mesRes.playerWite = myCurentGame.nameWite;
        mesRes.playerBlack = myCurentGame.nameBlack;
        mesRes.reitingWite = myCurentGame.reitingWite;
        mesRes.reitingBlack = myCurentGame.reitingBlack;
        mesRes.timeWite = myCurentGame.timeControl;
        mesRes.timeBlack = myCurentGame.timeControl;
        mesRes.move = myCurentGame.move;
        mesRes.idGame = myCurentGame._id;
        mesRes.message = "game";
        return { mesRes };
    }
    return { mesRes };
};

const gameStart = async (req) => {
    const mesRes = defaultResGame();
    const { game, opponentId } = await gameClass.createGame(req);
    if (game) {
        mesRes.idGame = game._id;
        mesRes.message = "startGame";
        mesRes.opponentId = opponentId;
        mesRes.typeGame = game.typeGame;
        mesRes.timeControl = game.timeControl;
        mesRes.timePluse = game.timePluse;
        mesRes.playerWite = game.nameWite;
        mesRes.playerBlack = game.nameBlack;
        mesRes.reitingWite = game.reitingWite;
        mesRes.reitingBlack = game.reitingBlack;
        return { mesRes };
    }
    return { mesRes };
};

const gameCurent = async (req) => {
    const mesRes = defaultResGame();
    const currentGame = await gameClass.gameCurent(req);
    if (currentGame) {
        mesRes.idGame = currentGame.idGame;
        mesRes.position = currentGame.position;
        mesRes.playerWite = currentGame.playerWite;
        mesRes.playerBlack = currentGame.playerBlack;
        mesRes.reitingWite = currentGame.reitingWite;
        mesRes.reitingBlack = currentGame.reitingBlack;
        mesRes.timeWite = currentGame.timeWite;
        mesRes.timeBlack = currentGame.timeBlack;
        mesRes.move = currentGame.move;
        mesRes.message = "game";
        return { mesRes };
    }
    return { mesRes };
};

module.exports = { gameStart, gameCurent, gameFindCurent };
