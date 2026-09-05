import {emitSosToast} from './sosToastService';

const SERVICE_LABELS = {
  backend: 'Server sync',
  sms: 'SMS',
  call: 'Call',
  location: 'Location',
  camera: 'Camera',
  audio: 'Audio',
  mediaUpload: 'Media upload',
  liveLocation: 'Live location',
  notifications: 'Notifications',
  email: 'Email',
};

function normalizeReason(errorOrResult) {
  if (typeof errorOrResult === 'string') return errorOrResult;
  return errorOrResult?.error || errorOrResult?.reason || errorOrResult?.message || 'Unknown SOS service failure';
}

function isTransient(reason) {
  return /timeout|timed out|network|connection|temporarily|unavailable|retry|queued|request failed|check your connection/i.test(String(reason || ''));
}

export function reportSosServiceError(serviceName, errorOrResult, {status = 'FAILED', eventId} = {}) {
  const reason = normalizeReason(errorOrResult);
  const label = SERVICE_LABELS[serviceName] || serviceName;
  const tag = serviceName === 'mediaUpload' ? 'UPLOAD' : serviceName.replace(/([A-Z])/g, '_$1').toUpperCase();

  if (__DEV__) {
    console.log(`[SOS][${tag}] ${status}`, {
      eventId,
      service: serviceName,
      reason,
      errorCode: errorOrResult?.code || errorOrResult?.errorCode || null,
    });
  }

  // Offline/temporary provider failures are intentionally silent here. The
  // durable SOS queue will retry them and the UI should not fill with red
  // error cards for an expected transient condition.
  if (status !== 'QUEUED' && !isTransient(reason)) {
    try {
      emitSosToast(`${label} failed: ${reason}`, 'error', 4500);
    } catch (reportingError) {
      if (__DEV__) console.log('[SOS][FLOW] ERROR_REPORT_FAILED', {serviceName, reason: reportingError?.message});
    }
  }

  return {service: serviceName, status, reason};
}

export default {reportSosServiceError};
