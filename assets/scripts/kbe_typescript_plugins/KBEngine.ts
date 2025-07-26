import KBEDebug from "./KBEDebug";
import * as KBEEncoding from "./KBEEncoding";

import { ScriptModule } from "./ScriptModule";
import { Property } from "./Property";
import { Method } from "./Method";
import KBEEvent from "./Event";
import * as ExportEntity from "./ExportEntity";
import { Vector2, Vector3, Vector4, Int8ToAngle,AngleToInt8 } from "./KBEMath";

import { ServerErr, ServerErrorDescrs } from "./ServerErrorDescrs";
import Messages,{ Message } from "./Messages";
import EntityDef from "./EntityDef";

//#region KBEngine app
export class KBEngineArgs {
    address: string = "127.0.0.1";
    port: number = 20013;
    // 心跳频率 （tick数）
    updateTick: number = 60; // 100
    // 自动同步玩家信息到服务端，信息包括位置与方向，毫秒
    // 非高实时类游戏不需要开放这个选项
    syncPlayerMS: number = 1000 / 10;
    clientType: number = 5;
    isOnInitCallPropertysSetMethods: boolean = true;
    useWss = false;
    wssBaseappPort = 443;
}


class ServerError {
    id: number = 0;
    name: string = "";
    description: string = "";
}

const KBE_FLT_MAX: number = 3.402823466e+38;

export class KBEngineApp {
    private args: KBEngineArgs;
    private idInterval: number;
    private updatePlayerToServerInterval: number;

    private userName: string = "test";
    private password: string = "123456";
    private clientDatas: Uint8Array = new Uint8Array(0);
    private encryptedKey: string = "";

    private serverdatas: Uint8Array | undefined;

    private loginappMessageImported = false;
    private baseappMessageImported = false;
    private serverErrorsDescrImported = false;
    private entitydefImported = false;

    private serverErrors: ServerErrorDescrs = new ServerErrorDescrs();

    // 登录loginapp的地址
    private serverAddress: string = "";
    private port = 0;

    // 服务端分配的baseapp地址
    private baseappAddress = "";
    private baseappPort = 0;
    private baseappUDPPort = 0;

    private useWss: boolean = false;
    private wssBaseappPort: number = 443;
    private protocol: string = "";

    public currserver = "loginapp";
    private currstate = "create";

    public networkInterface: NetworkInterface = new NetworkInterface();

    private serverVersion = "";
    private serverScriptVersion = "";
    private serverProtocolMD5 = "EB8AE9F114C8797B1E70E1A629686A27";
    private serverEntityDefMD5 = "46596D3750651E9F679C7775CD577E35";
    private clientVersion = "2.5.10";
    private clientScriptVersion = "0.1.0";

    private lastTickTime: number = 0;
    private lastTickCBTime: number = 0;

    entities: { [id: number]: Entity } = {};
    private bufferedCreateEntityMessage: { [id: number]: MemoryStream } = {};
    entity_id: number = 0;
    private entity_uuid: DataTypes.KB_UINT64 | undefined;    
    private entity_type: string = "";
    private controlledEntities: Array<Entity> = new Array<Entity>();
    private entityIDAliasIDList: Array<number> = new Array<number>();

    

    // 这个参数的选择必须与kbengine_defs.xml::cellapp/aliasEntityID的参数保持一致
    useAliasEntityID = true;

    isOnInitCallPropertysSetMethods = true;

    // 当前玩家最后一次同步到服务端的位置与朝向与服务端最后一次同步过来的位置
    entityServerPos = new Vector3(0.0, 0.0, 0.0);

    // space的数据，具体看API手册关于spaceData
    // https://github.com/kbengine/kbengine/tree/master/docs/api
    spacedata: { [key: string]: string } = {};

    // 玩家当前所在空间的id， 以及空间对应的资源
    spaceID = 0;
    spaceResPath = "";
    isLoadedGeometry = false;

    component: string = "client";

    private static _app: KBEngineApp | undefined = undefined;
    static get app() {
        return KBEngineApp._app;    // 如果外部使用者因为访问到undefined出错，表示需要先Create
    }

    static Create(args: KBEngineArgs): KBEngineApp {
        if (KBEngineApp._app != undefined) {
            throw Error("KBEngineApp must be singleton.");
        }
        new KBEngineApp(args);

        if (KBEngineApp._app === undefined) {
            throw Error("KBEngineApp is not created.");
        }

        return KBEngineApp._app;
    }

    static Destroy() {
        if (KBEngineApp.app === undefined) {
            return;
        }

        if(KBEngineApp.app.currserver == "baseapp")
            KBEngineApp.app.Logout();

        if (KBEngineApp.app.idInterval) {
            clearInterval(KBEngineApp.app.idInterval);
        }

        KBEngineApp.app.UninstallEvents();
        KBEngineApp.app.Reset();
        KBEngineApp._app = undefined;
    }

    private constructor(args: KBEngineArgs) {
        KBEDebug.ASSERT(KBEngineApp._app === undefined, "KBEngineApp::constructor:singleton KBEngineApp._app must be undefined.");
        KBEngineApp._app = this;

        this.args = args;
        this.serverAddress = args.address;
        this.port = args.port;
        this.useWss = args.useWss;
        this.wssBaseappPort = args.wssBaseappPort;
        this.protocol = args.useWss ? "wss://" : "ws://";


        EntityDef.init();

        this.InstallEvents();

        Messages.BindFixedMessage();
        // DataTypes.InitDatatypeMapping();

        let now = new Date().getTime();
        this.lastTickTime = now;
        this.lastTickCBTime = now;
        this.idInterval = setInterval(this.Update.bind(this), this.args.updateTick);
        this.updatePlayerToServerInterval = setInterval(this.UpdatePlayer.bind(this), this.args.syncPlayerMS);
    }

    InstallEvents(): void {
        KBEDebug.DEBUG_MSG("KBEngineApp::InstallEvents");
        KBEEvent.Register("createAccount", this, this.CreateAccount);
        KBEEvent.Register("login", this, this.Login);
        KBEEvent.Register("logout", this, this.Logout);
        KBEEvent.Register("reloginBaseapp", this, this.ReloginBaseapp);
        KBEEvent.Register("resetPassword", this, this.Reset_password);
        KBEEvent.Register("bindAccountEmail", this, this.BindAccountEmail);
        KBEEvent.Register("newPassword", this, this.NewPassword);

        KBEEvent.Register("onDisconnected", this, this.OnDisconnected);
        KBEEvent.Register("onNetworkError", this, this.OnNetworkError);


    }

    OnDisconnected() {
        this.networkInterface.Close();
    }

    OnNetworkError(event: MessageEvent) {
        KBEDebug.ERROR_MSG("KBEngineApp::OnNetworkError:%s.", event.toString())
        this.networkInterface.Close();
    }

    UninstallEvents() {
        KBEEvent.DeregisterObject(this);
    }

    Update(): void {
        KBEngineApp.app!.SendTick();
    }

    private GetLoginappAddr(): string {
        let addr: string = "";
        if (this.useWss) {
            addr = this.protocol + this.serverAddress + ":" + this.port + "/loginapp";
        }
        else {
            addr = this.protocol + this.serverAddress + ":" + this.port;
        }

        return addr;
    }

    private GetBaseappAddr(): string {
        let addr: string = "";
        if (this.useWss) {
            addr = this.protocol + this.baseappAddress + ":" + this.wssBaseappPort + "/baseapp" + "?port=" + this.baseappPort;
        }
        else {
            addr = this.protocol + this.baseappAddress + ":" + this.baseappPort;
        }
        return addr;
    }

    /**
     * 登出baseapp
     */
    private Logout()
    {
        let bundle = new Bundle();
        bundle.NewMessage(Messages.messages["Baseapp_logoutBaseapp"]);
        bundle.WriteUint64(this.entity_uuid!);  
        bundle.WriteInt32(this.entity_id);
        bundle.Send(this.networkInterface);
    }

    /**
     * 通过错误id得到错误描述
     */
    public ServerErr(id: number):string
    {
        let err = this.serverErrors.serverErr(id);
        return err?.name + "[" + err?.descr + "]";
    }

    /**
     * 通过错误id得到错误描述
     */
    public ServerErrItem(id: number) : ServerErr
    {
        let err = this.serverErrors.serverErr(id);
        return err;
    }

    /**
     * 向服务端发送心跳以及同步角色信息到服务端
     */
    private SendTick() {
        if (!this.networkInterface.IsGood) {
            //KBEDebug.DEBUG_MSG("KBEngineApp::SendTick...this.networkInterface is not ready.");
            return;
        }

        let now = (new Date()).getTime();
        //KBEDebug.DEBUG_MSG("KBEngineApp::SendTick...now(%d), this.lastTickTime(%d), this.lastTickCBTime(%d).", now, this.lastTickTime, this.lastTickCBTime);
        if ((now - this.lastTickTime) / 1000 > 15) {
            if (this.lastTickCBTime < this.lastTickTime) {
                KBEDebug.ERROR_MSG("KBEngineApp::Update: Receive appTick timeout!");
                this.networkInterface.Close();
                return;
            }

            let bundle = new Bundle();

            if (this.currserver === "loginapp") {
                bundle.NewMessage(Messages.messages["Loginapp_onClientActiveTick"]);
            }
            else {
                bundle.NewMessage(Messages.messages["Baseapp_onClientActiveTick"]);
            }
            bundle.Send(this.networkInterface);

            this.lastTickTime = now;
        }

        this.UpdatePlayerToServer();
    }

    Reset(): void {
        KBEDebug.DEBUG_MSG("KBEngineApp::Reset");

        // todo 需要实现
        // KBEngine.Event.clearFiredEvents(); 

        this.ClearEntities(true);

        this.networkInterface.Close();

        this.currserver = "loginapp";
        this.currstate = "create";

        // 扩展数据
        this.serverdatas = undefined;

        // 版本信息
        this.serverVersion = "";
        this.serverScriptVersion = "";

        // player的相关信息
        this.entity_uuid = undefined;
        this.entity_id = 0;
        this.entity_type = "";

        // 当前玩家最后一次同步到服务端的位置与朝向与服务端最后一次同步过来的位置
        this.entityServerPos = new Vector3(0.0, 0.0, 0.0);

        // 客户端所有的实体
        this.entityIDAliasIDList = [];

        // 空间的信息
        this.spacedata = {};
        this.spaceID = 0;
        this.spaceResPath = "";
        this.isLoadedGeometry = false;

        // 对象实例化时用即时时间初始化，否则update会不断执行，然而此时可能刚连接上服务器，但还未登陆，没导入协议，有可能导致出错
        // 如此初始化后会等待15s才会向服务器tick，时间已经足够服务器准备好
        var dateObject = new Date();
        this.lastTickTime = dateObject.getTime();
        this.lastTickCBTime = dateObject.getTime();

        // DataTypes.Reset();

        // 当前组件类别， 配套服务端体系
        this.component = "client";
    }


    FindEntity(entityID: number) {
        return this.entities[entityID];
    }

    Login(userName: string, password: string, datas): void {
        this.Reset();
        this.userName = userName;
        this.password = password;
        this.clientDatas = datas;

        this.Login_loginapp(true);
    }

    private Login_loginapp(noconnect: boolean): void {
        if (noconnect) {
            let addr: string = this.GetLoginappAddr();
            KBEDebug.DEBUG_MSG("KBEngineApp::Login_loginapp: start connect to " + addr + "!");

            this.networkInterface.ConnectTo(addr, (event: Event) => this.OnOpenLoginapp_login(event as MessageEvent));
        }
        else {
            let bundle = new Bundle();
            bundle.NewMessage(Messages.messages["Loginapp_login"]);
            bundle.WriteInt8(this.args.clientType);
            bundle.WriteBlob(this.clientDatas);
            bundle.WriteString(this.userName);
            bundle.WriteString(this.password);
            bundle.Send(this.networkInterface);
        }
    }

    private OnOpenLoginapp_login(event: MessageEvent) {
        KBEDebug.DEBUG_MSG("KBEngineApp::onOpenLoginapp_login:success to %s.", this.serverAddress);
        
        this.lastTickCBTime = (new Date()).getTime();

        if (!this.networkInterface.IsGood)   // 有可能在连接过程中被关闭
        {
            KBEDebug.WARNING_MSG("KBEngineApp::onOpenLoginapp_login:network has been closed in connecting!");
            return;
        }

        this.currserver = "loginapp";
        this.currstate = "login";

        KBEEvent.Fire("onConnectionState", true);

        KBEDebug.DEBUG_MSG(`KBEngine::login_loginapp(): connect ${this.serverAddress}:${this.port} success!`);

        this.Hello();
    }

    BindAccountEmail(emailAddress: string) {
        let bundle = new Bundle();
        bundle.NewMessage(Messages.messages["Baseapp_reqAccountBindEmail"])
        bundle.WriteInt32(this.entity_id);
        bundle.WriteString(this.password);
        bundle.WriteString(emailAddress);
        bundle.Send(this.networkInterface);
    }

    // 设置新密码，通过baseapp， 必须玩家登录在线操作所以是baseapp。
    NewPassword(old_password: string, new_password: string) {
        let bundle = new Bundle();
        bundle.NewMessage(Messages.messages["Baseapp_reqAccountNewPassword"]);
        bundle.WriteInt32(this.entity_id);
        bundle.WriteString(old_password);
        bundle.WriteString(new_password);
        bundle.Send(this.networkInterface);
    }

    Reset_password(userName: string) {
        this.Reset();
        this.userName = userName;
        this.Resetpassword_loginapp(true);
    }

    Resetpassword_loginapp(noconnect: boolean) {
        if (noconnect) {
            let addr = this.GetLoginappAddr();
            KBEDebug.DEBUG_MSG("KBEngineApp::Resetpassword_loginapp: start connect to %s!", addr);
            this.networkInterface.ConnectTo(addr, (event: Event) => this.OnOpenLoginapp_resetpassword(event as MessageEvent));
        }
        else {
            let bundle = new Bundle();
            bundle.NewMessage(Messages.messages["Loginapp_reqAccountResetPassword"]);
            bundle.WriteString(this.userName);
            bundle.Send(this.networkInterface);
        }
    }

