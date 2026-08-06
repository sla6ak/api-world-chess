import mongoose, { type Connection, type ConnectOptions } from "mongoose";

const { DB_HOST } = process.env as { DB_HOST: string };

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
  if (!DB_HOST) {
    console.error(
      "[DB] ❌ DB_HOST is missing in env, cannot connect databases",
    );
    throw new Error("DB_HOST is missing");
  }

  console.log("[DB] 🔌 Connecting to MongoDB...", DB_HOST);
  console.log("[DB] users_db, game_db");

  // Создаём два независимых соединения — базы users_db и game_db.
  // Mongoose сам поддерживает много соединений на одном DB_HOST.
  // Если в API.DB_HOST указан с '?database=users_db' (так бывает в Mongo Web Client),
  // берём более dbName-параметру (имитируем connectOptions).
  const connectionOpts: ConnectOptions = {};

  usersDb = mongoose.createConnection(DB_HOST, {
    ...connectionOpts,
    dbName: "users_db",
  });
  gameDb = mongoose.createConnection(DB_HOST, {
    ...connectionOpts,
    dbName: "game_db",
  });

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
