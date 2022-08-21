const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const logger = require("morgan");
const cors = require("cors");
const app = express();
const bodyParser = require("body-parser");
const server = http.createServer(app);
const webSocketServer = new WebSocket.Server({ server });

const formatsLogger = app.get("env") === "development" ? "dev" : "short";
app.use(
    logger(formatsLogger, {
        skip: function (req, res) {
            return res.statusCode === 404;
        },
    })
);

const optionCors = {
    origin: "*",
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
    allowedHeaders: "*",
};
app.use(cors(optionCors));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));

module.exports = { app, webSocketServer, server };