    private OnOpenLoginapp_resetpassword(event: MessageEvent) {
        KBEDebug.DEBUG_MSG("KBEngineApp::onOpenLoginapp_resetpassword: successfully!");
        this.currserver = "loginapp";
        this.currstate = "resetpassword";

        this.Resetpassword_loginapp(false);
   
    }

    CreateAccount(userName: string, password: string, datas) {
        this.Reset();
        this.userName = userName;
        this.password = password;
        this.clientDatas = datas;

        this.CreateAccount_loginapp(true);
    }

    OnOpenLoginapp_createAccount(event: MessageEvent) {
        KBEEvent.Fire("onConnectionState", true);
        KBEDebug.DEBUG_MSG("KBEngineApp::OnOpenLoginapp_createAccount: successfully!");
        this.currserver = "loginapp";
        this.currstate = "createAccount";

        this.CreateAccount_loginapp(false);
    }

    CreateAccount_loginapp(noconnect: boolean) {
        if (noconnect) {
            let addr = this.GetLoginappAddr();
            KBEDebug.DEBUG_MSG("KBEngineApp::CreateAccount_loginapp: start connect to %s!", addr);
            this.networkInterface.ConnectTo(addr, (event: Event) => this.OnOpenLoginapp_createAccount(event as MessageEvent));
        }
        else {
            let bundle = new Bundle();
            bundle.NewMessage(Messages.messages["Loginapp_reqCreateAccount"]);
            bundle.WriteString(this.userName);
            bundle.WriteString(this.password);
            bundle.WriteBlob(this.clientDatas);

            bundle.Send(this.networkInterface);
        }
    }

    ReloginBaseapp() {
        this.lastTickTime = (new Date()).getTime();
        this.lastTickCBTime = (new Date()).getTime();

        if (this.networkInterface.IsGood)
            return;

        this.networkInterface.Close();
        KBEEvent.Fire("onReloginBaseapp");
        let addr = this.GetBaseappAddr();
        KBEDebug.DEBUG_MSG("KBEngineApp::reloginBaseapp: start connect to %s!", addr);
        this.networkInterface.ConnectTo(addr, (event: Event) => this.OnReOpenBaseapp(event as MessageEvent));
    }

    OnReOpenBaseapp(event: MessageEvent) {
        KBEDebug.DEBUG_MSG("KBEngineApp::onReOpenBaseapp: successfully!");
        this.currserver = "baseapp";

        let bundle = new Bundle();
        bundle.NewMessage(Messages.messages["Baseapp_reloginBaseapp"]);
        bundle.WriteString(this.userName);
        bundle.WriteString(this.password);
        bundle.WriteUint64(this.entity_uuid!);
        bundle.WriteUint32(this.entity_id);
        bundle.Send(this.networkInterface);

        this.lastTickCBTime = (new Date()).getTime();
    }

    Client_onImportClientMessages(stream: MemoryStream) {
        // 无需实现，已由插件生成静态代码
    }

