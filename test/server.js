import http from 'http';
import assert from 'assert';

import '../server.js';

describe('Node Scaffold', () => {
  it('should return 200', done => {
    http.get('http://127.0.0.1:9000', res => {
      assert.equal(200, res.statusCode);
      done();
    });
  });
});
