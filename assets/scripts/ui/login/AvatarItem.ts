import { _decorator, Color, Component, Label, Node, Sprite } from 'cc';
import { KBETypes } from '../../kbe_typescript_plugins/KBEngine';
import { g_LoginLayer } from './LoginLayer';
const { ccclass, property } = _decorator;

@ccclass('AvatarItem')
export class AvatarItem extends Component {
    avatar:KBETypes.AVATAR_INFOS
    index:number

    init(avatar:KBETypes.AVATAR_INFOS,index:number){
        this.avatar = avatar
        this.node.getChildByName("Label").getComponent(Label).string = this.avatar.name
        this.index = index
    }


    onClick(){
        console.log("onClick",this.avatar,this.index)  
        g_LoginLayer.onSelectAvatar(this.avatar,this.index)


        // 设置按钮颜色为红色，颜色是rgba(255,0,0,255)
        this.node.getComponent(Sprite).color = new Color(255,0,0,255)
    }
}


