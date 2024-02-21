const $api = require('../http/index');
const OrderModel = require('../models/order-model');
const config = require('../config');
const mysql = require('mysql2/promise');

const states = new Map([
    ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/beaf29eb-b0fd-11ed-0a80-02dc0038a0e5'],
    ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/3ffc2d79-bb34-11ed-0a80-0cd400212101'],
    ['НА УПАКОВКЕ', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/45070416-c1ac-11ee-0a80-07e3000021ff']
])

let requestCounter = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function DoNeedTimeout() {
    if (requestCounter >= 45) {
        console.log('WE ARE SLEEPING')
        await sleep(3200);
        requestCounter = 0;
        console.log('WE WOKE UP')
    }
}

class OrderController {
    async getAllOrders(req, res, next) {
        try {
            const neededStatus = req.body.status;
            const query = `SELECT customerorder.id, customerorder.name, customerorder.created, deliver.value 'Способ доставки NEW', customerorder.description FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id and deliver.name = 'Способ доставки NEW' JOIN states on states.id = customerorder.state JOIN store on store.id = customerorder.store WHERE store.name = 'Казань, склад А' AND states.name = '${neededStatus}'`
            const connection = await mysql.createConnection(config.db);
            const [results, fields] = await connection.execute(query);
            console.log(results);

            res.json(results)
        } catch (error) {
            next(error);
        }
    }

    async getOrderById(req, res, next) {
        try {
            const orderId = req.params['id'];
            const query = `SELECT customerorder.id AS 'orderId', customerorder.name AS 'orderName', customerorder.created, customerorder.description, deliver.value AS 'delivery', pos.assortment AS 'assortmentId', assortment.name AS 'assortmentName', assortment.article, pos.quantity, assortment.ean13, assortment.type, assortment.miniature FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id AND deliver.name = 'Способ доставки NEW' JOIN customerorder_positions pos ON customerorder.id = pos.customerorder_id LEFT JOIN (SELECT 'product' AS 'type', product.id, product.name, product.article, barcodes.ean13, MIN(images.miniature) AS miniature FROM product LEFT JOIN images ON product.id = images.product_id LEFT JOIN barcodes ON product.id = barcodes.product_id GROUP BY 'type', product.id, product.name, product.article, barcodes.ean13 UNION ALL SELECT 'variant' AS 'type', variant.id, variant.name, case when MAX(characteristics.value) is null then product.article else CONCAT(product.article, ' ', MAX(characteristics.value)) end as article, barcodes.ean13, MIN(images.miniature) AS miniature FROM variant JOIN product ON product.id = variant.product LEFT JOIN images ON variant.id = images.variant_id LEFT JOIN characteristics ON characteristics.variant_id = variant.id LEFT JOIN barcodes ON variant.id = barcodes.variant_id GROUP BY 'type', variant.id, variant.name, product.article, barcodes.ean13 UNION ALL SELECT 'bundle' AS 'type', bundle.id, bundle.name, bundle.article, barcodes.ean13, MIN(images.miniature) AS miniature FROM bundle LEFT JOIN images ON bundle.id = images.bundle_id LEFT JOIN barcodes ON bundle.id = barcodes.bundle_id GROUP BY 'type', bundle.id, bundle.name, bundle.article, barcodes.ean13 UNION ALL SELECT 'service' AS 'type', service.id, service.name, '' AS article, '' AS ean13, '' AS miniature FROM service) AS assortment ON assortment.id = pos.assortment WHERE customerorder.id = '${orderId}'`
            const connection = await mysql.createConnection(config.db);
            const [results, fields] = await connection.execute(query);

            let order;
            if (results.length > 0) {
                order = {
                    id: results[0].orderId,
                    name: results[0].orderName,
                    created: results[0].created,
                    delivery: results[0].delivery,
                    description: results[0].description,
                    positions: results.map(item => {
                        return {
                            id: item.assortmentId,
                            name: item.assortmentName,
                            article: item.article,
                            quantity: item.quantity,
                            barcode: item.ean13,
                            type: item.type,
                            image: item.miniature
                        }
                    })
                }

                order.positions = order.positions.filter(item => item.name != "Доставка");
                
            } else {
                order = null;
            }
          
            console.log(order);
            res.json(order);
        } catch (error) {
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
            requestCounter++;
            await DoNeedTimeout();
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

            const result = await $api.put(url, {
                attributes: [
                    {
                        meta: {
                            "href": "https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/attributes/f1917566-1c0d-11ee-0a80-13cb002a779d",
                            "type": "attributemetadata",
                            "mediaType": "application/json"
                        },
                        value: userEmail
                    }
                ]
            });
            requestCounter++;
            await DoNeedTimeout();
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
            requestCounter++;
            await DoNeedTimeout();
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
            const order = await OrderModel.findOne({ userEmail: userEmail });
            requestCounter++;
            await DoNeedTimeout();
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
            const orderData = await OrderModel.create({ userEmail: userEmail, orderId, order: orderName });
            requestCounter++;
            await DoNeedTimeout();
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
            const orderData = await OrderModel.findOneAndDelete({ orderId });
            requestCounter++;
            await DoNeedTimeout();
            console.log(orderData);
            res.json(orderData);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OrderController();
