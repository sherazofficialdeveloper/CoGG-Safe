const multer = require('multer');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');

/**
 * Configures the single-responsibility concern of "how do we accept a
 * multipart file upload" — separate from sos.routes.js (routing) and
 * sos.service.js (business logic), so each stays focused on its own job.
 *
 * Memory storage: files are held in a Buffer just long enough to be
 * handed to the storage provider (see storage.provider.js), never
 * written to a temp path the app has to clean up itself, and never
 * persisted directly by multer — the storage abstraction is the only
 * thing that decides where bytes actually end up.
 */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/ogg',
]);

function fileFilter(req, file, cb) {
  const component = req.params.component;
  const isAudioComponent = component === 'audio';
  const allowed = isAudioComponent ? ALLOWED_AUDIO_MIME_TYPES : ALLOWED_IMAGE_MIME_TYPES;

  if (!allowed.has(file.mimetype)) {
    cb(ApiError.badRequest(`Unsupported file type "${file.mimetype}" for ${component}`));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.media.maxUploadSizeMb * 1024 * 1024, files: 1 },
  fileFilter,
});

/** Expects a single file under the multipart field name "file". */
const uploadSingleFile = upload.single('file');

module.exports = { uploadSingleFile };
