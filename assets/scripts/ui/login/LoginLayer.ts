import { _decorator, Button, Color, Component, EditBox, EventHandler, instantiate, Label, log, Node, Prefab, resources, Sprite, sys } from 'cc';
const { ccclass, property } = _decorator;

import { KBEngineApp, KBETypes } from "../../kbe_typescript_plugins/KBEngine";
import { MessagePopup } from '../../MessagePopup';
import KBEEvent from '../../kbe_typescript_plugins/Event';
import { AvatarItem } from './AvatarItem';
import { g_Account } from '../../entities/Account';




export var g_LoginLayer:LoginLayer

@ccclass('LoginLayer')
export class LoginLayer extends Component {


    @property(Node)
    loginLayer: Node = null
    @property(Node)
    registerLayer: Node = null
    @property(Node)
    selectAvatarLayer: Node = null
    @property(Node)
    createAvatarLayer: Node = null

    @property(EditBox)
    loginNameBox: EditBox = null
    @property(EditBox)
    loginPassBox: EditBox = null


    @property(EditBox)
    registerNameBox: EditBox = null
    @property(EditBox)
    registerLoginPassBox: EditBox = null


    @property(EditBox)
    createAvatarNameBox: EditBox = null

    @property(Node)
    avatarList: Node = null


    // 选择的角色
    selectAvatarItem:KBETypes.AVATAR_INFOS | null = null


    start() {
        g_LoginLayer = this
        this.loginLayer.active = true
        this.registerLayer.active = false
        this.selectAvatarLayer.active = false
        this.createAvatarLayer.active = false 
        // let s=sys.localStorage.getItem("name")
        // if(s){
        //     this.nameBox.string = s
        // }
        // s=sys.localStorage.getItem("pass") 
        // if(s){
        //     this.passBox.string = s
        // }

        KBEEvent.Register("onLoginFailed",this,this.onLoginFailed)
        
        KBEEvent.Register("onNetworkError", this, this.onNetworkError);
    }

    onLoginFailed(failedcode:number){
        MessagePopup.showMessage("登录失败，请稍后重试"+KBEngineApp.app.ServerErrItem(failedcode)?.descr);
    }

    onNetworkError(event: MessageEvent) {
        MessagePopup.showMessage("网络连接失败，请稍后重试");
    }

    onEdit() {
        // sys.localStorage.setItem("name",this.nameBox.string)
        // sys.localStorage.setItem("pass",this.passBox.string)
    }

    // 登录按钮点击
    onButtonLogin() {
        // log("login ",this.nameBox.string,this.passBox.string)
        KBEngineApp.app.Login(this.loginNameBox.string,this.loginPassBox.string,"kbengine_unity3d_demo")  
        // this.selectAvatarLayer.active = true
        // this.createAvatarLayer.active = false
        // this.loginLayer.active = false
        // this.registerLayer.active = false
    }


    // 去注册按钮点击
    onButtonGoToRegister() {
        this.loginLayer.active = false
        this.registerLayer.active = true
    }

    // 注册按钮点击
    onButtonRegister() {
        // MessagePopup.showMessage("网络连接失败，请稍后重试");
        // log("register ",this.nameBox.string,this.passBox.string)
        KBEngineApp.app.CreateAccount(this.registerNameBox.string,this.registerLoginPassBox.string,"kbengine_unity3d_demo")
    }

    //去登录按钮点击
    onButtonGoToLogin() {
        this.loginLayer.active = true
        this.registerLayer.active = false
    }


    // 进入游戏按钮点击
    onEnterGame() {
        // log("onEnterGame")
        if(this.selectAvatarItem){
            g_Account.selectAvatarGame(this.selectAvatarItem.dbid)
        }else{
            MessagePopup.showMessage("请选择角色")
        }
    }

    // 去创建角色按钮点击
    onGotoCreateAvatar() {
        this.selectAvatarLayer.active = false
        this.createAvatarLayer.active = true
    }

    // 创建角色按钮点击
    onCreateAvatar() { 
        g_Account.reqCreateAvatar(1,this.createAvatarNameBox.string)
    }

    // 选择角色按钮点击
    onSelectAvatar(avatar:KBETypes.AVATAR_INFOS,index:number) {
        // let index = parseInt(customEventData)
        // this.selectAvatarItem = this.avatarList.children[index].getComponent(AvatarItem).avatar
        

        // console.log("selectAvatarItem",this.selectAvatarItem)
        this.selectAvatarItem = avatar

        // 设置avatarList中所有按钮颜色为白色
        this.avatarList.children.forEach(child => {
            child.getComponent(Sprite).color = new Color(255, 255, 255, 255)
        })
    }

    // 删除角色按钮点击
    onButtonRemoveAvatar(){
        if(this.selectAvatarItem){
            g_Account.baseEntityCall.reqRemoveAvatar(this.selectAvatarItem.name)
        }else{
            MessagePopup.showMessage("请选择角色")
        }
    }

    // 返回到选择角色界面
    onReturnToSelectAvatarLayer() {
        this.selectAvatarLayer.active = true
        this.createAvatarLayer.active = false
    }


    createAvatarListUI(avatars:KBETypes.AVATAR_INFOS_LIST){ 
        this.selectAvatarLayer.active = true
        this.createAvatarLayer.active = false
        this.loginLayer.active = false
        this.registerLayer.active = false


        this.avatarList.removeAllChildren()

        avatars.values.forEach((avatar,index) => {
            resources.load("prefab/ui/login/角色项", Prefab, (err, prefab) => {
                const newNode = instantiate(prefab);
                newNode.getComponent(AvatarItem).init(avatar,index)
                this.avatarList.addChild(newNode);
            });
        })


    }

    createAvatarResult(retcode, info){
        if(retcode == 0){
            this.selectAvatarItem = info

            // 返回到选择角色界面
            this.selectAvatarLayer.active = true
            this.createAvatarLayer.active = false
        }else{
            MessagePopup.showMessage("创建角色失败")
        }
    }





    update(deltaTime: number) {

    }


    onDestroy() {

    }
}