    Client_onUpdateData_xyz_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);
        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();
        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, 0, true);
    }

    private OnImportClientMessages(stream: MemoryStream): void {
        // 无需实现，已由插件生成静态代码
    }

    private OnImportClientMessagesCompleted() {
        // 无需实现，已由插件生成静态代码
    }

    private OnImportEntityDefCompleted() {
        // 无需实现，已由插件生成静态代码
    }

    private IsClientMessage(name: string): boolean {
        return name.indexOf("Client_") >= 0;
    }

    private GetFunction(name: string): Function {
        let func: Function | undefined = this[name];
        if (!(func instanceof Function)) {
            func = undefined;
        }
        return func!;
    }

    /**
     *  与服务端握手，与任何一个进程连接之后应该第一时间进行握手
     */
    private Hello() {
        KBEDebug.DEBUG_MSG("KBEngine::Hello.........current server:%s.", this.currserver);
        let bundle: Bundle = new Bundle();
        if (this.currserver === "loginapp") {
            bundle.NewMessage(Messages.messages["Loginapp_hello"]);
        }
        else {
            bundle.NewMessage(Messages.messages["Baseapp_hello"]);
        }

        bundle.WriteString(this.clientVersion);
        bundle.WriteString(this.clientScriptVersion);
        bundle.WriteBlob(this.encryptedKey);
        bundle.Send(this.networkInterface);
    }

    /**
     * 服务端握手回调
     * @param stream 
     */
    Client_onHelloCB(stream: MemoryStream) {
        KBEDebug.DEBUG_MSG("KBEngine::Client_onHelloCB.........stream length:%d.", stream.Length());
        this.serverVersion = stream.ReadString();
        this.serverScriptVersion = stream.ReadString();
        this.serverProtocolMD5 = stream.ReadString();
        this.serverEntityDefMD5 = stream.ReadString();
        let ctype = stream.ReadInt32();

        KBEDebug.DEBUG_MSG("KBEngineApp::Client_onHelloCB: verInfo(" + this.serverVersion + "), scriptVerInfo(" +
            this.serverScriptVersion + "), serverProtocolMD5(" + this.serverProtocolMD5 + "), serverEntityDefMD5(" +
            this.serverEntityDefMD5 + "), ctype(" + ctype + ")!");

        this.lastTickCBTime = (new Date()).getTime();

        if(this.currserver == "baseapp")
        {
            this.Login_baseapp(false);
        }
        else
        {
            this.Login_loginapp(false);
        }

    }

    Client_onVersionNotMatch(stream: MemoryStream) {
        KBEDebug.DEBUG_MSG("KBEngine::Client_onVersionNotMatch.........stream length:%d.", stream.Length());
        this.serverVersion = stream.ReadString();
        KBEDebug.ERROR_MSG("Client_onVersionNotMatch: verInfo=" + this.clientVersion + " not match(server: " + this.serverVersion + ")");
        KBEEvent.Fire("onVersionNotMatch", this.clientVersion, this.serverVersion);
    }

    Client_onScriptVersionNotMatch(stream: MemoryStream) {
        this.serverScriptVersion = stream.ReadString();
        KBEDebug.ERROR_MSG("Client_onScriptVersionNotMatch: verInfo=" + this.clientScriptVersion + " not match(server: " + this.serverScriptVersion + ")");
        KBEEvent.Fire("onScriptVersionNotMatch", this.clientScriptVersion, this.serverScriptVersion);
    }

    /**
     * 服务器心跳回调
     */
    Client_onAppActiveTickCB() {
        let dateObject = new Date();
        this.lastTickCBTime = dateObject.getTime();
        KBEDebug.DEBUG_MSG("KBEngine::Client_onAppActiveTickCB.........lastTickCBTime:%d.", this.lastTickCBTime);
    }

    /**
     * 服务端错误描述导入
     * @param stream 
     */
    Client_onImportServerErrorsDescr(stream: MemoryStream) {
       // 无需实现，已由插件生成静态代码
    }


    private UpdatePlayer(){
        KBEngineApp.app!.UpdatePlayerToServer();
    }

    private UpdatePlayerToServer() {
        let player = this.Player();
        if (player == undefined || player.inWorld == false || this.spaceID === 0 || player.isControlled)
            return;

        if (player.entityLastLocalPos.Distance(player.position) > 0.001 || player.entityLastLocalDir.Distance(player.direction) > 0.001) {
            // 记录玩家最后一次上报位置时自身当前的位置
            player.entityLastLocalPos.x = player.position.x;
            player.entityLastLocalPos.y = player.position.y;
            player.entityLastLocalPos.z = player.position.z;
            player.entityLastLocalDir.x = player.direction.x;
            player.entityLastLocalDir.y = player.direction.y;
            player.entityLastLocalDir.z = player.direction.z;

            let bundle = new Bundle();
            bundle.NewMessage(Messages.messages["Baseapp_onUpdateDataFromClient"]);
            bundle.WriteFloat(player.position.x);
            bundle.WriteFloat(player.position.y);
            bundle.WriteFloat(player.position.z);

            let x = player.direction.x / 360 * (2 * Math.PI);
            let y = player.direction.y / 360 * (2 * Math.PI);
            let z = player.direction.z / 360 * (2 * Math.PI);

            if( x - Math.PI > 0.0){
                x = x - Math.PI * 2;
            }
            if( y - Math.PI > 0.0){
                y = y - Math.PI * 2;
            }
            if( z - Math.PI > 0.0){
                z = z - Math.PI * 2;
            }

            bundle.WriteFloat(x);
            bundle.WriteFloat(y);
            bundle.WriteFloat(z);

            let isOnGound = player.isOnGround ? 1 : 0;
            bundle.WriteUint8(isOnGound);
            bundle.WriteUint32(this.spaceID);
            bundle.Send(this.networkInterface);
        }

        // 开始同步所有被控制了的entity的位置
        for (let entity of this.controlledEntities) {
            let position = entity.position;
            let direction = entity.direction;

            let posHasChanged = entity.entityLastLocalPos.Distance(position) > 0.001;
            let dirHasChanged = entity.entityLastLocalDir.Distance(direction) > 0.001;
            if (posHasChanged || dirHasChanged) {
                entity.entityLastLocalPos = position;
                entity.entityLastLocalDir = direction;

                let bundle = new Bundle();
                bundle.NewMessage(Messages.messages["Baseapp_onUpdateDataFromClientForControlledEntity"]);
                bundle.WriteInt32(entity.id);
                bundle.WriteFloat(position.x);
                bundle.WriteFloat(position.y);
                bundle.WriteFloat(position.z);


                let x = entity.direction.x / 360 * (2 * Math.PI);
                let y = entity.direction.y / 360 * (2 * Math.PI);
                let z = entity.direction.z / 360 * (2 * Math.PI);
    
                if( x - Math.PI > 0.0){
                    x = x - Math.PI * 2;
                }
                if( y - Math.PI > 0.0){
                    y = y - Math.PI * 2;
                }
                if( z - Math.PI > 0.0){
                    z = z - Math.PI * 2;
                }
                
                bundle.WriteFloat(x);
                bundle.WriteFloat(y);
                bundle.WriteFloat(z);

                let isOnGound = player.isOnGround ? 1 : 0;
                bundle.WriteUint8(isOnGound);
                bundle.WriteUint32(this.spaceID);
                bundle.Send(this.networkInterface);
            }
        }
    }

    Client_onLoginFailed(stream: MemoryStream) {
        var failedcode = stream.ReadUint16();
        this.serverdatas = stream.ReadBlob();
        KBEDebug.ERROR_MSG("KBEngineApp::Client_onLoginFailed: failedcode(" + this.serverErrors.serverErr(failedcode)?.name + "), datas(" + this.serverdatas.length + ")!");
        KBEEvent.Fire("onLoginFailed", failedcode);
    }

    Client_onLoginSuccessfully(stream: MemoryStream) {
        KBEDebug.DEBUG_MSG("Client_onLoginSuccessfully------------------->>>");
        var accountName = stream.ReadString();
        this.userName = accountName;
        this.baseappAddress = stream.ReadString();
        this.baseappPort = stream.ReadUint16();
        this.baseappUDPPort = stream.ReadUint16();
        this.serverdatas = stream.ReadBlob();

        KBEDebug.DEBUG_MSG("KBEngineApp::Client_onLoginSuccessfully: accountName(" + accountName + "), addr(" +
            this.baseappAddress + ":" + this.baseappPort + "), datas(" + this.serverdatas.length + ")!");

        this.networkInterface.Close();
        this.Login_baseapp(true);
    }

    private Login_baseapp(noconnect: boolean) {
        if (noconnect) {
            let addr: string = this.GetBaseappAddr();
            KBEDebug.DEBUG_MSG("KBEngineApp::Login_baseapp: start connect to " + addr + "!");

            this.networkInterface.ConnectTo(addr, (event: Event) => this.OnOpenBaseapp(event as MessageEvent));
        }
        else {
            let bundle = new Bundle();
            bundle.NewMessage(Messages.messages["Baseapp_loginBaseapp"]);
            bundle.WriteString(this.userName);
            bundle.WriteString(this.password);
            bundle.Send(this.networkInterface);
        }
    }

    private OnOpenBaseapp(event: MessageEvent) {
        KBEDebug.DEBUG_MSG("KBEngineApp::onOpenBaseapp: successfully!");
        this.currserver = "baseapp";
        this.currstate = "";
        this.Hello();

        this.lastTickCBTime = (new Date()).getTime();
    }


    Client_onLoginBaseappFailed(failedcode) {
        KBEDebug.ERROR_MSG("KBEngineApp::Client_onLoginBaseappFailed: failedcode(" + this.serverErrors.serverErr(failedcode)?.name + ")!");
        KBEEvent.Fire("onLoginBaseappFailed", failedcode);
    }

    Client_onReloginBaseappFailed(failedcode) {
        KBEDebug.ERROR_MSG("KBEngineApp::Client_onReloginBaseappFailed: failedcode(" + this.serverErrors.serverErr(failedcode)?.name + ")!");
        KBEEvent.Fire("onReloginBaseappFailed", failedcode);
    }

    Client_onReloginBaseappSuccessfully(stream: MemoryStream) {
        this.entity_uuid = stream.ReadUint64();
        KBEDebug.DEBUG_MSG("KBEngineApp::Client_onReloginBaseappSuccessfully: " + this.userName);
        KBEEvent.Fire("onReloginBaseappSuccessfully");
    }

    Client_onImportClientEntityDef(stream: MemoryStream) {
        // 无需实现，已由插件生成静态代码
    }

    /**
     * 从服务端返回的二进制流导入客户端消息协议
     * @param stream 
     */
    OnImportClientEntityDef(stream: MemoryStream) {
        // 无需实现，已由插件生成静态代码
    }
    
    


    // 服务端使用优化的方式更新实体属性数据
    Client_onUpdatePropertysOptimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);
        this.OnUpdatePropertys(eid, stream);
    }

    Client_onUpdatePropertys(stream: MemoryStream) {
        let eid = stream.ReadInt32();
        //KBEDebug.DEBUG_MSG("Client_onUpdatePropertys------------------->>>eid:%s.", eid);
        this.OnUpdatePropertys(eid, stream);
    }

    OnUpdatePropertys(eid: number, stream: MemoryStream) {
        let entity = this.entities[eid];
        if (entity === undefined) {
            let entityStream = this.bufferedCreateEntityMessage[eid];
            if (entityStream !== undefined) {
                KBEDebug.ERROR_MSG("KBEngineApp::OnUpdatePropertys: entity(%i) not found.", eid);
                return;
            }

            let tempStream = new MemoryStream(stream.GetRawBuffer());
            tempStream.wpos = stream.wpos;
            tempStream.rpos = stream.rpos - 4;
            this.bufferedCreateEntityMessage[eid] = tempStream;
            return;
        }
        entity.onUpdatePropertys(stream);
    }

    Client_onCreatedProxies(rndUUID: DataTypes.KB_UINT64, eid: number, entityType: string) {
        KBEDebug.DEBUG_MSG("KBEngineApp::Client_onCreatedProxies: uuid:(%s) eid(%d), entityType(%s)!", rndUUID.toString(), eid, entityType);
        this.entity_uuid = rndUUID;
        this.entity_id = eid;
        this.entity_type = entityType;

        let entity = this.entities[eid];
        if (entity === undefined) {
            let scriptModule: ScriptModule = EntityDef.moduledefs[entityType];
            if (scriptModule === undefined) {
                KBEDebug.ERROR_MSG("KBEngineApp::Client_onCreatedProxies:script(%s) is undefined.", entityType);
                return;
            }

            let entity: Entity = new scriptModule.script();
            entity.id = eid;
            entity.className = entityType;
            entity.onGetBase();

            this.entities[eid] = entity;



            let entityStream = this.bufferedCreateEntityMessage[eid];
            if (entityStream !== undefined) {
                this.Client_onUpdatePropertys(entityStream);
                delete this.bufferedCreateEntityMessage[eid];
            }


            entity.__init__();
            entity.attachComponents();
            entity.inited = true;



            if (this.args.isOnInitCallPropertysSetMethods)
                entity.CallPropertysSetMethods();
        }
        else {
            let entityStream = this.bufferedCreateEntityMessage[eid];
            if (entityStream !== undefined) {
                this.Client_onUpdatePropertys(entityStream);
                delete this.bufferedCreateEntityMessage[eid];
            }
        }
    }

    OnRemoteMethodCall(eid: number, stream: MemoryStream) {
        let entity = this.entities[eid];
        if (entity === undefined) {
            KBEDebug.ERROR_MSG("KBEngineApp::Client_onRemoteMethodCall: entity(%d) not found!", eid);
            return;
        }
        entity.onRemoteMethodCall(stream);
      
    }

    Client_onRemoteMethodCall(stream: MemoryStream) {
        let eid = stream.ReadUint32();
        this.OnRemoteMethodCall(eid, stream);
    }

    Client_onRemoteMethodCallOptimized(stream: MemoryStream) {
        //KBEDebug.DEBUG_MSG("Client_onRemoteMethodCallOptimized------------------->>>.");
        let eid = this.GetViewEntityIDFromStream(stream);
        this.OnRemoteMethodCall(eid, stream);
    }

    Client_onEntityEnterWorld(stream: MemoryStream) {
        //KBEDebug.DEBUG_MSG("Client_onEntityEnterWorld------------------->>>.");

        let eid = stream.ReadInt32();
        if (this.entity_id > 0 && this.entity_id !== eid)
            this.entityIDAliasIDList.push(eid);

        let uentityType = 0;
        let useScriptModuleAlias: boolean = Object.keys(EntityDef.moduledefs).length > 255;
        if (useScriptModuleAlias)
            uentityType = stream.ReadUint16();
        else
            uentityType = stream.ReadUint8();

        let isOnGround: number = 1;
        if (stream.Length() > 0)
            isOnGround = stream.ReadInt8();

        let entity: Entity = this.entities[eid];
        if (entity === undefined) {
            let entityStream = this.bufferedCreateEntityMessage[eid];
            if (entityStream === undefined) {
                KBEDebug.ERROR_MSG("KBEngine::Client_onEntityEnterWorld: entity(%d) not found!", eid);
                return;
            }

            let entityType  = EntityDef.idmoduledefs[uentityType].name
            let module: ScriptModule = EntityDef.moduledefs[entityType]
            if (module === undefined) {
                KBEDebug.ERROR_MSG("KBEngine::Client_onEntityEnterWorld: not found module(" + entityType + ")!");
                return;
            }

            if (module.script === undefined)
                return;

            entity = new module.script();
            entity.id = eid;
            entity.className = module.name;

            entity.onGetCell();

            this.entities[eid] = entity;

            entity.isOnGround = isOnGround > 0;

            entity.__init__();
            entity.inWorld = true;
            entity.EnterWorld();

            if (this.args.isOnInitCallPropertysSetMethods)
                entity.CallPropertysSetMethods();

            this.Client_onUpdatePropertys(entityStream);
            delete this.bufferedCreateEntityMessage[eid];
        }
        else {
            if (!entity.inWorld) {
                // 安全起见， 这里清空一下
                // 如果服务端上使用giveClientTo切换控制权
                // 之前的实体已经进入世界，切换后的实体也进入世界，这里可能会残留之前那个实体进入世界的信息
                this.entityIDAliasIDList = [];
                this.entities = {}
                this.entities[entity.id] = entity

                entity.onGetCell();


                entity.onDirectionChanged(entity.direction);
                entity.onPositionChanged(entity.position);

                this.entityServerPos = entity.position;

                entity.isOnGround = isOnGround > 0;
                entity.inWorld = true;
                entity.EnterWorld();

                if (this.args.isOnInitCallPropertysSetMethods)
                    entity.CallPropertysSetMethods();
            }
        }
    }

    Client_onEntityLeaveWorldOptimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);
        this.Client_onEntityLeaveWorld(eid);
    }

    Client_onEntityLeaveWorld(eid: number) {
        let entity = this.entities[eid];
        if (entity === undefined) {
            KBEDebug.ERROR_MSG("KBEngineApp::Client_onEntityLeaveWorld: entity(" + eid + ") not found!");
            return;
        }

        if (entity.inWorld)
            entity.LeaveWorld();

        if (this.entity_id === eid) {
            this.ClearSpace(false);
            entity.onLoseCell();
        }
        else {
            let index = this.controlledEntities.indexOf(entity);
            if (index !== -1) {
                this.controlledEntities.splice(index, 1);
                KBEEvent.Fire("onLoseControlledEntity", entity);
            }

            index = this.entityIDAliasIDList.indexOf(eid);
            if (index != -1)
                this.entityIDAliasIDList.splice(index, 1);

            delete this.entities[eid];
            entity.Destroy();
        }
    }

    Client_initSpaceData(stream: MemoryStream) {
        this.ClearSpace(false);

        let spaceID = stream.ReadUint32();
        while (stream.Length() > 0) {
            let key = stream.ReadString();
            let value = stream.ReadString();
            this.Client_setSpaceData(spaceID, key, value);
        }

        KBEDebug.DEBUG_MSG("KBEngine::Client_initSpaceData: spaceID(" + spaceID + "), size(" + Object.keys(this.spacedata).length + ")!");
    }

    Client_setSpaceData(spaceID: number, key: string, value: string) {
        KBEDebug.DEBUG_MSG("KBEngine::Client_setSpaceData: spaceID(" + spaceID + "), key(" + key + "), value(" + value + ")!");

        this.spacedata[key] = value;

        if (key.indexOf("_mapping") != -1)
            this.AddSpaceGeometryMapping(spaceID, value);

        KBEEvent.Fire("onSetSpaceData", spaceID, key, value);
    }

    // 服务端删除客户端的spacedata， spacedata请参考API
    Client_delSpaceData(spaceID: number, key: string) {
        KBEDebug.DEBUG_MSG("KBEngine::Client_delSpaceData: spaceID(" + spaceID + "), key(" + key + ")");
        delete this.spacedata[key];
        KBEEvent.Fire("onDelSpaceData", spaceID, key);
    }

    Client_onEntityEnterSpace(stream: MemoryStream) {
        let eid = stream.ReadInt32();
        this.spaceID = stream.ReadUint32();

        let isOnGround = 1;
        if (stream.Length() > 0)
            isOnGround = stream.ReadInt8();

        let entity = this.entities[eid];
        if (entity === undefined) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onEntityEnterSpace: entity(" + eid + ") not found!");
            return;
        }

        this.entityServerPos.x = entity.position.x;
        this.entityServerPos.y = entity.position.y;
        this.entityServerPos.z = entity.position.z;
        entity.isOnGround = isOnGround > 0;
        entity.EnterSpace();
    }

    Client_onEntityLeaveSpace(eid: number) {
        let entity = this.entities[eid];
        if (entity === undefined) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onEntityLeaveSpace: entity(" + eid + ") not found!");
            return;
        }

        entity.LeaveSpace();
        this.ClearSpace(false);
    }

    Player(): Entity {
        return this.entities[this.entity_id];
    }

    ClearSpace(isAll: boolean) {
        this.entityIDAliasIDList = [];
        this.spacedata = {};
        this.ClearEntities(isAll);
        this.isLoadedGeometry = false;
        this.spaceID = 0;
    }

    ClearEntities(isAll: boolean) {
        this.controlledEntities = [];
        if (!isAll) {
            let entity: Entity = this.Player();

            for (let eid in this.entities) {
                let eid_number = Number(eid);
                if (eid_number == entity.id)
                    continue;

                if (this.entities[eid].inWorld) {
                    this.entities[eid].LeaveWorld();
                }

                this.entities[eid].Destroy();
            }

            this.entities = {}
            this.entities[entity.id] = entity;
        }
        else {
            for (let eid in this.entities) {
                if (this.entities[eid].inWorld) {
                    this.entities[eid].LeaveWorld();
                }

                this.entities[eid].Destroy();
            }

            this.entities = {}
        }
    }

    GetViewEntityIDFromStream(stream: MemoryStream) {
        let id = 0;
        if (this.entityIDAliasIDList.length > 255) {
            id = stream.ReadInt32();
        }
        else {
            var aliasID = stream.ReadUint8();

            // 如果为0且客户端上一步是重登陆或者重连操作并且服务端entity在断线期间一直处于在线状态
            // 则可以忽略这个错误, 因为cellapp可能一直在向baseapp发送同步消息， 当客户端重连上时未等
            // 服务端初始化步骤开始则收到同步信息, 此时这里就会出错。
            if (this.entityIDAliasIDList.length <= aliasID)
                return 0;

            id = this.entityIDAliasIDList[aliasID];
        }

        return id;
    }

    // 当前space添加了关于几何等信息的映射资源
    // 客户端可以通过这个资源信息来加载对应的场景
    AddSpaceGeometryMapping(spaceID: number, resPath: string) {
        KBEDebug.DEBUG_MSG("KBEngine::addSpaceGeometryMapping: spaceID(" + spaceID + "), resPath(" + resPath + ")!");

        this.isLoadedGeometry = true;
        this.spaceID = spaceID;
        this.spaceResPath = resPath;

        KBEEvent.Fire("addSpaceGeometryMapping", resPath);
    }

    Client_onKicked(failedcode: number) {
        KBEDebug.ERROR_MSG("KBEngineApp::Client_onKicked: failedcode(" + this.serverErrors.serverErr(failedcode)?.name + ")!");
        KBEEvent.Fire("onKicked", failedcode);
    }

    Client_onCreateAccountResult(stream: MemoryStream) {
        let retcode = stream.ReadUint16();
        let datas = stream.ReadBlob();

        KBEEvent.Fire("onCreateAccountResult", retcode, datas);

        if (retcode != 0) {
            KBEDebug.ERROR_MSG("KBEngineApp::Client_onCreateAccountResult: " + this.userName + " create is failed! code=" + this.serverErrors.serverErr(retcode)?.name + "!");
            return;
        }

        KBEDebug.DEBUG_MSG("KBEngineApp::Client_onCreateAccountResult: " + this.userName + " create is successfully!");
    }

    Client_onReqAccountResetPasswordCB(failcode: number) {
        KBEEvent.Fire("onResetPassword", failcode);
        
        if (failcode != 0) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onReqAccountResetPasswordCB: " + this.userName + " is failed! code=" + failcode + "!");
            return;
        }

        KBEDebug.DEBUG_MSG("KBEngine::Client_onReqAccountResetPasswordCB: " + this.userName + " is successfully!");
    }

    Client_onReqAccountBindEmailCB(failcode: number) {
        KBEEvent.Fire("onBindAccountEmail", failcode);

        if (failcode != 0) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onReqAccountBindEmailCB: " + this.userName + " is failed! code=" + failcode + "!");
            return;
        }

        KBEDebug.DEBUG_MSG("KBEngine::Client_onReqAccountBindEmailCB: " + this.userName + " is successfully!");
    }

    Client_onReqAccountNewPasswordCB(failcode: number) {
        KBEEvent.Fire("onNewPassword", failcode);
        
        if (failcode != 0) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onReqAccountNewPasswordCB: " + this.userName + " is failed! code=" + failcode + "!");
            return;
        }

        KBEDebug.DEBUG_MSG("KBEngine::Client_onReqAccountNewPasswordCB: " + this.userName + " is successfully!");
    }

    Client_onEntityDestroyed(eid: number) {
        KBEDebug.DEBUG_MSG("KBEngine::Client_onEntityDestroyed: entity(" + eid + ")");

        let entity = this.entities[eid];

        if (entity === undefined) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onEntityDestroyed: entity(" + eid + ") not found!");
            return;
        }

        if (entity.inWorld) {
            if (this.entity_id == eid)
                this.ClearSpace(false);

            entity.LeaveWorld();
        }

        let index = this.controlledEntities.indexOf(entity);
        if (index != -1) {
            this.controlledEntities.splice(index, 1);
            KBEEvent.Fire("onLoseControlledEntity", entity);
        }

        delete this.entities[eid];
        entity.Destroy();
    }

    // 服务端通知流数据下载开始
    // 请参考API手册关于onStreamDataStarted
    Client_onStreamDataStarted(id: number, datasize: number, descr: string) {
        KBEEvent.Fire("onStreamDataStarted", id, datasize, descr);
    }

    Client_onStreamDataRecv(stream: MemoryStream) {
        let resID = stream.ReadInt16();
        let datas = stream.ReadBlob();
        KBEEvent.Fire("onStreamDataRecv", resID, datas);
    }

    Client_onStreamDataCompleted(id: number) {
        KBEEvent.Fire("onStreamDataCompleted", id);
    }

    Client_onControlEntity(eid: number, isControlled: number) {
        let entity: Entity = this.entities[eid];

        if (entity == undefined) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onControlEntity: entity(%d) not found!", eid);
            return;
        }

        var isCont = isControlled !== 0;
        if (isCont) {
            // 如果被控制者是玩家自己，那表示玩家自己被其它人控制了
            // 所以玩家自己不应该进入这个被控制列表
            if (this.Player().id != entity.id) {
                this.controlledEntities.push(entity);
            }
        }
        else {
            let index = this.controlledEntities.indexOf(entity);
            if (index != -1)
                this.controlledEntities.splice(index, 1);
        }

        entity.isControlled = isCont;

        try {
            entity.OnControlled(isCont);
            KBEEvent.Fire("onControlled", entity, isCont);
        }
        catch (e) {
            KBEDebug.ERROR_MSG("KBEngine::Client_onControlEntity: entity id = %d, is controlled = %s, error = %s", eid, isCont, e.toString());
        }
    }

    UpdateVolatileData(entityID: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, isOnGround: number, isOptimized: boolean = false) {
        let entity = this.entities[entityID];
        if (entity === undefined) {
            // 如果为0且客户端上一步是重登陆或者重连操作并且服务端entity在断线期间一直处于在线状态
            // 则可以忽略这个错误, 因为cellapp可能一直在向baseapp发送同步消息， 当客户端重连上时未等
            // 服务端初始化步骤开始则收到同步信息, 此时这里就会出错。
            KBEDebug.ERROR_MSG("KBEngineApp::_updateVolatileData: entity(" + entityID + ") not found!");
            return;
        }

        let oldDirection = new Vector3(entity.direction.x, entity.direction.y, entity.direction.z);

        // 小于0不设置
        if (isOnGround >= 0) {
            entity.isOnGround = (isOnGround > 0);
        }

        let changeDirection = false;

        if (roll != KBE_FLT_MAX) {
            changeDirection = true;
            // entity.direction.x = (isOptimized? Int8ToAngle(roll, false)  : roll) * 360 / (2 * Math.PI);
            entity.direction.x = (isOptimized? Int8ToAngle(roll, false)  : roll);
        }

        if (pitch != KBE_FLT_MAX) {
            changeDirection = true;
            // entity.direction.y = (isOptimized? Int8ToAngle(pitch, false)  : pitch) * 360 / (2 * Math.PI);
            entity.direction.y = (isOptimized? Int8ToAngle(pitch, false)  : pitch);
        }

        if (yaw != KBE_FLT_MAX) {
            changeDirection = true;
            // entity.direction.z = (isOptimized? Int8ToAngle(yaw, false)  : yaw) * 360 / (2 * Math.PI);
            entity.direction.z = (isOptimized? Int8ToAngle(yaw, false)  : yaw);
        }

        let done = false;
        if (changeDirection == true) {
            entity.onDirectionChanged(oldDirection);
            // KBEEvent.Fire("set_direction", entity);
            done = true;
        }

        let positionChanged = false;
        if (x != KBE_FLT_MAX || y != KBE_FLT_MAX || z != KBE_FLT_MAX)
            positionChanged = true;

        if (x == KBE_FLT_MAX) x = isOptimized ? 0.0 : entity.position.x;
        if (y == KBE_FLT_MAX) y = isOptimized ? 0.0 : entity.position.y;
        if (z == KBE_FLT_MAX) z = isOptimized ? 0.0 : entity.position.z;

        if (positionChanged) {
            let oldPos = new Vector3(entity.position.x, entity.position.y, entity.position.z);
            let pos = isOptimized ? new Vector3(x + this.entityServerPos.x, y + this.entityServerPos.y, z + this.entityServerPos.z) : new Vector3(x, y, z);
            entity.position = pos;
            done = true;
            entity.onPositionChanged(oldPos);
            // KBEEvent.Fire("updatePosition", entity);
        }

        if (done)
            entity.OnUpdateVolatileData();
    }

    Client_onUpdateBaseDir(stream: MemoryStream) {
        // let yaw = stream.ReadFloat() * 360 / (Math.PI * 2);
        // let pitch = stream.ReadFloat() * 360 / (Math.PI * 2);
        // let roll = stream.ReadFloat() * 360 / (Math.PI * 2);

        let entity = this.Player();
        if (entity != null && entity.isControlled)
        {
            let oldDirection = new Vector3(entity.direction.x, entity.direction.y, entity.direction.z);
            entity.direction.x = stream.ReadFloat();
            entity.direction.y = stream.ReadFloat();
            entity.direction.z = stream.ReadFloat();
            // KBEEvent.Fire("set_direction", entity);
            entity.onDirectionChanged(oldDirection);
            entity.OnUpdateVolatileData();
        }
    }

    Client_onUpdateBasePos(x, y, z) {
        //KBEDebug.WARNING_MSG("Client_onUpdateBasePos---------->>>:x(%s),z(%s)..entityServerPos:x(%s),y(%s),z(%s).", x,z,this.entityServerPos.x,this.entityServerPos.y,this.entityServerPos.z);

        this.entityServerPos.x = x;
        this.entityServerPos.y = y;
        this.entityServerPos.z = z;

        let entity = this.Player();
        if (entity != undefined && entity.isControlled) {
            entity.OnUpdateVolatileData();
        }
    }

    Client_onUpdateBasePosXZ(x, z) {
        //KBEDebug.WARNING_MSG("Client_onUpdateBasePosXZ---------->>>:x(%s),z(%s)..entityServerPos:x(%s),y(%s),z(%s).", x,z,this.entityServerPos.x,this.entityServerPos.y,this.entityServerPos.z);
        this.Client_onUpdateBasePos(x, this.entityServerPos.y, z);
    }

    Client_onUpdateData(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);
        let entity = this.entities[eid];
        if (entity == undefined) {
            KBEDebug.ERROR_MSG("KBEngineApp::Client_onUpdateData: entity(" + eid + ") not found!");
            return;
        }
    }

    Client_onSetEntityPosAndDir(stream: MemoryStream) {
        let eid = stream.ReadInt32();
        let entity = this.entities[eid];
        if (entity == undefined) {
            KBEDebug.ERROR_MSG("KBEngineApp::Client_onSetEntityPosAndDir: entity(" + eid + ") not found!");
            return;
        }

        let oldPos = new Vector3(entity.position.x, entity.position.y, entity.position.z);
        let oldDir = new Vector3(entity.direction.x, entity.direction.y, entity.direction.z);

        entity.position.x = stream.ReadFloat();
        entity.position.y = stream.ReadFloat();
        entity.position.z = stream.ReadFloat();

        // let yaw = stream.ReadFloat() * 360 / (Math.PI * 2);
        // let pitch = stream.ReadFloat() * 360 / (Math.PI * 2);
        // let roll = stream.ReadFloat() * 360 / (Math.PI * 2);
        entity.direction.x = stream.ReadFloat();
        entity.direction.y = stream.ReadFloat();
        entity.direction.z = stream.ReadFloat();

        // entity.direction.x = roll;
        // entity.direction.y = pitch;
        // entity.direction.z = yaw;

        // 记录玩家最后一次上报位置时自身当前的位置
        entity.entityLastLocalPos.x = entity.position.x;
        entity.entityLastLocalPos.y = entity.position.y;
        entity.entityLastLocalPos.z = entity.position.z;
        
        entity.entityLastLocalDir.x = entity.direction.x;
        entity.entityLastLocalDir.y = entity.direction.y;
        entity.entityLastLocalDir.z = entity.direction.z;


        entity.entityLastLocalDir = entity.direction;
        entity.entityLastLocalPos = entity.position;

        entity.onDirectionChanged(oldDir);
        entity.onPositionChanged(oldPos);



    }

    Client_onUpdateData_ypr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, p, r, -1);
    }

    Client_onUpdateData_yp(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, p, KBE_FLT_MAX, -1);
    }

    Client_onUpdateData_yr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, KBE_FLT_MAX, r, -1);
    }

    Client_onUpdateData_pr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, p, r, -1);
    }

    Client_onUpdateData_y(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, KBE_FLT_MAX, KBE_FLT_MAX, -1);
    }

    Client_onUpdateData_p(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, p, KBE_FLT_MAX, -1);
    }

    Client_onUpdateData_r(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, r, -1);
    }

    Client_onUpdateData_xz(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, 1);
    }

    Client_onUpdateData_xz_ypr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], y, p, r, 1);
    }

    Client_onUpdateData_xz_yp(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], y, p, KBE_FLT_MAX, 1);
    }

    Client_onUpdateData_xz_yr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let y = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], y, KBE_FLT_MAX, r, 1);
    }

    Client_onUpdateData_xz_pr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, p, r, 1);
    }

    Client_onUpdateData_xz_y(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let y = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], y, KBE_FLT_MAX, KBE_FLT_MAX, 1);
    }

    Client_onUpdateData_xz_p(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        var xz = stream.ReadPackXZ();

        var p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, p, KBE_FLT_MAX, 1);
    }

    Client_onUpdateData_xz_r(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        var xz = stream.ReadPackXZ();

        var r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, r, 1);
    }

    Client_onUpdateData_xyz(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        var xz = stream.ReadPackXZ();
        var y = stream.ReadPackY();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, 0);
    }

    Client_onUpdateData_xyz_ypr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();
        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, p, r, 0);
    }

    Client_onUpdateData_xyz_yp(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();
        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, p, KBE_FLT_MAX, 0);
    }

    Client_onUpdateData_xyz_yr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, KBE_FLT_MAX, r, 0);
    }

    Client_onUpdateData_xyz_pr(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, p, r, 0);
    }

    Client_onUpdateData_xyz_y(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, KBE_FLT_MAX, KBE_FLT_MAX, 0);
    }

    Client_onUpdateData_xyz_p(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, p, KBE_FLT_MAX, 0);
    }

    Client_onUpdateData_xyz_r(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, r, 0);
    }


    Client_onUpdateData_ypr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, p, r, -1, true);
    }

    Client_onUpdateData_yp_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, p, KBE_FLT_MAX, -1, true);
    }

    Client_onUpdateData_yr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, KBE_FLT_MAX, r, -1, true);
    }

    Client_onUpdateData_pr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, p, r, -1, true);
    }



    Client_onUpdateData_y_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let y = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, y, KBE_FLT_MAX, KBE_FLT_MAX, -1, true);
    }

    Client_onUpdateData_p_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, p, KBE_FLT_MAX, -1, true);
    }

    Client_onUpdateData_r_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, r, -1, true);
    }

    Client_onUpdateData_xz_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, KBE_FLT_MAX, 1, true);
    }

    Client_onUpdateData_xz_ypr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], y, p, r, 1, true);
    }

    Client_onUpdateData_xz_yp_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let y = stream.ReadInt8();
        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], y, p, KBE_FLT_MAX, 1, true);
    }

    Client_onUpdateData_xz_yr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let y = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], y, KBE_FLT_MAX, r, 1, true);
    }

    Client_onUpdateData_xz_pr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, p, r, 1, true);
    }

    Client_onUpdateData_xz_y_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);
        let xz = stream.ReadPackXZ();
        let yaw = stream.ReadInt8();
        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], yaw, KBE_FLT_MAX, KBE_FLT_MAX, 1, true);
    }

    Client_onUpdateData_xz_p_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, p, KBE_FLT_MAX, 1, true);
    }

    Client_onUpdateData_xz_r_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();

        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], KBE_FLT_MAX, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, r, 1, true);
    }


    Client_onUpdateData_xyz_ypr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();
        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, p, r, 0, true);
    }

    Client_onUpdateData_xyz_yp_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();
        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, p, KBE_FLT_MAX, 0, true);
    }

    Client_onUpdateData_xyz_yr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, KBE_FLT_MAX, r, 0, true);
    }

    Client_onUpdateData_xyz_pr_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let p = stream.ReadInt8();
        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, p, r, 0, true);
    }

    Client_onUpdateData_xyz_y_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let yaw = stream.ReadInt8();
        this.UpdateVolatileData(eid, xz[0], y, xz[1], yaw, KBE_FLT_MAX, KBE_FLT_MAX, 0, true);
    }

    Client_onUpdateData_xyz_p_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let p = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, p, KBE_FLT_MAX, 0, true);
    }

    Client_onUpdateData_xyz_r_optimized(stream: MemoryStream) {
        let eid = this.GetViewEntityIDFromStream(stream);

        let xz = stream.ReadPackXZ();
        let y = stream.ReadPackY();

        let r = stream.ReadInt8();

        this.UpdateVolatileData(eid, xz[0], y, xz[1], KBE_FLT_MAX, KBE_FLT_MAX, r, 0, true);
    }

    Client_onImportClientSDK(stream: MemoryStream) {
        let remainingFiles = stream.ReadInt32();

        let fileName = stream.ReadString();

        let fileSize = stream.ReadInt32();

        let fileDatas = stream.ReadBlob();

        // this.Event.fireIn("onImportClientSDK", remainingFiles, fileName, fileSize, fileDatas);
    }


}

