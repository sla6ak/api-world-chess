import statusCode from "../errors/statusCode.js";

interface DefaultResponseUser {
    name: string | null;
    email: string | null;
    _id: string | null;
    token: string | null;
    currentReiting: number | null;
    gamesPlayed: number | null;
    wins: number | null;
    losses: number | null;
    draws: number | null;
    maxRating: number | null;
}

interface DefaultResponseData {
    user: DefaultResponseUser;
    status: number;
    message: string;
}

const defaultResponseData = (
    status: number = 200,
    message: string = statusCode[status]
): DefaultResponseData => {
    const data: DefaultResponseData = {
        user: {
            name: null,
            email: null,
            _id: null,
            token: null,
            currentReiting: null,
            gamesPlayed: null,
            wins: null,
            losses: null,
            draws: null,
            maxRating: null,
        status,
        message,
    };

    return data;
};

export default defaultResponseData;
