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
    // get polling settings for releasing connection
    const releaseMaxRetries = getConfigParam(poolConfig, 'releaseMaxRetries', 60);
    const releaseInterval = getConfigParam(poolConfig, 'releaseInterval', 1000);
    // create database connection pool (promise)
    const pool = oracledb.createPool(poolConfig);
    // Ask for initial connection to test connectivity and warm up the pool
    pool.then(pool => pool.getConnection().then(conn => conn.close()));
    // return middleware function
    return function (req, res, next) {
        // get connection from pool and put promise on request (as request.connection)
        const conn = req.connection = pool.then(pool => pool.getConnection())
        // release connection at end of request
        const close = (req, res, next) => {
            conn
                // after break, releasing connection keeps failing with
                // NJS-032: connection cannot be released because a database call is in progress
                // see https://github.com/oracle/node-oracledb/issues/671
                // .then(c => c.break())
                .then(c => new Promise((resolve, reject) => {
                    // try to close connection
                    let attempts = 0;
                    const ival = setInterval(() => {
                        c.close()
                            .then(() => {
                                clearInterval(ival);
                                resolve();
                            })
                            .catch(e => {
                                attempts++;
                                if (attempts > releaseMaxRetries) {
                                    clearInterval(ival);
                                    reject(e);
                                }
                            })
                    }, releaseInterval);
                }))
                .catch(err => console.error('error releasing database connection', err))
        }
        res.once('finish', close);
        res.once('close', close);
        next();
    }
}

function getConfigParam(config, key, dflt) {
    return typeof config[key] !== 'undefined' ? config[key] : dflt;
}
