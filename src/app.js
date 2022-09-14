const { app, webSocketServer, server } = require("./config/serverConfig");
const { v4: uuidv4 } = require("uuid");
const clients = {};
const { gameFindCurent, gameStart, gameStop, gameCurent } = require("./ws/gamews");
const { authenticateWs } = require("./middleware/authenticateWs");
const gameModel = require('./models/game');

const routerAuth = require("./routers/auth.routes");

app.use("/auth", routerAuth);

app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
    const { status = 500, message = "Server error" } = err;
    res.status(status).json({ message });
});
const players = [];
webSocketServer.on("connection", async (ws) => {
    const id = uuidv4();

    ws.send(JSON.stringify({ mesRes: { message: "ws connect", idWs: id } }));
    ws.on("message", async (message) => {
        const req = JSON.parse(message);
        const user = await authenticateWs(req.token);
        clients[user._id] = ws;
        let partner;
        if (Object.keys(clients).length > 1) {
            const myPartnerId = Object.keys(clients).filter(el => (el !== `${user._id}`)).toString();
            partner = clients[myPartnerId];
            partner.send(JSON.stringify({mesRes: {joining: `User ${user.name} joined to the game`}}));
        }

        if (!user.name) {
            console.log(user);
            ws.send(JSON.stringify({ mesRes: { message: "", error: user } }));
            return;
        }
        req.user = user; // поиск именно по запросу чтоб знать кто юзер
        // ****************************************************
        if (req.event === "startApp") {
            const res = await gameFindCurent(req); // если браузер перезагрузился или реконект апп пришлет старт и должно найти и вернуть ид текущей партии
            try {
                // console.log("res for client:", res);
                ws.send(JSON.stringify(res));
            } catch (error) {
                console.log("error send client:", error);
            }
            // ******************************************************
        } else if (req.event === "startGame") {
            const res = await gameStart(req); // ошибка валидации по модели!!!
            try {
                console.log("APP - res for client:", res);
                ws.send(JSON.stringify(res));
                if (partner) partner.send(JSON.stringify({mesRes: req}));
            } catch (error) {
                console.log("error send client:", error);
            }
            // *****************************************************
        } else if (req.event === "stopGame") {
            const {_id} = await gameModel.findOne({ statusGame: "open", result: "pending" });
            const result = await gameStop(_id);
            ws.send(JSON.stringify({mesRes: result}));
            partner.send(JSON.stringify({
                mesRes: {message: result, gameIdx: req.gameIdx, user:req.userInGame},
                event: req.event
            }))
            return {mesRes: result}; 
            // *****************************************************
        } else if (req.event === "game") {
            const res = await gameCurent(req);
            try {
                console.log("game for client", res);
                ws.send(JSON.stringify(res));
                webSocketServer.clients[res.opponentId].send(JSON.stringify(res));
            } catch (error) {
                console.log("error send client:", error);
            }
        }
    });

    ws.on("error", (e) => ws.send(e));
    ws.on("close", () => {
        console.log("client exit", id);
        ws.send(JSON.stringify({mesRes: "игрок покинул игру !"}))
        delete clients[id];
    });
});

module.exports = { app, server };
