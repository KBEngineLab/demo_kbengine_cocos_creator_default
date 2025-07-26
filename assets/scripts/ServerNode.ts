//    Copyright (C) 2016-2017 __COMPANY_NAME
//    All rights reserved
//
//    created by zone at 2017/9/26 22:54

import {KBEngineApp,KBEngineArgs} from "./kbe_typescript_plugins/KBEngine";
import KBEEvent from "./kbe_typescript_plugins/Event";

import { _decorator, Component,log,director } from 'cc';

const {ccclass, property, disallowMultiple,executionOrder} = _decorator


export var g_ServerNode:ServerNode=null
@ccclass
@disallowMultiple
export class ServerNode extends Component {
    @property
    ip="127.0.0.1"
    onLoad(){
        g_ServerNode=this
        this.installEvents()
        this.initServerApp()
    }

    installEvents(){
        //example
        KBEEvent.Register("onCreateAccountResult",this,this.onCreateAccountResult.bind(this))
        KBEEvent.Register("onDisconnected",this,this.onDisconnected.bind(this))
    }

    initServerApp():void {
        log("init Server App")
        let args = new KBEngineArgs();
        args.address=this.ip
        args.port = 20013;
        KBEngineApp.Destroy();
        KBEngineApp.Create(args)
    }

    onCreateAccountResult(err, datas) {
        log("onCreateAccountResult",err,datas)
    }

    onDisconnected(){
        KBEngineApp.Destroy()
        log("连接断开")
        director.loadScene("scene/login")
    }

    onDestroy(){
        g_ServerNode=null
        KBEEvent.DeregisterObject(this)
    }
}