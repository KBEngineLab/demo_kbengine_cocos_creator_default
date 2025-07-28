//    Copyright (C) 2016-2018 __COMPANY_NAME
//    All rights reserved
//
//    created by zone at 2018-10-19 19:00

import KBEDebug from "../kbe_typescript_plugins/KBEDebug";
import { RegisterScript } from "../kbe_typescript_plugins/ExportEntity";
import { GateBase } from "../kbe_typescript_plugins/GateBase";
import { resources, Prefab, instantiate, director, Vec3, tween, v3 } from "cc";
import { GameObject } from "../GameObject";
import { Vector3 } from "../kbe_typescript_plugins/KBEMath";

export class Gate extends GateBase {

    onPositionChanged(oldVal: Vector3): void {
        if (!this.renderObj) return;

        this.renderObj.setPosition(this.position.x, this.position.y, this.position.z);
    }
    OnEnterWorld(): void {
        let that = this
        resources.load("prefab/Gate", Prefab, (err, prefab) => {
            if (err) {
                console.error("加载 Gate prefab 失败:", err);
                return;
            }

            let gate = instantiate(prefab);


            gate.name = `Gate_${this.id}`;

            director.getScene().addChild(gate);


            let go = gate.addComponent(GameObject);
            go.username = that.name;
            go.showHPBar = false;
            go.entity = that;
            go.offset = v3(0, 8);

            go.create();

            gate.setPosition(this.position.x, 0, this.position.z);
            gate.setRotationFromEuler(this.direction.x, this.direction.z, this.direction.y);

            that.renderObj = gate;
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

RegisterScript("Gate", Gate)