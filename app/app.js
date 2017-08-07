"use strict";

var config = require('./config');
var crypto = require('crypto');
var fs = require('fs');
var sanitizeHtml = require('sanitize-html');
var helpers = require('./helpers')

helpers.redefineLog();
if (!fs.existsSync(config.tmpDir)){
  fs.mkdirSync(config.tmpDir);
}

// load channels list
var integrateLoaded = helpers.loadIntegrateConfig();
config.massSomeChannels = [];
helpers.loadDynamicConfig();

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
var WebClient = require('@slack/client').WebClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var token = config.slack_ApiToken;
var tokenMe = config.slack_MeApiToken;

config.channelsById = {};
config.channelsByName = {};
let channelsById = config.channelsById;		  // dictionary of channel names
let channelsByName = config.channelsByName;	// dictionary of channel ids
let slackSentMsg = {};
let skypeSentMsg = {};
let skypeIdsSentMsg = {};
let massSendMsgs = {};

let slackChannelsReading = {}; // last read time by slack channel
let skypeChatReading = {}; // last read time by skype conversation

// Skype login
var skyweb = new Skyweb();
config.skyweb = skyweb;
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
    //
    //skyweb.postFile("demo.js", "demo.js", "8:live:strelkopf");
    //skyweb.getContent("https://api.asm.skype.com/v1/objects/0-neu-d4-5e92664330f7499ef62daf8f047ea426/views/original", "tmp/skype_down.txt");
    //
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
console.log('\n============ APP HAS BEEN STARTED =====================\n');
console.log('Slack: RTM init...');
var rtm = new RtmClient(token, { logLevel: 'info' });
rtm.start();
var slackWeb = new WebClient(token);
config.slackWeb = slackWeb;
var slackWebMe = new WebClient(tokenMe);
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
  // reverse integrate list to slack
  helpers.updateIntegrateChannels();
  console.log(`Slack: Logged in as  ${rtmStartData.self.name}  of team  ${rtmStartData.team.name} , but not yet connected to a channel`);

  //
  //rtmMarkChannel(tokenMe, channelsByName["general"]);
  //
});
var rtmDownloadFile = function(fileUri, filename, callback) {
  let fs = require('fs');
  var file = fs.createWriteStream(filename);

  var request = require('request');
  let statusCode = 500;
  request.get(fileUri, {
    'headers': {
      'Authorization': "Bearer " + tokenMe
    }
  })
    .on('response', function(response) {
      statusCode = response.statusCode;
    })
    .pipe(file)
    .on('finish', function () {
      const stats = fs.statSync(filename);
      const fileSizeInBytes = stats.size;

      if (statusCode == 200) {
        console.log("Slack: got file content to: " + filename, " size: ", fileSizeInBytes);
        if (callback) callback(true);
      } else {
        console.warn("Slack: got wrong status of receiving file:", statusCode);
        if (callback) callback(false);
      }
    });
  ;
};
var rtmPostFile = function (filename, originalFileName, channels, who_post) {
  //curl -F file=@demo.js -F channels=#general -F token=xoxp-TOKEN https://slack.com/api/files.upload

  if (!who_post) who_post = token;
  var request = require('request');
  var req = request.post('https://slack.com/api/files.upload', function (err, resp, body) {
    if (err) {
      console.error('Error uploading file to Slack!');
    } else {
      console.log('Slack: upload file result: ' + resp.statusCode);
    }
  });
  var form = req.form();
  form.append('file', fs.createReadStream(filename));
  form.append('channels', channels);
  form.append('token', who_post);
  form.append('filename', originalFileName);

  console.log("Slack: SENDING...");
};
var rtmMarkChannel = function (token, channel, timestamp) {
  if (!timestamp) timestamp = Math.floor(new Date() / 1000);
  var request = require('request');
  var req = request.post('https://slack.com/api/channels.mark', function (err, resp, body) {
    if (err) {
      console.error('Error marking channel in Slack!');
    } else {
      console.log('Slack: marking channel result: ' + resp.statusCode, resp.body);
    }
  });
  var form = req.form();
  form.append('token', token);
  form.append('channel', channel);
  form.append('ts', timestamp);
};


