const winston = require('winston');
const path = require('path');
require('dotenv').config();

const { CloudWatchTransport } = require('winston-aws-cloudwatch');

// Log format
const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
);

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: []
});

// Local: Log to file + console
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.File({ 
        filename: path.join(__dirname, '../logs/app.log'),
        maxsize: 5 * 1024 * 1024, // 5MB max per file
        maxFiles: 5 
    }));
    logger.add(new winston.transports.Console());
}

// Production: Send logs to AWS CloudWatch
if (process.env.NODE_ENV === 'production') {
    logger.add(new CloudWatchTransport({
        logGroupName: process.env.CLOUDWATCH_GROUP, // CloudWatch Log Group
        logStreamName: process.env.CLOUDWATCH_STREAM, // Log Stream
        awsRegion: process.env.AWS_REGION,
        jsonMessage: true
    }));
}

module.exports = logger;
