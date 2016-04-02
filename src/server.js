import express from 'express';
import util from 'util';
import { logger } from './middleware';
import WebTorrent from 'webtorrent';
import bodyParser from 'body-parser';
import fs from 'fs';
import jade from 'jade';

const app = express();
const PORT = process.env.PORT || 9000;
const client = new WebTorrent();

const magnet = 'magnet:?xt=urn:btih:26EE69AD2B9BBCE723C2237D7DFB59F7597388CE';
const DOWNLOAD_PATH = __dirname + '/downloads/';

app.use(bodyParser.json()); // for parsing application/json
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');

function download(link, cb) {
  
  client.add(link, function(torrent) {
    const message = 'Client is downloading: ' + torrent.infoHash;
    console.log(message);
    cb(message);

    torrent.on('download', function(chunkSize){
      console.log('chunk size: ' + chunkSize);
      console.log('total downloaded: ' + torrent.downloaded);
      console.log('download speed: ' + torrent.downloadSpeed);
      console.log('progress: ' + torrent.progress);
      console.log('======');
    });

    torrent.on('done', function(){
      console.log('torrent finished downloading');

      torrent.files.forEach(function(file){
         console.log(file.name);
         file.getBuffer(function callback (err, buffer) {
          let path = DOWNLOAD_PATH + file.name;

          fs.writeFile(path, buffer, () => {
           console.log('file saved: ' + file.name); 
          });
        });
      });
    });
  });
}

function getFileNames(path, cb) {
  fs.readdir(path, (err, files) => {
    if (err) throw err;
    cb(files);
  });
}

app.get('/', (req, res) => {
	res.render('index');
});

// POST /magnet
app.post('/magnet', logger, (req, res) => {

  const { magnet } = req.body;

  download(magnet, response => {
    res.render('index', { response });
  });

});

// GET /file
app.get('/file', logger, (req, res) => {
  const files = getFileNames(DOWNLOAD_PATH, files => {
    res.render('index', { files });  
  });  
});

// GET /file/:name
app.get('/file/:name', logger, (req, res, next) => {

  const { name } = req.params;

  const options = {
    root: __dirname + '/downloads/',
    dotfiles: 'deny',
    headers: {
        'x-timestamp': Date.now(),
        'x-sent': true
    }
  };
 
  res.sendFile(name, options, err => {
    if (err) {
      console.log(err);
      res.status(err.status).end();
    }
    else {
      console.log('Sent:', name);
    }
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
