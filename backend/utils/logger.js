const winston = require('winston');

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
);

const logger = winston.createLogger({
    // Quiet under Vitest so test output stays readable (and cheap for agents to read).
    level: process.env.VITEST ? 'warn' : 'info',
    format: logFormat,
    transports: []
});

// Always log to console (both local and production)
logger.add(new winston.transports.Console());

module.exports = logger;
