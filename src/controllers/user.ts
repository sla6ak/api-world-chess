import { Request, Response, NextFunction } from "express";
import UserModel from "../models/user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import createError from "../errors/createError.js";

const { JWT_SECRET_KEY } = process.env as { JWT_SECRET_KEY: string };

class User {
    async addNewUser(req: Request, res: Response, next: NextFunction): Promise<void> {
        const { email, password } = req.body;

        try {
            const duplicateEmail = await UserModel.findOne({ email });
            if (duplicateEmail) {
                throw createError(409, "User not created. Email is duplicate");
            }

            const hashPassword = await bcrypt.hash(password, 12);

            const user = await UserModel.create({
                ...req.body,
                password: hashPassword,
            });

            res.status(201).json(user);
        } catch (error) {
            next(error);
        }
    }

    async userLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { email, password } = req.body;
            const user = await UserModel.findOne({ email });

            if (!user) {
                throw createError(401, `Email or password is wrong`);
            }

            if ((user as { requireVerificationEmail?: boolean; verify?: boolean }).requireVerificationEmail &&
                !(user as { verify?: boolean }).verify) {
                throw createError(401, `User ${email} not verify`);
            }

            const isPassword = await bcrypt.compare(password, (user as { password: string }).password);

            if (!isPassword) {
                throw createError(401, `Email or password is wrong`);
            }

            const token = jwt.sign({ id: (user as { _id: string })._id }, JWT_SECRET_KEY, {
                expiresIn: "30d",
            });

            await UserModel.findByIdAndUpdate((user as { _id: string })._id, { token });
            (user as { token: string }).token = token;

            res.json({ user });
        } catch (error) {
            next(error);
        }
    }

    async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { email } = req.user as { email: string };
            const user = await UserModel.findOne({ email });
            if (!user) {
                throw createError(404);
            }
            res.json({ user });
        } catch (error) {
            next(error);
        }
    }

    async logOutUser(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { _id } = req.user as { _id: string };
            const user = await UserModel.findByIdAndUpdate(_id, { token: "" });
            if (!user) {
                throw createError(404);
            }
            res.status(200).json({ message: "Logout success" });
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { email } = req.user as { email: string };
            const user = await UserModel.findOneAndDelete({ email });
            if (!user) {
                throw createError(404);
            }
            res.json({ user });
        } catch (error) {
            next(error);
        }
    }
}

export default new User();
