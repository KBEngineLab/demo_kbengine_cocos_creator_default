
import KBEDebug from "./KBEDebug";

class EventInfo
{
    m_object: object;
    m_cbFunction: Function;

    constructor(p_object: object, cbFunction: Function)
    {
        this.m_object = p_object;
        this.m_cbFunction = cbFunction;
    }
}


export default class KBEEvent
{
    private static _events: {} = {};

    static Register(eventName: string, p_object: object, cbFunction: Function): void
    {
        let eventList: Array<EventInfo> = this._events[eventName];  // 或者let eventList: EventInfo[] = [];
        if(eventList === undefined)
        {
            eventList = [];
            this._events[eventName] = eventList;
        }
        eventList.push(new EventInfo(p_object, cbFunction));
    }

    static Deregister(eventName: string, p_object: object|null, cbFunction: Function): void
    {
        let eventList: Array<EventInfo> = this._events[eventName];
        if(eventList === undefined)
        {
            // KBEDebug.ERROR_MSG("Event::Deregister:cant find event by name(%s).", eventName);
            return;
        }

        let hasFound: boolean = false;
        for (let item of eventList)
        {
            // 注意，严格模式下，arguments,call等被禁用，不可访问这些成员
            //KBEDebug.WARNING_MSG("Event::Deregister:let key of eventList.:" +item.m_cbFunction.toString());

            if(p_object === item.m_object && item.m_cbFunction === cbFunction)
            {
                let index: number = eventList.indexOf(item);
                eventList.splice(index, 1);
                KBEDebug.WARNING_MSG("Event::Deregister:item.m_cbFunction === cbFunction...delete index:%d", index);
                hasFound = true;
                break;
            }
        }
        if(!hasFound)
        {
            // KBEDebug.ERROR_MSG("Event::Deregister:cant find event by Function(event name:%s).", eventName);
        }
    }

    static Fire(eventName: string, ...params: any[]): void
    {
        let eventList: Array<EventInfo> = this._events[eventName];
        if(eventList === undefined)
        {
            // KBEDebug.DEBUG_MSG("Event::Fire:cant find event by name(%s).", eventName);
            return;
        }

        for(let item of eventList)
        {
            try
            {
                // 注意，传入参数和注册函数参数类型数量可以不一致，作为事件函数的参数类型检查没有作用
                item.m_cbFunction.apply(item.m_object, params);
            }
            catch(e)
            {
                KBEDebug.ERROR_MSG("Event::Fire(%s):%s", eventName, e);
            }
        }
    }

    static DeregisterObject(p_object: object): void
    {
        if(p_object === null)
        {
            KBEDebug.ERROR_MSG("Event::DeregisterObject:object cannot be null.");
            return;
        }

        let deleteCount: number = 0;
        for(let key in this._events)
        {
            let eventList: Array<EventInfo> = this._events[key];
            for(let item of eventList)
            {
                if(item.m_object === p_object)
                {
                    let index: number = eventList.indexOf(item);
                    eventList.splice(index, 1);
                    deleteCount += 1;
                }
            }
        }

        KBEDebug.DEBUG_MSG("KBEEvent::DeregisterObject %s:delete count:%d.", p_object.toString(), deleteCount);
    }
}


// KBE-Plugin fire-out events(KBE => TS):
export class EventOutTypes {
    // ------------------------------------账号相关------------------------------------

    
    /** Create account feedback results. 
    <para> param1(uint16): retcode. server_errors</para>
    <para> param2(bytes): datas. If you use third-party account system, the system may fill some of the third-party additional datas. </para> */
    static onCreateAccountResult = "onCreateAccountResult";

    
    /** Response from binding account Email request.
    <para> param1(uint16): retcode. server_errors</para> */
    static onBindAccountEmail = "onBindAccountEmail";

    
    /** Response from a new password request.
    <para> param1(uint16): retcode. server_errors</para> */
    static onNewPassword = "onNewPassword";

    
    /** Response from a reset password request.
    <para> param1(uint16): retcode. server_errors</para> */
    static onResetPassword = "onResetPassword";

    // ------------------------------------连接相关------------------------------------
    
    /** Kicked of the current server.
    <para> param1(uint16): retcode. server_errors</para> */
    static onKicked = "onKicked";

    
    /** Disconnected from the server. */
    static onDisconnected = "onDisconnected";

    
    /** Status of connection server.
    <para> param1(bool): success or fail</para> */
    static onConnectionState = "onConnectionState";

    // ------------------------------------logon相关------------------------------------
    
