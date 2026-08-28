const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validateRequest = require('../../middlewares/validateRequest');
const { ROLES } = require('../../constants/roles');
const {
  createUserValidation,
  updateUserValidation,
  setPasswordValidation,
  userIdParamValidation,
  listUsersValidation,
  updateMyProfileValidation,
} = require('./user.validation');
const userController = require('./user.controller');

const router = express.Router();

router.patch('/me', authenticate, updateMyProfileValidation, validateRequest, userController.updateMyProfile);

// Management routes are Admin-only. The /me route above is the sole
// authenticated self-service profile endpoint.
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/', createUserValidation, validateRequest, userController.createUser);
router.get('/', listUsersValidation, validateRequest, userController.listUsers);
router.get('/:id', userIdParamValidation, validateRequest, userController.getUser);
router.patch('/:id', updateUserValidation, validateRequest, userController.updateUser);
router.patch('/:id/password', setPasswordValidation, validateRequest, userController.setPassword);
router.patch('/:id/activate', userIdParamValidation, validateRequest, userController.activateUser);
router.patch('/:id/deactivate', userIdParamValidation, validateRequest, userController.deactivateUser);
router.delete('/:id', userIdParamValidation, validateRequest, userController.deleteUser);

module.exports = router;
