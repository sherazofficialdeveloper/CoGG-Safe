import AsyncStorage from '@react-native-async-storage/async-storage';

const SOS_EVENT_KEY = 'cogg_safe.sos.events';
const SOS_QUEUE_KEY = 'cogg_safe.sos.queue';
const memoryStore = {};

function readJson(key, fallback) {
  if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
    const stored = memoryStore[key];
    try {
      return Promise.resolve(JSON.parse(stored));
    } catch (error) {
      return Promise.resolve(fallback);
    }
  }

  return AsyncStorage.getItem(key).then(value => {
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
  return AsyncStorage.setItem(key, JSON.stringify(value));
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
    const events = await this.getAllEvents();
    const index = events.findIndex(item => item.id === sosId);
    if (index === -1) return null;

    const event = events[index];
    event.services = {
      ...event.services,
      [serviceKey]: {
        ...(event.services?.[serviceKey] || {}),
        ...patch,
      },
    };
    events[index] = event;
    await this.saveEvents(events);
    return event;
  },

  async clear() {
    delete memoryStore[SOS_EVENT_KEY];
    delete memoryStore[SOS_QUEUE_KEY];
    await Promise.all([
      AsyncStorage.removeItem(SOS_EVENT_KEY),
      AsyncStorage.removeItem(SOS_QUEUE_KEY),
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
    const queue = await this.getPendingQueue();
    const existing = queue.findIndex(entry => entry.id === item.id);
    const next = existing === -1
      ? [...queue, item]
      : queue.map((entry, index) => index === existing ? {...entry, ...item} : entry);
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
};

export default sosLocalStore;
