const { app } = require("./config/serverConfig");

const routerAuth = require("./routers/auth.routes");

app.use("/auth", routerAuth);

app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
    const { status = 500, message = "Server error" } = err;
    res.status(status).json({ message });
});

app.use(function (req, res, next) {
    console.log("middleware");
    req.testing = "testing";
    return next();
});

app.ws("/echo", function (ws, req) {
    ws.on("message", function (msg) {
        ws.send(msg);
        console.log(msg);
    });
    console.log("socket", req.testing);
});

module.exports = { app };
