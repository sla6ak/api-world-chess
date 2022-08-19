const { Schema, model } = require("mongoose");

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

module.exports = model("user", schema);
