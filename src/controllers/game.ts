import GameModel from "../models/game.js";
import type { Request } from "express";

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
}

export default new Game();
