"use strict";

var config = require('./config');

var redefineLog = function() {
    var fs = require('fs');
    var util = require('util');

    var dir = "log";
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
      errFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      console.old_error(date_str() + util.format.apply(null, arguments));
    }
    console.warn = function () {
      warnFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      console.old_warn(date_str() + util.format.apply(null, arguments));
    }
  };
redefineLog();

config.integrateSlack = {};
Object.keys(config.integrate).forEach(function (skypeName) {
	let slackName = config.integrate[skypeName];
	config.integrateSlack[slackName] = skypeName;
});

// Skype variables
Object.defineProperty(exports, "__esModule", { value: true });
var Skyweb = require("../dist/src/skyweb");
var username = config.skype_username;
var password = config.skype_password;
if (!username || !password) {
    throw new Error('Skype Username and password should be provided in config.js file!');
}

// Slack variables
var RtmClient = require('@slack/client').RtmClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var token = config.slack_ApiToken;

let channelsById = {};		// dictionary of channel names
let channelsByName = {};	// dictionary of channel ids

// Skype login
var skyweb = new Skyweb();
skyweb.login(username, password).then(function (skypeAccount) {
    console.log('Skype: Skyweb is initialized now');
    //console.log('Here is some info about you:' + JSON.stringify(skyweb.skypeAccount.selfInfo, null, 2));
    //console.log('Your contacts : ' + JSON.stringify(skyweb.contactsService.contacts, null, 2));
    if (config.skypeStatus) {
   	console.log('Skype: set status. Going to: ' + config.skypeStatus);
	skyweb.setStatus(config.skypeStatus);
    }
}).catch(function (reason) {
    console.log(reason);
});

// Slack RTM login
console.log('Slack: RTM init...');
var rtm = new RtmClient(token, { logLevel: 'info' });
rtm.start();
// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  console.log("====== Slack Channels LIST =================== ");
  for (const c of rtmStartData.channels) {
	//if (c.is_member && c.name ==='slakomka') { channel = c.id }
	console.log("Channel: ", c.name, " id: ", c.id);
	channelsById[c.id] = c.name;
	channelsByName[c.name] = c.id;
  }
  console.log("====== END OF Slack Channels LIST =================== ");
  console.log(`Slack: Logged in as  ${rtmStartData.self.name}  of team  ${rtmStartData.team.name} , but not yet connected to a channel`);
});


// Slack message listener
rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
  if (message) {
	let fromChannel = channelsById[message.channel];
	console.log('Slack client receive message:', message.text, "; channel_id:", message.channel, " channel:", fromChannel);
	// resend message to skype
	if (config.integrateSlack[fromChannel]) {
	  let skypeConversation = "8:" + config.integrateSlack[fromChannel];
	  console.log('Slack: redirect message to Skype :', skypeConversation);
	  skyweb.sendMessage(skypeConversation, message.text + (config.debugSuffixSlack || ''));

	/*
	  let channel = config.postAllChannel;
	  console.log('Slack Redirect Message to :', channelsByName[channel]);
	  rtm.sendMessage(message.text + ". Dog rules!", channelsByName[channel]);
	*/
	}
	// mass send checking
	if (fromChannel == config.massSendFromChannel) {
		let n = 1;
		Object.keys(config.integrate).forEach(function (skypeName) {
		  let skypeConversation = "8:" + skypeName;
		  setTimeout(sendSkypeMessage, n * config.massPeriod, skypeConversation, message.text + (config.debugSuffixSlack || '') );
		  n++;
		});
	
	}
  }
});
var sendSkypeMessage = function(skypeConversation, text) {
	console.log('Slack: mass send message to Skype :', skypeConversation);
	skyweb.sendMessage(skypeConversation, text);
};


// Skype message listener
skyweb.messagesCallback = function (messages) {
    messages.forEach(function (message) {
        if (message && message.resource && message.resource.from.indexOf(username) === -1 && message.resource.messagetype !== 'Control/Typing' && message.resource.messagetype !== 'Control/ClearTyping') {
            var conversationLink = message.resource.conversationLink;
            var conversationId = conversationLink.substring(conversationLink.lastIndexOf('/') + 1);
	    var skypeName = conversationId.substring(conversationId.indexOf(':') + 1);
	    console.log("Skype client receive message from : " + conversationId + "; message: " + message.resource.content);

	    //console.log("Skype client receive message: " + JSON.stringify(message.resource, null, 2), conversationId);
            //skyweb.sendMessage(conversationId, message.resource.content + '. Cats will rule the World');
				
	    // resend message to slack
	    if (config.integrate[skypeName]) {
		let slackChannel = config.integrate[skypeName];
		console.log('Skype: redirect message to Slack :', slackChannel);
		rtm.sendMessage(message.resource.content + (config.debugSuffixSkype || ''), channelsByName[slackChannel]);
	    }
        }
    });
};


// skype errors catching
var errorCount = 0;
var errorListener = function (eventName, error) {
    console.log("Skype: error#" + errorCount + " : Error occured : " + error);
    errorCount++;
    if (errorCount === 10) {
        console.log("Skype: Removing error listener");
        skyweb.un('error', errorListener);
    }
};
skyweb.on('error', errorListener);

// Slack RTM additioanl event listener (not used?)
rtm.on(RTM_EVENTS.REACTION_ADDED, function handleRtmReactionAdded(reaction) {
  console.log('Slack: Reaction added:', reaction);
});

rtm.on(RTM_EVENTS.REACTION_REMOVED, function handleRtmReactionRemoved(reaction) {
  console.log('Slack: Reaction removed:', reaction);
});

