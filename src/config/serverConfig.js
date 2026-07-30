const express = require("express");
const http = require("http");
const logger = require("morgan");
const cors = require("cors");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const app = express();
const bodyParser = require("body-parser");
const server = http.createServer(app);

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "https://app-world-chess.vercel.app",
];

const colyseusServer = new Server({
    transport: new WebSocketTransport({ server }),
});

colyseusServer.define("chess_room", require("../rooms/ChessRoom"));

const formatsLogger = app.get("env") === "development" ? "dev" : "short";
app.use(
    logger(formatsLogger, {
        skip: function (req, res) {
            return res.statusCode === 404;
        },
    })
);

const optionCors = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
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

module.exports = { app, colyseusServer, server, bodyParser };
