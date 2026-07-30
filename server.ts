import "dotenv/config";
import { server } from "./src/app.js";

const { PORT = 5000 } = process.env;

// MongoDB connections are created in models when they are imported
// users_db connection: src/models/user.ts
// game_db connection: src/models/game.ts

server.listen(PORT, () => {
    console.log(`Use port ${PORT}`);
});
