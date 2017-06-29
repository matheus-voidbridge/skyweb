/**
 * Example for creating and working with the Slack RTM API.
 */

/* eslint no-console:0 */

var config = require('./config');

var RtmClient = require('@slack/client').RtmClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;

var token = process.env.SLACK_API_TOKEN || config.slack_ApiToken;

let channelsById = {};		// dictionary of channel names
let channelsByName = {};	// dictionary of channel ids

/*
// sending via Web API
var WebClient = require('@slack/client').WebClient;
var web = new WebClient(token);
web.chat.postMessage('C5YQYD265', 'Hello there', function(err, res) {
  if (err) {
    console.log('Error:', err);
  } else {
    console.log('Message sent: ', res);
  }
});
*/


/*
// sending via webhooks
var IncomingWebhook = require('@slack/client').IncomingWebhook;

var url = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/T--'; //see section above on sensitive data

var webhook = new IncomingWebhook(url);

webhook.send('Hello there', function(err, header, statusCode, body) {
  if (err) {
    console.log('Error:', err);
  } else {
    console.log('Received', statusCode, 'from Slack');
  }
});
*/

// ----------------
console.log('Rtm init');

var rtm = new RtmClient(token, { logLevel: 'info' });
rtm.start();

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
  console.log('Receive Message:', message);
  let channel = config.postAllChannel;
  console.log('Redirect Message to :', channelsByName[channel]);
  rtm.sendMessage(message.text + ". Dog rules!", channelsByName[channel]);
});

rtm.on(RTM_EVENTS.REACTION_ADDED, function handleRtmReactionAdded(reaction) {
  console.log('Reaction added:', reaction);
});

rtm.on(RTM_EVENTS.REACTION_REMOVED, function handleRtmReactionRemoved(reaction) {
  console.log('Reaction removed:', reaction);
});

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  console.log("Channels LIST ===================== ");
  for (const c of rtmStartData.channels) {
	//if (c.is_member && c.name ==='slakomka') { channel = c.id }
	console.log("Channel: ", c.name, " id: ", c.id);
	channelsById[c.id] = c.name;
	channelsByName[c.name] = c.id;
  }
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
	console.log(config);
});

