const express = require('express');
const authController = require('../controllers/auth');
const orderController = require('../controllers/order');
const demandController = require('../controllers/demand');
const {body} = require('express-validator');
const authMiddleware = require('../middlewares/auth-middleware');

const router = express.Router()

// Auth
router.post('/registration', body('password').isLength({min: 3, max: 32}), authController.registration);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/refresh', authController.refresh);

// Order
router.post('/orders/changestatus/:id', authMiddleware, orderController.changeStatus); // patch // good
router.post('/ordersinwork', authMiddleware, orderController.getOrdersInWorkByUser); // get // good
router.post('/orders/waitinglist', authMiddleware, orderController.addToWaitingList); // good
router.post('/orders/getnew', authMiddleware, orderController.getNewOrder); // good
router.get('/orders', authMiddleware, orderController.getAllOrders); // good
router.get('/orders/:id', authMiddleware, orderController.getOrderById); // cash // good
router.get('/demands/:orderNumber', authMiddleware, orderController.getOrderByScan); // cash // url = /order/:orderNumber // good
router.get('/ordersinwork', authMiddleware, orderController.getAllOrdersInWork); // get orders (all entities) from cache // good
router.patch('/ordersinwork/:id/update_selected_rows', authMiddleware, orderController.updateSelectedRows); // good
router.delete('/orderinwork/:id', authMiddleware, orderController.removeOrderFromWork); // good

// Demand
router.patch('/demand/changestatus/:id', authMiddleware, demandController.changeStatus); // url = /demand/:id
router.patch('/demand/inwork/:id/update_selected_rows', authMiddleware, demandController.updateSelectedRows); // url = /demand/inwork/:id/ OR /demand/:id/
router.post('/demand/waitinglist', authMiddleware, demandController.addToWaitingList); // url = /demand/:id/waitinglist
router.post('/demand/getnew', authMiddleware, demandController.getNewDemand); // url = /demand
router.get('/demand', authMiddleware, demandController.getAllDemands);
router.get('/demand/:id', authMiddleware, demandController.getDemandById); // cash
router.post('/demand/inwork', authMiddleware, demandController.getDemandsInWorkByUser);
router.delete('/demand/inwork/:id', authMiddleware, demandController.removeOrderFromWork);

// Employee
router.get('/users', authMiddleware, orderController.getAllEmployees);
router.patch('/ordersinwork/change/employee', authMiddleware, orderController.changeOrderResponsibleEmployee);


module.exports = router
