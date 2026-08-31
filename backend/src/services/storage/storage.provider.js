const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

let S3Client;
try {
  // Only load S3Client if R2 is configured
  if (env.storage.provider === 'r2' && env.storage.r2.accountId) {
    const { S3Client: AwsS3Client } = require('@aws-sdk/client-s3');
    S3Client = AwsS3Client;
  }
} catch (err) {
  // AWS SDK not available — R2 will fail with a clear error
}

/**
 * Storage provider abstraction for SOS media (front/back image, audio).
 * Business logic (media.upload.middleware / sos.service) never touches
 * the filesystem or any cloud SDK directly — only `store()`/`resolveUrl()`/
 * `readStream()` here. Swapping local disk for S3/Firebase Storage later
 * means editing only this file.
 *
 * REAL IMPLEMENTATION: `provider: 'local'` (the default) is a fully
 * working implementation using Node's built-in `fs` — no cloud SDK
 * required for local/dev/single-instance deployments. `storageRef` is a
 * relative key (e.g. "sos/<sosId>/frontImage-<random>.jpg"), never an
 * absolute filesystem path and never the binary itself — exactly what
 * sos.model.js's components.*.storageRef is designed to hold.
 *
 * R2 IMPLEMENTATION: `provider: 'r2'` uses Cloudflare R2 with S3-compatible
 * API. storageRef is the object key in R2 (e.g. "sos/<sosId>/frontImage-<random>.jpg").
 * All media retrieval goes through the authenticated backend endpoint,
 * which streams from R2 to the client. R2 credentials are NEVER exposed to clients.
 *
 * OTHER PROVIDERS: `s3`/`firebase`/etc. are recognized by config but not
 * implemented yet — `store()` throws a clear configuration error rather
 * than silently behaving like local storage, so a misconfigured
 * STORAGE_PROVIDER fails loudly instead of writing to the wrong place.
 * Implementing a real cloud provider means adding a branch here with
 * that provider's SDK — no caller changes needed.
 */

function sanitizeExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  // Only allow a short, plain alphanumeric extension — never trust the
  // client-supplied filename beyond this.
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

function buildStorageRef(folder, originalFilename) {
  const random = crypto.randomBytes(16).toString('hex');
  const ext = sanitizeExtension(originalFilename);
  return `${folder}/${Date.now()}-${random}${ext}`;
}

/**
 * Resolves a storageRef to an absolute path INSIDE the configured local
 * upload directory, and throws if it would resolve to anything outside
 * it. This is the one thing standing between this file and a path-
 * traversal / arbitrary-file-read vulnerability: `storageRef` values
 * that reach `store()` are always server-generated (buildStorageRef),
 * but values reaching `readStream()` can also come from a client
 * reporting a reference for media it uploaded out-of-band (see
 * sos.service.reportMedia) — those are NOT trustworthy path input, so
 * every resolution is containment-checked regardless of where the ref
 * came from.
 */
function resolveContainedPath(storageRef) {
  const baseDir = path.resolve(process.cwd(), env.storage.localPath);
  const resolved = path.resolve(baseDir, String(storageRef || ''));
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    throw ApiError.badRequest('Invalid storage reference');
  }
  return resolved;
}

async function storeLocal({ buffer, folder, originalFilename }) {
  const storageRef = buildStorageRef(folder, originalFilename);
  const absolutePath = resolveContainedPath(storageRef);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return storageRef;
}

async function storeR2({ buffer, folder, originalFilename }) {
  if (!S3Client) {
    throw ApiError.internal(
      'AWS SDK not available. Install @aws-sdk/client-s3 to use R2 storage.'
    );
  }

  const config = env.storage.r2;
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw ApiError.internal(
      'R2 storage is not properly configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your .env file.'
    );
  }

  const storageRef = buildStorageRef(folder, originalFilename);
  
  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
    
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: storageRef,
        Body: buffer,
        ContentType: 'application/octet-stream',
      })
    );

    return storageRef;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('R2 upload error:', err.message);
    throw ApiError.internal(`R2 upload failed: ${err.message}`);
  }
}

/**
 * Stores a media buffer and returns its storageRef. `folder` scopes the
 * file to the owning SOS (e.g. `sos/<sosId>`) so files are never mixed
 * between SOS records on disk, mirroring the same isolation already
 * enforced at the database level.
 */
async function store({ buffer, folder, originalFilename }) {
  if (env.storage.provider === 'local') {
    return storeLocal({ buffer, folder, originalFilename });
  }
  if (env.storage.provider === 'r2') {
    return storeR2({ buffer, folder, originalFilename });
  }
  throw ApiError.internal(
    `Storage provider "${env.storage.provider}" is not implemented yet — set STORAGE_PROVIDER=local or r2, or implement this provider in storage.provider.js`
  );
}

function resolveUrl(storageRef) {
  if (!storageRef) return null;
  if (/^https?:\/\//i.test(storageRef)) return storageRef; // already a full URL
  return `${env.storage.baseUrl.replace(/\/$/, '')}/${storageRef.replace(/^\//, '')}`;
}

async function readStreamR2(storageRef) {
  if (!S3Client) {
    throw ApiError.internal(
      'AWS SDK not available. Install @aws-sdk/client-s3 to use R2 storage.'
    );
  }

  const config = env.storage.r2;
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw ApiError.internal(
      'R2 storage is not properly configured.'
    );
  }

  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
    
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: storageRef,
      })
    );

    return response.Body;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('R2 read error:', err.message);
    if (err.name === 'NoSuchKey') {
      throw ApiError.notFound('Stored media file not found');
    }
    throw ApiError.internal(`R2 read failed: ${err.message}`);
  }
}

/**
 * Opens a readable stream for a stored file, for the secure
 * retrieval/streaming endpoints (see sos.controller/emergencyLink.controller)
 * — those endpoints enforce SOS-level authorization before ever calling
 * this; this function itself has no authorization concept, purely I/O.
 */
async function readStream(storageRef) {
  if (env.storage.provider === 'local') {
    const absolutePath = resolveContainedPath(storageRef);
    if (!fsSync.existsSync(absolutePath)) {
      throw ApiError.notFound('Stored media file not found');
    }
    return fsSync.createReadStream(absolutePath);
  }
  if (env.storage.provider === 'r2') {
    return readStreamR2(storageRef);
  }
  throw ApiError.internal(`Storage provider "${env.storage.provider}" is not implemented yet`);
}

module.exports = { store, resolveUrl, readStream };
