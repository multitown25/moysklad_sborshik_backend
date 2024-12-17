const OrderModel = require('../models/order-model');

class OrderService {
    async addToDB(userEmail, orderId, orderName) {
        try {
            const order = await OrderModel.create({
                userEmail,
                orderId,
                order: orderName
            });

            return order;

        } catch (error) {
            throw error;
        }
    }

    async getAllProcessedOrders() {
        try {
            const orders = await OrderModel.find();

            return orders;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new OrderService();