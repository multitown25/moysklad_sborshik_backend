const mysql = require('mysql2/promise');
const config = require('../config');

const zapros = "SELECT customerorder.id, customerorder.name, customerorder.created, deliver.value 'Способ доставки NEW', customerorder.description, pos.assortment, assortment.name, assortment.article, pos.quantity, assortment.ean13, assortment.type, assortment.miniature FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id and deliver.name = 'Способ доставки NEW' JOIN customerorder_positions pos ON customerorder.id = pos.customerorder_id LEFT JOIN (SELECT 'product' as 'type', product.id, product.name, product.article, barcodes.ean13, images.miniature FROM product LEFT JOIN images on product.id = images.product_id LEFT JOIN barcodes on product.id = barcodes.product_id UNION ALL SELECT 'variant' as 'type', variant.id, variant.name, product.article, barcodes.ean13, images.miniature FROM variant JOIN product on product.id = variant.product LEFT JOIN images on variant.id = images.variant_id LEFT JOIN barcodes on variant.id = barcodes.variant_id UNION ALL SELECT 'bundle' as 'type', bundle.id, bundle.name, bundle.article, barcodes.ean13, images.miniature FROM bundle LEFT JOIN images on bundle.id = images.bundle_id   LEFT JOIN barcodes on bundle.id = barcodes.bundle_id UNION ALL SELECT 'service' as 'type', service.id, service.name, '' as article, '' as ean13, '' as miniature FROM service) as assortment on assortment.id = pos.assortment JOIN states on states.id = customerorder.state JOIN store on store.id = customerorder.store WHERE store.name = 'Казань, склад А' AND states.name = 'НА СБОРКЕ'"

async function test() {
    try {
        const neededStatus = 'TEST STATUS'
        const orderId = '5f7774dd-73cc-11ee-0a80-0284001c953f';
        const query = `SELECT customerorder.id as 'orderId', customerorder.name as 'orderName', customerorder.created, customerorder.description, deliver.value as 'delivery', pos.assortment as 'assortmentId', assortment.name as 'assortmentName', assortment.article, pos.quantity, assortment.ean13, assortment.type, assortment.miniature FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id and deliver.name = 'Способ доставки NEW' JOIN customerorder_positions pos ON customerorder.id = pos.customerorder_id LEFT JOIN ( SELECT 'product' as 'type', product.id, product.name, product.article, barcodes.ean13, max(images.miniature) as miniature FROM product LEFT JOIN images on product.id = images.product_id LEFT JOIN barcodes on product.id = barcodes.product_id group by  'type', product.id, product.name, product.article, barcodes.ean13 UNION ALL SELECT 'variant' as 'type', variant.id, variant.name, product.article, barcodes.ean13, max(images.miniature) as miniature FROM variant JOIN product on product.id = variant.product LEFT JOIN images on variant.id = images.variant_id LEFT JOIN barcodes on variant.id = barcodes.variant_id group by 'type', variant.id, variant.name, product.article, barcodes.ean13 UNION ALL SELECT 'bundle' as 'type', bundle.id,  bundle.name, bundle.article, barcodes.ean13, max(images.miniature) as miniature FROM bundle LEFT JOIN images on bundle.id = images.bundle_id   LEFT JOIN barcodes on bundle.id = barcodes.bundle_id group by 'type', bundle.id, bundle.name, bundle.article, barcodes.ean13 UNION ALL SELECT 'service' as 'type', service.id, service.name, '' as article, '' as ean13, '' as miniature FROM service ) as assortment on assortment.id = pos.assortment WHERE customerorder.id = '${orderId}'`
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
                        imageHref: item.miniature
                    }
                })
            }
        } else {
            order = null;
        }


        // const query = `SELECT customerorder.id, customerorder.name, customerorder.created, deliver.value 'Способ доставки NEW', customerorder.description FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id and deliver.name = 'Способ доставки NEW' JOIN states on states.id = customerorder.state JOIN store on store.id = customerorder.store WHERE store.name = 'Казань, склад А' AND states.name = '${neededStatus}'`
        // const connection = await mysql.createConnection(config.db);
        // const [results, fields] = await connection.execute(query);

        console.log(order);

        return order;
    } catch (error) {
        console.log(error);
    }
}

test();

