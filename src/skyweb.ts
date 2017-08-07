import SkypeAccount from './skype_account';
import ContactsService from './contacts_service';
import * as request from 'request';
import { CookieJar } from "request";
import Login from "./login";
import Poll from "./polling/poll";
import MessageService from "./message_service";
import StatusService from "./status_service";
import AuthRequest from "./polling/auth_request";
import RequestService from "./request_service";
import ThreadService from "./thread_service";
import Status from "./status/status";
import { Promise } from "es6-promise";
import { Member } from "./thread_service";
import { EventEmitter } from "./utils";

class Skyweb {
    public messagesCallback: (messages: Array<any>) => void;
    public skypeAccount: SkypeAccount;
    public contactsService: ContactsService;
    private messageService: MessageService;
    private requestService: RequestService;
    private statusService: StatusService;
    private eventEmitter: EventEmitter;
    public threadService: ThreadService;
    /**
     * CookieJar that is used for this Skyweb instance
     */
    private cookieJar: CookieJar;

    private pollObj: Poll;

    // if skype client is logout / logging in
    public loggedOut: any;
    public lastLogout: Date;     // the date of last logout
    public retryTimeout: number;

    constructor() {
        this.cookieJar = request.jar();
        this.eventEmitter = new EventEmitter();
        this.contactsService = new ContactsService(this.cookieJar, this.eventEmitter);
        this.messageService = new MessageService(this.cookieJar, this.eventEmitter);
        this.requestService = new RequestService(this.cookieJar, this.eventEmitter);
        this.statusService = new StatusService(this.cookieJar, this.eventEmitter);
        this.requestService = new RequestService(this.cookieJar, this.eventEmitter);
        this.threadService = new ThreadService(this.cookieJar, this.eventEmitter);

        this.loggedOut = true;
        this.lastLogout = new Date();
        this.retryTimeout = 1000;
    }

    login(username: any, password: any): Promise<{}> {
        this.skypeAccount = new SkypeAccount(username, password);
        return new Login(this.cookieJar, this.eventEmitter).doLogin(this.skypeAccount).then((skypeAccount: SkypeAccount) => {
            return new Promise(this.contactsService.loadContacts.bind(this.contactsService, skypeAccount));
        }).then((skypeAccount: SkypeAccount) => {
            this.pollObj = new Poll(this.cookieJar, this.eventEmitter);
            this.pollObj.pollAll(skypeAccount, (messages: Array<any>) => {
                if (this.messagesCallback) {
                    this.messagesCallback(messages);
                }
            });
            this.loggedOut = false;
            return skypeAccount;
        });
    }

    waitForLogIn(callAfterDelay: any, who?: string): boolean {
        let timeOut = 60000;
        if (this.loggedOut) {
            var outTimeMs = (new Date().getTime()) - this.lastLogout.getTime();
            if (outTimeMs < timeOut) {
                console.warn(who + ": Wait Skype for relogin, time from logout: " + outTimeMs);
                if (callAfterDelay) setTimeout(callAfterDelay, this.retryTimeout);
                return true;
            } else {
                // timeout exceeds
                console.error(who + ": Wait Skype exceeds timeout, time from logout: " + outTimeMs);
                return false;
            }
        }
        return true;
    }

    sendMessage(conversationId: string, message: string, messagetype?: string, contenttype?: string, changeMsgId?: string, callback?: any): string {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function() {
                    me.sendMessage(conversationId, message, messagetype, contenttype, changeMsgId, callback);
            }, "sendMessage");
            return "";
        }

        return this.messageService.sendMessage(this.skypeAccount, conversationId, message, messagetype, contenttype, changeMsgId, callback);
    }

    logout(callback?: any) {
        // keep logout state
        this.loggedOut = true;
        this.lastLogout = new Date();

        var me = this;
        new Login(this.cookieJar, this.eventEmitter).doLogout(function (result: any) {
            if (me.pollObj) me.pollObj.stopPolling = true;

            if (callback) callback(result);
        });
        //this.cookieJar = request.jar();
    }

    markConversation(conversationId:string, tsStart:any, tsEnd:any, callback?: any) {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function() {
                me.markConversation(conversationId, tsStart, tsEnd, callback);
            }, "markConversation");
            return;
        }
        this.messageService.markConversation(this.skypeAccount, conversationId, tsStart, tsEnd);
    }

    getContent(url: string, filename: string, callback: any) {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function() {
                me.getContent(url, filename, callback);
            }, "getContent");
            return;
        }
        this.messageService.getContent(this.skypeAccount, url, filename, callback);
    }

    public postFile(filename: string, originalFileName: string, send_to: string, callback?: any) {
        var me = this;
        if (this.loggedOut) {
            this.waitForLogIn(function() {
                me.postFile(filename, originalFileName, send_to, callback);
            }, "postFile");
            return;
        }
        this.messageService.postFile(this.skypeAccount, filename, originalFileName, send_to, callback);
    }

    setStatus(status: Status) {
        this.statusService.setStatus(this.skypeAccount, status);
    }

    acceptAuthRequest(username: any) {
        return this.requestService.accept(this.skypeAccount, username);
    }

    declineAuthRequest(username: any) {
        return this.requestService.decline(this.skypeAccount, username);
    }

    createThread(members: Member[]): Promise<string> {
        return this.threadService.create(this.skypeAccount, members);
    }

    on(eventName: string, listener: (eventName: string, content: any) => void) {
        this.eventEmitter.on(eventName, listener);
    }

    un(eventName: string, listener: (eventName: string, content: any) => void) {
        this.eventEmitter.un(eventName, listener);
    }
}

export = Skyweb;