//#endregion


//#region KBEngine Bundle
const MAX_BUFFER: number = 1460 * 4;
const MESSAGE_ID_LENGTH: number = 2;

export class Bundle
{
    private stream: MemoryStream = new MemoryStream(MAX_BUFFER);
    private streams: Array<MemoryStream> = new Array<MemoryStream>();

    private messageNum = 0;
    private messageLengthBuffer: Uint8Array | null = null;
    private messageLength = 0;
    private message: Message | null = null;

    constructor()
    {
    }

    WriteMessageLength(len: number)
    {
        if(this.messageLengthBuffer)
        {
            this.messageLengthBuffer[0] = len & 0xff;
            this.messageLengthBuffer[1] = (len >> 8) & 0xff;
        }
    }

    Fini(isSend: boolean)
    {
        if(isSend)
            KBEDebug.DEBUG_MSG("Bundle::Fini............message(%s:%s):messageNum(%d).stream length(%d).", this.message!.name, isSend, this.messageNum, this.stream.Length());

        if(this.messageNum > 0)
        {
            this.WriteMessageLength(this.messageLength);
            if(this.stream)
            {
                this.streams.push(this.stream);
            }
        }

        if(isSend)
        {
            this.messageLengthBuffer = null;
            this.messageNum = 0;
            this.message = null;
        }
        this.messageLength = 0;
    }

