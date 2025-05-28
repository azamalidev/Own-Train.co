const winston = require("winston");
const { format, transports } = winston;
const DailyRotateFile = require("winston-daily-rotate-file");

const logFormat = winston.format.combine(
  format.timestamp(
    { format: "YYYY-MM-DD HH:mm:ss" } // this is my date format
  ),
  format.errors({ stack: true }), //log the full stack of errro s
  format.splat(), //allows string interpolation
  format.json() // log in the format of the json ok
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: logFormat,
  transports: [
    //console logging -> pretty print in the development
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(
          (info) => `${info.timestamp} [${info.level}]: ${info.message}`
        )
      ),
    }),
    // Rotate error logs daily
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      level: "error",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
    }),
    // Rotate all logs daily
    new DailyRotateFile({
      filename: "logs/combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d",
    }),
  ],
  exceptionHandlers: [new transports.File({ filename: "logs/exceptions.log" })],
  rejectionHandlers: [new transports.File({ filename: "logs/rejections.log" })],
});

// Handle uncaught exceptions & promise rejections
logger.exitOnError = false;

module.exports = logger;

/*
this is the usecase

const logger = require('./logger');

// Basic logging
logger.error('This is an error message');
logger.warn('This is a warning');
logger.info('This is an info message');
logger.debug('This is a debug message');

// Logging with metadata
logger.info('User logged in', { userId: 123, ip: '127.0.0.1' });

// Logging errors with stack trace
try {
  throw new Error('Something went wrong!');
} catch (err) {
  logger.error('Error occurred:', err);
}

Log Levels:

error: Critical failures

warn: Unexpected but recoverable issues

info: Important runtime events

debug: Debugging information

verbose: Detailed logs

silly: Extremely verbose
*/
