import SkypeAccount from './skype_account';
import { CookieJar } from "request";
import { EventEmitter } from "./utils";
export declare class MessageService {
    private requestWithJar;
    private eventEmitter;
    constructor(cookieJar: CookieJar, eventEmitter: EventEmitter);
    sendMessage(skypeAccount: SkypeAccount, conversationId: string, message: string, messagetype?: string, contenttype?: string): void;
    getContent(skypeAccount: SkypeAccount, url: string, filename: string, callback?: any): void;
    createAsmObjectId(skypeAccount: SkypeAccount, filename: string, send_to: string, callback?: any): void;
    postFile(skypeAccount: SkypeAccount, filename: string, originalFileName: string, send_to: string, callback?: any): void;
}
export default MessageService;