    NewMessage(message: Message)
    {
        this.Fini(false);

        this.messageNum += 1;
        this.message = message;

        if(message.msglen == -1)
        {
            this.messageLengthBuffer = new Uint8Array(this.stream.GetRawBuffer(), this.stream.wpos + MESSAGE_ID_LENGTH, 2);
        }

        this.stream.WriteUint16(message.id);
        
        if(this.messageLengthBuffer)
        {
            this.WriteUint16(0);
            this.messageLengthBuffer[0] = 0;
            this.messageLengthBuffer[1] = 0;
            this.messageLength = 0;
        }
    }

    Send(networkInterface: NetworkInterface)
    {
        this.Fini(true);

        for(let stream of this.streams)
        {
            networkInterface.Send(stream.GetBuffer());
        }

        this.streams = new Array<MemoryStream>();
        this.stream = new MemoryStream(MAX_BUFFER);
    }

    CheckStream(len: number)
    {
        if(len > this.stream.Space())
        {
            this.streams.push(this.stream);
            this.stream = new MemoryStream(MAX_BUFFER);
        }

        this.messageLength += len;
    }

    WriteInt8(value: number)
    {
        this.CheckStream(1);
        this.stream.WriteInt8(value);
    }

	WriteInt16(value: number)
	{
		this.CheckStream(2);
		this.stream.WriteInt16(value);
    }

    WriteInt32(value: number)
	{
		this.CheckStream(4);
		this.stream.WriteInt32(value);
    }
    
    WriteInt64(value: DataTypes.KB_INT64)
	{
		this.CheckStream(8);
		this.stream.WriteInt64(value);
    }
    
    WriteUint8(value: number)
    {
        this.CheckStream(1);
        this.stream.WriteUint8(value);
    }

    WriteUint16(value: number)
    {
        this.CheckStream(2);
        this.stream.WriteUint16(value);
    }

    WriteUint32(value: number)
    {
        this.CheckStream(4);
        this.stream.WriteUint32(value);
    }

    WriteUint64(value: DataTypes.KB_UINT64)  
    {
        this.CheckStream(8);
        this.stream.WriteUint64(value);
    }

    WriteFloat(value: number)
    {
        this.CheckStream(4);
        this.stream.WriteFloat(value);
    }

    WriteDouble(value: number)
    {
        this.CheckStream(8);
        this.stream.WriteDouble(value);
    }

    WriteBlob(value: string|Uint8Array)
    {
        if(typeof(value) == "string"){
            value = new TextEncoder().encode(value);
        }
        
        this.CheckStream(value.length + 4);
        this.stream.WriteBlob(value);
    }

    WriteString(value: string)
    {
        this.CheckStream(value.length + 1);
        this.stream.WriteString(value);
    }

    WriteUnicode(value: string)
    {
        this.WriteBlob(value);
    }
}
//#endregion


//#region KBEngine DataTypes


export namespace DataTypes{
    const TWO_PWR_16_DBL = 1 << 16;
    const TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;

    export class KB_INT64 {
        low: number;
        high: number;
        private _isNegative: boolean;

        constructor(low: number, high: number) {
            this.low = low >>> 0;

            // 这里的 >>> 0 不是为了去掉符号，而是为了确保 输入的 high 是 32 位无符号格式，也就是说你即使传入了负数，它会正确转为补码整数。
            // 但注意：后续 this._isNegative 是根据 high >>> 0 的结果来判断是否带符号的，然后我们立刻做了补码还原。
            this.high = high >>> 0;
            this._isNegative = (this.high & 0x80000000) !== 0;

            // 补码转正（存储结构中仍然保留原始补码）
            if (this._isNegative) {
                const notLow = (~this.low + 1) >>> 0;
                const carry = notLow === 0 ? 1 : 0;
                const notHigh = (~this.high + carry) >>> 0;
                this.low = notLow;
                this.high = notHigh;
            }
        }

        toNumber(): number {
            let val = this.high * TWO_PWR_32_DBL + this.low;
            return this._isNegative ? -val : val;
        }

        toBigInt(): bigint {
            let bi = (BigInt(this.high) << 32n) | BigInt(this.low);
            return this._isNegative ? -bi : bi;
        }

        toString(radix: number = 10): string {
            return this.toBigInt().toString(radix);
        }

        equals(other: KB_INT64): boolean {
            return this.toBigInt() === other.toBigInt();
        }

        static fromNumber(num: number): KB_INT64 {
            const isNegative = num < 0;
            if (isNegative) num = -num;

            const low = num >>> 0;
            const high = Math.floor(num / TWO_PWR_32_DBL) >>> 0;
            let int64 = new KB_INT64(low, high);

            if (isNegative) {
                let l = (~int64.low + 1) >>> 0;
                let h = (~int64.high + (l === 0 ? 1 : 0)) >>> 0;
                int64.low = l;
                int64.high = h;
                int64._isNegative = true;
            }

            return int64;
        }

        static fromBigInt(bi: bigint): KB_INT64 {
            const isNegative = bi < 0n;
            if (isNegative) bi = -bi;

            let low = Number(bi & 0xFFFFFFFFn);
            let high = Number((bi >> 32n) & 0xFFFFFFFFn);

            let int64 = new KB_INT64(low, high);

            if (isNegative) {
                let l = (~int64.low + 1) >>> 0;
                let h = (~int64.high + (l === 0 ? 1 : 0)) >>> 0;
                int64.low = l;
                int64.high = h;
                int64._isNegative = true;
            }

            return int64;
        }
    }


    export class KB_UINT64 {
        low: number;
        high: number;

        constructor(low: number, high: number) {
            this.low = low >>> 0;
            this.high = high >>> 0;
        }

        toNumber(): number {
            return this.high * TWO_PWR_32_DBL + this.low;
        }

        toBigInt(): bigint {
            return (BigInt(this.high) << 32n) | BigInt(this.low);
        }

        toString(radix: number = 10): string {
            return this.toBigInt().toString(radix);
        }

        equals(other: KB_UINT64): boolean {
            return this.toBigInt() === other.toBigInt();
        }

        static fromNumber(num: number): KB_UINT64 {
            const low = num >>> 0;
            const high = Math.floor(num / TWO_PWR_32_DBL) >>> 0;
            return new KB_UINT64(low, high);
        }

        static fromBigInt(bi: bigint): KB_UINT64 {
            const low = Number(bi & 0xFFFFFFFFn);
            const high = Number((bi >> 32n) & 0xFFFFFFFFn);
            return new KB_UINT64(low, high);
        }
    }


    export class NumberUtil {
        static toUInt8(n: number): number {
            return n & 0xFF;
        }

        static toUInt16(n: number): number {
            return n & 0xFFFF;
        }

        static toUInt32(n: number): number {
            return n >>> 0;
        }

        // 模拟 UInt64 返回 BigInt
        static toUInt64(n: number | bigint): bigint {
            return BigInt(n) & BigInt("0xFFFFFFFFFFFFFFFF");
        }

        static toInt8(n: number): number {
            const val = n & 0xFF;
            return val > 0x7F ? val - 0x100 : val;
        }

        static toInt16(n: number): number {
            const val = n & 0xFFFF;
            return val > 0x7FFF ? val - 0x10000 : val;
        }

        static toInt32(n: number): number {
            return n | 0; // 强制转换为有符号 Int32
        }

        // 模拟 Int64 返回 BigInt
        static toInt64(n: number | bigint): bigint {
            const big = BigInt(n);
            return big >= BigInt("0x8000000000000000")
                ? big - BigInt("0x10000000000000000")
                : big;
        }

        // 强制转为 Float32 精度
        static toFloat(n: number): number {
            const f32 = new Float32Array(1);
            f32[0] = n;
            return f32[0];
        }

        // JS number 就是 Double
        static toDouble(n: number): number {
            return n;
        }
    }


    export class UINT64_OLD {
        low: number;
        high: number;

        constructor(p_low: number, p_high: number) {
            this.low = p_low >>> 0;
            this.high = p_high;
        }

        toString() {
            let low = this.low.toString(16);
            let high = this.high.toString(16);

            let result = "";
            if (this.high > 0) {
                result += high;
                for (let i = 8 - low.length; i > 0; --i) {
                    result += "0";
                }
            }

            return result + low;
        }

        static BuildUINT64(data: number): KB_UINT64 {
            let low = (data % TWO_PWR_32_DBL) | 0;
            low >>>= 0;
            let high = (data / TWO_PWR_32_DBL) | 0;
            high >>>= 0;
            //KBEDebug.WARNING_MSG("Datatypes::BuildUINT64:low:%s, low hex(%s);high:%s, high hex(%s).", low, low.toString(16), high, high.toString(16));
            return new KB_UINT64(low, high);
        }
    }


    function IsNumber(anyObject: any): boolean {
        return typeof anyObject === "number" || typeof anyObject == 'boolean';
    }

    export abstract class DATATYPE_BASE {
        static readonly FLOATE_MAX = Number.MAX_VALUE;

        Bind(): void { }

        CreateFromStream(stream: MemoryStream): any {
            return null;
        }
        AddToStream(stream: Bundle, value: any): void {

        }
        ParseDefaultValueString(value: string): any {
            return null;
        }
        IsSameType(value: any): boolean {
            return value == null;
        }
    }

    export class DATATYPE_UINT8 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {

            return stream.ReadUint8();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteUint8(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            if (!IsNumber(value))
                return false;

            if (value < 0 || value > 0xff) {
                return false;
            }

            return true;
        }
    }

