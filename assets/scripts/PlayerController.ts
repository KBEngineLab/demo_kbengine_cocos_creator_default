import {
    _decorator, Component, Input, input, EventKeyboard,
    KeyCode, Vec3, CharacterController, Animation, Quat, Node,
    find
} from 'cc';
import { g_CameraController } from './CameraController';
import { Avatar } from './entities/Avatar';
import { Vector3 } from './kbe_typescript_plugins/KBEMath';
import { KBEngineApp } from './kbe_typescript_plugins/KBEngine';
const { ccclass, property } = _decorator;

@ccclass('PlayerController')
export class PlayerController extends Component {

    avatar:Avatar = null!;

    @property
    moveSpeed: number = 5;

    @property
    jumpHeight: number = 5;

    @property
    gravity: number = 9.8;

    @property(CharacterController)
    characterController: CharacterController = null!;

    @property(Animation)
    animation: Animation = null!;

    
    @property(Node)
    cameraNode: Node= null!;  // 相机节点引用
    camera: Node= null!;  // 相机节点引用


    private _velocityY: number = 0;
    private _isGrounded: boolean = true;
    private _moveDir: Vec3 = new Vec3();
    private _worldMove: Vec3 = new Vec3();
    private _rotation: Quat = new Quat();

    private _keyMap: Record<number, boolean> = {};

    start() {
        // this.cameraNode = find("CameraNode")
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onKeyDown(event: EventKeyboard) {
        this._keyMap[event.keyCode] = true;
    }

    onKeyUp(event: EventKeyboard) {
        this._keyMap[event.keyCode] = false;
    }

    update(deltaTime: number) {
        // if(this.camera == null){
        //     this.camera = this.cameraNode.getChildByName("FollowCamera")
        //     return
        // }
        this._moveDir.set(0, 0, 0);

        if (this._keyMap[KeyCode.KEY_W]) this._moveDir.z -= 1;
        if (this._keyMap[KeyCode.KEY_S]) this._moveDir.z += 1;
        if (this._keyMap[KeyCode.KEY_A]) this._moveDir.x -= 1;
        if (this._keyMap[KeyCode.KEY_D]) this._moveDir.x += 1;

        const isMoving = this._moveDir.lengthSqr() > 0;

        if (isMoving) {
            this._moveDir.normalize();

            // 获取相机 forward 方向
            const forward = new Vec3(0, 0, 1);
            const camRot = g_CameraController.cameraNode.getWorldRotation();
            Vec3.transformQuat(forward, forward, camRot);
            forward.y = 0;
            forward.normalize();

            

            // 获取相机 right 方向
            const right = new Vec3();
            Vec3.cross(right, Vec3.UP, forward);
            right.normalize();

            // 计算移动方向（相机空间转世界空间）
            this._worldMove.set(0, 0, 0);
            Vec3.scaleAndAdd(this._worldMove, this._worldMove, forward, this._moveDir.z);
            Vec3.scaleAndAdd(this._worldMove, this._worldMove, right, this._moveDir.x);
            this._worldMove.normalize();

            // console.log(deltaTime);
            this._worldMove.multiplyScalar((this.moveSpeed / 10) * deltaTime);
        } else {
            this._worldMove.set(0, 0, 0);
        }

        // 跳跃和重力处理
        if (this._isGrounded && this._keyMap[KeyCode.SPACE]) {
            this._velocityY = this.jumpHeight;
            this._isGrounded = false;
            if (this.animation) {
                this.animation.play('jump');
            }
        }
        this._velocityY -= this.gravity * deltaTime;

        // 加入垂直速度
        this._worldMove.y = this._velocityY * deltaTime;

        // 角色朝向移动方向转向
        if (isMoving) {
            const flatMove = new Vec3(this._worldMove.x, 0, this._worldMove.z);
            Quat.fromViewUp(this._rotation, flatMove, Vec3.UP);
            this.node.setRotation(this._rotation);
        }

        // 通过 CharacterController 移动
        if (this.characterController && this.characterController.enabled) {
            this.characterController.move(this._worldMove);
        }

        // 简单落地检测
        const pos = this.node.getPosition();
        if (pos.y <= 0.01) {
            this._velocityY = 0;
            this._isGrounded = true;
        }

        // 动画播放控制
        if (this.animation) {


            if (isMoving && !this.animation.getState('run')?.isPlaying) {
                this.animation.play('run');
            } else if (!isMoving && !this.animation.getState('idle')?.isPlaying) {
                this.animation.play('idle');
            }
        }

        if(this.avatar.currSpaceID == KBEngineApp.app.spaceID){
            this.avatar.position = new Vector3(this.node.getPosition().x, this.node.getPosition().y, this.node.getPosition().z);
            this.avatar.direction = new Vector3(this.node.getRotation().x, this.node.getRotation().z, this.node.getRotation().y);
        }
        
    }
}
