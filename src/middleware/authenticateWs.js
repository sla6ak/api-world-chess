const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { createError } = require("../helpers/errors/createError");
const { JWT_SECRET_KEY } = process.env;

const authenticateWs = async (token) => {
    try {
        const { id } = jwt.verify(token, JWT_SECRET_KEY);
        const user = await User.findById(id);
        if (!user || user.token !== token) {
            throw createError(401, "Not authorized Ws");
        }
        return user;
    } catch (error) {
        return error;
    }
};

module.exports = { authenticateWs };
