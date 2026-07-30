import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import game from "../controllers/game.js";

const router = Router();

router.post("/find", authenticate, game.createSearchRoom);

export default router;
