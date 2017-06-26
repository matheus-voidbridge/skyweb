var config = {
	// Auth info for Skype Web client
	"skype_username":	"skype_login_here",
	"skype_password":	"password_here",
	// after skype login, set visible status
	"skypeStatus":		"Online",	// "" - don't change status, or "Hidden" | "Online" | "Away" | "Busy"
	// Slack API token of bot user to read and post message (it should be connected to slack channels!)
	// obtain token here, be authorized as bot user
	// https://api.slack.com/custom-integrations/legacy-tokens
	"slack_ApiToken":	"xoxp-203299281251-202842644177-203594386612-8e7e869304ad102cf702604ad2f06093",

	// List of skype contacts that connects to slack channels
	"integrate": {
		// skype contact	// slack channel
		"lakomkafuntik":	"slakomka",
		"live:strelkopf":	"general"
	},

	// everything posted to that Slack channel, will be re-posted to all Skype contacts from list above
	"massSendFromChannel":	"random",
	// period in ms between sending mass messages (should not be less than 1000ms)
	"massPeriod":		1000,

	// text at the end of each redirected message - for debug purposes
				// should be just "" in production
	"debugSuffixSkype":	" - Greetings from Skype.",
	"debugSuffixSlack":	" - Greetings from Slack."
};

module.exports = config;