    export class DATATYPE_UINT16 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadUint16();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteUint16(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            if (!IsNumber(value))
                return false;

            if (value < 0 || value > 0xffff) {
                return false;
            }

            return true;
        }
    }

    export class DATATYPE_UINT32 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadUint32();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteUint32(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            if (!IsNumber(value))
                return false;

            if (value < 0 || value > 0xffffffff) {
                return false;
            }

            return true;
        }
    }

    export class DATATYPE_UINT64 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadUint64();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteUint64(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            return value instanceof KB_UINT64 || typeof value === "bigint";
        }
    }

    export class DATATYPE_INT8 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadInt8();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteInt8(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            if (!IsNumber(value))
                return false;

            if (value < -0x80 || value > 0x7f) {
                return false;
            }

            return true;
        }
    }

    export class DATATYPE_INT16 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadInt16();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteInt16(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            if (!IsNumber(value))
                return false;

            if (value < -0x8000 || value > 0x7fff) {
                return false;
            }

            return true;
        }
    }

    export class DATATYPE_INT32 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadInt32();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteInt32(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            if (!IsNumber(value))
                return false;

            if (value < -0x80000000 || value > 0x7fffffff) {
                return false;
            }

            return true;
        }
    }

    export class DATATYPE_INT64 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadInt64();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteInt64(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseInt(value);
        }

        IsSameType(value: any): boolean {
            return value instanceof KB_INT64 || typeof value === "bigint";
        }
    }

    export class DATATYPE_FLOAT extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadFloat();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteFloat(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseFloat(value);
        }

        IsSameType(value: any): boolean {
            return typeof (value) === "number";
        }
    }

    export class DATATYPE_DOUBLE extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadDouble();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteDouble(value);
        }

        ParseDefaultValueString(value: string): any {
            return parseFloat(value);
        }

        IsSameType(value: any): boolean {
            return typeof (value) === "number";
        }
    }

    export class DATATYPE_STRING extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadString();
        }

        AddToStream(stream: Bundle, value: any): void {
            return stream.WriteString(value);
        }

        ParseDefaultValueString(value: string): any {
            return value;   // TODO: 需要测试正确
        }

        IsSameType(value: any): boolean {
            return typeof (value) === "string";
        }
    }

    export class DATATYPE_VECTOR2 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return new Vector2(stream.ReadFloat(), stream.ReadFloat());
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteFloat(value.x);
            stream.WriteFloat(value.y);
        }

        ParseDefaultValueString(value: string): any {
            return new Vector2(0.0, 0.0);
        }

        IsSameType(value: any): boolean {
            return value instanceof Vector2;
        }
    }

    export class DATATYPE_VECTOR3 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return new Vector3(stream.ReadFloat(), stream.ReadFloat(), stream.ReadFloat());
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteFloat(value.x);
            stream.WriteFloat(value.y);
            stream.WriteFloat(value.z);
        }

        ParseDefaultValueString(value: string): any {
            return new Vector3(0.0, 0.0, 0.0);
        }

        IsSameType(value: any): boolean {
            return value instanceof Vector3;
        }
    }

    export class DATATYPE_VECTOR4 extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return new Vector4(stream.ReadFloat(), stream.ReadFloat(), stream.ReadFloat(), stream.ReadFloat());
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteFloat(value.x);
            stream.WriteFloat(value.y);
            stream.WriteFloat(value.z);
            stream.WriteFloat(value.w);
        }

        ParseDefaultValueString(value: string): any {
            return new Vector4(0.0, 0.0, 0.0, 0.0);
        }

        IsSameType(value: any): boolean {
            return value instanceof Vector4;
        }
    }


    export class DATATYPE_PYTHON extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadBlob();
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteBlob(value);
        }

        ParseDefaultValueString(value: string): any {
            return new Uint8Array(0);
        }

        IsSameType(value: any): boolean {
            return value instanceof Uint8Array;
        }
    }

    export class DATATYPE_UNKNOW extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
        }

        AddToStream(stream: Bundle, value: any): void {
        }

        ParseDefaultValueString(value: string): any {
        }

        IsSameType(value: any): any {
        }
    }

    export class DATATYPE_UNICODE extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return KBEEncoding.UTF8ArrayToString(stream.ReadBlob());
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteBlob(KBEEncoding.StringToUTF8Array(value));
        }

        ParseDefaultValueString(value: string): any {
            return value;
        }

        IsSameType(value: any): boolean {
            return typeof value === "string";
        }
    }

    export class DATATYPE_ENTITYCALL extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            stream.ReadInt32()
            stream.ReadUint64()
            stream.ReadUint16()
            stream.ReadUint16()
            return null
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteBlob(value);
        }

        ParseDefaultValueString(value: string): any {
        }

        IsSameType(value: any): boolean {
            return false;
        }
    }

    export class DATATYPE_BLOB extends DATATYPE_BASE {
        CreateFromStream(stream: MemoryStream): any {
            return stream.ReadBlob();
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteBlob(value);
        }

        ParseDefaultValueString(value: string): any {
            return new Uint8Array(0);
        }

        IsSameType(value: any): boolean {
            return true;
        }
    }

    export class DATATYPE_ARRAY extends DATATYPE_BASE {
        type: any;

        Bind() {
            if (typeof (this.type) == "number")
                this.type = EntityDef.datatypes[this.type];
        }

        CreateFromStream(stream: MemoryStream): Array<any> {
            let size = stream.ReadUint32();
            let items = [];
            while (size-- > 0) {
                size--;
                // items.push(this.type.CreateFromStream(stream));
            }

            return items;
        }

        AddToStream(stream: Bundle, value: any): void {
            stream.WriteUint32(value.length);
            for (let i = 0; i < value.length; i++) {
                this.type.AddToStream(stream, value[i]);
            }
        }

        ParseDefaultValueString(value: string): any {
            return [];
        }

        IsSameType(value: any): boolean {
            for (let i = 0; i < value.length; i++) {
                if (!this.type.IsSameType(value[i]))
                    return false;
            }

            return true;
        }
    }

    export class DATATYPE_FIXED_DICT extends DATATYPE_BASE {
        dictType: { [key: string]: any } = {};
        implementedBy: string;

        Bind() {
            for (let key in this.dictType) {
                //KBEDebug.DEBUG_MSG("DATATYPE_FIXED_DICT::Bind------------------->>>show (key:%s, value:%s).", key, this.dictType[key]);
                if (typeof (this.dictType[key]) == "number") {
                    let utype = Number(this.dictType[key]);
                    this.dictType[key] = EntityDef.datatypes[utype];
                }
            }
        }

        CreateFromStream(stream: MemoryStream): { [key: string]: any } {
            let datas = {};
            for (let key in this.dictType) {
                KBEDebug.DEBUG_MSG("DATATYPE_FIXED_DICT::CreateFromStream------------------->>>FIXED_DICT(key:%s).", key);
                datas[key] = this.dictType[key].CreateFromStream(stream);
            }

            return datas;
        }

        AddToStream(stream: Bundle, value: any): void {
            for (let key in this.dictType) {
                this.dictType[key].AddToStream(stream, value[key]);
            }
        }

        ParseDefaultValueString(value: string): any {
            return {};
        }

        IsSameType(value: any): boolean {
            for (let key in this.dictType) {
                if (!this.dictType[key].IsSameType(value[key]))
                    return false;
            }
            return true;
        }
    }
}
//#endregion





//#region KBEngine Entity
export class Entity
{
    id: number;
    className: string;

    position: Vector3 = new Vector3(0, 0, 0);
    direction: Vector3 = new Vector3(0, 0, 0);
    entityLastLocalPos = new Vector3(0.0, 0.0, 0.0);
    entityLastLocalDir = new Vector3(0.0, 0.0, 0.0);

    inWorld: boolean = false;
    inited: boolean = false;
    isControlled: boolean = false;
    isOnGround: boolean = false;

    // cell: EntityCall;
    // base: EntityCall;


    renderObj:any = null; // 渲染对象

    __init__()
    {
    }

    CallPropertysSetMethods()
    {
        // 动态生成
    }

    GetPropertyValue(name: string)
    {
        let value = this[name];
        if(value == undefined)
        {
            KBEDebug.DEBUG_MSG("Entity::GetPropertyValue: property(%s) not found(undefined).", name);
        }

        return value;
    }

    SetPropertyValue(name: string, value: any)
    {
        this[name] = value;
    }

    OnDestroy()
    {
    }

    OnControlled(isControlled: boolean)
    {
        KBEDebug.DEBUG_MSG("Entity::OnControlled:entity(%id) controlled state(%s) change.", this.id, isControlled);
    }

    IsPlayer(): boolean
    {
        return KBEngineApp.app!.entity_id === this.id;
    }

    BaseCall(methodName: string, ...args: any[])
    {
        if(KBEngineApp.app!.currserver == "loginapp"){
            KBEDebug.ERROR_MSG("%s::baseCall(%s),currserver is loginapp.", this.className, methodName);
            return;
        }

        // if(this.base === undefined)
        // {
        //     KBEDebug.ERROR_MSG("Entity::BaseCall: entity(%d) base is undefined.", this.id);
        // }

        let method: Method = EntityDef.moduledefs[this.className].baseMethods[methodName];
        if(method === undefined)
        {
            KBEDebug.ERROR_MSG("Entity::BaseCall: entity(%d) method(%s) not found.", this.id, methodName);
        }

        if(args.length !== method.args.length)
        {
            KBEDebug.ERROR_MSG("Entity::BaseCall: args(%d != %d) size is error!", args.length, method.args.length);  
			return;
        }


        let baseEntityCall = this.getBaseEntityCall();

        if (!baseEntityCall) {
            KBEDebug.ERROR_MSG(this.className + "::baseCall(%s),baseEntityCall is null.", methodName);
            return;
        }

        baseEntityCall.NewCall();
        baseEntityCall.bundle!.WriteUint16(0);
        baseEntityCall.bundle!.WriteUint16(method.methodUtype);

        try
        {
            for(let i = 0; i < method.args.length; i++)
            {
                if(method.args[i].IsSameType(args[i]))
                {
                    method.args[i].AddToStream(baseEntityCall.bundle, args[i])
                }
                else
                {
                    throw(new Error("KBEngine.Entity::baseCall: arg[" + i + "] is error!"));
                }
            }
        }
        catch(e)
        {
            KBEDebug.ERROR_MSG(e.toString());
            KBEDebug.ERROR_MSG("KBEngine.Entity::baseCall: args is error!");
            baseEntityCall.bundle = undefined;
            return;
        }

        baseEntityCall.SendCall();
    }

    CellCall(methodName: string, ...args: any[])
    {
        if(KBEngineApp.app!.currserver == "loginapp"){
            KBEDebug.ERROR_MSG("%s::cellCall(%s),currserver is loginapp.", this.className, methodName);
            return;
        }


        let method: Method = EntityDef.moduledefs[this.className].cellMethods[methodName];
        if(method === undefined)
        {
            KBEDebug.ERROR_MSG("Entity::CellCall: entity(%d) method(%s) not found.", this.id, methodName);
        }

        if(args.length !== method.args.length)
        {
            KBEDebug.ERROR_MSG("Entity::CellCall: args(%d != %d) size is error!", args.length, method.args.length);  
			return;
        }

        let cellEntityCall = this.getCellEntityCall();

        if (cellEntityCall == null) {
            KBEDebug.ERROR_MSG(this.className + "::cellCall(%s),cellEntityCall is null.", methodName);
            return;
        }

        cellEntityCall.NewCall();
        cellEntityCall.bundle!.WriteUint16(0);
        cellEntityCall.bundle!.WriteUint16(method.methodUtype);

        try
        {
            for(let i = 0; i < method.args.length; i++)
            {
                if(method.args[i].IsSameType(args[i]))
                {
                    method.args[i].AddToStream(cellEntityCall.bundle, args[i])
                }
                else
                {
                    throw(new Error("KBEngine.Entity::baseCall: arg[" + i + "] is error!"));
                }
            }
        }
        catch(e)
        {
            KBEDebug.ERROR_MSG(e.tostring());
            KBEDebug.ERROR_MSG("KBEngine.Entity::baseCall: args is error!");
            cellEntityCall.bundle = undefined;
            return;
        }

        cellEntityCall.SendCall();
    }

    EnterWorld()
    {
        KBEDebug.DEBUG_MSG(this.className + "::EnterWorld------------------->>>id:%s.", this.id);
        this.inWorld = true;
       
        try{
            this.OnEnterWorld();
            this.onComponentsEnterworld();
        }catch(e){
            KBEDebug.ERROR_MSG(this.className + "::EnterWorld: error(%s).", e.toString());
        }

        KBEEvent.Fire("onEnterWorld", this);
    }

    OnEnterWorld()
    {
        KBEDebug.DEBUG_MSG(this.className + "::OnEnterWorld------------------->>>id:%s.", this.id);
    }

    LeaveWorld()
    {
        try{
            this.OnLeaveWorld();
            this.onComponentsLeaveworld();
        }catch(e){
            KBEDebug.ERROR_MSG(this.className + "::LeaveWorld: error(%s).", e.toString());
        }

        KBEEvent.Fire("onLeaveWorld", this);
    }

    OnLeaveWorld()
    {
        KBEDebug.DEBUG_MSG(this.className + "::OnLeaveWorld------------------->>>id:%s.", this.id);
    }

    EnterSpace()
    {
        this.inWorld = true;
        try{
            this.OnEnterSpace();
        }catch(e){
            KBEDebug.ERROR_MSG(this.className + "::EnterSpace: error(%s).", e.toString());
        }

        KBEEvent.Fire("onEnterSpace", this);

        // 要立即刷新表现层对象的位置
        KBEEvent.Fire("set_position", this);
        KBEEvent.Fire("set_direction", this);
    }

    OnEnterSpace()
    {
        KBEDebug.DEBUG_MSG(this.className + "::OnEnterSpace------------------->>>id:%s.", this.id);
    }

    LeaveSpace()
    {
        this.inWorld = false;
        try{
            this.OnLeaveSpace();
        }catch(e){
            KBEDebug.ERROR_MSG(this.className + "::LeaveSpace: error(%s).", e.toString());
        }

        KBEEvent.Fire("onLeaveSpace", this);
    }

    OnLeaveSpace()
    {
        KBEDebug.DEBUG_MSG(this.className + "::OnLeaveSpace------------------->>>id:%s.", this.id);
    }

    OnUpdateVolatileData()
    {
    }

    // set_position(oldVal: Vector3)
    // {
	// 	if(this.IsPlayer())
	// 	{
	// 		KBEngineApp.app!.entityServerPos.x = this.position.x;
	// 		KBEngineApp.app!.entityServerPos.y = this.position.y;
    //         KBEngineApp.app!.entityServerPos.z = this.position.z;
	// 	}

    //     if(this.inWorld)
    //        KBEEvent.Fire("set_position", this);
    // }

    // set_direction(oldVal: Vector3)
    // {
    //     if(this.inWorld)
    //        KBEEvent.Fire("set_direction", this);
    // }

    SetPositionFromServer(postion: Vector3)
    {
    }

    SetDirectionFromServer(direction: Vector3)
    {
    }

    Destroy()
    {
        this.OnDestroy();
        this.detachComponents();
    }


    
    attachComponents()
    {
        // 动态生成
    }

    detachComponents()
    {
        // 动态生成
    }

    callPropertysSetMethods()
    {
        // 动态生成
    }

     getBaseEntityCall() : EntityCall | null
    {
        // 动态生成
        return null;
    }

     getCellEntityCall() : EntityCall | null
    {
        // 动态生成
        return null;
    }


    onRemoteMethodCall(stream:MemoryStream )
    {
        // 动态生成
    }

    onUpdatePropertys(stream:MemoryStream)
    {
        // 动态生成
    }

    onGetBase()
    {
        // 动态生成
    }

    onGetCell()
    {
        // 动态生成
    }

    onLoseCell()
    {
        // 动态生成
    }

    onComponentsEnterworld()
    {
        // 动态生成， 通知组件onEnterworld
    }

    onComponentsLeaveworld()
    {
        // 动态生成， 通知组件onLeaveworld
    }

    onPositionChanged(oldVal: Vector3){
        if(this.IsPlayer()){
            KBEngineApp.app!.entityServerPos = this.position;
        }

        if(this.inWorld){
            KBEEvent.Fire("set_position", this);
        }
    }


    onDirectionChanged(oldVal: Vector3){
        if(this.inWorld){
            // this.direction.x
            this.direction.x = this.direction.x *360 / (2 * Math.PI);
            this.direction.y = this.direction.y *360 / (2 * Math.PI);
            this.direction.z = this.direction.z *360 / (2 * Math.PI);
            KBEEvent.Fire("set_direction", this);
        }else{
            this.direction = oldVal;
        }
    }

