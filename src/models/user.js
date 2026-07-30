const { Schema } = require("mongoose");
const mongoose = require("mongoose");

const { DB_HOST } = process.env;

const usersDbConnection = mongoose.createConnection(DB_HOST, { dbName: "users_db" });

const schema = new Schema(
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

        token: {
            type: String,
            default: "",
        },
    },
    {
        versionKey: false,
        timestamps: true,
    }
);

module.exports = usersDbConnection.model("user", schema);
