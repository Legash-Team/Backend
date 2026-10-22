const express = require('express');
const verifyToken = require('../../middleware/authMiddleware');
const requireRole = require('../../middleware/requireRole');
const donationRecordController = require('../../controllers/donationRecordController');

const hospitalRouter = express.Router();
hospitalRouter.use(verifyToken, requireRole('hospital'));
hospitalRouter.get('/accepted', donationRecordController.listAcceptedDonors);
hospitalRouter.post('/', donationRecordController.createRecord);

const donorRouter = express.Router();
donorRouter.use(verifyToken, requireRole('donor'));
donorRouter.get('/', donationRecordController.getMyDonationHistory);

module.exports = {
  mounts: [
    { path: '/api/hospital/donation-records', router: hospitalRouter },
    { path: '/api/donor/donation-history', router: donorRouter },
  ],
};