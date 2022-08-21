require("dotenv").config();
const mongoose = require("mongoose");
const { server } = require("./src/app");
// const { v4: uuidv4 } = require("uuid");

const { DB_HOST, PORT = 5000 } = process.env;

async function start() {
    try {
        server.listen(PORT, () => {
            console.log(`Use port ${PORT}`);
            mongoose.connect(DB_HOST).then(() => {
                console.log(`MongoDB connection successful`);
            });
        });
    } catch (error) {
        console.log(error.massage);
        process.exit(1);
    }
}

start();
