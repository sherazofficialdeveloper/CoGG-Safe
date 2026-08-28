require('dotenv').config();

/**
 * Centralized, validated access to environment variables.
 * Nothing else in the codebase should call process.env directly —
 * this keeps configuration in one place and fails fast on boot
 * if something critical is missing.
 */
const required = ['MONGODB_URI', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  // Fail fast rather than limping along without critical config.
  // eslint-disable-next-line no-console
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  appName: process.env.APP_NAME || 'CoGG SOS Backend',
  clientOrigin: process.env.CLIENT_ORIGIN || '*',

  mongoUri: process.env.MONGODB_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,

  sos: {
    cancellationWindowSeconds: parseInt(process.env.SOS_CANCELLATION_WINDOW_SECONDS, 10) || 10,
    liveLocationMaxDurationHours: parseInt(process.env.LIVE_LOCATION_MAX_DURATION_HOURS, 10) || 3,
  },

  // How often the durable scheduler polls for due jobs (SOS activation,
  // live-location expiry). See src/modules/scheduler.
  scheduler: {
    pollIntervalMs: parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS, 10) || 5000,
  },

  media: {
    maxUploadSizeMb: parseInt(process.env.MEDIA_MAX_UPLOAD_SIZE_MB, 10) || 15,
  },

  rateLimit: {
    windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined,
  },

  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio',
    accountSid: process.env.SMS_ACCOUNT_SID,
    authToken: process.env.SMS_AUTH_TOKEN,
    fromNumber: process.env.SMS_FROM_NUMBER,
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || 'smtp',
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'noreply@coggsos.com',
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    localPath: process.env.STORAGE_LOCAL_PATH || 'uploads',
    baseUrl: process.env.STORAGE_BASE_URL || 'http://localhost:5000/uploads',
    s3Bucket: process.env.AWS_S3_BUCKET,
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  call: {
    provider: process.env.CALL_PROVIDER || 'twilio',
    // Voice calls reuse the same Twilio account credentials as SMS by
    // default (the common setup — one Twilio account, both capabilities),
    // but can be overridden independently if a different account/number
    // is used for voice.
    accountSid: process.env.CALL_ACCOUNT_SID || process.env.SMS_ACCOUNT_SID,
    authToken: process.env.CALL_AUTH_TOKEN || process.env.SMS_AUTH_TOKEN,
    fromNumber: process.env.CALL_FROM_NUMBER || process.env.SMS_FROM_NUMBER,
    // Twilio requires a TwiML URL telling it what the call should say/do
    // once answered — this must be provided by the operator (a static
    // TwiML Bin or their own webhook), the backend cannot generate one.
    twimlUrl: process.env.CALL_TWIML_URL,
  },

  emergencyLink: {
    baseUrl: process.env.EMERGENCY_LINK_BASE_URL || 'http://localhost:5000/e',
  },
};

module.exports = env;
