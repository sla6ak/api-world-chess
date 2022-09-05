const statusCode = require("../errors/statusCode");

const defaultResGame = (status = 200, message = statusCode[status]) => {
    const data = {
        idGame: "",
        position: "",
        playerWite: "",
        playerBlack: "",
        reitingWite: 800,
        reitingBlack: 800,
        timeWite: "",
        timeBlack: "",
        move: true,
        resultGame: "",
        status,
        message,
    };

    return data;
};

module.exports = defaultResGame;
