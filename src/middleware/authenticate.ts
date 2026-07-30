import jwt from "jsonwebtoken";
import User from "../models/user.js";
import createError from "../helpers/errors/createError.js";
import { Request, Response, NextFunction } from "express";

const { JWT_SECRET_KEY } = process.env as { JWT_SECRET_KEY: string };

const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { authorization = "" } = req.headers;
    const [bearer, token] = authorization.split(" ");
    if (bearer !== "Bearer") {
      throw createError(401, "Not authorized");
    }
    try {
      const { id } = jwt.verify(token, JWT_SECRET_KEY) as { id: string };
      const user = await User.findById(id);
      if (!user || user.token !== token) {
        throw createError(401, "Not authorized");
      }
      req.user = user as any;
      next();
    } catch (error) {
      throw createError(401, "Not authorized");
    }
  } catch (error) {
    next(error);
  }
};

export default authenticate;
