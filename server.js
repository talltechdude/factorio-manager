#!/usr/bin/env node

var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var es = require('event-stream');
var vfs = require('vinyl-fs');
var Promise = require('bluebird');
var crypto = require('crypto');
var basicAuth = require('basic-auth');
var moment = require('moment');
var pug = require('pug');
var multer = require('multer');
var archiver = require('archiver');

var listFiles = Promise.promisify(function (path, mountPath, callback) {
    var files = [];
    vfs.src(path, {read: false})
    .pipe(es.through(function(file){
        file.dirname = mountPath;
        files.push(file);
    }, function(end){
        callback(null, files);
    }));
});
var transload = require('./lib/transload');

var paths = {};
paths.base = process.env.FACTORIO_DIR || '/opt/factorio';
paths.saves = paths.base+'/saves';
paths.mods = paths.base+'/mods';
paths.data = paths.base+'/data';

var salt = crypto.randomBytes(32);
var passwordHash = crypto.pbkdf2Sync(process.env.ADMIN_PASSWORD || '', salt, 10000, 512, 'sha512');

var app = express();

app.use(morgan('common'));
app.use('/saves', express.static(paths.saves));
app.use('/mods', express.static(paths.mods));
app.use('/static', express.static(__dirname+'/static'));


var admin = express.Router();
app.use('/', admin);

function sortTags(tags){
  var tagsf = ""
  for(i = 0; i < tags.length -1; i++){
    tagsf = tagsf + tags[i] + ",";
  };
  tagsf = tagsf + tags[i]
  return tagsf
}

admin.get('/', (req, res, next)=>{
  var fs = require("fs");
  var confi = fs.readFileSync(paths.data+'/server-settings.json');
  parsedConfig = JSON.parse(confi);
  parsedConfig.tags = sortTags(parsedConfig.tags)

    var saves = [];
    var mods = [];
    Promise.all([
        listFiles(paths.saves+'/*.zip', 'saves')
        .then((files)=>{
            saves = files;
        }),
        listFiles(paths.mods+'/*.zip', 'mods')
        .then((files)=>{
            mods = files;
        })
    ]).then(()=>{
        var options = {
            pretty: true,
            cache: process.env.NODE_ENV != 'debug'
	};
        adminTemplate = pug.compileFile(__dirname+'/admin.pug', options);
        context = {
            parsedConfig: parsedConfig,
            moment: moment,
            saves: saves,
            mods: mods
        };
        html = adminTemplate(context);
        res.send(html);
     });
});

admin.get('/modpackage', (req, res, next)=>{
  var zip = archiver('zip');
  //res.set('Content-Type', 'application/zip');
  res.attachment('mods.zip');
  zip.pipe(res);
  //zip.glob(paths.mods+'/*.zip');
  zip.bulk([
    { expand: true, cwd: paths.mods, src: ['*.zip'] }
  ]);

  zip.finalize();
});

admin.use((req, res, next)=>{
    // allow read-only methods
    if (['GET', 'HEAD', 'OPTIONS'].indexOf(req.method) !== -1) {
        return next();
    }
    // require password for other methods
    var user = basicAuth(req) || {pass: ''};
    crypto.pbkdf2(user.pass, salt, 10000, 512, 'sha512', (err, hash)=>{
        if (err) {
            return next(err);
        }
        if (Buffer.compare(hash, passwordHash) !== 0) {
            res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
            res.sendStatus(401);
        }
        // password was correct
        next();
    })
});

admin.post('/transload-mod', transload({dir: paths.mods}));

admin.post('/mods', (req, res, next)=>{
    var storage = multer.diskStorage({
        destination: (req, file, callback)=>{
            callback(null, paths.mods);
        },
        filename: (req, file, callback)=>{
            callback(null, file.originalname);
        }
    });
    var upload = multer({storage: storage}).single('file');
    upload(req, res, (err)=>{
        if (err) {
            return next(err);
        }
        res.setHeader('Refresh', '1;.')
        res.redirect(201, '.');
    });
});

//admin.use(runCommand.middleware);

admin.get('/version', (req, res, next)=>{
    res.runCommand(paths.exe, ['--version']);
});

admin.use(bodyParser.urlencoded({extended: false}));

module.exports = app;

if (module == require.main) {
    var server = app.listen(process.env.PORT || 8000, ()=>{
        console.log('HTTP server is running on port %s', server.address().port);
    });
}
