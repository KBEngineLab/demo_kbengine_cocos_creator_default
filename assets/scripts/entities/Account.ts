import { Entity, KBETypes } from "../kbe_typescript_plugins/KBEngine";
import {RegisterScript} from "../kbe_typescript_plugins/ExportEntity";
import {KBEngineApp} from "../kbe_typescript_plugins/KBEngine";
import KBEEvent from "../kbe_typescript_plugins/Event";
import { AccountBase } from "../kbe_typescript_plugins/AccountBase";
import KBEDebug from "../kbe_typescript_plugins/KBEDebug";
import { MessagePopup } from "../MessagePopup";


import {g_LoginLayer} from "../ui/login/LoginLayer";
import { director } from "cc";


export var g_Account:Account
export class Account extends AccountBase {
    avatars:KBETypes.AVATAR_INFOS_LIST
    __init__() {
        super.__init__()
        g_Account=this
        window["g_Account"]=this

        // g_HelloLayer.node.active=true
        // g_HelloLayer.onLoginSuccess()
        // // this.BaseCall("reqAvatarList")
        // this.baseEntityCall.reqAvatarList()

        // KBEEvent.Register("reqAvatarList",this,this.onReqAvatarList.bind(this))
        // KBEEvent.Register("selectAvatarGame",this,this.selectAvatarGame.bind(this))

        KBEDebug.DEBUG_MSG("Account:: 登录成功")
        MessagePopup.showMessage("登录成功")
        this.baseEntityCall.reqAvatarList()
        
    }


    onReqAvatarList(infos) {
        this.avatars = infos;
        console.info("KBEAccount::onReqAvatarList: avatarsize=" + this.avatars.values.length);
        for (var i = 0; i < this.avatars.values.length; i++) {
            console.info("KBEAccount::onReqAvatarList: name" + i + "=" + this.avatars.values[i].name + " dbid=" + this.avatars.values[i].dbid);
        }

        g_LoginLayer.createAvatarListUI(this.avatars)

    }

    onCreateAvatarResult(retcode, info) {
        if (retcode == 0) {
            this.baseEntityCall.reqAvatarList()
        }else{
            console.info("KBEAccount::onCreateAvatarResult: avatarsize=" + this.avatars.values.length + ", error=" + KBEngineApp.app.ServerErr(retcode));
        }

        
        g_LoginLayer.createAvatarResult(retcode, info)
    }


    onRemoveAvatar(dbid) {
        if(dbid > 0){
            MessagePopup.showMessage("删除角色成功")
            this.baseEntityCall.reqAvatarList()
        }else{
            MessagePopup.showMessage("删除角色失败")
        }
        // if (this.avatars["values"].length <= 0)
        //     return;

        // var done = false;
        // var values = [];
        // for (var i = 0; i < this.avatars.values.length; i++) {
        //     if (this.avatars.values[i].dbid != dbid)
        //         values.push(this.avatars.values[i]);
        //     else
        //         done = true;
        // }

        // if (done) {
        //     this.avatars.values = values;
        //     console.info("Account::onRemoveAvatar: dbid=" + dbid);
        // }
    }

    reqCreateAvatar(roleType, name) {
        this.baseEntityCall.reqCreateAvatar(roleType, name);
        console.info("Account::reqCreateAvatar: roleType=" + roleType + ", name=" + name);
    }

    selectAvatarGame(dbid) {
        // 这里偷懒先切换了场景后请求进入，实际上需要请求完之后，在avatar创建时再切换场景，同时切换场景时需要考虑各种entity的创建时机，
        // 因为场景创建和entity创建是"异步"的，可能entity创建时场景还没有加载完成。
        director.loadScene("scene/world", () => {
            console.info("Account::selectAvatarGame: scene loaded");
            this.baseEntityCall.selectAvatarGame(dbid);
            console.info("Account::selectAvatarGame: dbid=" + dbid);
        });
    }
    OnDestroy(){
        super.OnDestroy()
        g_Account=null
    }

}

RegisterScript("Account", Account);