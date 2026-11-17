// Shared by the unit tests and the child-process workers; ES5 so Node 0.8 runs it as is.
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var verifySha256 = require('staged-cache').verifySha256;

var CONTENT = 'pinned artifact contents\n';
var FOLDER_FILES = { 'a.txt': 'alpha\n', 'b.txt': 'beta\n', 'c.txt': 'gamma\n' };

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// A file job: build writes the file after a delay, as a download would.
function fileSteps(counter, delay) {
  return {
    verify: verifySha256(sha(CONTENT)),
    build: function (staging, cb) {
      counter.builds++;
      setTimeout(function () {
        fs.writeFile(staging, CONTENT, cb);
      }, delay || 0);
    },
  };
}

// A folder job: build writes several files; verify checks each file's hash, as a corpus or checkout check would.
function folderSteps(counter, delay) {
  var names = Object.keys(FOLDER_FILES);
  return {
    verify: function (dir, cb) {
      var i = 0;
      (function next() {
        if (i >= names.length) return cb(null, true);
        var name = names[i++];
        verifySha256(sha(FOLDER_FILES[name]))(path.join(dir, name), function (err, valid) {
          if (err) return cb(err);
          if (!valid) return cb(null, false);
          next();
        });
      })();
    },
    build: function (staging, cb) {
      counter.builds++;
      fs.mkdir(staging, function (err) {
        if (err) return cb(err);
        var i = 0;
        (function next() {
          if (i >= names.length) return setTimeout(cb, delay || 0);
          var name = names[i++];
          fs.writeFile(path.join(staging, name), FOLDER_FILES[name], function (err) {
            err ? cb(err) : next();
          });
        })();
      });
    },
  };
}

module.exports = { CONTENT: CONTENT, FOLDER_FILES: FOLDER_FILES, sha: sha, fileSteps: fileSteps, folderSteps: folderSteps };
