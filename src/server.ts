import "dotenv/config";
import { Request, Response, NextFunction } from "express";
import { app, server } from "./config/serverConfig.js";
import routerAuth from "./routers/auth.routes.js";
import routerGame from "./routers/game.routes.js";

const { PORT = 5000 } = process.env;

app.use("/auth", routerAuth);
app.use("/game", routerGame);

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: "Not found" });
});

app.use(
  (
    err: Error & { status?: number },
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const status = err.status || 500;
    const message = err.message || "Server error";
    res.status(status).json({ message });
  },
);

server.listen(PORT, () => {
  console.log(`Use port ${PORT}`);
});
