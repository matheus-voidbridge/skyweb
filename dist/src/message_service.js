"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var request = require("request");
var Consts = require("./consts");
var utils_1 = require("./utils");
var https = require("https");
var fs = require("fs");
var MessageService = (function () {
    function MessageService(cookieJar, eventEmitter) {
        this.requestWithJar = request.defaults({ jar: cookieJar });
        this.eventEmitter = eventEmitter;
    }
    MessageService.prototype.sendMessage = function (skypeAccount, conversationId, message, messagetype, contenttype, changeMsgId, callback) {
        var _this = this;
        var clientmessageid = changeMsgId || (Math.floor(utils_1.default.getCurrentTime() * 1000) + '');
        var requestBody = {
            'content': message,
            'messagetype': messagetype || 'RichText',
            'contenttype': contenttype || 'text'
        };
        if (changeMsgId)
            requestBody['skypeeditedid'] = changeMsgId;
        else
            requestBody['clientmessageid'] = clientmessageid;
        this.requestWithJar.post(Consts.SKYPEWEB_HTTPS + skypeAccount.messagesHost + '/v1/users/ME/conversations/' + conversationId + '/messages', {
            body: JSON.stringify(requestBody),
            headers: {
                'RegistrationToken': skypeAccount.registrationTokenParams.raw
            }
        }, function (error, response, body) {
            if (!error && response.statusCode === 201) {
                if (callback)
                    callback(clientmessageid, true);
            }
            else {
                _this.eventEmitter.fire('error', 'Failed to send message.' +
                    '.\n Error code: ' + response.statusCode +
                    '.\n Error: ' + error +
                    '.\n Body: ' + body);
            }
        });
        return clientmessageid;
    };
    MessageService.prototype.markConversation = function (skypeAccount, conversationId, tsStart, tsEnd, callback) {
        var requestBody = JSON.stringify({
            'consumptionhorizon': tsStart + ';' + tsEnd + ';' + (tsStart + 300)
        });
        this.requestWithJar.put(Consts.SKYPEWEB_HTTPS + skypeAccount.messagesHost + '/v1/users/ME/conversations/' + conversationId + '/properties?name=consumptionhorizon', {
            body: requestBody,
            headers: {
                'RegistrationToken': skypeAccount.registrationTokenParams.raw,
                'Content-Type': 'application/json'
            }
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                console.log("Skype conversation was marked as read.");
                if (callback)
                    callback(true);
            }
            else {
                console.error('Failed to send message.' +
                    '.\n Error code: ' + response.statusCode +
                    '.\n Error: ' + error +
                    '.\n Body: ' + body);
            }
        });
    };
    MessageService.prototype.getContent = function (skypeAccount, url, filename, callback) {
        var file = fs.createWriteStream(filename);
        var statusCode = 404;
        this.requestWithJar.get(url).on('response', function (response) {
            statusCode = response.statusCode;
        }).pipe(file).on('finish', function () {
            var stats = fs.statSync(filename);
            var fileSizeInBytes = stats.size;
            if (statusCode == 200) {
                console.log("Skype: got file content to: " + filename, " size: ", fileSizeInBytes);
                if (callback)
                    callback(true);
            }
            else {
                console.warn("Skype: got wrong status of receiving file:", statusCode);
                if (callback)
                    callback(false);
            }
        });
    };
    MessageService.prototype.createAsmObjectId = function (skypeAccount, filename, send_to, callback) {
        var _this = this;
        var requestBody = {
            'filename': filename,
            'permissions': (_a = {},
                _a[send_to] = ["read"],
                _a),
            'type': 'sharing/file'
        };
        console.log("POST:" + JSON.stringify(requestBody));
        this.requestWithJar.post(Consts.SKYPEWEB_ASM_OBJECTS, {
            body: JSON.stringify(requestBody),
            headers: {
                'Authorization': 'skype_token ' + skypeAccount.skypeToken,
                'Content-Type': 'application/json'
            }
        }, function (error, response, body) {
            if (!error && response.statusCode === 201) {
                try {
                    var obj = JSON.parse(body);
                    if (callback)
                        callback(obj);
                }
                catch (e) {
                    _this.eventEmitter.fire('error', 'Skype: Failed to create file object, cant recognize json: ' + body);
                    if (callback)
                        callback(false);
                }
            }
            else {
                _this.eventEmitter.fire('error', 'Failed to create file object.' +
                    '.\n Error code: ' + response.statusCode +
                    '.\n Error: ' + error +
                    '.\n Body: ' + body);
                if (callback)
                    callback(false);
            }
        });
        var _a;
    };
    MessageService.prototype.postFile = function (skypeAccount, filename, originalFileName, send_to, callback) {
        var me = this;
        this.createAsmObjectId(skypeAccount, originalFileName, send_to, function (asmObj) {
            if (asmObj && asmObj.id) {
                var uri_1 = Consts.SKYPEWEB_ASM_OBJECTS + "/" + asmObj.id;
                var uriUpl = Consts.SKYPEWEB_ASM_OBJECTS + "/" + asmObj.id + "/content/original";
                console.log("Skype: created asm. object, PUT into ", uriUpl);
                var stats = fs.statSync(filename);
                var filesize_1 = stats.size;
                var req = https.request({
                    hostname: 'api.asm.skype.com',
                    port: 443,
                    path: '/v1/objects' + "/" + asmObj.id + "/content/original",
                    method: 'PUT',
                    headers: {
                        'Authorization': 'skype_token ' + skypeAccount.skypeToken,
                        'Content-Type': 'multipart/form-data',
                        'Content-Length': filesize_1,
                    }
                }, function (response) {
                    console.log('Skype: file upload result: ' + response.statusCode);
                    var msg = '<URIObject type="File.1" uri="' + uri_1 + '"' +
                        ' url_thumbnail="' + uri_1 + '/views/thumbnail"><Title>Title: ' + originalFileName +
                        '</Title><Description> Description: ' + originalFileName +
                        '</Description><a href="https://login.skype.com/login/sso?go=webclient.xmm&amp;docid=' + asmObj.id +
                        '"> https://login.skype.com/login/sso?go=webclient.xmm&amp;docid=' + asmObj.id +
                        '</a><OriginalName v="' + originalFileName +
                        '"/><FileSize v="' + filesize_1 +
                        '"/></URIObject>';
                    me.sendMessage(skypeAccount, send_to, msg, "RichText/Media_GenericFile");
                    if (callback)
                        callback(true);
                });
                fs.createReadStream(filename).pipe(req).on('finish', function () {
                    console.log("Skype upload finished");
                });
                console.log("Skype: SENDING...");
            }
            else {
                if (callback)
                    callback(false);
            }
        });
    };
    return MessageService;
}());
exports.MessageService = MessageService;
exports.default = MessageService;
//# sourceMappingURL=message_service.js.map