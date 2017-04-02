import express from 'express';
import util from 'util';
import { logger } from './middleware';
import WebTorrent from 'webtorrent';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import jade from 'jade';
import archiver from 'archiver';

import google from 'googleapis';
import googleAuth from 'google-auth-library';

// Google integration

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/drive-nodejs-quickstart.json
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_DIR = (process.env.HOME ||
                   process.env.HOMEPATH ||
                   process.env.USERPROFILE) + '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'wtorrent.json';

let oauth2Client;

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  generateClient(credentials);

  getNewToken(oauth2Client, callback);
}

function login(credentials, callback) {
  generateClient(credentials);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      console.log('get new token');
      getNewToken(oauth2Client, callback);
    } else {
      console.log('token found');
      oauth2Client.credentials = JSON.parse(token);
      callback(null);
    }
  });
}

function generateClient(credentials) {
  const REDIRECT_PATH = process.env.NODE_ENV === 'production' ?
                       'https://wtorrent.herokuapp.com/auth' :
                       'http://localhost:9000/auth';
  const clientSecret = credentials.web.client_secret;
  const clientId = credentials.web.client_id;
  const auth = new googleAuth();
  oauth2Client = new auth.OAuth2(clientId, clientSecret, REDIRECT_PATH);
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
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

// END Google integration

const app = express();
const PORT = process.env.PORT || 9000;
const client = new WebTorrent();
let timeout = 1000;

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: false })); // for parsing application/x-www-form-urlencoded
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');

function download(link, cb) {
  
  client.on('error', function (err) {
    console.log(err);
    cb(err);
  });

  client.add(link, function(torrent) {
    const message = 'Client is downloading: ' + torrent.name;
    console.log(message);
    cb(message);
    timeout = 1000;

    torrent.on('download', function(chunkSize){
      console.log('chunk size: ' + chunkSize);
      console.log('total downloaded: ' + torrent.downloaded);
      console.log('download speed: ' + torrent.downloadSpeed);
      console.log('progress: ' + torrent.progress);
      console.log('======');
    });

    torrent.on('done', function(){
      uploadCompressed(torrent);
    });
  });
}

function upload(torrent) {
  const drive = google.drive({ version: 'v2', auth: oauth2Client });
  
  torrent.files.forEach(function(file){
    console.log('downloaded:  ' + file.name);
    
    drive.files.insert({
      resource: {
        title: file.name
      },
      media: {
        body: file.createReadStream()
      }
    }, function (err, response) {
      if (err) {
        console.log('error:', err);
        if (err.code === 403) return setTimeout(upload, timeout*10, torrent);
      }

      if (response) {
        console.log('Uploaded to drive:', file.name);
        deleteFile(file, torrent.path);
      }
    });         
  });
}

function uploadCompressed(torrent) {
  const drive = google.drive({ version: 'v2', auth: oauth2Client });
  const title = torrent.name + '.zip';

  // create a file to stream archive data to.
  var output = fs.createWriteStream(__dirname + '/' + title);
  var archive = archiver('zip', {
      zlib: { level: 0 } // Sets the compression level.
  });

  // listen for all archive data to be written
  output.on('close', function() {
    console.log(archive.pointer() + ' total bytes');
    console.log('archiver has been finalized and the output file descriptor has closed.');

    drive.files.insert({
      resource: {
        title: title
      },
      media: {
        body: fs.createReadStream(__dirname + '/' + title)
      }
    }, function (err, response) {
      if (err) {
        console.log('error:', err);
        if (err.code === 403) return setTimeout(uploadCompressed, timeout*10, torrent);
      }

      if (response) {
        console.log('Uploaded to drive:', title);
        
        torrent.files.forEach(function(file) {
          deleteFile(file, torrent.path);
        });
        
        fs.unlink(__dirname + '/' + title);
      }
    });
  });

  // pipe archive data to the file
  archive.pipe(output);

  torrent.files.forEach(function(file){
    console.log('compressing:  ' + file.name);

    const tFile = file.createReadStream();
    archive.append(tFile, { name: file.name });

  });

  archive.finalize();
}

function deleteFile(file, path) {
  const filePath = path + '/' + file.path;
  fs.unlink(filePath, err => {
    if (err) throw err;
    console.log('Successfully deleted ' + file.name);
  });
}

function getFileNames(path, cb) {
  fs.readdir(path, (err, files) => {
    if (err) throw err;
    
    // filter out the .keep file from the list
    let filteredFiles = files.filter(file => {
      if (file != '.keep') return file;
    });

    cb(filteredFiles);
  });
}

app.get('/', (req, res) => {
  // Load client secrets from a local file.
  fs.readFile('client_secret.json', (err, content) => {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return res.status(500).send('Error loading client secret file: ' + err);
    }
    
    // Authorize a client with the loaded credentials
    login(JSON.parse(content), (err, redirect) => {
      if (err) return res.status(500).send();
      
      if (redirect) return res.redirect(redirect);

      res.render('index');
    });
  });
});

app.get('/login', (req, res) => {
  // Load client secrets from a local file.
  fs.readFile('client_secret.json', (err, content) => {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return res.status(500).send('Error loading client secret file: ' + err);
    }
    
    // Authorize a client with the loaded credentials
    authorize(JSON.parse(content), (err, redirect) => {
      if (err) return res.status(500).send();
      
      if (redirect) return res.redirect(redirect);

      res.redirect('/');
    });
  });
});

app.get('/auth', (req, res) => {
  const { code } = req.query;
  console.log('auth token: ', code);

  oauth2Client.getToken(code, (err, token) => {
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
app.post('/torrent', logger, (req, res) => {
  const { torrent } = req.body;
  download(torrent, response => {
    res.render('index', { response });
  });

});

// Handle 404
app.use( (req, res, next) => {
  res.status(404).send('Sorry can\'t find that!');
});

// Handle errors
app.use( (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}...`);  
}); 
