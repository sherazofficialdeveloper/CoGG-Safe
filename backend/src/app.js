const path = require('path');
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
// The only deviation from helmet's defaults: allow the public emergency
// page (see the "/e" section below) to embed an OpenStreetMap iframe for
// the live/last-known location — no API key, no new map library, just a
// same-origin script fetching from our own JSON API and one iframe pointed
// at openstreetmap.org. Everything else (script-src, img-src, etc.) stays
// locked to 'self', which the emergency page's own JS/CSS/media already
// satisfy without any further relaxation.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'frame-src': ["'self'", 'https://www.openstreetmap.org'],
      },
    },
  })
);
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

// --- Public emergency webpage ---
// Deliberately separate from "/api": this serves the static HTML/CSS/JS
// shell for the public emergency link (EMERGENCY_LINK_BASE_URL points
// here, e.g. http://localhost:8000/e/<token>). The page itself is a thin
// client that calls the existing GET /api/emergency/:token JSON endpoint
// for data — this route never touches the database directly.
const emergencyPagePath = path.join(__dirname, 'public/emergency');
app.use('/e', express.static(emergencyPagePath));
// Any /e/<token> that doesn't match a static asset above (styles.css,
// app.js) is the SPA shell; the token itself is parsed client-side from
// the URL and resolved through the JSON API, not read here.
app.get('/e/:token', (req, res) => {
  res.sendFile(path.join(emergencyPagePath, 'index.html'));
});

// --- Rate limiting (applies to all API routes) ---
app.use('/api', apiLimiter);

// --- Routes ---
app.use('/api', routes);

// --- 404 + centralized error handling (must be last) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
