const collectionService = require('./collection.service');
const userService = require('../users/user.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const httpStatus = require('../../constants/httpStatus');

const createCollection = asyncHandler(async (req, res) => {
  const { type, name, emergencyCallNumber } = req.body;
  const collection = await collectionService.createCollection({ type, name, emergencyCallNumber });
  ApiResponse.send(res, { statusCode: httpStatus.CREATED, message: 'Collection created', data: { collection } });
});

const listCollections = asyncHandler(async (req, res) => {
  const { items, meta } = await collectionService.listCollections(req.query);
  ApiResponse.send(res, {
    statusCode: httpStatus.OK,
    message: 'Collections retrieved',
    data: { collections: items, meta },
  });
});

const getCollection = asyncHandler(async (req, res) => {
  const collection = await collectionService.getCollectionById(req.params.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Collection retrieved', data: { collection } });
});

const updateCollection = asyncHandler(async (req, res) => {
  const { type, name, emergencyCallNumber } = req.body;
  const collection = await collectionService.updateCollection(req.params.id, { type, name, emergencyCallNumber });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Collection updated', data: { collection } });
});

/**
 * GET /api/collections/:id/users
 * "Manage users inside a collection" is served by reusing
 * user.service.listUsers scoped to this collection, rather than
 * duplicating query/pagination logic here.
 */
const listCollectionUsers = asyncHandler(async (req, res) => {
  await collectionService.getCollectionById(req.params.id); // 404s if the collection doesn't exist
  const { items, meta } = await userService.listUsers({ ...req.query, collectionId: req.params.id });
  ApiResponse.send(res, {
    statusCode: httpStatus.OK,
    message: 'Collection users retrieved',
    data: { users: items, meta },
  });
});

module.exports = { createCollection, listCollections, getCollection, updateCollection, listCollectionUsers };
