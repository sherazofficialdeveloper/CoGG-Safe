const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const env = require('./config/env');
const requestLogger = require('./middlewares/requestLogger');
const { apiLimiter } = require('./middlewares/rateLimiter');
const notFoundHandler = require('./middlewares/notFoundHandler');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');

const app = express();

// Trust the first proxy hop (e.g. load balancer) so req.ip / rate limiting
// and secure cookies behave correctly in production.
app.set('trust proxy', 1);

// --- Security & parsing middleware ---
app.use(helmet());
// `credentials: true` tells browsers to allow cookies/HTTP-auth on
// cross-origin requests — this API doesn't use cookies (auth is a
// Bearer token in the Authorization header, which CORS credentials mode
// doesn't gate at all), and combining a wildcard origin with
// credentials is invalid per the Fetch spec anyway (browsers reject
// it). Only enable it when a specific origin is actually configured.
const isWildcardOrigin = env.clientOrigin === '*';
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: !isWildcardOrigin,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// --- Observability ---
if (env.nodeEnv !== 'test') {
  app.use(requestLogger);
}

// --- Rate limiting (applies to all API routes) ---
app.use('/api', apiLimiter);

// --- Routes ---
app.use('/api', routes);

// --- 404 + centralized error handling (must be last) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
