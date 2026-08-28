const userService = require('./user.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const httpStatus = require('../../constants/httpStatus');

/**
 * POST /api/users
 * Only these fields are ever read from the body — `role` is never
 * extracted here, even if somehow present after validation.
 */
const createUser = asyncHandler(async (req, res) => {
  const { username, mobileNumber, password, email, collectionId } = req.body;
  const user = await userService.createUser({ username, mobileNumber, password, email, collectionId });
  ApiResponse.send(res, { statusCode: httpStatus.CREATED, message: 'User created', data: { user } });
});

const listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.listUsers(req.query);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Users retrieved', data: { users: items, meta } });
});

const listMyContacts = asyncHandler(async (req, res) => {
  const contacts = await userService.listContacts(req.user.id);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Contacts retrieved', data: {contacts}});
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const {username, mobileNumber, email, emergencyMessage} = req.body;
  const user = await userService.updateOwnProfile(req.user.id, {username, mobileNumber, email, emergencyMessage});
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'Profile updated', data: {user}});
});

/**
 * GET /api/users/:id
 * Returns exactly the fields the Admin Edit User form needs, with a
 * missing email naturally serialized as absent (never a placeholder).
 */
const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'User retrieved', data: { user } });
});

const updateUser = asyncHandler(async (req, res) => {
  const { username, mobileNumber, email } = req.body;
  const user = await userService.updateUser(req.params.id, { username, mobileNumber, email });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'User updated', data: { user } });
});

/**
 * PATCH /api/users/:id/password
 * Response data is always null — the new password/hash is never echoed
 * back, per spec.
 */
const setPassword = asyncHandler(async (req, res) => {
  await userService.setPassword(req.params.id, req.body.password);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Password updated', data: null });
});

const activateUser = asyncHandler(async (req, res) => {
  const user = await userService.activateUser(req.params.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'User activated', data: { user } });
});

const deactivateUser = asyncHandler(async (req, res) => {
  const user = await userService.deactivateUser(req.params.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'User deactivated', data: { user } });
});

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'User deleted', data: null });
});

module.exports = {
  createUser,
  listUsers,
  listMyContacts,
  updateMyProfile,
  getUser,
  updateUser,
  setPassword,
  activateUser,
  deactivateUser,
  deleteUser,
};
