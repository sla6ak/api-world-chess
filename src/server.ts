import "dotenv/config";
// Перехват console.* в файл ДО любых импортов, которые могут логировать.
// Все логи сервера зеркалируются в logs/server-console.log.
import { installConsoleFileLogger } from "./utils/consoleLogger.js";
installConsoleFileLogger();

import { Request, Response, NextFunction } from "express";
import { app, server } from "./config/serverConfig.js";
import routerAuth from "./routers/auth.routes.js";
import routerGame from "./routers/game.routes.js";

const { PORT = 5000 } = process.env;

// Логирование входящих HTTP-запросов
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log("[Server] 📥 HTTP", req.method, req.originalUrl, "| ip:", req.ip);
  next();
});

// Логирование исходящих ответов
app.use((req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    console.log("[Server] 📤 HTTP", req.method, req.originalUrl, "| status:", res.statusCode, "| body:", JSON.stringify(body));
    return originalJson(body);
  };
  next();
});

app.use("/auth", routerAuth);
app.use("/game", routerGame);

app.use((req: Request, res: Response) => {
  console.log("[Server] ❌ 404 Not found:", req.method, req.originalUrl);
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
    console.log("[Server] ⚠️ Error", status, "|", message, "|", req.method, req.originalUrl);
    res.status(status).json({ message });
  },
);

server.listen(PORT, () => {
  console.log("[Server] 🚀 Server started on port", PORT);
});
