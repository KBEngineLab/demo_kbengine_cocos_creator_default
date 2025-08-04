import {
    _decorator, Component, Input, input, EventKeyboard,
    KeyCode, Vec3, CharacterController, Animation, Quat, Node,
    find,
    Prefab,
    resources,
    instantiate,
    Camera,
    EventTouch,
    PhysicsSystem
} from 'cc';
import { g_CameraController } from './CameraController';
import { Avatar } from './entities/Avatar';
import { Vector3 } from './kbe_typescript_plugins/KBEMath';
import { KBEngineApp } from './kbe_typescript_plugins/KBEngine';
import { MessagePopup } from './MessagePopup';
const { ccclass, property } = _decorator;

enum AnimState {
    Idle = 'idle',
    Run = 'run',
    Attack = 'attack',
    Die = 'die',  // 新增死亡动画状态
}
@ccclass('PlayerController')
export class PlayerController extends Component {

    avatar: Avatar = null!;

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
    cameraNode: Node = null!;  // 相机节点引用
    camera: Node = null!;  // 相机节点引用


    private _velocityY: number = 0;
    private _isGrounded: boolean = true;
    private _moveDir: Vec3 = new Vec3();
    private _worldMove: Vec3 = new Vec3();
    private _rotation: Quat = new Quat();

    private _reliveBtn: Node = null!; // 复活按钮
    private _canvas: Node = null!; // 复活按钮

    private _keyMap: Record<number, boolean> = {};

    private _playDieAnim: boolean = false;
    
    private _currentState: AnimState = AnimState.Idle;
    private _attackTimer: number = 0;

    start() {
        // this.cameraNode = find("CameraNode")
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);


        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.createReliveBtn();
    }

    onTouchEnd(event: EventTouch) {
        if(this.avatar.state == 1) return;

        
        const screenPos = event.getLocation(); // 获取屏幕点击坐标

        // 从屏幕点转换到射线
        const camera = g_CameraController.cameraNode.getComponent(Camera)!;
        const ray = camera.screenPointToRay(screenPos.x, screenPos.y);

        if (PhysicsSystem.instance.raycast(ray)) {

            for  (const result of PhysicsSystem.instance.raycastResults) {
                // const result = PhysicsSystem.instance.raycastResults[0];

                const hitNode = result.collider?.node;
                if (!hitNode) return;

                if(!hitNode.name.startsWith("Monster")) continue;

                // if(hitNode.)

                // 计算距离
                const playerPos = this.node.worldPosition;
                const targetPos = hitNode.worldPosition;
                const dist = Vec3.distance(playerPos, targetPos);


                if (dist < 20) {

                    this.node.lookAt(targetPos)
                    this.playAttack()


                    // 你可以添加其它逻辑，如发送攻击事件、扣血等
                    this.avatar.cellEntityCall.useTargetSkill(1,Number(hitNode.name.substring(hitNode.name.indexOf("_")+ 1)))
                } else {
                    
                    MessagePopup.showMessage("目标距离太远，无法攻击")
                }
            }
            
        }
    }



    createReliveBtn() {
        if (this._canvas == null) {
            this._canvas = find("Canvas");
        }
        if (this._canvas == null) {
            console.error("Canvas not found!");
            return;
        }

        if (find("Canvas/复活") != null) {
            this._reliveBtn = find("Canvas/复活");
        }

        if (this._reliveBtn != null) {
            return; // 如果复活按钮已经存在，则不再创建
        }
        resources.load("prefab/ui/复活", Prefab, (err, prefab) => {


            if (err) {
                console.error("加载 复活 prefab 失败:", err);
                return;
            }

            let reliveBtn = instantiate(prefab);
            reliveBtn.active = false;
            reliveBtn.parent = this._canvas;

            this._reliveBtn = reliveBtn;

            this._reliveBtn.on(Node.EventType.TOUCH_END, () => {
                if (this.avatar && this.avatar.state == 1) { // 玩家死亡状态
                    // this.avatar.relive(); // 调用复活方法
                    this.avatar.cellEntityCall.relive(1); // 调用复活方法
                    // this._reliveBtn.active = false; // 隐藏复活按钮
                }
            }, this);

        });
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

    public playAttack() {
        if (this._currentState === AnimState.Attack) return;

        this._switchAnim(AnimState.Attack);
        this._attackTimer = 1.33; // 攻击动画时长（单位：秒，根据实际动画时长调整）
    }

    private _switchAnim(state: AnimState) {
        if (this._currentState === state || !this.animation) return;

        this._currentState = state;

        // if(state.)
        if (!this.animation.getState(state)?.isPlaying) {
            this.animation.play(state);
        }
    }


    update(deltaTime: number) {
        if (this._attackTimer > 0) {
            this._attackTimer -= deltaTime;
            if (this._attackTimer <= 0) {
                this._attackTimer = 0;
                this._switchAnim(AnimState.Idle);
            }
            return;
        }


        if (this.avatar == null) {
            return;
        }

        // 玩家死亡状态
        if (this._reliveBtn != null) {
            if (this.avatar.state == 1) {
                this._reliveBtn.active = true; // 显示复活按钮
                
                this._switchAnim(AnimState.Die)
            } else {
                this._playDieAnim = false;
                this._reliveBtn.active = false; // 隐藏复活按钮
            }
        }



        if (this.avatar.state == 1) return;

        

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
            const flatMove = new Vec3(-this._worldMove.x, 0, -this._worldMove.z);
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


            if(isMoving){
                this._switchAnim(AnimState.Run)
            }else{

                this._switchAnim(AnimState.Idle)
            }

            // if (isMoving && !this.animation.getState('run')?.isPlaying) {
            //     this.animation.play('run');
            // } else if (!isMoving && !this.animation.getState('idle')?.isPlaying) {
            //     this.animation.play('idle');
            // }
        }

        if (this.avatar.currSpaceID == KBEngineApp.app.spaceID) {
            this.avatar.position = new Vector3(this.node.getPosition().x, this.node.getPosition().y, this.node.getPosition().z);
            this.avatar.direction = new Vector3(this.node.eulerAngles.x, this.node.eulerAngles.z, this.node.eulerAngles.y);
        }

    }
}
