const { app, webSocketServer, server } = require("./config/serverConfig");
const { v4: uuidv4 } = require("uuid");
const clients = {};
const { gameFindCurent, gameStart, gameCurent } = require("./ws/gamews");
const { authenticateWs } = require("./middleware/authenticateWs");
const { logError } = require("./helpers/logger/logger");

const routerAuth = require("./routers/auth.routes");

app.use("/auth", routerAuth);

app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
    const { status = 500, message = "Server error" } = err;
    res.status(status).json({ message });
});

webSocketServer.on("error", (e) => {
    logError("WebSocket server error", e);
});

webSocketServer.on("connection", async (ws) => {
    const id = uuidv4();
    try {
        ws.send(JSON.stringify({ mesRes: { message: "ws connect", idWs: id } }));
    } catch (e) {
        logError(`WebSocket send welcome error for client ${id}`, e);
    }
    ws.on("message", async (message) => {
        let req;
        try {
            req = JSON.parse(message);
        } catch (e) {
            logError(`WebSocket JSON parse error for client ${id}`, e);
            return;
        }
        try {
            const user = await authenticateWs(req.token);
            clients[user._id] = ws;
            if (!user.name) {
                logError(`WebSocket auth error for client ${id}`, user);
                try {
                    ws.send(JSON.stringify({ mesRes: { message: "", error: user } }));
                } catch (e) {
                    logError(`WebSocket send auth error for client ${id}`, e);
                }
                return;
            }
            req.user = user;
            // ****************************************************
            if (req.event === "startApp") {
                const res = await gameFindCurent(req);
                try {
                    ws.send(JSON.stringify(res));
                } catch (e) {
                    logError(`WebSocket send startApp error for client ${id}`, e);
                }
                // ******************************************************
            } else if (req.event === "startGame") {
                const res = await gameStart(req);
                try {
                    ws.send(JSON.stringify(res));
                    const opponentId = res.mesRes.opponentId;
                    if (opponentId && clients[opponentId]) {
                        try {
                            clients[opponentId].send(JSON.stringify(res));
                        } catch (e) {
                            logError(`WebSocket send to opponent ${opponentId} error`, e);
                        }
                    }
                } catch (e) {
                    logError(`WebSocket send startGame error for client ${id}`, e);
                }
                // *****************************************************
            } else if (req.event === "game") {
                const res = await gameCurent(req);
                try {
                    ws.send(JSON.stringify(res));
                } catch (e) {
                    logError(`WebSocket send game error for client ${id}`, e);
                }
            }
        } catch (e) {
            logError(`WebSocket message handler error for client ${id}`, e);
        }
    });

    ws.on("error", (e) => {
        logError(`WebSocket error for client ${id}`, e);
    });
    ws.on("close", () => {
        console.log("client exit", id);
        for (const [userId, clientWs] of Object.entries(clients)) {
            if (clientWs === ws) {
                delete clients[userId];
                break;
            }
        }
    });
});

module.exports = { app, server };
