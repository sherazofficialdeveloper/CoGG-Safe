const Collection = require('./collection.model');
const User = require('../users/user.model');
const ApiError = require('../../utils/ApiError');
const { COLLECTION_TYPES } = require('../../constants/sosConstants');
const { parsePagination, buildPaginationMeta } = require('../../utils/paginate');
const escapeRegex = require('../../utils/escapeRegex');

function titleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Resolves the final `name` for a collection given its type and the
 * (optional) name supplied by the admin.
 *   - type === "other": a non-empty custom name is REQUIRED.
 *   - any other type: name defaults to the title-cased type
 *     (e.g. "family" -> "Family") unless the admin supplied one.
 * This is the single place this rule is enforced, for both create and
 * update, so validation and business logic can't drift apart.
 */
function resolveName(type, name) {
  const trimmed = name && name.trim();
  if (type === COLLECTION_TYPES.OTHER) {
    if (!trimmed) {
      throw ApiError.badRequest('A custom collection name is required when type is "other"');
    }
    return trimmed;
  }
  return titleCase(type);
}

async function createCollection({ type, name, emergencyCallNumber }) {
  const resolvedName = resolveName(type, name);
  const collection = await Collection.create({ type, name: resolvedName, emergencyCallNumber });
  return collection;
}

async function listCollections(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.search) filter.name = { $regex: escapeRegex(query.search), $options: 'i' };

  const [items, total] = await Promise.all([
    Collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Collection.countDocuments(filter),
  ]);

  const itemsWithCounts = await Promise.all(items.map(async item => {
    const userCount = await User.countDocuments({collectionId: item._id, deletedAt: null});
    return {...item.toObject(), userCount};
  }));

  return { items: itemsWithCounts, meta: buildPaginationMeta({ page, limit, total }) };
}

async function getCollectionById(id) {
  const collection = await Collection.findById(id);
  if (!collection) {
    throw ApiError.notFound('Collection not found');
  }
  return collection;
}

async function updateCollection(id, updates) {
  const collection = await getCollectionById(id);

  const nextType = updates.type !== undefined ? updates.type : collection.type;
  const nextNameInput = updates.name !== undefined ? updates.name : collection.name;
  const resolvedName = resolveName(nextType, nextNameInput);

  collection.type = nextType;
  collection.name = resolvedName;
  if (updates.emergencyCallNumber !== undefined) {
    collection.emergencyCallNumber = updates.emergencyCallNumber;
  }

  await collection.save();
  return collection;
}

module.exports = { createCollection, listCollections, getCollectionById, updateCollection };
