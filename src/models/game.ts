import { Schema } from "mongoose";
import { getGamesDb } from "../db/connections.js";

// Используем централизованное соединение game_db из db/connections.ts —
// модель НЕ открывает своё подключение (всего один connection на GameDB).

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
    // Контракт времени: ВСЁ в СЕКУНДАХ (timeControl — секунды на партию,
    // timePluse — добавка за ход в секундах, timeWite/timeBlack — остаток в секундах).
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
      enum: [
        "",
        "checkmate",
        "stalemate",
        "threefold",
        "fifty_move",
        "insufficient_material",
        "timeout",
        "resignation",
        "agreed_draw",
        "abandonment",
      ],
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
    // Стартовое время должно соответствовать timeControl — иначе часы стартуют с 0
    // и серверный флаг падает на первом же ходу (ложный "timeout").
    timeWite: { type: Number, default: 180 },
    timeBlack: { type: Number, default: 180 },
    paused: { type: Boolean, default: false },
    // Дельта рейтинга за эту партию (newRating - oldRating) для белых и чёрных.
    // Используется фронтендом для отображения «+N / -N» в истории партий.
    ratingChangeWite: { type: Number, default: 0 },
    ratingChangeBlack: { type: Number, default: 0 },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

export default getGamesDb().model("game", gameSchema);
