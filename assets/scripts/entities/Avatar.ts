//    Copyright (C) 2016-2018 __COMPANY_NAME
//    All rights reserved
//
//    created by zone at 2018-10-19 19:00

import KBELog from "../kbe_typescript_plugins/KBELog";
import { RegisterScript } from "../kbe_typescript_plugins/ExportEntity";
import { Vector3 } from "../kbe_typescript_plugins/KBEMath";


import { _decorator, CharacterController, director, find, instantiate, Prefab, resources, SkeletalAnimation, tween, v3, Vec3 ,Node} from 'cc';
import { AvatarBase } from "../kbe_typescript_plugins/AvatarBase";
import { GameObject } from "../GameObject";
import { g_CameraController } from "../CameraController";
import { PlayerController } from "../PlayerController";
import { KBEngineApp } from "../kbe_typescript_plugins/KBEngine";
import KBEEvent from "../kbe_typescript_plugins/Event";

export var g_Avatar
export class Avatar extends AvatarBase {


    public currSpaceID: number = 0;
    private _playerController: PlayerController | null = null;


    constructor() {
        super();


    }

    public onAddSkill(arg1: number) {
        console.log("Avatar::onAddSkill: " + arg1);
    }
    public onJump() {
        console.log("Avatar::onJump");
    }
    public onRemoveSkill(arg1: number) {
        console.log("Avatar::onRemoveSkill: " + arg1);
    }
    public dialog_addOption(arg1: number, arg2: number, arg3: string, arg4: number) {
        console.log("Avatar::dialog_addOption: " + arg1 + ", " + arg2 + ", " + arg3 + ", " + arg4);
    }
    public dialog_close() {
        console.log("Avatar::dialog_close");
    }
    public dialog_setText(arg1: string, arg2: number, arg3: number, arg4: string) {
        console.log("Avatar::dialog_setText: " + arg1 + ", " + arg2 + ", " + arg3 + ", " + arg4);
    }
    public recvDamage(arg1: number, arg2: number, arg3: number, arg4: number) {
        // 获取攻击方node
        let node = KBEngineApp.app.entities[arg1].renderObj as Node
        node.getComponent(GameObject)?.playAttack()

        console.log("Avatar::recvDamage: " + arg1 + ", " + arg2 + ", " + arg3 + ", " + arg4);
    }
    __init__() {
        super.__init__()   



        if (this.IsPlayer()) {
                    
            g_Avatar = this
            window["g_Avatar"] = this
            // g_HelloLayer.node.active=false
            // g_WorldUILayer.node.active=true
            // scene.loadScene("world")

        }
    }


    public onStateChanged(oldValue: number): void {
        // = 1 死亡
        // this.cellEntityCall.useTargetSkill
    }


    onPositionChanged(oldVal: Vector3): void {
        super.onPositionChanged(oldVal);
        if (!this.renderObj) return;
        // if (this.IsPlayer()) return;

        const targetPos = new Vec3(this.position.x, 0.1, this.position.z);


        if (this._playerController.characterController) this._playerController.characterController.enabled = false;
        this.renderObj.setPosition(targetPos);
        if (this._playerController.characterController) this._playerController.characterController.enabled = true;
        

    }
    
    onSmoothPositionChanged(oldVal: Vector3): void {
        super.onPositionChanged(oldVal);
        if (!this.renderObj) return;
        // if (this.IsPlayer()) return;
        const targetPos = new Vec3(this.position.x, 0.1, this.position.z);

        tween(this.renderObj).stop();
            tween(this.renderObj)
                .to(0.1, { position: targetPos }, { easing: 'linear' })
                .start();

    }

    onDirectionChanged(oldVal: Vector3): void {
        if (this.IsPlayer()) return;
        // console.log("Monster::onDirectionChanged:", this.direction);
        // console.log("Old direction:", oldVal);
        super.onDirectionChanged(oldVal);


        if (this.renderObj) {
            this.renderObj.setRotationFromEuler(this.direction.x, this.direction.z, this.direction.y);
        }


        this.currSpaceID = KBEngineApp.app.spaceID;
    }

    public onHPChanged(oldValue: number): void {
        if (this.renderObj) {
            this.renderObj.getComponent(GameObject).setHP(this.HP, this.HP_Max);
        }
    }
    OnEnterWorld(): void {
        super.OnEnterWorld()
        let that = this;
        console.log("Avatar::OnEnterWorld: spaceID=" + this.currSpaceID + ", entityID=" + this.id + ", name=" + this.name + ", pos=" + this.position.toString() + ", dir=" + this.direction.toString());

        resources.load("prefab/Player", Prefab, (err, prefab) => {
            if (err) {
                console.error("加载 Player prefab 失败:", err);
                return;
            }

            let player = instantiate(prefab);


            player.name = `Player_${this.id}`;

            player.setPosition(this.position.x, 0, this.position.z);
            player.setRotationFromEuler(this.direction.x, this.direction.z, this.direction.y);


            director.getScene().addChild(player);


            let go = player.addComponent(GameObject);
            go.username = that.name;
            go.hp = that.HP;
            go.hpMax = that.HP_Max;
            go.offset = v3(0, 6);
            go.entity = that;
            go.create();

            if (this.IsPlayer()) {
                g_CameraController.target = player;

                let pc = player.addComponent(PlayerController)
                pc.animation = player.getComponentInChildren(SkeletalAnimation)
                pc.characterController = player.getComponent(CharacterController)
                pc.moveSpeed = this.moveSpeed
                pc.avatar = that;

                that._playerController = pc;
            }

            that.renderObj = player;
        });
    }


    OnLeaveWorld(): void {
        super.OnLeaveWorld();
        if (this.renderObj) {
            this.renderObj.destroy();
            this.renderObj = null;
        }
    }

    OnEnterSpace(): void {
        super.OnEnterSpace();
        this.currSpaceID = KBEngineApp.app.spaceID;

    }

}

RegisterScript("Avatar", Avatar);