import * as request from 'request';
import * as Consts from './consts';
import SkypeAccount from './skype_account';
import Utils from './utils';
import * as http from 'http';
import * as https from 'https';
import {CookieJar} from "request";
import {EventEmitter} from "./utils";
import * as fs from 'fs';

export class MessageService {
    private requestWithJar: any;
    private eventEmitter: EventEmitter;

    constructor(cookieJar:CookieJar, eventEmitter: EventEmitter) {
        this.requestWithJar = request.defaults({jar: cookieJar});
        this.eventEmitter = eventEmitter;
    }

    public sendMessage(skypeAccount:SkypeAccount, conversationId:string, message:string, messagetype?:string, contenttype?:string, changeMsgId?: string): string {
        let clientmessageid = changeMsgId || (Math.floor(Utils.getCurrentTime() * 1000) + '');
        var requestBody:any = {
            'content': message,
            'messagetype': messagetype || 'RichText',
            'contenttype': contenttype || 'text'
        };
        if (changeMsgId) requestBody['skypeeditedid'] = changeMsgId;
        else requestBody['clientmessageid'] = clientmessageid;
        this.requestWithJar.post(Consts.SKYPEWEB_HTTPS + skypeAccount.messagesHost + '/v1/users/ME/conversations/' + conversationId + '/messages', {
            body: JSON.stringify(requestBody),
            headers: {
                'RegistrationToken': skypeAccount.registrationTokenParams.raw
            }
        }, (error:any, response:http.IncomingMessage, body:any) => {
            if (!error && response.statusCode === 201) {
                //fixme? send success callback?
            } else {
                this.eventEmitter.fire('error', 'Failed to send message.' +
                    '.\n Error code: ' + response.statusCode +
                    '.\n Error: ' + error +
                    '.\n Body: ' + body
                );
            }
        });
        return clientmessageid;
    }

    public markConversation(skypeAccount:SkypeAccount, conversationId:string, tsStart:any, tsEnd:any) {
        var requestBody = JSON.stringify({
            'consumptionhorizon': tsStart + ';' + tsEnd + ';' + (tsStart+300) //'8626535328339004456',
        });
        this.requestWithJar.put(Consts.SKYPEWEB_HTTPS + skypeAccount.messagesHost + '/v1/users/ME/conversations/' + conversationId + '/properties?name=consumptionhorizon', {
            body: requestBody,
            headers: {
                'RegistrationToken': skypeAccount.registrationTokenParams.raw,
                'Content-Type': 'application/json'
            }
        }, (error:any, response:http.IncomingMessage, body:any) => {
            if (!error && response.statusCode === 200) {
                console.log("Skype conversation was marked as read.");
            } else {
                console.error('Failed to send message.' +
                    '.\n Error code: ' + response.statusCode +
                    '.\n Error: ' + error +
                    '.\n Body: ' + body
                );
            }
        });
    }

    public getContent(skypeAccount: SkypeAccount, url: string, filename: string, callback?: any) {
        var file = fs.createWriteStream(filename);

        let statusCode = 404;
        this.requestWithJar.get(url).on('response', function (response:any) {
            statusCode = response.statusCode;
        }).pipe(file).on('finish', function () {
            const stats = fs.statSync(filename);
            const fileSizeInBytes = stats.size;

            if (statusCode == 200) {
                console.log("Skype: got file content to: " + filename, " size: ", fileSizeInBytes);
                if (callback) callback(true);
            } else {
                console.warn("Skype: got wrong status of receiving file:", statusCode);
                if (callback) callback(false);
            }
        });
    }

    public createAsmObjectId(skypeAccount: SkypeAccount, filename: string, send_to: string, callback?: any) {
        var requestBody = {
            'filename': filename,
            'permissions': {
                [send_to]: ["read"]
            },
            'type': 'sharing/file'
        };
        console.log("POST:" +  JSON.stringify(requestBody));
        this.requestWithJar.post(Consts.SKYPEWEB_ASM_OBJECTS, {
            body: JSON.stringify(requestBody),
            headers: {
                'Authorization': 'skype_token ' + skypeAccount.skypeToken,
                'Content-Type': 'application/json'
            }
        }, (error:any, response:http.IncomingMessage, body:any) => {
            if (!error && response.statusCode === 201) {
                try {
                    let obj = JSON.parse(body);
                    if (callback) callback(obj);
                } catch (e) {
                    this.eventEmitter.fire('error', 'Skype: Failed to create file object, cant recognize json: ' + body);
                    if (callback) callback(false);
                }
            } else {
                this.eventEmitter.fire('error', 'Failed to create file object.' +
                    '.\n Error code: ' + response.statusCode +
                    '.\n Error: ' + error +
                    '.\n Body: ' + body
                );
                if (callback) callback(false);
            }

        });
    }

    public postFile(skypeAccount: SkypeAccount, filename: string, originalFileName: string, send_to: string, callback?: any) {
        var me = this;
        this.createAsmObjectId(skypeAccount, originalFileName, send_to, function (asmObj: any) {
            if (asmObj && asmObj.id) {
                let uri = Consts.SKYPEWEB_ASM_OBJECTS + "/" + asmObj.id;
                let uriUpl = Consts.SKYPEWEB_ASM_OBJECTS + "/" + asmObj.id + "/content/original";
                console.log("Skype: created asm. object, PUT into ", uriUpl);

                const stats = fs.statSync(filename);
                let filesize = stats.size;
                var req = https.request({
                    hostname : 'api.asm.skype.com',
                    port     : 443,
                    path     : '/v1/objects' + "/" + asmObj.id + "/content/original",
                    method   : 'PUT',
                    headers: {
                        'Authorization': 'skype_token ' + skypeAccount.skypeToken,
                        'Content-Type': 'multipart/form-data',
                        'Content-Length': filesize,
                        //'Connection': 'keep-alive'
                    }
                }, function (response: any) {
                    console.log('Skype: file upload result: ' + response.statusCode);
                    //console.log("OPT:", response.headers);

                    // publish file in message
                    let msg = '<URIObject type="File.1" uri="' + uri + '"' +
                        ' url_thumbnail="' + uri + '/views/thumbnail"><Title>Title: ' + originalFileName +
                        '</Title><Description> Description: ' + originalFileName +
                        '</Description><a href="https://login.skype.com/login/sso?go=webclient.xmm&amp;docid=' + asmObj.id +
                        '"> https://login.skype.com/login/sso?go=webclient.xmm&amp;docid=' + asmObj.id +
                        '</a><OriginalName v="' + originalFileName +
                        '"/><FileSize v="' + filesize +
                        '"/></URIObject>';
                    me.sendMessage(skypeAccount, send_to, msg, "RichText/Media_GenericFile");

                    if (callback) callback(true);
                });
                fs.createReadStream(filename).pipe(req).on('finish', function () {
                    console.log("Skype upload finished");
                    //req.end();
                });

                console.log("Skype: SENDING...");
            } else {
                if (callback) callback(false);
            }
        })
    }
}

export default MessageService;
