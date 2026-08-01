import { Router, Request, Response, NextFunction } from "express";
import { loginValidation, signupValidation } from "../middleware/userValidation.js";
import authenticate from "../middleware/authenticate.js";
import user from "../controllers/user.js";

const router = Router();

// Логирование всех входящих запросов к /auth
router.use((req: Request, _res: Response, next: NextFunction) => {
    console.log("[AuthRouter] 📥", req.method, req.originalUrl, "| body:", JSON.stringify(req.body), "| user:", req.user?._id || "(unauthenticated)");
    next();
});

router.post("/signup", signupValidation, user.addNewUser);

router.post("/login", loginValidation, user.userLogin);

router.get("/current", authenticate, user.getCurrentUser);

router.post("/logout", authenticate, user.logOutUser);

router.delete("/delete", authenticate, user.delete);

export default router;
