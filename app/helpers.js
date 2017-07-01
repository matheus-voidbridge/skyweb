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

  // load/save `some` channels list
  loadDynamicConfig : function () {
      // load json config from file
     try {
       let json = fs.readFileSync(config.dynamicConfigFile);
       if (json) {
         let obj = JSON.parse(json);
         if (obj.channels && obj.mode) {
           config.massSomeChannels = obj.channels;
           config.partialSendMode = obj.mode;
         }
       }
     } catch (e) {

     }
  },
  saveDynamicConfig: function () {
    // save changes in file
    fs.truncate(config.dynamicConfigFile, 0, function() {
      let obj = {
        channels: config.massSomeChannels,
        mode: config.partialSendMode
      };
      fs.writeFile(config.dynamicConfigFile, JSON.stringify(obj, null, 2), function (err) {
        if (err) {
          return console.error("Error writing dynamic config file: " + err);
        }
      });
    });
  },

  loadIntegrateConfig : function () {
    // load json config from file
    try {
      let json = fs.readFileSync(config.integrateConfigFile);
      if (json) {
        config.integrate = JSON.parse(json);
        return true;
      }
    } catch (e) {
    }
    return false;
  },
  saveIntegrateConfig: function () {
    // save changes in file
    fs.truncate(config.integrateConfigFile, 0, function() {
      fs.writeFile(config.integrateConfigFile, JSON.stringify(config.integrate, null, 2), function (err) {
        if (err) {
          return console.error("Error writing integrate config file: " + err);
        }
      });
    });
  },
  updateIntegrateChannels: function () {
    config.integrateSlack = {};
    Object.keys(config.integrate).forEach(function (skypeName) {
      let slackName = config.integrate[skypeName];
      if (slackName.indexOf('#') === 0) slackName = config.channelsByName[slackName.substring(1)];
      if (slackName) {
        config.integrateSlack[slackName] = skypeName;
        config.integrate[skypeName] = slackName;
      }
    });
  },

  processConfigCommands: function (command) {
    var parseCh = function (text) {
      let st = text.lastIndexOf('<#');
      let i = text.indexOf('|', st);
      if (st !== -1 && i !== -1 && st < i) return text.substring(st + 2, i).toUpperCase(); else return '';
    };

    let channel = parseCh(command);
    let parts = command.trim().toLowerCase().split(' ');
    //console.log(parts, channel);
    if (parts[1] == "all") {
      if ((parts[0] == "add" || parts[0] == "change") && parts.length == 4 && channel) {
        // (add|change) all (skype|#slack) (#slack|skype)
        let sky = (parts[3].indexOf('<#') == 0)? 2 : 3;
        let action = (config.integrate[parts[sky]])? "changed" : "added";
        // check for existing #channel, then change sky for it
        if (config.integrateSlack[channel]) {
          delete config.integrate[config.integrateSlack[channel]];
          action = "changed";
        }
        // add/change record
        config.integrate[parts[sky]] = channel;
        return this.savePrintIntegrate("_" + action + " " + parts[sky] + " to #" + config.channelsById[channel] + "_");
      } else if (parts[0] == "del" && parts.length == 3) {
        // del all #slack_channel
        if (config.integrateSlack[channel]) {
          let skype = config.integrateSlack[channel];
          delete config.integrate[skype];
          return this.savePrintIntegrate("_removed " + skype + " to " + parts[2] + "_");
        }
        // del all skype_name
        if (config.integrate[parts[2]]) {
          let channel = config.integrate[parts[2]];
          delete config.integrate[parts[2]];
          return this.savePrintIntegrate("_removed " + parts[2] + " to #" + config.channelsById[channel] + "_");
        }
      } else if (parts[0] == "list") {
        return this.savePrintIntegrate("_List of tunnels:_");
      }
    } else if (parts[1] == "spec") {
      if (parts[0] == "add" && parts.length == 3 && channel) {
        // add some #channel
        config.massSomeChannels.push(channel);
        return this.printSomeChannels("_added #" + config.channelsById[channel] +"_");
      } else if (parts[0] == "del" && parts.length == 3 && channel) {
        // del some #channel
        var index = config.massSomeChannels.indexOf(channel);
        let addStr = "cant find";
        if (index > -1) {
          addStr = "_removed #" + config.channelsById[channel] + "_";
          config.massSomeChannels.splice(index, 1);
        }
        return this.printSomeChannels(addStr);
      } else if (parts[0] == "list") {
        return this.printSomeChannels();
      } else if (parts[0] == "reset") {
        config.massSomeChannels = [];
        return this.printSomeChannels();
      } else if (parts[0] == "mode") {
        if (parts[2] == "exclude") {
          config.partialSendMode = "exclude";
          return this.printSomeChannels("_mode changed_");
        } else if (parts[2] == "include") {
          config.partialSendMode = "include";
          return this.printSomeChannels("_mode changed_");
        }
      }
    } else if (parts[0] == "help") {
      return "*Manage tunnels:*\n" +
      "add all skype #slack\n" +
      "del all skype|#slack\n" +
      "change all skype #slack\n" +
      "list all\n\n" +

      "*Manage partial sending:*\n" +
      "add spec #slack\n" +
      "del spec #slack\n" +
      "reset spec\n" +
      "list spec\n" +
      "mode spec (exclude|include)\n";
    } else {
      return "_unknown command_";
    }

    /*
    if (command.indexOf("mass status") === 0) {
      helpers.saveDynamicConfig();
      return this.printExcludedChannels();
    } else if (command.indexOf("exclude reset") === 0) {
      config.massSomeChannels = [];
      return this.printExcludedChannels();
    } else if (command.indexOf("include <#") === 0) {
      let channel = parseCh(command);
      if (channel) {
        var index = config.massSomeChannels.indexOf(channel);
        if (index > -1) config.massSomeChannels.splice(index, 1);
        return this.printExcludedChannels();
      }
    } else if (command.indexOf("exclude <#") === 0) {
      let channel = parseCh(command);
      if (channel) {
        config.massSomeChannels.push(channel);
        return this.printExcludedChannels();
      }
    }*/
    return "_unknown command_";
  },

  printSomeChannels : function (addStr) {
    if (addStr === undefined) addStr = ''; else console.log(addStr);
    this.saveDynamicConfig();
    return 'Special list, the following channels are *' + config.partialSendMode + 'd* : \n' +
      config.massSomeChannels.map(function (channel) {
        return "#" + config.channelsById[channel] + ((config.integrateSlack[channel])? "" : " - _doesn't exist!_");
      })
        .join('\n');
  },

  savePrintIntegrate: function (addStr) {
    if (addStr === undefined) addStr = ''; else console.log(addStr);
    this.updateIntegrateChannels();
    this.saveIntegrateConfig();

    var list = Object.keys(config.integrate).map(function (skypeName) {
      let channelName = config.channelsById[config.integrate[skypeName]];
      return skypeName + " <--> #" + (channelName || config.integrate[skypeName]);
    }).join('\n');;

    return addStr + '\n' + list;
  }

};

module.exports = HelperMethods;
