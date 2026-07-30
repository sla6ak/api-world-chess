import express, { Application, Request, Response, NextFunction } from "express";
import http, { Server as HttpServer } from "http";
import logger from "morgan";
import cors, { CorsOptions } from "cors";
import { Server as ColyseusServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import bodyParser from "body-parser";

import { app, server } from "./config/serverConfig.js";
import routerAuth from "./routers/auth.routes.js";
import routerGame from "./routers/game.routes.js";

app.use("/auth", routerAuth);
app.use("/game", routerGame);

app.use((req: Request, res: Response) => {
    res.status(404).json({ message: "Not found" });
});

app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || 500;
    const message = err.message || "Server error";
    res.status(status).json({ message });
});

export { app, server };
