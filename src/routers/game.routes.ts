import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate.js";
import game from "../controllers/game.js";

const router = Router();

// Логирование всех входящих запросов к /game
router.use((req: Request, _res: Response, next: NextFunction) => {
    console.log("[GameRouter] 📥", req.method, req.originalUrl, "| body:", JSON.stringify(req.body), "| user:", req.user?._id || "(unauthenticated)");
    next();
});

// REST endpoints for matchmaking (finding opponent, creating game)
router.post("/find", authenticate, game.createSearchRoom);
router.get("/status/:gameId", authenticate, game.getGameStatus);
router.get("/active", authenticate, game.getActiveGame);
router.post("/cancel", authenticate, game.cancelSearchRoom);
router.post("/:gameId/result", authenticate, game.submitGameResult);

export default router;
