import GameModel from "../models/game.js";
import type { Request, Response } from "express";

class Game {
    async findCurentGame(req: Request): Promise<unknown> {
        try {
            let curentGame = null;
            if (req.color === "wite") {
                curentGame = await GameModel.findOne({
                    ownerWite: req.user?._id,
                    result: "pending",
                });
            } else if (req.color === "black") {
                curentGame = await GameModel.findOne({
                    ownerBlack: req.user?._id,
                    result: "pending",
                });
            } else {
                curentGame = await GameModel.findOne({
                    $or: [{ ownerWite: req.user?._id }, { ownerBlack: req.user?._id }],
                    result: "pending",
                });
            }
            return curentGame;
        } catch (error) {
            console.log(error);
        }
    }

    async deleteGame(req: Request): Promise<void> {
        try {
            const deleteGame = await GameModel.findOneAndDelete({
                _id: req.gameId,
                statusGame: "open",
            });
            console.log(deleteGame);
        } catch (error) {
            console.log(error);
        }
    }

    async createSearchRoom(req: Request, res: Response): Promise<void> {
        try {
            const { typeGame, timeControl, timePluse } = req.body;
            const userId = req.user?._id;

            const newGame = await GameModel.create({
                statusGame: "open",
                typeGame: typeGame || "standart",
                timeControl: timeControl || 180,
                timePluse: timePluse || 0,
                ownerWite: userId,
                nameWite: req.user?.name || "",
                reitingWite: req.user?.currentReiting || 800,
            });

            res.status(201).json({
                message: "Search room created",
                game: newGame,
            });
        } catch (error) {
            console.log(error);
            res.status(500).json({ message: "Failed to create search room" });
        }
    }
}

export default new Game();