// Slack message listener
rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
  if (message) {
    let channelId = message.channel;
    let fromChannel = channelsById[channelId];
    //console.log('--Slack client receive message:' + JSON.stringify(message, null, 2));
    if (message.subtype == "bot_message") return;
    console.log('Slack client receive message:', message.text, "; channel_id:", channelId, " channel:", fromChannel,
      ((message.subtype)? " subtype: " + message.subtype : "")
    );
    // resend message to skype
    if (config.integrateSlack[channelId]) {
      let skypeName = config.integrateSlack[channelId];
      let skypeConversation = "8:" + skypeName;

      if (message.subtype == "file_share" && message.file) {
        // mute skype bot sent messages
        if (hasMsg(slackSentMsg[channelId], message.file.name, 'file')) {
          console.log('Slack: mute double file sent from skype.');
          return;
        }

        console.log('Slack: catch shared file: ' + message.file.url_private_download);
        let filename = config.tmpDir + "/" + crypto.createHash('md5').update(message.file.url_private_download).digest('hex');
        rtmDownloadFile(message.file.url_private_download, filename, function () {
          console.log("Slack: resend file to Skype: ", skypeName, "  filename: " + message.file.name);
          // upload file to Skype
          skyweb.postFile(filename, message.file.name, skypeConversation, function (result) {
            // store sent files
            storeMsg(skypeSentMsg, skypeName, message.file.name, 'file');
          });
        });
      } else if (message.subtype == "message_changed" || message.subtype == "message_deleted") {
        // slack message removed or changed
        console.log("Slack: " + message.subtype, JSON.stringify(message, null, 2));
        if (message.previous_message && message.previous_message.ts) {
          let oldMsg = findMsgById(skypeIdsSentMsg[skypeName], message.previous_message.ts);
          if (oldMsg && oldMsg.msg) {
            console.log("Slack: CHANGING/Removing message on skype, id=", oldMsg.msg.skypeId);
            let newMsg = '';
            if (message.subtype == "message_changed")
              if (message.message && message.message.text) newMsg = message.message.text; else return;
            skyweb.sendMessage(skypeConversation, newMsg, '', '', oldMsg.msg.skypeId, function (msgId, result) {
              // store sent message
              storeMsg(skypeSentMsg, skypeName, newMsg);
            });
          }
        }
      } else if (message.subtype == "channel_name" || message.subtype == "channel_join") {
        // update channels list
        helpers.updateChannelsList();
      } else if (!message.subtype) {  // Usual text message
        // mute skype bot sent messages
        if (hasMsg(slackSentMsg[channelId], message.text) ||
            hasMsg(slackSentMsg[channelId], getOrigMsgWithTags(message.text))
          ) {
          console.log('Slack: mute double message sent from skype.');
          return;
        }
        // resend
        console.log('Slack: redirect message to Skype :', skypeConversation);
        let msg = message.text + (config.debugSuffixSlack || '');
        skyweb.sendMessage(skypeConversation, msg, undefined, undefined, undefined, function (skypeMsgId, result) {
          //console.log("Skype message was sent, ", skypeMsgId);
          // store sent messages
          storeMsg(skypeSentMsg, skypeName, msg);
          // store msg Id   // use another similar array
          storeMsg(skypeIdsSentMsg, skypeName, {
            'id': message.ts,
            'skypeId': skypeMsgId
          }, 'ids');

        });
      }
    }
    // mass send checking
    if (fromChannel == config.massSendFromChannel && !message.file && !message.subtype && message.text) {
      let n = 1;
      // TODO: clean sendMassMessage associative array?
      Object.keys(config.integrateSlack).forEach(function (channel) {
        setTimeout(sendMassMessage, n * config.massPeriod,
          channel, message.text + (config.debugSuffixSlack || ''), message.ts);
        n++;
      });
    }
    // partial mass send
    if (fromChannel == config.partialSendFromChannel && !message.file && !message.subtype && message.text) {
      let n = 1;
      Object.keys(config.integrateSlack).forEach(function (channel) {
        // consider excluded channels
        if ((config.partialSendMode == "exclude" && config.massSomeChannels.indexOf(channel) === -1) ||
            (config.partialSendMode == "include" && config.massSomeChannels.indexOf(channel) > -1))
          {
          // send only if channel is not excluded
          setTimeout(sendMassMessage, n * config.massPeriod,
            channel, message.text + (config.debugSuffixSlack || ''), message.ts);
          n++;
        }
      });
    }
    if ((fromChannel == config.massSendFromChannel || fromChannel == config.partialSendFromChannel) &&
      (message.subtype == "message_changed" || message.subtype == "message_deleted")) {
      // mass message changing or removing
      console.log("Mass send " + message.subtype);
      if (message.previous_message && message.previous_message.ts) {
        if (massSendMsgs[message.previous_message.ts]) {
          massSendMsgs[message.previous_message.ts].forEach(function (msgInfo) {
            if (msgInfo && msgInfo.msg) {
              if (message.subtype == "message_changed") {
                let newMsg = '';
                if (message.message && message.message.text) newMsg = message.message.text; else return;
                slackWebMe.chat.update(msgInfo.msg.id, msgInfo.msg.channel, newMsg);
              } else {
                slackWebMe.chat.delete(msgInfo.msg.id, msgInfo.msg.channel);
              }
            }
          })
        }
      }
    }
    // config channel processing
    if (fromChannel == config.configChannel && !message.file && message.text) {
      let answer = helpers.processConfigCommands(message.text);
      rtm.sendMessage(answer, channelsByName[config.configChannel]);
    }
  }
});

