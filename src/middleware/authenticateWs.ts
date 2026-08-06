import jwt from "jsonwebtoken";
import User from "../models/user.js";
import createError from "../errors/createError.js";

const { JWT_SECRET_KEY } = process.env as { JWT_SECRET_KEY: string };

const authenticateWs = async (token: string): Promise<unknown> => {
    console.log("[authenticateWs] 📥 Attempting WebSocket auth | token:", token ? token.substring(0, 20) + "..." : "(none)");

    try {
        const { id } = jwt.verify(token, JWT_SECRET_KEY) as { id: string };
        const user = await User.findById(id);
        if (!user || user.token !== token) {
            console.log("[authenticateWs] ❌ WebSocket auth failed — user not found or token mismatch");
            throw createError(401, "Not authorized Ws");
        }
        console.log("[authenticateWs] ✅ WebSocket auth success | userId:", id);
        return user;
    } catch (error) {
        console.log("[authenticateWs] ❌ WebSocket auth error:", error);
        return error;
    }
};

export { authenticateWs };
