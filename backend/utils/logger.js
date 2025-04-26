const winston = require('winston');

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
);

const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: []
});

// Always log to console (both local and production)
logger.add(new winston.transports.Console());

module.exports = logger;
