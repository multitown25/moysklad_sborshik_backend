const $api = require('../http/index');
const OrderModel = require('../models/order-model');

const states = new Map([
    ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/beaf29eb-b0fd-11ed-0a80-02dc0038a0e5'],
    ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/3ffc2d79-bb34-11ed-0a80-0cd400212101']
])

class OrderController {
    async getAllOrders(req, res, next) {
        try {
            const url = 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder?filter=state.name=TEST STATUS';
            const result = await $api.get(url);
            res.json(result.data.rows);
        } catch (error) {
            next(error);
        }
    }

    async getOrderById(req, res, next) {
        try {
            console.log(req.params)
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${req.params['id']}?expand=positions.meta.href`;
            console.log("URL");
            console.log(url)
            const result = await $api.get(url);
            res.json(result.data);
        } catch (error) {
            next(error);
        }
    }

    async getPositionsByOrderId(req, res, next) {
        try {
            console.log(req.params)
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${req.params['id']}/positions`;
            console.log("URL");
            console.log(url)
            const result = await $api.get(url);
            res.json(result.data);
        } catch (error) {
            next(error);
        }
    }
    
    async getPosition(req, res, next) {
        try {
            console.log(req.params)
            const url = req.params['href'];
            console.log("URL");
            console.log(url)
            const result = await $api.get(url);
            res.json(result.data);
        } catch (error) {
            next(error);
        }
    }

    async getImages(req, res, next) {
        try {
            console.log(req.params)
            const url = req.body.imgURL;
            console.log("GET IMAGES");
            console.log(url)
            const result = await $api.get(url);
            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async getImage(req, res, next) {
        try {
            console.log(req.params)
            const url = req.body.imgURL;
            console.log("GET IMAGE");
            // console.log(url)
            const result = await $api.get(url);
            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async getBundleComponents(req, res, next) {
        try {
            console.log(req.params)
            const bundleId = req.params.id;
            console.log("GET BUNDLE COMPONENTS");
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/bundle/${bundleId}/components?expand=assortment.meta`
            // console.log(url)
            const result = await $api.get(url);
            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async changeOrderStatus(req, res, next) {
        try {
            console.log(req.params)
            const orderId = req.params.id;
            const statusName = req.body.statusName
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${orderId}`;
            console.log(url);
            const statusHref = states.get(statusName);
            console.log(statusHref);
            console.log("CHANGE STATUS NAME ON " + statusName);
            // console.log(url)
            const result = await $api.put(url, {
                state: {
                    meta: {
                        href: statusHref,
                        type: 'state',
                        mediaType: "application/json"
                    }
                }
            });
            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async changeOrderBody(req, res, next) {
        try {
            console.log(req.params)
            const orderId = req.params.id;
            const userEmail = req.body.userEmail
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${orderId}`;
            console.log(url);
            const attributeSborshik = await $api.get(url).then(data => data.data.attributes.find(item => item.name === "Сборщик").meta);
            console.log(attributeSborshik)
            const result = await $api.put(url, {
                attributes: [
                    {
                        meta: attributeSborshik,
                        value: userEmail
                    }
                ]
            });
            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async getAllOrdersInWork(req, res, next) {
        try {
            console.log(req.params)
            // const orderId = req.params.id;
            const order = await OrderModel.find();
            res.json(order);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async getOrderByUser(req, res, next) {
        try {
            console.log(req.params)
            const userEmail = req.params.userEmail;
            const order = await OrderModel.findOne({userEmail: userEmail});
            res.json(order);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async setOrderInWork(req, res, next) {
        try {
            const orderId = req.params.id;
            const userEmail = req.body.userEmail;
            const orderName = req.body.orderName;
            const orderData = await OrderModel.create({userEmail: userEmail, orderId, order: orderName});
            res.json(orderData);
        } catch (error) {
            next(error);
        }
    }

    async removeOrderFromWork(req, res, next) {
        try {
            const orderId = req.params.id;
            // const userId = req.body.userId;
            console.log(orderId)
            const orderData = await OrderModel.findOneAndDelete({orderId});
            console.log(orderData);
            res.json(orderData);
        } catch (error) {
            next(error);
        } 
    }
}

module.exports = new OrderController();