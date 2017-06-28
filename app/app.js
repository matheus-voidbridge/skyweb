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
      logFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      errFile.write(date_str() + util.format.apply(null, arguments) + '\n');
      console.old_error(date_str() + util.format.apply(null, arguments));
    }
    console.warn = function () {
      logFile.write(date_str() + util.format.apply(null, arguments) + '\n');
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
var tokenMe = config.slack_MeApiToken;

let channelsById = {};		// dictionary of channel names
let channelsByName = {};	// dictionary of channel ids
let slackSentMsg = {};
let skypeSentMsg = {};

// Skype login
var skyweb = new Skyweb();
var errorCount = 0;
var skywebLogin = function() {
  skyweb.login(username, password).then(function (skypeAccount) {
    console.log('Skype: Skyweb is initialized now');
    //console.log('Here is some info about you:' + JSON.stringify(skyweb.skypeAccount.selfInfo, null, 2));
    //console.log('Your contacts : ' + JSON.stringify(skyweb.contactsService.contacts, null, 2));
    if (config.skypeStatus) {
      console.log('Skype: set status. Going to: ' + config.skypeStatus);
      skyweb.setStatus(config.skypeStatus);
    }

    // clear errors counter
    if (errorCount > 0) {
      console.log('Skype: Last session errors count = ' + errorCount + '. Set to 0.');
      errorCount = 0;
    }
    //skyweb.getContent("abc");
  }).catch(function (reason) {
    console.log(reason);
  });
};
// perform login on start
skywebLogin();

var skywebRelogin = function () {
  console.log("Skype: RELOGIN STARTED.");
  skyweb.logout(function (result) {
    console.log("Skype callback: logout: " + result);
    // do not check result because polling stopped anyway
    // TODO: may be login in parallel with logout?  (to do not loose messages)
    console.log("Skype: trying to login");
    skywebLogin();
  });
};

// Slack RTM login
console.log('Slack: RTM init...');
var rtm = new RtmClient(token, { logLevel: 'info' });
rtm.start();
var rtmMe = new RtmClient(tokenMe, { logLevel: 'info' });
rtmMe.start();
// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  console.log("====== Slack Channels LIST =================== ");
  for (const c of rtmStartData.channels) {
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
	  let skypeName = config.integrateSlack[fromChannel];
	  // mute skype bot sent messages
	  if (hasMsg(slackSentMsg[fromChannel], message.text)) {
		  console.log('Slack: mute double message sent from skype.');
		  return;
	  }
	  let skypeConversation = "8:" + skypeName;
	  console.log('Slack: redirect message to Skype :', skypeConversation);
	  let msg = message.text + (config.debugSuffixSlack || '');
	  skyweb.sendMessage(skypeConversation, msg);
	  // store sent messages
	  storeMsg(skypeSentMsg, skypeName, msg);


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
		//console.log("Skype client receive message: " + JSON.stringify(message.resource, null, 2));
		if (message && message.resource &&message.resource.messagetype !== 'Control/Typing' && message.resource.messagetype !== 'Control/ClearTyping') {
			var conversationLink = message.resource.conversationLink;
			var conversationId = conversationLink.substring(conversationLink.lastIndexOf('/') + 1);
			var skypeName = conversationId.substring(conversationId.indexOf(':') + 1);
			if (message.resource.from.indexOf(username) === -1) {
				console.log("Skype client receive message from : " + conversationId + "; message: " + message.resource.content);

				// resend message to slack
				if (config.integrate[skypeName]) {
					let slackChannel = config.integrate[skypeName];
					console.log('Skype: redirect message to Slack :', slackChannel);
					let msg = message.resource.content + (config.debugSuffixSkype || '');
					rtm.sendMessage(msg, channelsByName[slackChannel]);
					// don't store sent messages
				}
			} else {
				console.log("Skype client send message to : " + conversationId + "; message: " + message.resource.content);

        // resend self skype message to slack from `me` name
				if (config.integrate[skypeName]) {
					// mute slack bot sent messages
					if (hasMsg(skypeSentMsg[skypeName], message.resource.content)) {
					  console.log('Skype: mute double message sent from slack.');
					  return;
					}

					let slackChannel = config.integrate[skypeName];
					console.log('Skype: write same message in Slack  :', slackChannel);
					let msg = message.resource.content + (config.debugSuffixSkypeMe || '');
					rtmMe.sendMessage(msg, channelsByName[slackChannel]);
					// store sent messages
					storeMsg(slackSentMsg, slackChannel, msg);
					//console.log("slackSentMsg: " + JSON.stringify(slackSentMsg, null, 2));
				}
			}
		}
    });
};


// skype errors catching
var errorListener = function (eventName, error) {
    console.error("Skype: error#" + errorCount + " : Error occured : " + error);
    // TODO: test on error "Failed to poll messages"?
    // relogin in case of error
    skywebRelogin();

    errorCount++;
    if (errorCount === 10) {
        console.error("Skype: Removing error listener");
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

var storeMsg = function(dict, key, msg) {
	if (!dict[key]) dict[key] = [];
	dict[key].push({
		'msg': msg,
		'time': new Date()
	});
};
var cleanMsg = function(arr) {
	var now = new Date();
	for (let i = 0; i < arr.length; ++i) {
		//console.log("t:" , now - arr[i].time);
		if (now - arr[i].time > config.muteTimeout) {
		    arr.splice(i--, 1);
   		}
	}
};
var hasMsg = function(arr, msg) {
	if (!arr) return false;
	cleanMsg(arr);
	//console.log("look in arr: ", arr, "msg: ", msg);
	return arr.some( function(elem) {
		return (elem !== '' && elem.msg === msg);
	});
};


