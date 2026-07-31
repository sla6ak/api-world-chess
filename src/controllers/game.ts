import GameModel from "../models/game.js";
import { logError } from "../utils/logger.js";
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
            logError("findCurentGame", error);
            return null;
        }
    }

    async deleteGame(req: Request): Promise<void> {
        try {
            await GameModel.findOneAndDelete({
                _id: req.gameId,
                statusGame: "open",
            });
        } catch (error) {
            logError("deleteGame", error);
        }
    }

    async createSearchRoom(req: Request, res: Response): Promise<void> {
        try {
            const { typeGame, timeControl, timePluse } = req.body;
            const userId = req.user?._id;

            const searchParams = {
                statusGame: "open",
                result: "pending",
                typeGame: typeGame || "standart",
                timeControl: timeControl || 180,
                timePluse: timePluse || 0,
            };

            // Ищем существующую открытую игру с такими же параметрами
            const existingGame = await GameModel.findOne(searchParams);

            if (existingGame) {
                // Обновляем существующую игру — назначаем второго игрока
                const updatedGame = await GameModel.findByIdAndUpdate(
                    existingGame._id,
                    {
                        ownerBlack: userId,
                        nameBlack: req.user?.name || "",
                        reitingBlack: req.user?.currentReiting || 800,
                    },
                    { new: true }
                );

                res.status(200).json({
                    message: "Found existing search room",
                    game: updatedGame,
                });
                return;
            }

            // Создаём новую игру
            const newGame = await GameModel.create({
                statusGame: "open",
                typeGame: searchParams.typeGame,
                timeControl: searchParams.timeControl,
                timePluse: searchParams.timePluse,
                ownerWite: userId,
                nameWite: req.user?.name || "",
                reitingWite: req.user?.currentReiting || 800,
            });

            res.status(201).json({
                message: "Search room created",
                game: newGame,
            });
        } catch (error) {
            logError("createSearchRoom", error);
            res.status(500).json({ message: "Failed to create search room" });
        }
    }

    async cancelSearchRoom(req: Request, res: Response): Promise<void> {
        try {
            const { gameId } = req.body;

            if (!gameId) {
                res.status(400).json({ message: "gameId is required" });
                return;
            }

            const game = await GameModel.findOneAndDelete({
                _id: gameId,
                statusGame: "open",
                result: "pending",
            });

            if (!game) {
                res.status(404).json({ message: "Game not found or already started" });
                return;
            }

            res.status(200).json({
                message: "Search cancelled, game deleted",
                gameId: game._id,
            });
        } catch (error) {
            logError("cancelSearchRoom", error);
            res.status(500).json({ message: "Failed to cancel search" });
        }
    }
}

export default new Game();
