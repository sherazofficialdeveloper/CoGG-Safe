const morgan = require('morgan');
const logger = require('../config/logger');

/**
 * Streams HTTP access logs through the same structured logger used
 * everywhere else, instead of morgan writing directly to stdout.
 */
const stream = {
  write: (message) => logger.info(message.trim()),
};

const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream }
);

module.exports = requestLogger;
