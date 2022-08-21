const express = require("express");
const expressWsT = require("express-ws");
const expressWs = expressWsT(express());
const app = expressWs.app;
const bodyParser = require("body-parser");
const logger = require("morgan");
const cors = require("cors");

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
    // methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
    allowedHeaders: "*",
};
app.use(cors(optionCors));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));

module.exports = { app };