    getComponents(componentName:string, all :boolean){
        // 动态生成
        return [] as EntityComponent[];
    }
}

//#endregion


//#region KBEngine EntityCall
export abstract class EntityCall
{
    bundle?: Bundle;
    id: number = 0;
    className: string = "";
    
    // 0: CellEntityCall, 1: BaseEntityCall
    entityCallType: number = 0;


    constructor(eid: number,ename:string)
    {
        this.id = eid;
        this.className = ename;
    }

    isBase(){
        return this.entityCallType == 1;
    }

    isCell(){
        return this.entityCallType == 0;
    }

    SendCall(bundle?: Bundle)
    {
        KBEDebug.ASSERT(this.bundle !== undefined);

        if(bundle === undefined)
            bundle = this.bundle;
        bundle!.Send(KBEngineApp.app!.networkInterface);
        
        if(bundle === this.bundle)
            this.bundle = undefined;
    }

    // protected abstract BuildBundle();

    NewCall()
    {
        if(this.bundle === undefined)
            this.bundle = new Bundle();
            
        // this.BuildBundle();

        if(this.isCell()){
            this.bundle.NewMessage(Messages.messages["Baseapp_onRemoteCallCellMethodFromClient"])
        }else{
            this.bundle.NewMessage(Messages.messages["Entity_onRemoteMethodCall"])
        }

        this.bundle.WriteUint32(this.id);

        return this.bundle;
    }

    

    NewCallToMethod(methodName:string, entitycomponentPropertyID:number = 0){
        if(KBEngineApp.app!.currserver == "loginapp"){
            KBEDebug.ERROR_MSG(this.className + "::newCall(" + methodName + "), currserver=!" + KBEngineApp.app!.currserver);  
            return null;
        }

        const module = EntityDef.moduledefs[this.className];
        if(!module){
            KBEDebug.ERROR_MSG(this.className + "::newCall: entity-module(" + this.className + ") error, can not find from EntityDef.moduledefs");
            return null;
        }

        let method: Method;
        if(this.isCell()){
            method = module.cellMethods[methodName];
        }else{
            method = module.baseMethods[methodName];
        }
        
        if(!method){
            KBEDebug.ERROR_MSG(this.className + "::newCall: entity-method(" + this.className + ") error, can not find from EntityDef.moduledefs");
        }


        this.NewCall();
        this.bundle!.WriteUint16(entitycomponentPropertyID);
        this.bundle!.WriteUint16(method.methodUtype);
        return this.bundle;
    }
}
//#endregion


//#region KBEngine EntityComponent
export abstract class EntityComponent {
    public owner: any;
    public entityComponentPropertyID: number = 0;
    public name_: string = '';
    public ownerID: number = 0;
    public componentType: number = 0;
  
    public onEnterworld?(): void;
    public onLeaveworld?(): void;
    public onGetBase?(): void;
    public onGetCell?(): void;
    public onLoseCell?(): void;
    public onAttached?(entity: Entity): void;
    public onDetached?(entity: Entity): void;
    public getScriptModule?(): ScriptModule;
  
  
    public onRemoteMethodCall(methodUtype: number, stream: MemoryStream) {
      // 动态生成
    }
  
    public onUpdatePropertys(propUtype: number, stream: MemoryStream, maxCount: number) {
      // 动态生成
    }
  
    public callPropertysSetMethods() {
      // 动态生成
    }
  
  
  
    public createFromStream(stream: MemoryStream)
    {
        this.componentType = stream.ReadInt32();
        this.ownerID = stream.ReadInt32();

        //UInt16 ComponentDescrsType;
        stream.ReadUint16();

        let count = stream.ReadUint16();

        if(count > 0)
            this.onUpdatePropertys(0, stream, count);
    }
} 
//#endregion




//#region KBEngine MemoryStream
class PackFloatXType
{
    private _unionData: ArrayBuffer;
    fv: Float32Array;
    uv: Uint32Array;
    iv: Int32Array;

    constructor()
    {
        this._unionData = new ArrayBuffer(4);
        this.fv = new Float32Array(this._unionData, 0, 1);
        this.uv = new Uint32Array(this._unionData, 0, 1);
        this.iv = new Int32Array(this._unionData, 0, 1);
    }
}

export class MemoryStream
{
    rpos: number = 0;
    wpos: number = 0;
    private buffer: ArrayBuffer;

    constructor(size_or_buffer: number | ArrayBuffer)
    {
        if(size_or_buffer instanceof ArrayBuffer)
        {
            this.buffer = size_or_buffer;
        }
        else
        {
            this.buffer = new ArrayBuffer(size_or_buffer);
        }
    }

    Space(): number
    {
        return this.buffer.byteLength - this.wpos;
    }

    ReadInt8(): number
    {
        let buf = new Int8Array(this.buffer, this.rpos);
        this.rpos += 1;
        return buf[0];
    }

    ReadUint8(): number
    {
        let buf = new Uint8Array(this.buffer, this.rpos);
        this.rpos += 1;
        return buf[0];
    }

    ReadUint16(): number
    {
        let buf = new Uint8Array(this.buffer, this.rpos);
        this.rpos += 2;
        return ((buf[1] & 0xff) << 8) + (buf[0] & 0xff);
    }

    ReadInt16(): number
    {
        let value = this.ReadUint16();
        if(value >= 32768)
            value -= 65536;
        return value;
    }

    ReadUint32(): number
    {
        let buf = new Uint8Array(this.buffer, this.rpos);
        this.rpos += 4;

        return (buf[3] << 24) + (buf[2] << 16) + (buf[1] << 8) + buf[0];
    }

    ReadInt32(): number
    {
        let value = this.ReadUint32();
        if(value >= 2147483648)
            value -= 4294967296;
        return value;
    }

    ReadUint64(): DataTypes.KB_UINT64
    {
        return new DataTypes.KB_UINT64(this.ReadUint32(), this.ReadUint32());
    }

    ReadInt64(): DataTypes.KB_INT64
    {
        return new DataTypes.KB_INT64(this.ReadUint32(), this.ReadUint32());
    }

    ReadFloat(): number
    {
        let buf: Float32Array | undefined;
        try
        {
            buf = new Float32Array(this.buffer, this.rpos, 1);
        }
        catch(e)
        {
            buf = new Float32Array(this.buffer.slice(this.rpos, this.rpos + 4));
        }
        
        this.rpos += 4;

        return buf[0];
    }

    ReadDouble(): number
    {
        let buf: Float64Array | undefined;
		try
		{
			buf = new Float64Array(this.buffer, this.rpos, 1);
		}
		catch(e)
		{
			buf = new Float64Array(this.buffer.slice(this.rpos, this.rpos + 8), 0, 1);
        }
        
        this.rpos += 8;
        return buf[0];
    }

    ReadString(): string
    {
        let buf = new Int8Array(this.buffer, this.rpos);
        let value: string = "";
        let index: number = 0;
        
        while(true)
        {
            if(buf[index] != 0 )
            {
                value += String.fromCharCode(buf[index]);
                index += 1;
                if(this.rpos + index >= this.buffer.byteLength)
                {
                    throw(new Error("KBEngine.MemoryStream::ReadString overflow(>=) max length:" + this.buffer.byteLength));
                }
            }
            else
            {
                index += 1;
                break;
            }
        }

        this.rpos += index;
        return value;
    }


    ReadUnicode(): string {
        const size = this.ReadUint32(); // 读取字节长度
        const buf = new Uint8Array(this.buffer, this.rpos, size);
        this.rpos += size;
    
        // 解码 UTF-8 buffer 到字符串
        const decoder = new TextDecoder("utf-8");
        return decoder.decode(buf);
    }

    ReadBlob(): Uint8Array
    {
        let size = this.ReadUint32();
        let buf = new Uint8Array(this.buffer, this.rpos, size);
        this.rpos += size;
        return buf;
    }

    // ReadStream(): MemoryStream
    // {
    //     let buf = new Uint8Array(this.buffer, this.rpos, this.buffer.byteLength - this.rpos);
    //     this.rpos = this.buffer.byteLength;
    //     return new MemoryStream(buf);
    // }


    ReadVector2(): Vector2 {
        return new Vector2(this.ReadFloat(), this.ReadFloat());
    }

    ReadVector3(): Vector3 {
        return new Vector3(this.ReadFloat(), this.ReadFloat(), this.ReadFloat());
    }

    ReadVector4(): Vector4 {
        return new Vector4(this.ReadFloat(), this.ReadFloat(), this.ReadFloat(), this.ReadFloat());
    }

    ReadPackXZ(): Array<number>
    {
        let xPackData = new PackFloatXType();
        let zPackData = new PackFloatXType();

        xPackData.fv[0] = 0.0;
        zPackData.fv[0] = 0.0;

        xPackData.uv[0] = 0x40000000;
        zPackData.uv[0] = 0x40000000;
		let v1 = this.ReadUint8();
		let v2 = this.ReadUint8();
		let v3 = this.ReadUint8();

		let data = 0;
		data |= (v1 << 16);
		data |= (v2 << 8);
		data |= v3;

		xPackData.uv[0] |= (data & 0x7ff000) << 3;
		zPackData.uv[0] |= (data & 0x0007ff) << 15;

		xPackData.fv[0] -= 2.0;
		zPackData.fv[0] -= 2.0;
	
		xPackData.uv[0] |= (data & 0x800000) << 8;
		zPackData.uv[0] |= (data & 0x000800) << 20;
		
		let xzData = new Array(2);
		xzData[0] = xPackData.fv[0];
		xzData[1] = zPackData.fv[0];
		return xzData;
    }

    ReadPackY(): number
    {
        let data = this.ReadUint16();
        
        let yPackData = new PackFloatXType();
        yPackData.uv[0] = 0x40000000;
        yPackData.uv[0] |= (data & 0x7fff) << 12;   // 解压，补足尾数
        yPackData.fv[0] -= 2.0;                     // 此时还未设置符号位，当作正数处理，-2后再加上符号位即可，无需根据正负来+-2
        yPackData.uv[0] |= (data & 0x8000) << 16;   // 设置符号位

        return yPackData.fv[0];
    }

    WriteInt8(value: number): void
    {
        let buf = new Int8Array(this.buffer, this.wpos, 1);
        buf[0] = value;
        this.wpos += 1;
    }

    WriteInt16(value: number): void
    {
        this.WriteInt8(value & 0xff);
        this.WriteInt8((value >> 8) & 0xff);
    }

    WriteInt32(value: number): void
    {
        for(let i = 0; i < 4; i++)
            this.WriteInt8((value >> i * 8) & 0xff);
    }

    WriteInt64(value: DataTypes.KB_INT64): void
    {
        this.WriteInt32(value.low);
        this.WriteInt32(value.high);
    }

    WriteUint8(value: number): void
    {
        let buf = new Uint8Array(this.buffer, this.wpos, 1);
        buf[0] = value;
        this.wpos += 1;
    }

    WriteUint16(value: number): void
    {
        this.WriteUint8(value & 0xff);
        this.WriteUint8((value >> 8) & 0xff);
    }

    WriteUint32(value: number): void
    {
        for(let i = 0; i < 4; i++)
            this.WriteUint8((value >> i*8) & 0xff);
    }

    WriteUint64(value: DataTypes.KB_UINT64): void
    {
        this.WriteUint32(value.low);
        this.WriteUint32(value.high);
    }

    WriteFloat(value: number): void
    {
        try
        {
            let buf = new Float32Array(this.buffer, this.wpos, 1);
            buf[0] = value;
        }
        catch(e)
        {
            let buf = new Float32Array(1);
            buf[0] = value;
            let buf1 = new Uint8Array(this.buffer);
            let buf2 = new Uint8Array(buf.buffer);
            buf1.set(buf2, this.wpos);
        }

        this.wpos += 4;
    }

    WriteDouble(value: number): void
    {
		try
		{
			let buf = new Float64Array(this.buffer, this.wpos, 1);
			buf[0] = value;
		}
		catch(e)
		{
			let buf = new Float64Array(1);
			buf[0] = value;
			let buf1 = new Uint8Array(this.buffer);
			let buf2 = new Uint8Array(buf.buffer);
			buf1.set(buf2, this.wpos);
        }
        
        this.wpos += 8;
    }

    WriteBlob(value: string|Uint8Array): void
    {
        let size = value.length;
        if(size + 4 > this.Space())
        {
            KBEDebug.ERROR_MSG("KBE.MemoryStream:WriteBlob:there is no space for size:%d", size + 4);
            return;
        }

        this.WriteUint32(size);

        let buf = new Uint8Array(this.buffer, this.wpos, size);
        if(typeof(value) == "string")
        {
            for(let i = 0; i < size; i++)
            {
                buf[i] = value.charCodeAt(i);
            }
        }
        else
        {
            for(let i = 0; i< size; i++)
            {
                buf[i] = value[i];
            }
        }

        this.wpos += size;
    }

    WriteString(value: string): void
    {

        if(value.length + 1 > this.Space())
        {
            KBEDebug.ERROR_MSG("KBE.MemoryStream:WriteString:there is no space for size:%d", value.length + 1);
            return;
        }

        let buf = new Uint8Array(this.buffer, this.wpos, value.length);
        for(let i = 0; i < value.length; i++)
        {
            buf[i] = value.charCodeAt(i);
        }

        buf[value.length] = 0;
        this.wpos = this.wpos + value.length + 1;
    }

    ReadSkip(count: number): void
    {
        this.rpos += count;
    }

    Length(): number
    {
        return this.wpos - this.rpos;
    }

    ReadEOF(): boolean
    {
        return this.buffer.byteLength - this.rpos <= 0;
    }

    Done(): void
    {
        this.rpos = this.wpos;
    }

    GetBuffer(): ArrayBuffer
    {
        return this.buffer.slice(this.rpos, this.wpos);
    }

