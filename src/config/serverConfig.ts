import express, { Application } from "express";
import http, { Server as HttpServer } from "http";
import logger from "morgan";
import cors, { CorsOptions } from "cors";
import { Server as ColyseusServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import bodyParser from "body-parser";
import ChessRoom from "../rooms/ChessRoom.js";

const app: Application = express();
const server: HttpServer = http.createServer(app);

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "https://app-world-chess.vercel.app",
];

const colyseusServer = new ColyseusServer({
    transport: new WebSocketTransport({
        server,
        verifyClient: (info, callback) => {
            const origin = info.req.headers.origin;
            if (!origin || allowedOrigins.includes(origin)) {
                console.log("[Colyseus] ✅ WebSocket connection allowed | origin:", origin);
                // eslint-disable-next-line node/no-callback-literal
                callback(true);
            } else {
                console.log("[Colyseus] ❌ WebSocket connection rejected from origin:", origin);
                // eslint-disable-next-line node/no-callback-literal
                callback(false, 403, "Forbidden");
            }
        },
    }),
});

colyseusServer
    .define("chess_room", ChessRoom as any)
    .filterBy(["gameId"]);

const isDevelopment = app.get("env") === "development";

const formatsLogger = isDevelopment ? "dev" : "short";
app.use(
    logger(formatsLogger, {
        skip: (_req, _res) => {
            return _res.statusCode === 404;
        },
    })
);

const optionCors: CorsOptions = {
    origin: (origin, callback) => {
        // В режиме разработки разрешаем все локальные origin'ы
        if (isDevelopment) {
            if (!origin || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1") || origin.startsWith("https://localhost")) {
                console.log(`[CORS] Allowed origin (dev): ${origin}`);
                callback(null, true);
            } else {
                console.log(`[CORS] Rejected origin (dev): ${origin}`);
                callback(new Error("Not allowed by CORS"));
            }
        } else {
            // В продакшене строгая проверка
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.log(`[CORS] Rejected origin (prod): ${origin}`);
                callback(new Error("Not allowed by CORS"));
            }
        }
    },
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
};
app.use(cors(optionCors));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));

export { app, colyseusServer, server, bodyParser };
