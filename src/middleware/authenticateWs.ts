import jwt from "jsonwebtoken";
import User from "../models/user.js";
import createError from "../helpers/errors/createError.js";

const { JWT_SECRET_KEY } = process.env as { JWT_SECRET_KEY: string };

const authenticateWs = async (token: string): Promise<unknown> => {
    try {
        const { id } = jwt.verify(token, JWT_SECRET_KEY) as { id: string };
        const user = await User.findById(id);
        if (!user || user.token !== token) {
            throw createError(401, "Not authorized Ws");
        }
        return user;
    } catch (error) {
        return error;
    }
};

export { authenticateWs };
