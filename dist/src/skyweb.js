"use strict";
var skype_account_1 = require("./skype_account");
var contacts_service_1 = require("./contacts_service");
var request = require("request");
var login_1 = require("./login");
var poll_1 = require("./polling/poll");
var message_service_1 = require("./message_service");
var status_service_1 = require("./status_service");
var request_service_1 = require("./request_service");
var thread_service_1 = require("./thread_service");
var es6_promise_1 = require("es6-promise");
var utils_1 = require("./utils");
var Skyweb = (function () {
    function Skyweb() {
        this.cookieJar = request.jar();
        this.eventEmitter = new utils_1.EventEmitter();
        this.contactsService = new contacts_service_1.default(this.cookieJar, this.eventEmitter);
        this.messageService = new message_service_1.default(this.cookieJar, this.eventEmitter);
        this.requestService = new request_service_1.default(this.cookieJar, this.eventEmitter);
        this.statusService = new status_service_1.default(this.cookieJar, this.eventEmitter);
        this.requestService = new request_service_1.default(this.cookieJar, this.eventEmitter);
        this.threadService = new thread_service_1.default(this.cookieJar, this.eventEmitter);
        this.loggedOut = true;
        this.lastLogout = new Date();
        this.retryTimeout = 1000;
    }
    Skyweb.prototype.login = function (username, password) {
        var _this = this;
        this.skypeAccount = new skype_account_1.default(username, password);
        return new login_1.default(this.cookieJar, this.eventEmitter).doLogin(this.skypeAccount).then(function (skypeAccount) {
            return new es6_promise_1.Promise(_this.contactsService.loadContacts.bind(_this.contactsService, skypeAccount));
        }).then(function (skypeAccount) {
            _this.pollObj = new poll_1.default(_this.cookieJar, _this.eventEmitter);
            _this.pollObj.pollAll(skypeAccount, function (messages) {
                if (_this.messagesCallback) {
                    _this.messagesCallback(messages);
                }
            });
            _this.loggedOut = false;
            return skypeAccount;
        });
    };
    Skyweb.prototype.waitForLogIn = function (callAfterDelay, who) {
        var timeOut = 60000;
        if (this.loggedOut) {
            var outTimeMs = (new Date().getTime()) - this.lastLogout.getTime();
            if (outTimeMs < timeOut) {
                console.warn(who + ": Wait Skype for relogin, time from logout: " + outTimeMs);
                if (callAfterDelay)
                    setTimeout(callAfterDelay, this.retryTimeout);
                return true;
            }
            else {
                console.error(who + ": Wait Skype exceeds timeout, time from logout: " + outTimeMs);
                return false;
            }
        }
        return true;
    };
    Skyweb.prototype.sendMessage = function (conversationId, message, messagetype, contenttype, changeMsgId, callback) {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function () {
                me.sendMessage(conversationId, message, messagetype, contenttype, changeMsgId, callback);
            }, "sendMessage");
            return "";
        }
        return this.messageService.sendMessage(this.skypeAccount, conversationId, message, messagetype, contenttype, changeMsgId, callback);
    };
    Skyweb.prototype.logout = function (callback) {
        this.loggedOut = true;
        this.lastLogout = new Date();
        var me = this;
        new login_1.default(this.cookieJar, this.eventEmitter).doLogout(function (result) {
            if (me.pollObj)
                me.pollObj.stopPolling = true;
            if (callback)
                callback(result);
        });
    };
    Skyweb.prototype.markConversation = function (conversationId, tsStart, tsEnd, callback) {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function () {
                me.markConversation(conversationId, tsStart, tsEnd, callback);
            }, "markConversation");
            return;
        }
        this.messageService.markConversation(this.skypeAccount, conversationId, tsStart, tsEnd);
    };
    Skyweb.prototype.getContent = function (url, filename, callback) {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function () {
                me.getContent(url, filename, callback);
            }, "getContent");
            return;
        }
        this.messageService.getContent(this.skypeAccount, url, filename, callback);
    };
    Skyweb.prototype.postFile = function (filename, originalFileName, send_to, callback) {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function () {
                me.postFile(filename, originalFileName, send_to, callback);
            }, "postFile");
            return;
        }
        this.messageService.postFile(this.skypeAccount, filename, originalFileName, send_to, callback);
    };
    Skyweb.prototype.setStatus = function (status) {
        this.statusService.setStatus(this.skypeAccount, status);
    };
    Skyweb.prototype.acceptAuthRequest = function (username) {
        return this.requestService.accept(this.skypeAccount, username);
    };
    Skyweb.prototype.declineAuthRequest = function (username) {
        return this.requestService.decline(this.skypeAccount, username);
    };
    Skyweb.prototype.createThread = function (members) {
        return this.threadService.create(this.skypeAccount, members);
    };
    Skyweb.prototype.on = function (eventName, listener) {
        this.eventEmitter.on(eventName, listener);
    };
    Skyweb.prototype.un = function (eventName, listener) {
        this.eventEmitter.un(eventName, listener);
    };
    return Skyweb;
}());
module.exports = Skyweb;
//# sourceMappingURL=skyweb.js.map