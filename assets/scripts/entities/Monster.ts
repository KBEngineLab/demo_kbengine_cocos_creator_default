//    Copyright (C) 2016-2018 __COMPANY_NAME
//    All rights reserved
//
//    created by zone at 2018-10-19 19:00

import KBEDebug from "../kbe_typescript_plugins/KBEDebug";
import { RegisterScript } from "../kbe_typescript_plugins/ExportEntity";
import { MonsterBase } from "../kbe_typescript_plugins/MonsterBase";
import { Vector3 } from "../kbe_typescript_plugins/KBEMath";
import { director, instantiate, Prefab, resources, tween, v3, Vec3 } from "cc";
import { AvatarItem } from "../ui/login/AvatarItem";
import { GameObject } from "../GameObject";
import { KBEngineApp } from "../kbe_typescript_plugins/KBEngine";

export class Monster extends MonsterBase {

    private _go: GameObject = null!;
    __init__() {
        super.__init__();
        let that = this;

        // console.log("Monster::__init__:", this.id);



    }

    public recvDamage(arg1: number, arg2: number, arg3: number, arg4: number) {
        // 接收伤害的逻辑
    }



    onPositionChanged(oldVal: Vector3): void {
        if (!this.renderObj) return;
        const targetPos = new Vec3(this.position.x, 0.1, this.position.z);

        const oldtPos = v3(oldVal.x, 0.1, oldVal.z);
        const dist = Vec3.distance(targetPos, oldtPos);

        if (dist > 20) {
            this.renderObj.setPosition(targetPos);
        } else {
            tween(this.renderObj).stop();
            tween(this.renderObj)
                .to(0.2, { position: targetPos }, { easing: 'linear' })
                .start();
        }


    }

    onDirectionChanged(oldVal: Vector3): void {
        super.onDirectionChanged(oldVal);

        if (this.renderObj) {
            // +180 设置正确朝向，因为cocos 模型坐标系是-z朝外，lookat也是-z面向
            this.renderObj.setRotationFromEuler(this.direction.x, this.direction.z + 180, this.direction.y);
        }
    }

    public onHPChanged(oldValue: number): void {
        if (this.renderObj) {
            this.renderObj.getComponent(GameObject).setHP(this.HP, this.HP_Max);
        }
    }

    OnEnterWorld(): void {
        let that = this
        console.log("Monster::OnEnterWorld");
        resources.load("prefab/Monster", Prefab, (err, prefab) => {
            if (err) {
                console.error("加载 Monster prefab 失败:", err);
                return;
            }

            let monster = instantiate(prefab);


            monster.name = `Monster_${this.id}`;

            director.getScene().addChild(monster);


            let go = monster.addComponent(GameObject);
            go.username = that.name;
            go.hp = that.HP;
            go.hpMax = that.HP_Max;

            go.entity = that;

            go.create();

            this._go = go;

            monster.setPosition(this.position.x, 0, this.position.z);
            monster.setRotationFromEuler(this.direction.x, this.direction.z, this.direction.y);

            that.renderObj = monster;
        });
    }


    OnLeaveWorld(): void {
        super.OnLeaveWorld();
        if (this.renderObj) {
            this.renderObj.destroy();
            this.renderObj = null;
        }
    }

    OnLeaveSpace(): void {
        // this.OnLeaveWorld();
    }


    OnEnterSpace(): void {
        // this.OnEnterWorld();
    }



}

RegisterScript("Monster", Monster);
