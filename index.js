const oracledb = require('oracledb');

// see pool parameters at https://github.com/oracle/node-oracledb/blob/master/doc/api.md#createpool
module.exports = function (poolConfig) {
    poolConfig = poolConfig || {};
    // take any ORACLEDB_* environment variable and add it as a key to poolConfig
    Object.keys(process.env)
        .filter(key => key.startsWith('ORACLEDB_'))
        .forEach(key => {
            let val = process.env[key];
            val = !isNaN(parseInt(val, 10)) ? parseInt(val, 10) : val;
            val = val === 'true' ? true : val === 'false' ? false : val;
            poolConfig[key.substring('ORACLEDB_'.length)] = val;
        });
    // create database connection pool (promise)
    const pool = oracledb.createPool(poolConfig);
    // return middleware function
    return function (req, res, next) {
        // get connection from pool and put promise on request (as request.connection)
        const conn = req.connection = pool.then(pool => pool.getConnection())
        // release connection at end of request
        const close = () => {
            console.log('have to close connection');
            conn
                .then(c => {
                    console.log('closing connction');
                    return c.close();
                })
                .then(() => console.log('closed'))
                .catch(err => console.error('oracledb', err))
        }
        res.once('finish', close);
        res.once('close', close);
        next();
        // next();
    }
}
