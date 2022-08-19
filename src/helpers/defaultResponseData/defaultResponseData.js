const statusCode = require("../errors/statusCode");

const defaultResponseData = (status = 200, message = statusCode[status]) => {
    const data = {
        user: {
            name: null,
            email: null,
            _id: null,
            token: null,
            currentBalance: null,
        },
        status,
        message,
    };

    return data;
};

module.exports = defaultResponseData;
