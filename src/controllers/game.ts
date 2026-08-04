import GameModel from "../models/game.js";
import { logError } from "../utils/logger.js";
import createError from "../errors/createError.js";
import type { Request, Response } from "express";

class Game {
    /**
     * POST /game/find — Початок пошуку гри або підключення до існуючої.
     *
     * Логіка:
     * 1. Шукає відкриту гру (statusGame: "open", result: "pending") з тим самими параметрами,
     *    де ще не призначений другий гравець (ownerBlack порожній).
     * 2. Якщо знайдено — призначає поточного користувача як чорного, закриває гру (statusGame: "close"),
     *    і повертає повні дані гри з обома гравцями (status: "matched").
     * 3. Якщо не знайдено — створює нову гру з поточним користувачем як білим,
     *    і повертає лише gameId (status: "waiting").
     */
    async createSearchRoom(req: Request, res: Response): Promise<void> {
        const userId = req.user?._id;
        const userName = req.user?.name;
        const userRating = req.user?.currentReiting ?? 800;
        const { typeGame, timeControl, timePluse } = req.body;

        // Новый контракт: timeControl/timePluse передаются в СЕКУНДАХ.
        // Защитная нормализация: если клиент всё ещё шлёт минуты (< 60) — конвертируем.
        const normSec = (v: unknown, def: number): number => {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return def;
            return n < 60 ? Math.round(n * 60) : Math.round(n);
        };
        const timeControlSec = normSec(timeControl, 180);
        const timePluseSec = timePluse != null ? normSec(timePluse, 0) : 0;

        console.log("[Game:createSearchRoom] 📥 Search request | userId:", userId,
            "| name:", userName, "| typeGame:", typeGame,
            "| timeControl:", timeControl, "| timePluse:", timePluse);

        try {
            const searchParams = {
                statusGame: "open",
                result: "pending",
                typeGame: typeGame || "standart",
                timeControl: timeControlSec,
                timePluse: timePluseSec,
            };

            // Шукаємо існуючу відкриту гру з такими ж параметрами, де ще не є другий гравець
            const existingGame = await GameModel.findOne({
                ...searchParams,
                ownerBlack: { $exists: false, $eq: null }, // ownerBlack ще не призначений
            });

            if (existingGame) {
                // Призначаємо другого гравця (чорного)
                console.log("[Game:createSearchRoom] 🔁 Found existing game | existingGameId:",
                    existingGame._id, "| assigning player Black");

                const updatedGame = await GameModel.findByIdAndUpdate(
                    existingGame._id,
                    {
                        statusGame: "close",
                        ownerBlack: userId,
                        nameBlack: userName || "",
                        reitingBlack: userRating,
                    },
                    { new: true }
                );

                console.log("[Game:createSearchRoom] ✅ Matched! gameId:", updatedGame?._id,
                    "| white:", updatedGame?.nameWite, "| black:", updatedGame?.nameBlack);

                res.status(200).json({
                    message: "Matched with opponent",
                    status: "matched",
                    game: updatedGame,
                });
                return;
            }

            // Створюємо нову гру — перший гравець (білий)
            console.log("[Game:createSearchRoom] 🆕 Creating new search room");

            const newGame = await GameModel.create({
                statusGame: "open",
                typeGame: searchParams.typeGame,
                timeControl: searchParams.timeControl,
                timePluse: searchParams.timePluse,
                // Часы обоих игроков стартуют с полного контроля времени —
                // иначе GameManager восстановит 0 и флаг упадёт на первом ходу.
                timeWite: searchParams.timeControl,
                timeBlack: searchParams.timeControl,
                ownerWite: userId,
                nameWite: userName || "",
                reitingWite: userRating,
            });

            console.log("[Game:createSearchRoom] ✅ New room created | gameId:", newGame._id,
                "| waiting for opponent...");

            res.status(201).json({
                message: "Search room created, waiting for opponent",
                status: "waiting",
                gameId: newGame._id,
                game: newGame,
            });
        } catch (error) {
            logError("createSearchRoom", error);
            res.status(500).json({ message: "Failed to create search room" });
        }
    }

    /**
     * GET /game/status/:gameId — Перевірка статусу пошуку гри.
     *
     * Використовується фронтендом для полінгу: чи знайдено суперника.
     *
     * Відповіді:
     * - status: "waiting" — гра відкрита, чекає на другого гравця
     * - status: "matched" — обидва гравці призначені, гра готова до старту
     * - status: "not_found" — гра не знайдена або вже завершена
     */
    async getGameStatus(req: Request, res: Response): Promise<void> {
        const { gameId } = req.params;
        const userId = req.user?._id;

        console.log("[Game:getGameStatus] 📥 Status check | gameId:", gameId, "| userId:", userId);

        try {
            const game = await GameModel.findById(gameId);

            if (!game) {
                console.log("[Game:getGameStatus] ❌ Game not found | gameId:", gameId);
                res.status(404).json({ status: "not_found", message: "Game not found" });
                return;
            }

            // Перевіряємо, чи належить ця гра поточному користувачу
            const isOwner =
                game.ownerWite?.toString() === userId?.toString() ||
                game.ownerBlack?.toString() === userId?.toString();

            if (!isOwner) {
                console.log("[Game:getGameStatus] ❌ User not part of this game | gameId:", gameId);
                res.status(403).json({ status: "not_found", message: "Not your game" });
                return;
            }

            const bothPlayersAssigned = game.ownerWite && game.ownerBlack;

            if (bothPlayersAssigned && game.statusGame === "close") {
                console.log("[Game:getGameStatus] ✅ Matched | gameId:", gameId,
                    "| white:", game.nameWite, "| black:", game.nameBlack);
                res.status(200).json({
                    status: "matched",
                    game,
                });
            } else if (game.statusGame === "open") {
                console.log("[Game:getGameStatus] ⏳ Waiting for opponent | gameId:", gameId);
                res.status(200).json({
                    status: "waiting",
                    game,
                });
            } else {
                console.log("[Game:getGameStatus] ⏭️ Game in unexpected state | gameId:", gameId,
                    "| statusGame:", game.statusGame, "| result:", game.result);
                res.status(200).json({
                    status: "not_found",
                    message: "Game is not in a searchable state",
                });
            }
        } catch (error) {
            logError("getGameStatus", error);
            res.status(500).json({ message: "Failed to check game status" });
        }
    }

