const
    restify = require('restify'),
    oracledb = require('oracledb'),
    oracledbMiddleware = require('./index'),
    server = restify.createServer();

server
    .use(oracledbMiddleware({
        poolPingInterval: 10,
        // poolIncrement: 2,
        // poolTimeout: 5
    }))
    .get('/test', (req, res, next) => {
        req.connection
            .then(conn => conn.execute(
                'begin dbms_lock.sleep(3); :ret := systimestamp || \'\'; end;',
                // 'begin :ret := systimestamp || \'\'; end;',
                {
                    ret: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                }
            ))
            .then(result => res.json(result.outBinds))
            .then(() => next())
            .catch(err => {
                console.error(new Date().toISOString(), 'GET error', err);
                next(new Error(err));
            })
    });

setInterval(() => {
    console.log('used:', oracledb.getPool().connectionsInUse, 'open:', oracledb.getPool().connectionsOpen);
}, 1000);

server.listen(process.env.PORT || 8080, () => {
    console.log('%s listening at %s', server.name, server.url);
});

// Ctrl-C doesn't kill node on Mac: workaround https://github.com/oracle/node-oracledb/issues/128
process.on('SIGINT', function () {
    process.kill(process.pid);
});
