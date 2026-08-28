const winston = require('winston');

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Fields that must never reach the logs, even accidentally
 * (e.g. someone spreads a request body into a log call).
 * This is a defense-in-depth safety net — callers are still
 * responsible for not logging sensitive data directly.
 */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'jwt',
  'authorization',
  'accessToken',
  'refreshToken',
  'authToken',
  'privateKey',
  'apiKey',
  'secret',
]);

function redact(meta) {
  if (!meta || typeof meta !== 'object') return meta;

  const clean = Array.isArray(meta) ? [] : {};
  for (const [key, value] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(key)) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = redact(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const redactFormat = winston.format((info) => {
  const { level, message, timestamp, stack, ...meta } = info;
  return { level, message, timestamp, stack, ...redact(meta) };
});

const logger = winston.createLogger({
  level: nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactFormat(),
    nodeEnv === 'production' ? winston.format.json() : winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
    })
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

module.exports = logger;
