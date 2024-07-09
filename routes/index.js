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
router.post('/orders/changestatus/:id', authMiddleware, orderController.changeOrderStatus);
router.post('/ordersinwork', authMiddleware, orderController.getOrdersByUser); // getOrderInWorkByUser
// router.post('/orderinwork/:id', authMiddleware, orderController.setOrderInWork);
// router.post('/orders/changebody/:id', authMiddleware, orderController.changeOrderBody);
router.post('/orders/waitinglist', authMiddleware, orderController.addToWaitingList);
router.post('/orders/getnew', authMiddleware, orderController.getNewOrder);

router.get('/refresh', authController.refresh);
router.get('/orders', authMiddleware, orderController.getAllOrders);
router.get('/orders/:id', authMiddleware, orderController.getOrderById); // cash
router.get('/demands/:orderNumber', authMiddleware, orderController.getDemandsByOrderNumber); // cash
router.get('/ordersinwork', authMiddleware, orderController.getAllOrdersInWork);
router.get('/users', authMiddleware, orderController.getAllEmployees);

router.patch('/ordersinwork/:id/update_selected_rows', authMiddleware, orderController.updateSelectedRows);
router.patch('/ordersinwork/change/employee', authMiddleware, orderController.changeOrderResponsibleEmployee);
router.delete('/orderinwork/:id', authMiddleware, orderController.removeOrderFromWork);


module.exports = router
