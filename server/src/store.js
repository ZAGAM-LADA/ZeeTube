import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const COLLECTIONS = ['downloads', 'media', 'playlists', 'history', 'conversions'];
const defaults = () => ({
  downloads: [], media: [], playlists: [], history: [], conversions: [],
  settings: { theme: 'light', defaultFormat: 'mp4', defaultQuality: 'source', concurrency: 2 }
});

const schemas = {};
for (const name of COLLECTIONS) {
  schemas[name] = new mongoose.Schema({ id: { type: String, required: true, unique: true, index: true } }, {
    strict: false, timestamps: true, minimize: false
  });
}
const SettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'default' },
  theme: { type: String, default: 'light' },
  defaultFormat: { type: String, default: 'mp4' },
  defaultQuality: { type: String, default: 'source' },
  concurrency: { type: Number, default: 2 }
}, { timestamps: true });

class Store {
  constructor() {
    this.driver = (process.env.DATA_DRIVER || 'file').toLowerCase();
    this.dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(process.cwd(), 'storage');
    this.filePath = path.join(this.dataDir, 'db.json');
    this.state = defaults();
    this.models = {};
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.driver === 'mongo') {
      if (!process.env.MONGODB_URI) throw new Error('DATA_DRIVER=mongo requires MONGODB_URI in .env');
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
      for (const name of COLLECTIONS) {
        this.models[name] = mongoose.models[`Zag${name}`] || mongoose.model(`Zag${name}`, schemas[name], `zag_${name}`);
      }
      this.models.settings = mongoose.models.ZagSettings || mongoose.model('ZagSettings', SettingsSchema, 'zag_settings');
      await this.models.settings.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true });
      return;
    }
    this.driver = 'file';
    await fs.mkdir(this.dataDir, { recursive: true });
    for (const folder of ['uploads', 'downloads', 'converted']) await fs.mkdir(path.join(this.dataDir, folder), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const loaded = JSON.parse(raw);
      this.state = { ...defaults(), ...loaded };
      for (const name of COLLECTIONS) if (!Array.isArray(this.state[name])) this.state[name] = [];
      this.state.settings = { ...defaults().settings, ...(this.state.settings || {}) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Could not read persistent data file: ${err.message}`);
      await this.#writeFile();
    }
  }

  async #writeFile() {
    const temp = `${this.filePath}.tmp`;
    await fs.writeFile(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    await fs.rename(temp, this.filePath);
  }

  #serialWrite(fn) {
    const task = this.writeQueue.then(fn, fn);
    this.writeQueue = task.catch(() => {});
    return task;
  }

  async list(type) {
    if (!COLLECTIONS.includes(type)) throw new Error(`Unknown collection: ${type}`);
    if (this.driver === 'mongo') {
      const rows = await this.models[type].find({}).sort({ createdAt: -1 }).lean();
      return rows.map(({ _id, __v, ...row }) => row);
    }
    await this.writeQueue;
    return structuredClone(this.state[type]).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async get(type, id) {
    if (!COLLECTIONS.includes(type)) throw new Error(`Unknown collection: ${type}`);
    if (this.driver === 'mongo') {
      const row = await this.models[type].findOne({ id }).lean();
      if (!row) return null;
      const { _id, __v, ...clean } = row;
      return clean;
    }
    await this.writeQueue;
    const row = this.state[type].find((item) => item.id === id);
    return row ? structuredClone(row) : null;
  }

  async insert(type, input) {
    if (!COLLECTIONS.includes(type)) throw new Error(`Unknown collection: ${type}`);
    const item = { id: input.id || randomUUID(), createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), ...input };
    if (this.driver === 'mongo') {
      const saved = await this.models[type].create(item);
      const obj = saved.toObject();
      delete obj._id; delete obj.__v;
      return obj;
    }
    return this.#serialWrite(async () => {
      this.state[type].unshift(item);
      await this.#writeFile();
      return structuredClone(item);
    });
  }

  async update(type, id, patch) {
    if (!COLLECTIONS.includes(type)) throw new Error(`Unknown collection: ${type}`);
    const safePatch = { ...patch, updatedAt: new Date().toISOString() };
    delete safePatch.id; delete safePatch._id; delete safePatch.__v;
    if (this.driver === 'mongo') {
      const row = await this.models[type].findOneAndUpdate({ id }, { $set: safePatch }, { new: true, lean: true });
      if (!row) return null;
      const { _id, __v, ...clean } = row;
      return clean;
    }
    return this.#serialWrite(async () => {
      const index = this.state[type].findIndex((item) => item.id === id);
      if (index < 0) return null;
      this.state[type][index] = { ...this.state[type][index], ...safePatch };
      await this.#writeFile();
      return structuredClone(this.state[type][index]);
    });
  }

  async remove(type, id) {
    if (!COLLECTIONS.includes(type)) throw new Error(`Unknown collection: ${type}`);
    if (this.driver === 'mongo') {
      const result = await this.models[type].deleteOne({ id });
      return result.deletedCount > 0;
    }
    return this.#serialWrite(async () => {
      const before = this.state[type].length;
      this.state[type] = this.state[type].filter((item) => item.id !== id);
      if (before !== this.state[type].length) await this.#writeFile();
      return before !== this.state[type].length;
    });
  }

  async getSettings() {
    if (this.driver === 'mongo') {
      const row = await this.models.settings.findOne({ key: 'default' }).lean();
      if (!row) return defaults().settings;
      return { theme: row.theme, defaultFormat: row.defaultFormat, defaultQuality: row.defaultQuality, concurrency: row.concurrency };
    }
    await this.writeQueue;
    return structuredClone(this.state.settings);
  }

  async updateSettings(patch) {
    if (this.driver === 'mongo') {
      const row = await this.models.settings.findOneAndUpdate({ key: 'default' }, { $set: patch }, { upsert: true, new: true, lean: true });
      return { theme: row.theme, defaultFormat: row.defaultFormat, defaultQuality: row.defaultQuality, concurrency: row.concurrency };
    }
    return this.#serialWrite(async () => {
      this.state.settings = { ...this.state.settings, ...patch };
      await this.#writeFile();
      return structuredClone(this.state.settings);
    });
  }

  async close() { if (this.driver === 'mongo') await mongoose.disconnect(); }
}

export const store = new Store();
export { COLLECTIONS };