var sendSkypeMessage = function(skypeConversation, text) {
	console.log('Slack: mass send message to Skype :', skypeConversation);
	skyweb.sendMessage(skypeConversation, text);
};
var sendMassMessage = function(channel, text, massMsgId) {
  console.log('Slack: mass send message to channel :', channelsById[channel]);
  rtmMe.sendMessage(text, channel, function (err, resp) {
    if (resp && resp.ts) {
      // store msg Id  of that mass sending session
      storeMsg(massSendMsgs, massMsgId, {
        'id': resp.ts,
        'channel': channel
      }, 'ids');
      // mark #channel after timeout (need to update in phone)
      setTimeout(function () {
        rtmMarkChannel(tokenMe, channel);
      }, config.markWaitTimeout);
    }
  });
};
var getOrigMsgWithTags = function(msg) {
  return (msg)? msg.replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
}
rtmMe.on(RTM_EVENTS.CHANNEL_MARKED, function handleRtmMessage(message) {
  if (message.channel && message.ts) {
    let fromChannel = channelsById[message.channel];
    let ts = message.ts;
    if (config.integrateSlack[message.channel]) {
      // mute?
      if ((new Date()) - slackChannelsReading[message.channel] < config.muteTimeout) {
        console.log('Slack: channel was marked: muted by skype');
        return;
      }

      let skypeName = config.integrateSlack[message.channel];
      let skypeConversation = "8:" + skypeName;
      console.log('Slack: channel was marked: #' + fromChannel, " updating skype conversation: " + skypeConversation);

      // it's weird that from should be greater to (???)
      let to = Math.floor(new Date() / 1000);
      let from = (to + 60*60*24);
      skyweb.markConversation(skypeConversation, from*1000,  to*1000, function (result) {
        // remember time of updating slack channel to mute reverse
        skypeChatReading[skypeName] = new Date();
      });
    }
  }
});