    /**
     * POST /game/cancel — Скасування пошуку гри.
     *
     * Видаляє незапущену гру (statusGame: "open", result: "pending") з MongoDB.
     */
    async cancelSearchRoom(req: Request, res: Response): Promise<void> {
        const { gameId } = req.body;
        const userId = req.user?._id;

        console.log("[Game:cancelSearchRoom] 📥 Cancel search request | userId:", userId, "| gameId:", gameId);

        try {
            if (!gameId) {
                console.log("[Game:cancelSearchRoom] ❌ No gameId provided");
                res.status(400).json({ message: "gameId is required" });
                return;
            }

            const game = await GameModel.findOneAndDelete({
                _id: gameId,
                statusGame: "open",
                result: "pending",
            });

            if (!game) {
                console.log("[Game:cancelSearchRoom] ❌ Game not found or already started | gameId:", gameId);
                res.status(404).json({ message: "Game not found or already started" });
                return;
            }

            console.log("[Game:cancelSearchRoom] ✅ Search cancelled, game deleted | gameId:", game._id);

            res.status(200).json({
                message: "Search cancelled, game deleted",
                gameId: game._id,
            });
        } catch (error) {
            logError("cancelSearchRoom", error);
            res.status(500).json({ message: "Failed to cancel search" });
        }
    }

    /**
     * GET /game/active — Знаходження активної (не завершеної) гри поточного користувача.
     *
     * Використовується фронтендом для відновлення гри після перезавантаження сторінки.
     *
     * Шукає гру, де:
     * - користувач є учасником (ownerWite або ownerBlack)
     * - гра не завершена (result: "pending")
     * - обидва гравці призначені
     */
    async getActiveGame(req: Request, res: Response): Promise<void> {
        const userId = req.user?._id;

        console.log("[Game:getActiveGame] 📥 Active game check | userId:", userId);

        try {
            const game = await GameModel.findOne({
                $or: [
                    { ownerWite: userId },
                    { ownerBlack: userId },
                ],
                result: "pending",
            });

            if (!game) {
                console.log("[Game:getActiveGame] ⚪ No active game found | userId:", userId);
                res.status(200).json({
                    status: "not_found",
                    message: "No active game found",
                });
                return;
            }

            const bothPlayersAssigned = game.ownerWite && game.ownerBlack;

            if (!bothPlayersAssigned) {
                console.log("[Game:getActiveGame] ⚪ Game found but not both players assigned | gameId:", game._id);
                res.status(200).json({
                    status: "waiting",
                    game,
                });
                return;
            }

            console.log("[Game:getActiveGame] ✅ Active game found | gameId:", game._id,
                "| white:", game.nameWite, "| black:", game.nameBlack);

            res.status(200).json({
                status: "matched",
                game,
            });
        } catch (error) {
            logError("getActiveGame", error);
            res.status(500).json({ message: "Failed to check active game" });
        }
    }

    /**
     * POST /game/:gameId/result — Збереження результату гри.
     *
     * Викликається після завершення партії.
     */
    async submitGameResult(req: Request, res: Response): Promise<void> {
        const { gameId } = req.params;
        const userId = req.user?._id;
        const { result, ratingChange } = req.body as {
            result: string;
            ratingChange: number;
        };

        console.log("[Game:submitGameResult] 📥 Game result | gameId:", gameId,
            "| userId:", userId, "| result:", result);

        try {
            if (!result || !["1-0", "0-1", "0.5-0.5"].includes(result)) {
                res.status(400).json({ message: "Invalid result value" });
                return;
                return;
            }

            const game = await GameModel.findById(gameId);
            if (!game) {
                res.status(404).json({ message: "Game not found" });
                return;
            }

            // Перевіряємо, що користувач є учасником гри
            const isParticipant =
                game.ownerWite?.toString() === userId?.toString() ||
                game.ownerBlack?.toString() === userId?.toString();

            if (!isParticipant) {
                res.status(403).json({ message: "Not a participant of this game" });
                return;
            }

            await GameModel.findByIdAndUpdate(gameId, {
                result,
                dateGameOver: new Date(),
            });

            console.log("[Game:submitGameResult] ✅ Result saved | gameId:", gameId, "| result:", result);

            res.status(200).json({
                message: "Game result saved",
                gameId,
                result,
            });
        } catch (error) {
            logError("submitGameResult", error);
            res.status(500).json({ message: "Failed to save game result" });
        }
    }
}

export default new Game();
