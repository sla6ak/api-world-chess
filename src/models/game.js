const { number } = require("joi/lib");
const { Schema, model } = require("mongoose");

const schema = new Schema(
    {
        idx: {type: Number},
        statusGame: { type: String, enum: ["open", "close"], default: "open" },
        position: { type: Array, default: ["rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR"] },
        typeGame: { type: String, default: "standart" },
        timeControl: { type: Number, default: 180 },
        timePluse: { type: Number, default: 2 },
        // nameWite: {
        //     type: String,
        //     required: [true, "NameWite is required"],
        // },
        // reitingWite: { type: Number, required: [true, "reitingWite is required"] },
        // nameBlack: {
        //     type: String,
        //     required: [true, "NameBlack is required"],
        // },
        // reitingBlack: { type: Number, required: [true, "reitingBlack is required"] },
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

module.exports = model("game", schema);
