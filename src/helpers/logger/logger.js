const fs = require("fs");
const path = require("path");

const logDir = path.join(__dirname, "..", "..", "..", "logs");
const logFile = path.join(logDir, "errors.log");

const ensureLogDir = () => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

const logError = (context, error) => {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${context}] ${error instanceof Error ? error.stack : String(error)}\n`;
  fs.appendFileSync(logFile, entry, "utf-8");
};

module.exports = { logError };
