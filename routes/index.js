const express = require('express');
const authController = require('../controllers/auth');
const orderController = require('../controllers/order');
const {body} = require('express-validator');
const authMiddleware = require('../middlewares/auth-middleware');

const router = express.Router()

router.post('/registration',
        body('password').isLength({min: 3, max: 32}),
        authController.registration);

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/refresh', authController.refresh);
router.post('/orders', authMiddleware, orderController.getAllOrders);
router.get('/orders/:id', authMiddleware, orderController.getOrderById); // cash
router.post('/orders/:id', authMiddleware, orderController.changeOrderStatus);
router.get('/ordersinwork/:type', authMiddleware, orderController.getAllOrdersInWork);
router.get('/ordersinwork/:userEmail', authMiddleware, orderController.getOrderByUser); // getOrderInWorkByUser  
router.post('/orderinwork/:id', authMiddleware, orderController.setOrderInWork);
router.delete('/orderinwork/:id', authMiddleware, orderController.removeOrderFromWork);
router.post('/orders/:id/changebody', authMiddleware, orderController.changeOrderBody);

module.exports = router
