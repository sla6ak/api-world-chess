const { app, webSocketServer, server } = require("./config/serverConfig");
const { v4: uuidv4 } = require("uuid");
const clients = {};
const { gameFindCurent, game } = require("./ws/gamews");
const { authenticateWs } = require("./middleware/authenticateWs");

const routerAuth = require("./routers/auth.routes");

app.use("/auth", routerAuth);

app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
    const { status = 500, message = "Server error" } = err;
    res.status(status).json({ message });
});

webSocketServer.on("connection", async (ws) => {
    const id = uuidv4();
    clients[id] = ws;
    ws.send(JSON.stringify({ message: "ws connect", idWs: id }));
    ws.on("message", async (message) => {
        const req = JSON.parse(message);
        const user = await authenticateWs(req.token);
        req.user = user; // поиск именно по запросу чтоб знать кто юзер
        if (req.event === "start") {
            console.log("client start app");
            const res = await gameFindCurent(req); // если браузер перезагрузился или реконект апп пришлет старт и должно найти и вернуть ид текущей партии
            try {
                console.log("res for client:", res);
                webSocketServer.clients[req.idWs].send(JSON.stringify(res));
            } catch (error) {
                console.log("error send client:", error);
            }
        } else if (req.event === "game") {
            console.log("client start game");
            const res = await game(req);
            try {
                console.log("res for client", res);
                // webSocketServer.clients[id].send(JSON.stringify(res));
            } catch (error) {
                console.log("error send client:", error);
            }
        }
    });
    ws.on("error", (e) => ws.send(e));
    ws.on("close", () => {
        console.log("client exit", id);
        delete clients[id];
    });
});

module.exports = { app, server };
