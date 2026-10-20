// Backend/src/routes/v2/postRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/authMiddleware');
const requireRole = require('../../middleware/requireRole');
const postController = require('../../controllers/postController');

const adminRouter = express.Router();
adminRouter.post('/', verifyToken, requireRole('admin'), postController.createPost);
adminRouter.get('/', verifyToken, requireRole('admin'), postController.getMyPosts);

const donorRouter = express.Router();
donorRouter.get('/', verifyToken, requireRole('donor'), postController.getFeed);

module.exports = {
  mounts: [
    { path: '/api/admin/posts', router: adminRouter },
    { path: '/api/donor/feed', router: donorRouter },
  ],
};
