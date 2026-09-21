const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * Liveness check — used by uptime monitors / load balancers.
 * Deliberately has no auth and no dependency on the database: it must
 * keep responding even if MongoDB is temporarily unreachable, since
 * that's a separate failure mode from "the process itself is dead".
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'OK',
    data: { uptimeSeconds: process.uptime() },
  });
});

/**
 * Readiness check — distinct from liveness: confirms the database
 * connection is actually usable, so an orchestrator (k8s, a load
 * balancer) can avoid routing traffic to an instance whose MongoDB
 * connection is down even though the process itself is still running.
 * No auth, same as /health.
 */
router.get('/health/ready', (req, res) => {
  const isDbReady = mongoose.connection.readyState === 1; // 1 = connected
  res.status(isDbReady ? 200 : 503).json({
    success: isDbReady,
    message: isDbReady ? 'Ready' : 'Database not connected',
    data: { mongoConnected: isDbReady },
  });
});

// Feature module routes are mounted here as they're implemented.
router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/users', require('../modules/users/user.routes'));
router.use('/contacts', require('../modules/users/contacts.routes'));
router.use('/collections', require('../modules/collections/collection.routes'));
router.use('/sos', require('../modules/sos/sos.routes'));
router.use('/notifications', require('../modules/notifications/notification.routes'));
router.use('/push-tokens', require('../modules/notifications/pushToken.routes'));
// Public, unauthenticated emergency-link view — deliberately NOT under /sos.
router.use('/emergency', require('../modules/sos/emergencyLink.routes'));

module.exports = router;
