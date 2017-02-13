#!/usr/bin/env node

var express = require('express');
var morgan = require('morgan');




var paths = {};
paths.base = process.env.FACTORIO_DIR || '/opt/factorio';
paths.saves = paths.base+'/saves';
paths.mods = paths.base+'/mods';


var app = express();

app.use(morgan('common'));
app.use('/saves', express.static(paths.saves));
app.use('/mods', express.static(paths.mods));
app.use('/static', express.static(__dirname+'/static'));


var admin = express.Router();
app.use('/', admin);



module.exports = app;

if (module == require.main) {
    var server = app.listen(process.env.PORT || 8000, ()=>{
        console.log('HTTP server is running on port %s', server.address().port);
    });
}
