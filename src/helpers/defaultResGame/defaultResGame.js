const defaultResGame = () => {
    const data = {
        idGame: "",
        position: [],
        playerWite: "",
        playerBlack: "",
        reitingWite: 800,
        reitingBlack: 800,
        timeWite: "",
        timeBlack: "",
        move: true,
        resultGame: "",
        status: 200,
        message: "",
        error: "",
    };

    return data;
};

module.exports = defaultResGame;
