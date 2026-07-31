import mongoose, { Schema, type ConnectOptions } from "mongoose";

const { DB_HOST } = process.env as { DB_HOST: string };

const usersDbConnection = mongoose.createConnection(DB_HOST, {
  dbName: "users_db",
} as ConnectOptions);

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

export default usersDbConnection.model("user", userSchema);
