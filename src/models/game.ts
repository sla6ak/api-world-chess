import mongoose, { Schema, type ConnectOptions } from "mongoose";

const { DB_HOST } = process.env as { DB_HOST: string };

const gameDbConnection = mongoose.createConnection(DB_HOST, {
  dbName: "game_db",
} as ConnectOptions);

const gameSchema = new Schema(
  {
    statusGame: { type: String, enum: ["open", "close"], default: "open" },
    position: {
      type: Array,
      default: [
        "rnbqkbnrpppppppp88888888888888888888888888888888PPPPPPPPRNBQKBNR",
      ],
    },
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
    result: {
      type: String,
      enum: ["pending", "1-0", "0-1", "0.5-0.5"],
      default: "pending",
    },
    endReason: {
      type: String,
      enum: ["", "checkmate", "stalemate", "threefold", "fifty_move", "insufficient_material", "timeout", "resignation", "agreed_draw", "abandonment"],
      default: "",
    },
    pgn: { type: String, default: "" },
    finalFen: { type: String, default: "" },
    moveHistory: {
      type: [
        {
          san: String,
          from: String,
          to: String,
          color: String,
          time: Number,
          ts: Number,
        },
      ],
      default: [],
    },
    move: { type: Boolean, default: true },
    timeWite: { type: Number, default: 0 },
    timeBlack: { type: Number, default: 0 },
    paused: { type: Boolean, default: false },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

export default gameDbConnection.model("game", gameSchema);
