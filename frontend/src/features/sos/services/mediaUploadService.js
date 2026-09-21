import {uploadSosMedia} from '../../../api/resources';

/**
 * Uploads captured media (front/back image, audio) to the backend.
 * Returns the backend storageRef for durable reference.
 * 
 * Flow:
 * - local media file
 * - upload to backend via multipart
 * - backend stores and returns storageRef
 * - frontend uses storageRef for persistence/retrieval
 */
export async function uploadMediaFile({
  token,
  backendSosId,
  component, // 'frontImage', 'backImage', 'audio'
  localFilePath,
  mimeType,
}) {
  if (!token || !backendSosId || !component || !localFilePath || !mimeType) {
    throw new Error('Media upload requires token, backendSosId, component, localFilePath, and mimeType');
  }

  try {
    // Convert local file path to a File/Blob for FormData
    // In React Native, we pass the path and let fetch handle it
    const file = {
      uri: localFilePath,
      type: mimeType,
      name: `${component}-${Date.now()}`,
    };

    const result = await uploadSosMedia(token, backendSosId, component, file);
    
    // Backend returns SOS with updated components containing storageRef
    if (result?.sos?.components?.[component]?.storageRef) {
      return {
        status: 'SUCCESS',
        storageRef: result.sos.components[component].storageRef,
        mimeType: result.sos.components[component].mimeType || mimeType,
        component,
      };
    }

    return {
      status: 'FAILED',
      error: 'Backend did not return storageRef',
      component,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      error: error?.message || 'Media upload failed',
      component,
    };
  }
}

export default { uploadMediaFile };
