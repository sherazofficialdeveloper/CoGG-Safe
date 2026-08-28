const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validateRequest = require('../../middlewares/validateRequest');
const { ROLES } = require('../../constants/roles');
const {
  createCollectionValidation,
  updateCollectionValidation,
  collectionIdParamValidation,
  listCollectionsValidation,
  listCollectionUsersValidation,
} = require('./collection.validation');
const collectionController = require('./collection.controller');

const router = express.Router();

// Every route in this module is Admin-only.
router.use(authenticate, authorize(ROLES.ADMIN));

router.post('/', createCollectionValidation, validateRequest, collectionController.createCollection);
router.get('/', listCollectionsValidation, validateRequest, collectionController.listCollections);
router.get('/:id', collectionIdParamValidation, validateRequest, collectionController.getCollection);
router.patch('/:id', updateCollectionValidation, validateRequest, collectionController.updateCollection);
router.get('/:id/users', listCollectionUsersValidation, validateRequest, collectionController.listCollectionUsers);

module.exports = router;
