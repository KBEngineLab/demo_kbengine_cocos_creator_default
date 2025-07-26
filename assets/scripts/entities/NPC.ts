//    Copyright (C) 2016-2018 __COMPANY_NAME
//    All rights reserved
//
//    created by zone at 2018-10-19 19:00

import { RegisterScript } from "../kbe_typescript_plugins/ExportEntity";
import { NPCBase } from "../kbe_typescript_plugins/NPCBase";
import { resources, Prefab, instantiate, director, v3, SkeletalAnimation, CharacterController } from "cc";
import { GameObject } from "../GameObject";

export class NPC extends NPCBase {
    OnEnterWorld(): void {
        super.OnEnterWorld()
        let that = this;

        resources.load("prefab/NPC", Prefab, (err, prefab) => {
            if (err) {
                console.error("加载 NPC prefab 失败:", err);
                return;
            }

            let player = instantiate(prefab);


            player.name = `npc_${this.id}`;

            player.setPosition(this.position.x, 0, this.position.z);
            player.setRotationFromEuler(this.direction.x, this.direction.z, this.direction.y);


            director.getScene().addChild(player);


            let go = player.addComponent(GameObject);
            go.username = that.name;
            go.hp = 100;
            go.hpMax = 100;
            go.offset = v3(0, 6);
            go.create();




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
}

RegisterScript("NPC", NPC)