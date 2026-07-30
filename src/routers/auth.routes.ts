import { Router } from "express";
import { loginValidation, signupValidation } from "../middleware/userValidation.js";
import authenticate from "../middleware/authenticate.js";
import user from "../controllers/user.js";

const router = Router();

router.post("/signup", signupValidation, user.addNewUser);

router.post("/login", loginValidation, user.userLogin);

router.get("/current", authenticate, user.getCurrentUser);

router.post("/logout", authenticate, user.logOutUser);

router.delete("/delete", authenticate, user.delete);

export default router;