    GetRawBuffer(): ArrayBuffer
    {
        return this.buffer;
    }
}
//#endregion



//#region KBEngine NetworkInterface
export class NetworkInterface
{
    private socket: WebSocket | undefined;
    private onOpenCB: Function | undefined;

    get IsGood(): boolean
    {
        return this.socket != undefined && this.socket.readyState === WebSocket.OPEN;
    }

    ConnectTo(addr: string, callbackFunc?: (event:Event)=>any)
    {
        try
        {
            this.socket = new WebSocket(addr);
        }
        catch(e)
        {
            KBEDebug.ERROR_MSG("NetworkInterface::Connect:Init socket error:" + e);
            KBEEvent.Fire("onConnectionState", false);
            return;
        }

        this.socket.binaryType = "arraybuffer";

        this.socket.onerror = this.onerror;
        this.socket.onclose = this.onclose;
        this.socket.onmessage = this.onmessage;
        this.socket.onopen = this.onopen;
        if(callbackFunc)
        {
            this.onOpenCB = callbackFunc;
        }
    }

    Close()
    {
        try
        {
            KBEDebug.DEBUG_MSG("NetworkInterface::Close on good:" + this.IsGood)
            if(this.socket != undefined)
            {
                this.socket.close();
                this.socket.onclose = null;
                this.socket = undefined;
            }
        }
        catch(e)
        {
            KBEDebug.ERROR_MSG("NetworkInterface::Close error:%s.", e);
        }
    }

    Send(buffer: ArrayBuffer)
    {
        if(!this.IsGood)
        {
            KBEDebug.ERROR_MSG("NetworkInterface::Send:socket is unavailable.");
            return;
        }

        try
        {
            KBEDebug.DEBUG_MSG("NetworkInterface::Send buffer length:[%d].", buffer.byteLength);
            this.socket!.send(buffer);
        }
        catch(e)
        {
            KBEDebug.ERROR_MSG("NetworkInterface::Send error:%s.", e);
        }
    }

    private onopen = (event: Event) =>
    {
        KBEDebug.DEBUG_MSG("NetworkInterface::onopen:success!");
        if(this.onOpenCB)
        {
            this.onOpenCB(event as MessageEvent);
            this.onOpenCB = undefined;
        }
    }
    
    private onerror = (event: Event) =>
    {
        KBEDebug.DEBUG_MSG("NetworkInterface::onerror:...!");
        KBEEvent.Fire("onNetworkError", event as MessageEvent);
    }

    private onmessage = (event: MessageEvent) =>
    {
        let data: ArrayBuffer = event.data;
        //KBEDebug.DEBUG_MSG("NetworkInterface::onmessage:...!" + data.byteLength);
        let stream: MemoryStream = new MemoryStream(data);
        stream.wpos = data.byteLength;

        while(stream.rpos < stream.wpos)
        {
            let msgID = stream.ReadUint16();
            //KBEDebug.DEBUG_MSG("NetworkInterface::onmessage:...!msgID:" + msgID);

            let handler: Message = Messages.clientMessages[msgID];
            if(!handler)
            {
                KBEDebug.ERROR_MSG("NetworkInterface::onmessage:message(%d) has not found.", msgID);
            }
            else
            {
                let msgLen = handler.msglen;
                if(msgLen === -1)
                {
                    msgLen = stream.ReadUint16();
                    if(msgLen === 65535)
                    {
                        msgLen = stream.ReadUint32();
                    }
                }

                let wpos = stream.wpos;
                let rpos = stream.rpos + msgLen;
                stream.wpos = rpos;
                handler.handleMessage(stream);
                stream.wpos = wpos;
                stream.rpos = rpos;
            }
        }
    }

    private onclose = () =>
    {
        KBEDebug.DEBUG_MSG("NetworkInterface::onclose:...!");
        KBEEvent.Fire("onDisconnected");
    }
}
//#endregion


/*
	Generated by KBEngine!
	Please do not modify this file!
	tools = kbcmd
*/


export namespace KBETypes {

// defined in */entity_defs/types.xml

export type UINT8 = number; 
export type UINT16 = number; 
export type UINT64 = bigint; 
export type UINT32 = number; 
export type INT8 = number; 
export type INT16 = number; 
export type INT32 = number; 
export type INT64 = bigint; 
export type STRING = string; 
export type UNICODE = string; 
export type FLOAT = number; 
export type DOUBLE = number; 
export type PYTHON = Uint8Array; 
export type PY_DICT = Uint8Array; 
export type PY_TUPLE = Uint8Array; 
export type PY_LIST = Uint8Array; 
export type ENTITYCALL = Uint8Array; 
export type BLOB = Uint8Array; 
export type VECTOR2 = Vector2;
export type VECTOR3 = Vector3;
export type VECTOR4 = Vector4;
export type OBJECT_ID = number; 
export type BOOL = number; 
export type CONTROLLER_ID = number; 
export type EXPERIENCE = number; 
export type ITEM_ID = number; 
export type SKILLID = number; 
export type QUESTID = number; 
export type DBID = bigint; 
export type UID = bigint; 
export type UID1 = Uint8Array; 
export type ENTITY_ID = number; 
export type ENTITY_NO = number; 
export type SPACE_ID = number; 
export type POSITION3D = Vector3;
export type DIRECTION3D = Vector3;
export type ENTITY_UTYPE = number; 
export type DAMAGE_TYPE = number; 
export type ENMITY = number; 
export type HP = number; 
export type MP = number; 
export type ENTITY_STATE = number; 
export type ENTITY_SUBSTATE = number; 
export type ENTITY_FORBIDS = number; 
export class ENTITY_FORBID_COUNTER extends Array<number>{

}

export class ENTITYID_LIST extends Array<number>{

}

export class AVATAR_DATA{
	public param1:number = 0;
	public param2:Uint8Array = new Uint8Array();

}

export class AVATAR_INFOS{
	public dbid:bigint = 0n;
	public name:string = "";
	public roleType:number = 0;
	public level:number = 0;
	public data:AVATAR_DATA = new AVATAR_DATA();

}

export class AVATAR_INFOS_LIST{
	public values:Array<AVATAR_INFOS> = new Array<AVATAR_INFOS>();

}

export class BAG{
	public values22:Array<Array<bigint>> = new Array<Array<bigint>>();

}

export class EXAMPLES{
	public k1:bigint = 0n;
	public k2:bigint = 0n;

}



export class DATATYPE_ENTITY_FORBID_COUNTER extends DataTypes.DATATYPE_BASE{
	public createFromStreamEx(stream:MemoryStream): ENTITY_FORBID_COUNTER{
		let size = stream.ReadUint32();
		let datas = new ENTITY_FORBID_COUNTER();

		while(size > 0)
		{
			--size;
			datas.push(stream.ReadInt8());
		}

		return datas;
	}

	public addToStreamEx(stream:Bundle, v:ENTITY_FORBID_COUNTER){
		stream.WriteUint32( v.length >>> 0 );
		for(let i=0; i< v.length; ++i){
			stream.WriteInt8(v[i]);
		}
	}
}



export class DATATYPE_ENTITYID_LIST extends DataTypes.DATATYPE_BASE{
	public createFromStreamEx(stream:MemoryStream): ENTITYID_LIST{
		let size = stream.ReadUint32();
		let datas = new ENTITYID_LIST();

		while(size > 0)
		{
			--size;
			datas.push(stream.ReadInt32());
		}

		return datas;
	}

	public addToStreamEx(stream:Bundle, v:ENTITYID_LIST){
		stream.WriteUint32( v.length >>> 0 );
		for(let i=0; i< v.length; ++i){
			stream.WriteInt32(v[i]);
		}
	}
}



export class DATATYPE_AVATAR_DATA extends DataTypes.DATATYPE_BASE {
	public createFromStreamEx(stream: MemoryStream) : AVATAR_DATA {
		let datas = new AVATAR_DATA();
		datas.param1 = stream.ReadInt8();
		datas.param2 = stream.ReadBlob();
		return datas;
	}

	public addToStreamEx(stream:Bundle,  v:AVATAR_DATA){
		stream.WriteInt8(v.param1);
		stream.WriteBlob(v.param2);
	}
}



export class DATATYPE_AVATAR_INFOS extends DataTypes.DATATYPE_BASE {
	public data_DataType:DATATYPE_AVATAR_DATA = new DATATYPE_AVATAR_DATA();
	public createFromStreamEx(stream: MemoryStream) : AVATAR_INFOS {
		let datas = new AVATAR_INFOS();
		datas.dbid = stream.ReadUint64().toBigInt();
		datas.name = stream.ReadUnicode();
		datas.roleType = stream.ReadUint8();
		datas.level = stream.ReadUint16();
		datas.data = this.data_DataType.createFromStreamEx(stream);
		return datas;
	}

	public addToStreamEx(stream:Bundle,  v:AVATAR_INFOS){
		stream.WriteUint64(DataTypes.KB_UINT64.fromBigInt(v.dbid));
		stream.WriteUnicode(v.name);
		stream.WriteUint8(v.roleType);
		stream.WriteUint16(v.level);
		this.data_DataType.addToStreamEx(stream, v.data);
	}
}



export class DATATYPE_AVATAR_INFOS_LIST extends DataTypes.DATATYPE_BASE {
	public values_DataType:DATATYPE__AVATAR_INFOS_LIST_values_ArrayType_ChildArray = new DATATYPE__AVATAR_INFOS_LIST_values_ArrayType_ChildArray();

	public createFromStreamEx(stream: MemoryStream) : AVATAR_INFOS_LIST {
		let datas = new AVATAR_INFOS_LIST();
		datas.values = this.values_DataType.createFromStreamEx(stream);
		return datas;
	}

	public addToStreamEx(stream:Bundle,  v:AVATAR_INFOS_LIST){
		this.values_DataType.addToStreamEx(stream, v.values);
	}
}

export class DATATYPE__AVATAR_INFOS_LIST_values_ArrayType_ChildArray extends DataTypes.DATATYPE_BASE{
	private itemType = new DATATYPE_AVATAR_INFOS();

	public  createFromStreamEx(stream:MemoryStream ) : Array<AVATAR_INFOS>{
		let size = stream.ReadUint32();
		let datas = new Array<AVATAR_INFOS>();

		while(size > 0)
		{
			--size;
			datas.push(this.itemType.createFromStreamEx(stream));
		}

		return datas;
	}

	public addToStreamEx(stream:Bundle, v:Array<AVATAR_INFOS> ){
		stream.WriteUint32(v.length >>> 0);
		for(let i=0; i<v.length; ++i)
		{
			this.itemType.addToStreamEx(stream, v[i]);
		}
	}
}



export class DATATYPE_BAG extends DataTypes.DATATYPE_BASE {
	public values22_DataType:DATATYPE__BAG_values22_ArrayType_ChildArray = new DATATYPE__BAG_values22_ArrayType_ChildArray();

	public createFromStreamEx(stream: MemoryStream) : BAG {
		let datas = new BAG();
		datas.values22 = this.values22_DataType.createFromStreamEx(stream);
		return datas;
	}

	public addToStreamEx(stream:Bundle,  v:BAG){
		this.values22_DataType.addToStreamEx(stream, v.values22);
	}
}

export class DATATYPE__BAG_values22_ArrayType_ChildArray extends DataTypes.DATATYPE_BASE{
	private  itemType:DATATYPE___BAG_values22_ArrayType_ArrayType_ChildArray = new DATATYPE___BAG_values22_ArrayType_ArrayType_ChildArray();

	public  createFromStreamEx(stream:MemoryStream ) : Array<Array<bigint>>{
		let size = stream.ReadUint32();
		let datas = new Array<Array<bigint>>();

		while(size > 0)
		{
			--size;
			datas.push(this.itemType.createFromStreamEx(stream));
		}

		return datas;
	}

	public addToStreamEx(stream:Bundle ,v:Array<Array<bigint>> ){
		stream.WriteUint32(v.length >>> 0);
		for(let i=0; i<v.length; ++i)
		{
			this.itemType.addToStreamEx(stream, v[i]);
		}
	}
}

export class DATATYPE___BAG_values22_ArrayType_ArrayType_ChildArray extends DataTypes.DATATYPE_BASE{
	public  createFromStreamEx(stream:MemoryStream ) : Array<bigint>{
		let size = stream.ReadUint32();
		let datas = new Array<bigint>();

		while(size > 0)
		{
			--size;
			datas.push(stream.ReadInt64().toBigInt());
		}

		return datas;
	}

	public addToStreamEx(stream:Bundle, v:Array<bigint> ){
		stream.WriteUint32(v.length >>> 0);
		for(let i=0; i<v.length; ++i)
		{
			stream.WriteInt64(DataTypes.KB_INT64.fromBigInt(v[i]));
		}
	}
}



export class DATATYPE_EXAMPLES extends DataTypes.DATATYPE_BASE {
	public createFromStreamEx(stream: MemoryStream) : EXAMPLES {
		let datas = new EXAMPLES();
		datas.k1 = stream.ReadInt64().toBigInt();
		datas.k2 = stream.ReadInt64().toBigInt();
		return datas;
	}

	public addToStreamEx(stream:Bundle,  v:EXAMPLES){
		stream.WriteInt64(DataTypes.KB_INT64.fromBigInt(v.k1));
		stream.WriteInt64(DataTypes.KB_INT64.fromBigInt(v.k2));
	}
}



export class DATATYPE_AnonymousArray_32 extends DataTypes.DATATYPE_BASE{
	public createFromStreamEx(stream:MemoryStream): Array<number>{
		let size = stream.ReadUint32();
		let datas = new Array<number>();

		while(size > 0)
		{
			--size;
			datas.push(stream.ReadInt32());
		}

		return datas;
	}

	public addToStreamEx(stream:Bundle, v:Array<number>){
		stream.WriteUint32( v.length >>> 0 );
		for(let i=0; i< v.length; ++i){
			stream.WriteInt32(v[i]);
		}
	}
}


}