// Skype message listener
skyweb.messagesCallback = function (messages) {
  messages.forEach(function (message) {
    // message read status
    if (message && message.resourceType === 'ConversationUpdate') {
      skypeReadStatusMessage(message);
      return;
    }

    //console.log("Skype client receive message: " + JSON.stringify(message.resource, null, 2));
		if (message && message.resource &&message.resource.messagetype !== 'Control/Typing' && message.resource.messagetype !== 'Control/ClearTyping') {
			var conversationLink = message.resource.conversationLink;
			var conversationId = conversationLink.substring(conversationLink.lastIndexOf('/') + 1);
			var skypeName = conversationId.substring(conversationId.indexOf(':') + 1);
      var slackChannel = config.integrate[skypeName]; // channel id
      var msg = message.resource.content;
			if (message.resource.from.indexOf(username) === -1) {
				console.log("Skype client receive message from : " + conversationId + "; message: " + msg);

				// resend message to slack
				if (config.integrate[skypeName]) {

          // test for attachments
          if (msg && msg.indexOf("<URIObject") === 0) {
            if (hasMsg(skypeSentMsg[skypeName], getSkypeOriginalFilename(msg), 'file')) {
              console.log('Skype: mute double file sent from slack.');
              return;
            }
            resendSkypeFileMsg(msg, slackChannel, token);
          } else {
            console.log('Skype: redirect message to Slack :', channelsById[slackChannel]);
            let sentMsg = (msg)? sanitizeHtml(msg) + (config.debugSuffixSkype || '') : '';
            if (message.resource.skypeeditedid) {
              // some message was edited
              if (sentMsg) {
                sentMsg = "--edited msg: " + sentMsg;
              } else {
                sentMsg = "--removed msg--";
              }
            }
            if (config.slack_sendAsBot) {
              // send as bot user with changing name and avatar
              let opt = {};
              if (message.resource.imdisplayname) {
                opt = {
                  username: message.resource.imdisplayname,
                  as_user: false,
                };
                // try to get avatar
                let contactInfo = skyweb.contactsService.contacts.find(function (contact) {
                  return contact.id == skypeName;
                });
                if (contactInfo && contactInfo.avatar_url) opt.icon_url = contactInfo.avatar_url;
                if (contactInfo && contactInfo.display_name) opt.username = contactInfo.display_name;
              }
              slackWeb.chat.postMessage(slackChannel, sentMsg, opt, function(err, res) {
                if (err) {
                  console.error('Slack: sent msg error:', err);
                } else {
                  //console.log('Message sent: ', res);
                }
              });
            } else {
              rtm.sendMessage(sentMsg, slackChannel);
            }
            // don't store sent messages for duplicate skipping
          }
				}
			} else {
				console.log("Skype client send message to : " + conversationId + "; message: " + msg);

        // resend Self skype Message to slack from `me` name
				if (config.integrate[skypeName]) {
          // test for attachments
          if (msg && msg.indexOf("<URIObject") === 0) {
            console.log('Skype: SELF file post detected.');
            // mute slack bot sent messages
            if (hasMsg(skypeSentMsg[skypeName], getSkypeOriginalFilename(msg), 'file')) {
              console.log('Skype: mute double file sent from slack.');
            } else {
              resendSkypeFileMsg(msg, config.integrate[skypeName], tokenMe);
            }
            return;
          }

            // mute slack bot sent messages
					if (hasMsg(skypeSentMsg[skypeName], msg)) {
					  console.log('Skype: mute double message sent from slack.');
					  return;
					}

					console.log('Skype: write same message in Slack  :', channelsById[slackChannel]);
          let sentMsg = (msg)? sanitizeHtml(msg) + (config.debugSuffixSkype || '') : '';
          if (message.resource.skypeeditedid) {
            // some message was edited
            if (sentMsg) {
              sentMsg = "--edited msg: " + sentMsg;
            } else {
              sentMsg = "--removed msg--";
            }
          }

          rtmMe.sendMessage(sentMsg, slackChannel, function (err, msg) {
            // mark #channel after timeout (need to update in phone)
            setTimeout(function () {
              rtmMarkChannel(tokenMe, slackChannel);
            }, config.markWaitTimeout);
          });
					// store sent messages
					storeMsg(slackSentMsg, slackChannel, sentMsg);
					//console.log("slackSentMsg: " + JSON.stringify(slackSentMsg, null, 2));
				}
			}
		}
    });
};
var skypeReadStatusMessage = function (message) {
  if (message && message.resource && message.resource.id) {
    console.log("Skype client receive ConversationUpdate: " + message.resource.id); //JSON.stringify(message, null, 2));
    let conversationId = message.resource.id;
    var skypeName = conversationId.substring(conversationId.indexOf(':') + 1);
    if (config.integrate[skypeName]) {
      // mute?
      if ((new Date()) - skypeChatReading[skypeName] < config.muteTimeout) {
        console.log('Skype: channel was marked: muted by slack');
        return;
      }

      var slackChannel = config.integrate[skypeName];
      console.log("Skype update conversation read state in Slack: skype=" + conversationId, "  slack= #" + channelsById[slackChannel]);
      rtmMarkChannel(tokenMe, slackChannel);
      // remember time of updating slack channel to mute reverse
      slackChannelsReading[slackChannel] = new Date();
    }
  }
}
// parse Skype msg, extact file name and send it to Slack
// @slackChannel is channel id
function resendSkypeFileMsg(msg, slackChannel, who_post) {
  let isUri = msg.indexOf('uri="') + 5;
  let ieUri = msg.indexOf('"', isUri);
  if (isUri >= 0 && ieUri >= 0) {
    let suffix = (msg.indexOf('type="Picture') !== -1)? "/views/imgpsh_fullsize" : "/views/original";
    let uri = msg.substring(isUri, ieUri) + suffix;
    console.log("Skype: downloading file by URI: ", uri);
    // create filename by hashing its uri
    var filename = config.tmpDir + "/" + crypto.createHash('md5').update(uri).digest('hex');
    skyweb.getContent(uri, filename, function (result) {
      if (result) {
        let originalName = getSkypeOriginalFilename(msg);

        console.log("Skype: resend file to Slack: ", "#" + channelsById[slackChannel], "  filename: " + originalName);
        rtmPostFile(filename, originalName, slackChannel, who_post);
        // store sent files
        storeMsg(slackSentMsg, slackChannel, originalName, 'file');
      }
    });
  }
};
function getSkypeOriginalFilename(msg) {
  let isTitle = msg.indexOf('<Title>') + 7;
  let ieTitle = msg.indexOf('</Title>', isTitle);
  let filename = 'unnamed';
  if (isTitle >= 0 && ieTitle >= 0) {
    filename = msg.substring(isTitle, ieTitle);
  } else {
    // <OriginalName v="   name for pictures
    let isTitle = msg.indexOf('<OriginalName v="') + 17;
    let ieTitle = msg.indexOf('"', isTitle);
    if (isTitle >= 0 && ieTitle >= 0 && ieTitle > isTitle) filename = msg.substring(isTitle, ieTitle);
  }
  if (filename.indexOf('Title: ') === 0) filename = filename.substring(7);
  return filename;
}

