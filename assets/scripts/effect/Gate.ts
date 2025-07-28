import { _decorator, Component, Node, Vec3 } from 'cc';
import { g_CameraController } from '../CameraController';
const { ccclass, property } = _decorator;

@ccclass('Gate')
export class Gate extends Component {
    start() {

    }

    update(deltaTime: number) {

        if( g_CameraController == null || g_CameraController.cameraNode == null) return;


        const nodePos = this.node.worldPosition;
        const camPos = g_CameraController.cameraNode.worldPosition;

        // 方向：从摄像机看向节点
        const dir = new Vec3();
        Vec3.subtract(dir, nodePos, camPos); // node - camera（即反方向）

        // 目标位置：从节点位置沿着 dir 延伸
        const targetPos = new Vec3();
        Vec3.add(targetPos, nodePos, dir); // nodePos + (nodePos - camPos)

        this.node.lookAt(targetPos);
    }
}


