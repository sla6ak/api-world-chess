import fs from "fs";
import path from "path";

const logDir = path.join(__dirname, "..", "..", "..", "logs");
const logFile = path.join(logDir, "errors.log");

const ensureLogDir = (): void => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

const logError = (context: string, error: unknown): void => {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${context}] ${error instanceof Error ? error.stack : String(error)}\n`;
  fs.appendFileSync(logFile, entry, "utf-8");
};

export { logError };
