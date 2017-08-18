var sanitizeHtml = require('sanitize-html');

// transforming messages
String.prototype.replaceAll = function (find, replace) {
  var str = this;
  return str.replace(new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replace);
};


var emoticons = {
    ":slightly_smiling_face:":  ":)",
    ":disappointed:":           ":(",
    ":+1:":                     "(y)",
    ":joy:":                    ":D",
    ":grinning:":               ":D",
    ":wink:":                   ";)"
  };
// replaces emoticons and email from slack to skype format
var transformSlack2Skype = function (msg) {
  if (!msg) return '';
  /*
   msg.replace(/:slightly_smiling_face:/g, ":)")
   .replace(/:disappointed:/g, ":(")
   .replace(/:\+1:/g, "(y)")
   .replace(/:joy:/g, ":D")
   .replace(/:grinning:/g, ":D")
   .replace(/:wink:/g, ";)");
   */
  for (const slackEm in emoticons) {
    msg = msg.replaceAll(slackEm, emoticons[slackEm]);
  }

  // replace <mailto:info@vidaplayer.com|info@vidaplayer.com>
  msg = transfromSlackMailto(msg);

  return msg;
};
var transfromSlackMailto = function (msg) {
  // replace <mailto:info@vidaplayer.com|info@vidaplayer.com>
  let iMts = msg.indexOf("<mailto:");
  if (iMts >= 0) { // stars with mailto:
    let iMte = msg.indexOf(">", iMts);
    let iSpr = msg.indexOf("|", iMts);
    if (iSpr > 0 && iMte > 0 && iSpr < iMte) {   // ends with >
      let email = msg.substring(iMts + 8, iSpr);
      msg = msg.substring(0, iMts) + email + msg.substring(iMte + 1);
    }
  }
  return msg;
};
// replaces emoticons from slack to skype format
var transformSkype2Slack = function (msg) {
  if (!msg) return '';
  // emoticons
  for (const slackEm in emoticons) {
    const skypeEm = emoticons[slackEm];
    msg = msg.replaceAll(skypeEm, slackEm);
  }
  // replace <a href="mailto:info@viuda.com">info@viuda.com</a>
  let iMts = msg.indexOf('<a href="mailto:');
  if (iMts >= 0) { // stars with <a href=
    let iMte = msg.indexOf("</a>", iMts);
    let iSpr = msg.indexOf('">', iMts);
    if (iSpr > 0 && iMte > 0 && iSpr < iMte) {   // ends with ">
      let email = msg.substring(iMts + 16, iSpr);
      msg = msg.substring(0, iMts) + email + msg.substring(iMte + 4);
    }
  }

  return sanitizeHtml(msg);
};

module.exports = { transformSkype2Slack, transformSlack2Skype, transfromSlackMailto };
