import statusCode from "./statusCode.js";

interface ErrorWithStatus extends Error {
    status: number;
}

const createError = (status: number, message?: string): ErrorWithStatus => {
    const error = new Error(message ?? statusCode[status]) as ErrorWithStatus;
    error.status = status;
    return error;
};

export default createError;
