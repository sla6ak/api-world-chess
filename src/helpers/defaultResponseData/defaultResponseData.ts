import statusCode from "../errors/statusCode.js";

interface DefaultResponseUser {
    name: string | null;
    email: string | null;
    _id: string | null;
    token: string | null;
    currentReiting: number | null;
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
        },
        status,
        message,
    };

    return data;
};

export default defaultResponseData;