// skype errors catching
var errorListener = function (eventName, error) {
    console.error("Skype: error#" + errorCount + " : Error occured : " + error);
    // TODO: test on error "Failed to poll messages"?
    // relogin in case of error
    skywebRelogin();

    errorCount++;
    if (errorCount === 4) {
      // exit on errors to run again
      process.exit(2);
      console.log("\n==== TERMINATE DUE TO SKYPE ERRORS. ====\n");
    }
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

var storeMsg = function(dict, key, msg, type) {
  if (!type) type = 'msg';
	if (!dict[key]) dict[key] = [];
	dict[key].push({
		'msg': msg,
		'time': new Date(),
    'type': type
	});
};
var cleanMsg = function(arr) {
  if (!arr) return false;
	var now = new Date();
	for (let i = 0; i < arr.length; ++i) {
		//console.log("t:" , now - arr[i].time);
		if (arr[i].type == 'msg' && now - arr[i].time > config.muteTimeout) {
		    arr.splice(i--, 1);
    } else if (arr[i].type == 'file' && now - arr[i].time > config.muteFileTimeout) {
      arr.splice(i--, 1);
    } else if (arr[i].type == 'ids' && now - arr[i].time > config.removeTimeout) {
      arr.splice(i--, 1);
    }
	}
};
var hasMsg = function(arr, msg, type) {
  if (!type) type = 'msg';
	if (!arr) return false;
	cleanMsg(arr);
	//console.log("look in arr: ", arr, "msg: ", msg);
	return arr.some( function(elem) {
		return (elem !== '' && elem.type == type && elem.msg === msg);
	});
};
var findMsgById = function(arr, id) {
  if (!arr) return false;
  cleanMsg(arr);
  //console.log("look in arr: ", arr, "msg: ", msg);
  return arr.find( function(elem) {
    return (elem && elem.type == 'ids' && elem.msg && elem.msg.id == id);
  });
};

