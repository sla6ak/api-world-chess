require("dotenv").config();
const { server } = require("./src/app");

const { PORT = 5000 } = process.env;

// MongoDB connections are created in models when they are imported
// users_db connection: src/models/user.js
// game_db connection: src/models/game.js

server.listen(PORT, () => {
    console.log(`Use port ${PORT}`);
});
