import fs from "fs";
import path from "path";

/**
 * Перехват console.log / console.warn / console.error / console.info / console.debug
 * и зеркалирование их в файл для последующего анализа (например, агентом).
 *
 * Файл: <api-world-chess>/logs/server-console.log
 *  - ротация: если при старте файл больше MAX_BYTES → переименовывается в
 *    server-console.1.log (старое .1 перезаписывается);
 *  - формат строки: `[ISO-dата] [LEVEL] сериализованные-аргументы`;
 *  - вывод в stdout сохраняется (вызывается оригинальный console.*).
 *
 * Инициализация — вызвать installConsoleFileLogger() как можно раньше в server.ts.
 */

const logDir = path.join(__dirname, "..", "..", "logs"); // <api>/logs (не корень репо)
const consoleLogFile = path.join(logDir, "server-console.log");
const rotatedFile = path.join(logDir, "server-console.1.log");
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — защита от разрастания

type Level = "LOG" | "INFO" | "WARN" | "ERROR" | "DEBUG";

const serialize = (value: unknown): string => {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const writeEntry = (level: Level, args: unknown[]): void => {
  try {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${args.map(serialize).join(" ")}\n`;
    fs.appendFileSync(consoleLogFile, line, "utf-8");
  } catch {
    // Логирование не должно ронять сервер.
  }
};

const installConsoleFileLogger = (): void => {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    // Ротация при старте: предыдущий лог сессии уходит в .1
    if (
      fs.existsSync(consoleLogFile) &&
      fs.statSync(consoleLogFile).size > MAX_BYTES
    ) {
      fs.renameSync(consoleLogFile, rotatedFile);
    }
  } catch {
    return; // нет ФС-доступа — просто не перехватываем
  }

  const wrap =
    (level: Level, original: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      writeEntry(level, args);
      original.apply(console, args);
    };

  console.log = wrap("LOG", console.log.bind(console));
  console.info = wrap("INFO", console.info.bind(console));
  console.warn = wrap("WARN", console.warn.bind(console));
  console.error = wrap("ERROR", console.error.bind(console));
  console.debug = wrap("DEBUG", (console.debug ?? console.log).bind(console));

  // Неперехваченные исключения и промисы — тоже в файл.
  process.on("uncaughtException", (err) => {
    writeEntry("ERROR", ["[uncaughtException]", err]);
  });
  process.on("unhandledRejection", (reason) => {
    writeEntry("ERROR", ["[unhandledRejection]", reason]);
  });

  writeEntry("INFO", [
    "=== console file logger installed | pid:",
    process.pid,
    "| node:",
    process.version,
    "===",
  ]);
};

export { installConsoleFileLogger, consoleLogFile };
