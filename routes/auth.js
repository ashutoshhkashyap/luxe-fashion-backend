// routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const ctrl   = require('../controllers/authController');
const auth   = require('../middleware/auth');
const router = express.Router();

router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').isEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  ],
  ctrl.register
);
router.post('/login',
  [
    body('email').isEmail(),
    body('password').notEmpty(),
  ],
  ctrl.login
);
router.post('/admin/login', ctrl.adminLogin);
router.get('/profile',       auth, ctrl.getProfile);
router.put('/profile',       auth, ctrl.updateProfile);

module.exports = router;
