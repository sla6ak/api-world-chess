import { Schema } from "mongoose";
import { getUsersDb } from "../db/connections.js";

// Используем централизованное соединение users_db из db/connections.ts —
// модель НЕ открывает своё подключение (всего один connection на UsersDB).

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
    },

    currentReiting: {
      type: Number,
      default: 800,
    },

    gamesPlayed: {
      type: Number,
      default: 0,
    },

    wins: {
      type: Number,
      default: 0,
    },

    losses: {
      type: Number,
      default: 0,
    },

    draws: {
      type: Number,
      default: 0,
    },

    maxRating: {
      type: Number,
      default: 800,
    },

    token: {
      type: String,
      default: "",
    },
    lastColor: {
      type: String,
      default: "black",
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

export default getUsersDb().model("user", userSchema);
