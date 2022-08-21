const { app, webSocketServer, server } = require("./config/serverConfig");

const routerAuth = require("./routers/auth.routes");

app.use("/auth", routerAuth);

app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
    const { status = 500, message = "Server error" } = err;
    res.status(status).json({ message });
});

webSocketServer.on("connection", (ws) => {
    ws.on("message", (m) => {
        console.log("new message", m);
        webSocketServer.clients.forEach((client) => client.send(m));
    });

    ws.on("error", (e) => ws.send(e));

    ws.send("Hi there, I am a WebSocket server");
});

module.exports = { app, webSocketServer, server };
