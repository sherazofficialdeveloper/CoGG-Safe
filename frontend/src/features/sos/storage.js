import AsyncStorage from '@react-native-async-storage/async-storage';

const SOS_EVENT_KEY = 'cogg_safe.sos.events';
const SOS_QUEUE_KEY = 'cogg_safe.sos.queue';
const COLLECTION_CACHE_KEY = 'cogg_safe.sos.collectionCache';
const EMERGENCY_CALL_SIM_KEY = 'cogg_safe.sos.emergencyCallSubscriptionId';
const memoryStore = {};
let queueMutation = Promise.resolve();
let eventMutation = Promise.resolve();
const storageApi = AsyncStorage && AsyncStorage.default ? AsyncStorage.default : AsyncStorage;
const safeAsyncStorage = {
  async getItem(key) {
    if (storageApi && typeof storageApi.getItem === 'function') {
      return storageApi.getItem(key);
    }
    return null;
  },
  async setItem(key, value) {
    if (storageApi && typeof storageApi.setItem === 'function') {
      return storageApi.setItem(key, value);
    }
    return undefined;
  },
  async removeItem(key) {
    if (storageApi && typeof storageApi.removeItem === 'function') {
      return storageApi.removeItem(key);
    }
    return undefined;
  },
};

function readJson(key, fallback) {
  if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
    const stored = memoryStore[key];
    try {
      return Promise.resolve(JSON.parse(stored));
    } catch (error) {
      return Promise.resolve(fallback);
    }
  }

  return safeAsyncStorage.getItem(key).then(value => {
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      memoryStore[key] = JSON.stringify(parsed);
      return parsed;
    } catch (error) {
      return fallback;
    }
  });
}

function writeJson(key, value) {
  memoryStore[key] = JSON.stringify(value);
  return safeAsyncStorage.setItem(key, JSON.stringify(value));
}

export const sosLocalStore = {
  async getAllEvents() {
    const events = await readJson(SOS_EVENT_KEY, []);
    return Array.isArray(events) ? events : [];
  },

  async getSosById(id) {
    const events = await this.getAllEvents();
    return events.find(event => event.id === id) || null;
  },

  async saveEvents(events) {
    await writeJson(SOS_EVENT_KEY, events);
    return events;
  },

  async upsertSos(event) {
    const mutation = eventMutation.then(async () => {
      const events = await this.getAllEvents();
      const next = [...events.filter(item => item.id !== event.id), event];
      await this.saveEvents(next);
      return event;
    });
    eventMutation = mutation.catch(() => undefined);
    return mutation;
  },

  async updateSosServiceState(sosId, serviceKey, patch) {
    const mutation = eventMutation.then(async () => {
      const events = await this.getAllEvents();
      const index = events.findIndex(item => item.id === sosId);
      if (index === -1) return null;

      const event = events[index];
      const updatedEvent = {
        ...event,
        services: {
          ...event.services,
          [serviceKey]: {
            ...(event.services?.[serviceKey] || {}),
            ...patch,
          },
        },
      };
      events[index] = updatedEvent;
      await this.saveEvents(events);
      return updatedEvent;
    });
    eventMutation = mutation.catch(() => undefined);
    return mutation;
  },

  async clear() {
    await eventMutation;
    eventMutation = Promise.resolve();
    delete memoryStore[SOS_EVENT_KEY];
    delete memoryStore[SOS_QUEUE_KEY];
    delete memoryStore[EMERGENCY_CALL_SIM_KEY];
    await Promise.all([
      safeAsyncStorage.removeItem(SOS_EVENT_KEY),
      safeAsyncStorage.removeItem(SOS_QUEUE_KEY),
      safeAsyncStorage.removeItem(EMERGENCY_CALL_SIM_KEY),
    ]);
  },

  async getPendingQueue() {
    const queue = await readJson(SOS_QUEUE_KEY, []);
    return Array.isArray(queue) ? queue : [];
  },

  async saveQueue(queue) {
    await writeJson(SOS_QUEUE_KEY, queue);
    return queue;
  },

  async enqueueQueueItem(item) {
    const mutation = queueMutation.then(async () => {
      const queue = await this.getPendingQueue();
      const existing = queue.findIndex(entry => entry.id === item.id);

    // A queue item's id is a stable {sosId}:{type}:{backendSosId} key, so
    // callers (orchestrator, recovery after an app restart, queueWorker's
    // own re-enqueue of MEDIA_UPLOAD) can safely call this for a job that
    // may already exist. When it does, this must be a true no-op: merging
    // the fresh {status: 'PENDING', attempts: 0, createdAt: now, ...}
    // fields in would silently reset an in-flight job's retry count and
    // backoff (or even resurrect one that already reached FAILED) every
    // time recovery re-derives pending work, which defeats MAX_ATTEMPTS
    // and loses the job's original creation time. Only a genuinely new id
    // gets added.
      if (existing !== -1) {
        return queue;
      }

      const next = [...queue, item];
      await this.saveQueue(next);
      return next;
    });
    queueMutation = mutation.catch(() => undefined);
    return mutation;
  },

  async updateQueueItem(id, patch) {
    const mutation = queueMutation.then(async () => {
      const queue = await this.getPendingQueue();
      const next = queue.map(item => item.id === id ? {...item, ...patch} : item);
      await this.saveQueue(next);
      return next.find(item => item.id === id) || null;
    });
    queueMutation = mutation.catch(() => undefined);
    return mutation;
  },

  async removeQueueItem(id) {
    const mutation = queueMutation.then(async () => {
      const queue = await this.getPendingQueue();
      const next = queue.filter(item => item.id !== id);
      await this.saveQueue(next);
      return next;
    });
    queueMutation = mutation.catch(() => undefined);
    return mutation;
  },

  // Emergency SMS must not require a live backend call to know who to text.
  // We cache the last-known emergency contact per collection locally so SMS
  // can be sent even when the device is offline; this is refreshed opportunistically
  // whenever the collection is fetched successfully.
  async getCachedCollectionInfo(collectionId) {
    if (!collectionId) return null;
    const cache = await readJson(COLLECTION_CACHE_KEY, {});
    return (cache && cache[collectionId]) || null;
  },

  async setCachedCollectionInfo(collectionId, info) {
    if (!collectionId) return null;
    const cache = await readJson(COLLECTION_CACHE_KEY, {});
    const next = {...cache, [collectionId]: {...info, cachedAt: new Date().toISOString()}};
    await writeJson(COLLECTION_CACHE_KEY, next);
    return next[collectionId];
  },

  // Dual-SIM devices need a deterministic, user-chosen SIM for emergency
  // calling so SOS never has to ask "which SIM?" mid-emergency. This is a
  // device-local preference (not a backend field) — it persists the Android
  // subscriptionId the user picked in Profile settings.
  async getEmergencyCallSimPreference() {
    const stored = await readJson(EMERGENCY_CALL_SIM_KEY, null);
    if (stored == null || stored.subscriptionId == null) return null;
    return stored;
  },

  async setEmergencyCallSimPreference(subscriptionId, meta = {}) {
    if (subscriptionId == null) {
      delete memoryStore[EMERGENCY_CALL_SIM_KEY];
      await safeAsyncStorage.removeItem(EMERGENCY_CALL_SIM_KEY);
      return null;
    }
    const value = {subscriptionId, ...meta, savedAt: new Date().toISOString()};
    await writeJson(EMERGENCY_CALL_SIM_KEY, value);
    return value;
  },
};

export default sosLocalStore;
