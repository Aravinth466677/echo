const express = require('express');
const router = express.Router();
const { register, login, authorityLogin } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/authority-login', authorityLogin);

module.exports = router;
