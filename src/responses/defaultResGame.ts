interface DefaultResGame {
    idGame: string;
    position: string[];
    playerWite: string;
    playerBlack: string;
    reitingWite: number;
    reitingBlack: number;
    timeWite: string;
    timeBlack: string;
    move: boolean;
    resultGame: string;
    status: number;
    message: string;
    error: string;
}

const defaultResGame = (): DefaultResGame => {
    const data: DefaultResGame = {
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

export default defaultResGame;
