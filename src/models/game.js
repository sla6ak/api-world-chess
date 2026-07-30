const { Schema } = require("mongoose");
const mongoose = require("mongoose");

const { DB_HOST } = process.env;

const gameDbConnection = mongoose.createConnection(DB_HOST, { dbName: "game_db" });

const schema = new Schema(
    {
        statusGame: { type: String, enum: ["open", "close"], default: "open" },
        position: { type: Array, default: ["rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR"] },
        typeGame: { type: String, default: "standart" },
        timeControl: { type: Number, default: 180 },
        timePluse: { type: Number, default: 2 },
        nameWite: { type: String, default: "" },
        reitingWite: { type: Number, default: 800 },
        nameBlack: { type: String, default: "" },
        reitingBlack: { type: Number, default: 800 },
        ownerWite: {
            type: Schema.Types.ObjectId,
            ref: "user",
        },
        ownerBlack: {
            type: Schema.Types.ObjectId,
            ref: "user",
        },
        date: { type: Date, default: Date.now },
        dateGameOver: { type: Date, default: Date.now },
        result: { type: String, enum: ["pending", "1-0", "0-1", "0.5-0.5"], default: "pending" },
    },
    {
        versionKey: false,
        timestamps: true,
    }
);

module.exports = gameDbConnection.model("game", schema);
