//    Copyright (C) 2016-2018 __COMPANY_NAME
//    All rights reserved
//
//    created by zone at 2018-10-19 19:00

import KBEDebug from "../kbe_typescript_plugins/KBEDebug";
import { RegisterScript } from "../kbe_typescript_plugins/ExportEntity";
import { MonsterBase } from "../kbe_typescript_plugins/MonsterBase";
import { Vector3 } from "../kbe_typescript_plugins/KBEMath";
import { director, instantiate, Prefab, resources, tween, Vec3 } from "cc";
import { AvatarItem } from "../ui/login/AvatarItem";
import { GameObject } from "../GameObject";

export class Monster extends MonsterBase {

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



        // console.log("Monster::onDirectionChanged:", this.direction);
        // console.log("Old direction:", oldVal);
        // console.log("Monster::onPositionChanged:", this.position);
        // console.log("Old position:", oldVal);

        const targetPos = new Vec3(this.position.x, 0.1, this.position.z);

        // 停止之前的移动 tween（如果有）
        tween(this.renderObj).stop();

        // 平滑移动（0.2 秒可调）
        tween(this.renderObj)
            .to(0.2, { position: targetPos }, { easing: 'sineInOut' })
            .start();
        // this.renderObj.setPosition(this.position.x, this.position.y, this.position.z);
    }

    onDirectionChanged(oldVal: Vector3): void {
        // console.log("Monster::onDirectionChanged:", this.direction);
        // console.log("Old direction:", oldVal);
        super.onDirectionChanged(oldVal);

        if (this.renderObj) {
            this.renderObj.setRotationFromEuler(this.direction.x, this.direction.z, this.direction.y);
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

            go.create();

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



}

RegisterScript("Monster", Monster);
