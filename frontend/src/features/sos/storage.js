import AsyncStorage from '@react-native-async-storage/async-storage';

const fallbackStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};
const safeStorage = AsyncStorage || fallbackStorage;

const SOS_EVENT_KEY = 'cogg_safe.sos.events';
const SOS_QUEUE_KEY = 'cogg_safe.sos.queue';
const SOS_LOCATION_PINGS_KEY = 'cogg_safe.sos.pending_pings';
const memoryStore = {};
let writeChain = Promise.resolve();
let eventMutationChain = Promise.resolve();

function readJson(key, fallback) {
  if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
    const stored = memoryStore[key];
    try {
      return Promise.resolve(JSON.parse(stored));
    } catch (error) {
      return Promise.resolve(fallback);
    }
  }

  return Promise.resolve(safeStorage.getItem(key)).then(value => {
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
  writeChain = writeChain.then(() => safeStorage.setItem(key, JSON.stringify(value)));
  return writeChain;
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
    const events = await this.getAllEvents();
    const next = [...events.filter(item => item.id !== event.id), event];
    await this.saveEvents(next);
    return event;
  },

  async updateSosServiceState(sosId, serviceKey, patch) {
    const mutation = eventMutationChain.then(async () => {
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
    eventMutationChain = mutation.catch(() => undefined);
    return mutation;
  },

  async clear() {
    delete memoryStore[SOS_EVENT_KEY];
    delete memoryStore[SOS_QUEUE_KEY];
    delete memoryStore[SOS_LOCATION_PINGS_KEY];
    await Promise.all([
      safeStorage.removeItem(SOS_EVENT_KEY),
      safeStorage.removeItem(SOS_QUEUE_KEY),
      safeStorage.removeItem(SOS_LOCATION_PINGS_KEY),
    ]);
    writeChain = Promise.resolve();
    eventMutationChain = Promise.resolve();
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
    const queue = await this.getPendingQueue();
    const existing = queue.findIndex(entry => entry.id === item.id);
    const next = existing === -1
      ? [...queue, item]
      : queue.map((entry, index) => index === existing ? {...item, ...entry, payload: {...item.payload, ...entry.payload}} : entry);
    await this.saveQueue(next);
    return next;
  },

  async updateQueueItem(id, patch) {
    const queue = await this.getPendingQueue();
    const next = queue.map(item => item.id === id ? {...item, ...patch} : item);
    await this.saveQueue(next);
    return next.find(item => item.id === id) || null;
  },

  async removeQueueItem(id) {
    const queue = await this.getPendingQueue();
    const next = queue.filter(item => item.id !== id);
    await this.saveQueue(next);
    return next;
  },

  async getAllPendingLocationPings() {
    const pings = await readJson(SOS_LOCATION_PINGS_KEY, []);
    return Array.isArray(pings) ? pings : [];
  },

  async savePendingLocationPings(pings) {
    await writeJson(SOS_LOCATION_PINGS_KEY, pings);
    return pings;
  },

  async getPendingLocationPings(sosId) {
    const pings = await this.getAllPendingLocationPings();
    if (!sosId) return pings;
    return pings.filter(p => p.sosId === sosId);
  },

  async addPendingLocationPing(ping) {
    const pings = await this.getAllPendingLocationPings();
    const id = ping.id || `${ping.sosId || 'sos'}_${ping.capturedAt || Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const formatted = {
      id,
      sosId: ping.sosId,
      latitude: ping.latitude,
      longitude: ping.longitude,
      accuracy: ping.accuracy || null,
      capturedAt: ping.capturedAt || new Date().toISOString(),
    };
    // Keep max 100 most recent pending pings
    const next = [...pings, formatted].slice(-100);
    await this.savePendingLocationPings(next);
    return formatted;
  },

  async removePendingLocationPing(id) {
    const pings = await this.getAllPendingLocationPings();
    const next = pings.filter(p => p.id !== id);
    await this.savePendingLocationPings(next);
    return next;
  },

  async clearPendingLocationPings(sosId) {
    const pings = await this.getAllPendingLocationPings();
    const next = sosId ? pings.filter(p => p.sosId !== sosId) : [];
    await this.savePendingLocationPings(next);
    return next;
  },
};

export default sosLocalStore;
