'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _util = require('util');

var _util2 = _interopRequireDefault(_util);

var _middleware = require('./middleware');

var _webtorrent = require('webtorrent');

var _webtorrent2 = _interopRequireDefault(_webtorrent);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _jade = require('jade');

var _jade2 = _interopRequireDefault(_jade);

var _googleapis = require('googleapis');

var _googleapis2 = _interopRequireDefault(_googleapis);

var _googleAuthLibrary = require('google-auth-library');

var _googleAuthLibrary2 = _interopRequireDefault(_googleAuthLibrary);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Google integration

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/drive-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/drive.file'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'wtorrent.json';

var oauth2Client = void 0;

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var REDIRECT_PATH = process.env.NODE_ENV === 'production' ? 'https://wtorrent.herokuapp.com/auth' : 'http://localhost:9000/auth';
  var clientSecret = credentials.web.client_secret;
  var clientId = credentials.web.client_id;
  var auth = new _googleAuthLibrary2.default();
  oauth2Client = new auth.OAuth2(clientId, clientSecret, REDIRECT_PATH);

  // Check if we have previously stored a token.
  _fs2.default.readFile(TOKEN_PATH, function (err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(null);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });

  callback(null, authUrl);
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    _fs2.default.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  _fs2.default.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

// END Google integration

var app = (0, _express2.default)();
var PORT = process.env.PORT || 9000;
var client = new _webtorrent2.default();
var timeout = 1000;

app.use(_bodyParser2.default.json()); // for parsing application/json
app.use(_bodyParser2.default.urlencoded({ extended: false })); // for parsing application/x-www-form-urlencoded
app.use(_express2.default.static(__dirname + '/public'));
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');

function download(link, cb) {

  client.add(link, function (torrent) {
    var message = 'Client is downloading: ' + torrent.infoHash;
    console.log(message);
    cb(message);
    timeout = 1000;

    torrent.on('download', function (chunkSize) {
      console.log('chunk size: ' + chunkSize);
      console.log('total downloaded: ' + torrent.downloaded);
      console.log('download speed: ' + torrent.downloadSpeed);
      console.log('progress: ' + torrent.progress);
      console.log('======');
    });

    torrent.on('done', function () {
      upload(torrent);
    });
  });
}

function upload(torrent) {
  var drive = _googleapis2.default.drive({ version: 'v2', auth: oauth2Client });

  torrent.files.forEach(function (file) {
    console.log('  downloaded:  ' + file.name);

    drive.files.insert({
      resource: {
        title: file.name
      },
      media: {
        body: file.createReadStream() // read streams are awesome!
      }
    }, function (err, response) {
      if (err) {
        console.log('error:', err);
        if (err.code === 403) return setTimeout(upload, timeout * 10, torrent);
      }

      if (response) {
        console.log('Uploaded to drive:', response.id);
        deleteFile(file, torrent.path);
      }
    });
  });
}

function deleteFile(file, path) {
  var filePath = path + '/' + file.path;
  _fs2.default.unlink(filePath, function (err) {
    if (err) throw err;
    console.log('Successfully deleted ' + file.name);
  });
}

function getFileNames(path, cb) {
  _fs2.default.readdir(path, function (err, files) {
    if (err) throw err;

    // filter out the .keep file from the list
    var filteredFiles = files.filter(function (file) {
      if (file != '.keep') return file;
    });

    cb(filteredFiles);
  });
}

app.get('/', function (req, res) {
  // Load client secrets from a local file.
  _fs2.default.readFile('client_secret.json', function (err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return res.status(500).send('Error loading client secret file: ' + err);
    }

    // Authorize a client with the loaded credentials
    authorize(JSON.parse(content), function (err, redirect) {
      if (err) return res.status(500).send();

      if (redirect) return res.redirect(redirect);

      res.render('index');
    });
  });
});

app.get('/auth', function (req, res) {
  var code = req.query.code;

  console.log('auth token: ', code);

  oauth2Client.getToken(code, function (err, token) {
    if (err) {
      console.log('Error while trying to retrieve access token', err);
      return res.status(500).send('Error while trying to retrieve access token');
    }

    console.log('Token granted');

    oauth2Client.credentials = token;
    storeToken(token);
    res.redirect('/');
  });
});

// POST /torrent
app.post('/torrent', _middleware.logger, function (req, res) {
  var torrent = req.body.torrent;

  download(torrent, function (response) {
    res.render('index', { response: response });
  });
});

// GET /file
app.get('/file', _middleware.logger, function (req, res) {
  var files = getFileNames(DOWNLOAD_PATH, function (files) {
    res.render('index', { files: files });
  });
});

// GET /file/:name
app.get('/file/:name', _middleware.logger, function (req, res, next) {
  var name = req.params.name;


  var options = {
    root: __dirname + '/downloads/',
    dotfiles: 'deny',
    headers: {
      'x-timestamp': Date.now(),
      'x-sent': true
    }
  };

  res.sendFile(name, options, function (err) {
    if (err) {
      console.log(err);
      res.status(err.status).end();
    } else {
      console.log('Sent:', name);
    }
  });
});

// DELETE /file/:name
app.delete('/file/:name', _middleware.logger, function (req, res) {
  var name = req.params.name;

  var path = DOWNLOAD_PATH + name;
  _fs2.default.unlink(path, function (err) {
    if (err) throw err;
    console.log('Successfully deleted ' + name);
    res.status(200).send('Successfully deleted ' + name);
  });
});

// Handle 404
app.use(function (req, res, next) {
  res.status(404).send('Sorry can\'t find that!');
});

// Handle errors
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, function () {
  console.log('Listening on port ' + PORT + '...');
});