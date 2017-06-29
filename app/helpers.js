var config = require('./config');
var crypto = require('crypto');
var fs = require('fs');
var sanitizeHtml = require('sanitize-html');

var HelperMethods = {
  redefineLog : function() {
    var util = require('util');

    var dir = config.logDir;
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }
    var logFile = fs.createWriteStream(dir + '/skylack.log.txt', { flags: 'a' });
    var warnFile = fs.createWriteStream(dir + '/skylack.log.warn.txt', { flags: 'a' });
    var errFile = fs.createWriteStream(dir + '/skylack.log.err.txt', { flags: 'a' });
    // Or 'w' to truncate the file every time the process starts.
    var logStdout = process.stdout;

    var date_str = function () {
      return new Date().toISOString()
          .replace(/T/, ' ')      // replace T with a space
          .replace(/\..+/, '') + ":  ";
    };

    console.old_log = console.log;
    console.old_error = console.error;
    console.old_warn = console.warn;

    console.log = function () {
      logFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      console.old_log(date_str() + util.format.apply(null, arguments));
    }
    console.error = function () {
      logFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      errFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      console.old_error(date_str() + util.format.apply(null, arguments));
    }
    console.warn = function () {
      logFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      warnFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      console.old_warn(date_str() + util.format.apply(null, arguments));
    }
  },

  loadDynamicConfig : function () {
      // load json config from file
     try {
       let json = fs.readFileSync(config.dynamicConfigFile);
       if (json) {
       config.massChannelsExcluded = JSON.parse(json);
       }
     } catch (e) {

     }
  }

};

module.exports = HelperMethods;
