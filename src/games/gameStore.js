const games = new Map();

const gameStore = {
    get: (gameId) => games.get(gameId),
    set: (gameId, state) => games.set(gameId, state),
    delete: (gameId) => games.delete(gameId),
    has: (gameId) => games.has(gameId),
    findByUser: (userId) => {
        for (const [gameId, state] of games.entries()) {
            if (
                state.players.wite?.userId === userId ||
                state.players.black?.userId === userId
            ) {
                return { gameId, state };
            }
        }
        return null;
    },
    findOpenGame: (typeGame, timeControl, timePluse) => {
        for (const [gameId, state] of games.entries()) {
            if (
                state.statusGame === "open" &&
                state.typeGame === typeGame &&
                state.timeControl === timeControl &&
                state.timePluse === timePluse
            ) {
                return { gameId, state };
            }
        }
        return null;
    },
    getAll: () => games,
};

module.exports = gameStore;