    /** Engine version mismatch.
    <para> param1(string): clientVersion
    <para> param2(string): serverVersion */
    static onVersionNotMatch = "onVersionNotMatch";

    
    /** script version mismatch.
    <para> param1(string): clientScriptVersion
    <para> param2(string): serverScriptVersion */
    static onScriptVersionNotMatch = "onScriptVersionNotMatch";

    
    /** Login failed.
    <para> param1(uint16): retcode. server_errors</para> */
    static onLoginFailed = "onLoginFailed";

    
    /** Login to baseapp. */
    static onLoginBaseapp = "onLoginBaseapp";

    
    /** Login baseapp failed.
    <para> param1(uint16): retcode. server_errors</para> */
    static onLoginBaseappFailed = "onLoginBaseappFailed";

    
    /** Relogin to baseapp. */
    static onReloginBaseapp = "onReloginBaseapp";

    
    /** Relogin baseapp success. */
    static onReloginBaseappSuccessfully = "onReloginBaseappSuccessfully";

    
    /** Relogin baseapp failed.
    <para> param1(uint16): retcode. server_errors</para> */
    static onReloginBaseappFailed = "onReloginBaseappFailed";

    //------------------------------------实体cell相关事件------------------------------------

    
    /** Entity enter the client-world.
    <para> param1: Entity</para> */
    static onEnterWorld = "onEnterWorld";

    
    /** Entity leave the client-world.
    <para> param1: Entity</para> */
    static onLeaveWorld = "onLeaveWorld";

    
    /** Player enter the new space.
    <para> param1: Entity</para> */
    static onEnterSpace = "onEnterSpace";

    
    /** Player leave the space.
    <para> param1: Entity</para> */
    static onLeaveSpace = "onLeaveSpace";

    
    /** Sets the current position of the entity.
    <para> param1: Entity</para> */
    static set_position = "set_position";

    
    /** Sets the current direction of the entity.
    <para> param1: Entity</para> */
    static set_direction = "set_direction";

    
    /** The entity position is updated, you can smooth the moving entity to new location.
    <para> param1: Entity</para> */
    static updatePosition = "updatePosition";

    
    /** The current space is specified by the geometry mapping.
    Popular said is to load the specified Map Resources.
    <para> param1(string): resPath</para> */
    static addSpaceGeometryMapping = "addSpaceGeometryMapping";

    
    /** Server spaceData set data.
    <para> param1(int32): spaceID</para>
    <para> param2(string): key</para>
    <para> param3(string): value</para> */
    static onSetSpaceData = "onSetSpaceData";

    
    /** Start downloading data.
    <para> param1(int32): rspaceID</para>
    <para> param2(string): key</para> */
    static onDelSpaceData = "onDelSpaceData";

    
    /** Triggered when the entity is controlled or out of control.
    <para> param1: Entity</para>
    <para> param2(bool): isControlled</para> */
    static onControlled = "onControlled";

    
    /** Lose controlled entity.
    <para> param1: Entity</para> */
    static onLoseControlledEntity = "onLoseControlledEntity";

    // ------------------------------------数据下载相关------------------------------------
    
    /** Start downloading data.
    <para> param1(uint16): resouce id</para>
    <para> param2(uint32): data size</para>
    <para> param3(string): description</para> */
    static onStreamDataStarted = "onStreamDataStarted";

    
    /** Receive data.
    <para> param1(uint16): resouce id</para>
    <para> param2(bytes): datas</para> */
    static onStreamDataRecv = "onStreamDataRecv";

    
    /** The downloaded data is completed.
    <para> param1(uint16): resouce id</para> */
    static onStreamDataCompleted = "onStreamDataCompleted";
};


//KBE-Plugin fire-in events(TS => KBE):

export class EventInTypes {
    
    /** Create new account.
    <para> param1(string): accountName</para>
    <para> param2(string): password</para>
    <para> param3(bytes): datas Datas by user defined. Data will be recorded into the KBE account database, you can access the datas through the script layer. If you use third-party account system, datas will be submitted to the third-party system.</para> */
    static createAccount = "createAccount";

    
    /** Login to server.
    <para> param1(string): accountName</para>
    <para> param2(string): password</para>
    <para> param3(bytes): datas Datas by user defined. Data will be recorded into the KBE account database, you can access the datas through the script layer. If you use third-party account system, datas will be submitted to the third-party system.</para> */
    static login = "login";

    
    /** Logout to baseapp, called when exiting the client. */
    static logout = "logout";

    
    /** Relogin to baseapp. */
    static reloginBaseapp = "reloginBaseapp";

    
    /** Reset password.
    <para> param1(string): accountName</para> */
    static resetPassword = "resetPassword";

    
    /** Request to set up a new password for the account. Note: account must be online.
    <para> param1(string): old_password</para>
    <para> param2(string): new_password</para> */
    static newPassword = "newPassword";

    
    /** Request server binding account Email.
    <para> param1(string): emailAddress</para> */
    static bindAccountEmail = "bindAccountEmail";
};
