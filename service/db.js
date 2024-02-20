const redis = require('redis');

const client = redis.createClient();

client.on('error', (err) => {console.log(err)});

(async () => {
    await client.connect();

    await client.hSet('user1', {
        name: "Ramazan",
        lastname: "Zinurov"
    });
    const value = await client.hGetAll('user1');

    console.log(value);
})();
