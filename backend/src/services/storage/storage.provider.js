const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

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
  throw ApiError.internal(
    `Storage provider "${env.storage.provider}" is not implemented yet — set STORAGE_PROVIDER=local, or implement this provider in storage.provider.js`
  );
}

function resolveUrl(storageRef) {
  if (!storageRef) return null;
  if (/^https?:\/\//i.test(storageRef)) return storageRef; // already a full URL
  return `${env.storage.baseUrl.replace(/\/$/, '')}/${storageRef.replace(/^\//, '')}`;
}

/**
 * Opens a readable stream for a stored file, for the secure
 * retrieval/streaming endpoints (see sos.controller/emergencyLink.controller)
 * — those endpoints enforce SOS-level authorization before ever calling
 * this; this function itself has no authorization concept, purely I/O.
 */
function readStream(storageRef) {
  if (env.storage.provider !== 'local') {
    throw ApiError.internal(`Storage provider "${env.storage.provider}" is not implemented yet`);
  }
  const absolutePath = resolveContainedPath(storageRef);
  if (!fsSync.existsSync(absolutePath)) {
    throw ApiError.notFound('Stored media file not found');
  }
  return fsSync.createReadStream(absolutePath);
}

module.exports = { store, resolveUrl, readStream };
