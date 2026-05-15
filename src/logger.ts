import { createLoggerSync, type Logger } from "@toolprint/mcp-logger";

export const logger: Logger = createLoggerSync({ level: "info" });
