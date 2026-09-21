const Sos = require('./sos.model');

/**
 * Atomically sets one named component's status (and optional error /
 * storageRef) on an SOS document via a targeted $set, rather than
 * loading + mutating + saving the whole document. This matters because
 * dispatch (sms/email/push/call) and live-location pings can be updating
 * the same SOS document concurrently — a full-document save() risks
 * clobbering a concurrent update with a stale in-memory copy.
 *
 * A failure in one component NEVER touches any other component's fields
 * or the overall SOS status — that is the whole point of this being a
 * narrow, single-path $set.
 */
async function setComponentStatus(
  sosId,
  componentName,
  status,
  { error = null, storageRef = undefined, mimeType = undefined } = {}
) {
  const set = {
    [`components.${componentName}.status`]: status,
    [`components.${componentName}.error`]: error,
    [`components.${componentName}.updatedAt`]: new Date(),
  };
  if (storageRef !== undefined) {
    set[`components.${componentName}.storageRef`] = storageRef;
  }
  if (mimeType !== undefined) {
    set[`components.${componentName}.mimeType`] = mimeType;
  }
  await Sos.updateOne({ _id: sosId }, { $set: set });
}

module.exports = { setComponentStatus };
