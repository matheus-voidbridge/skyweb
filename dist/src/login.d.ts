import SkypeAccount from './skype_account';
import { CookieJar } from "request";
import { Promise } from "es6-promise";
import { EventEmitter } from "./utils";
export declare class Login {
    private requestWithJar;
    private cookieJar;
    private eventEmitter;
    constructor(cookieJar: CookieJar, eventEmitter: EventEmitter);
    doLogin(skypeAccount: SkypeAccount): Promise<{}>;
    doLogout(callback?: any): void;
    requestAsmToken(skypeAccount: SkypeAccount, resolve: any, reject: any): void;
    private sendLoginRequestOauth;
    private promiseSkypeToken;
    private getRegistrationToken;
    private subscribeToResources;
    private createStatusEndpoint;
    private getSelfDisplayName;
}
export default Login;
