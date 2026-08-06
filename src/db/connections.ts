import mongoose, { type Connection } from "mongoose";

const { DB_HOST } = process.env as { DB_HOST: string };

// Очищаем DB_HOST от пробелов, переносов и query-параметров после знака "?"
const cleanDbHost = DB_HOST.trim().split("?")[0].replace(/\/+$/, "");
/**
 * Центральный модуль подключений к MongoDB.
 *
 * Правило: все соединения создаются ОДИН РАЗ здесь.
 * Модели (UserModel, GameModel) получают их через геттеры getUsersDb/getGamesDb —
 * они не открывают свои подключения (иначе мы бы имели N соединений на импорт).
 *
 * Вызывается из server.ts ДО любого обращения к моделям.
 */

let initialized = false;

let usersDb: Connection;
let gameDb: Connection;

const initConnections = (): void => {
  if (initialized) return;
  if (!cleanDbHost) {
    console.error(
      "[DB] ❌ DB_HOST is missing in env, cannot connect databases",
    );
    throw new Error("DB_HOST is missing");
  }

  console.log("[DB] 🔌 Connecting to MongoDB...", cleanDbHost);
  console.log("[DB] users_db, game_db");

  // 2. Явно добавляем имя базы к URL
  const usersUri = `${cleanDbHost}/users_db`;
  const gameUri = `${cleanDbHost}/game_db`;

  usersDb = mongoose.createConnection(usersUri);
  gameDb = mongoose.createConnection(gameUri);

  usersDb.on("connected", () => console.log("[DB] ✅ users_db connected"));
  usersDb.on("error", (e) => console.error("[DB] ❌ users_db error:", e));
  gameDb.on("connected", () => console.log("[DB] ✅ game_db connected"));
  gameDb.on("error", (e) => console.error("[DB] ❌ game_db error:", e));

  initialized = true;
};

// Лениво инициализируем при первом импорте модуля (доступно на top-level)
initConnections();

export const getUsersDb = (): Connection => usersDb;
export const getGamesDb = (): Connection => gameDb;

/**
 * Инициализация соединений с ожиданием 'connected' Promise.
 * Вызывается из server.ts перед app.listen. Если соединения уже up — мгновенно
 * resolve (connection.readyState === 1 в mongoose.Connection.STATES.connected).
 */
export const connectDatabases = async (): Promise<void> => {
  if (!initialized) {
    initConnections();
  }

  const waitFor = (conn: Connection, name: string) =>
    new Promise<void>((resolve, reject) => {
      if (conn.readyState === 1) {
        console.log(`[DB] ✅ ${name} already connected`);
        return resolve();
      }
      const timeout = setTimeout(
        () => reject(new Error(`[DB] ⏰ ${name} connect timeout`)),
        8000,
      );
      conn.once("connected", () => {
        clearTimeout(timeout);
        resolve();
      });
      conn.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  await Promise.all([waitFor(usersDb, "users_db"), waitFor(gameDb, "game_db")]);
  console.log("[DB] 🎯 All databases connected");
};

export const isInitialized = (): boolean => initialized;
