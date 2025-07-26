import {
    _decorator, Component, Node, Vec3, Quat, Camera,
    EventMouse, Input, input, math,
    find,
    Layers
} from 'cc';
const { ccclass, property } = _decorator;


export var g_CameraController:CameraController

@ccclass('CameraController')
export class CameraController extends Component {
    @property(Node)
    target: Node = null!; // 目标（角色）

    @property
    distance: number = 45; // 相机距离角色的距离

    @property
    verticalAngleLimit: number = 80; // 上下旋转最大角度（防止翻转）

    @property
    public cameraNode: Node = null!;

    private _yaw: number = 0; // 水平旋转角
    private _pitch: number = 15; // 垂直旋转角
    private _isRotating: boolean = false;
    private _lastMousePos = new Vec3();
    private _rotationSpeed = 0.3;

    start() {
        g_CameraController = this;
        this.createCamera();
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    onDestroy() {
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private createCamera() {
        let mainCamera = find("Main Camera");
        if(mainCamera){
            mainCamera.parent = this.node; // 将主摄像机设置为当前节点的子节点
            mainCamera.name = 'FollowCamera'; // 重命名摄像机节点
            this.cameraNode = mainCamera;
        }else{
            this.cameraNode = new Node('FollowCamera');
            this.node.addChild(this.cameraNode);
            const camera = this.cameraNode.addComponent(Camera);
            camera.visibility |= Layers.BitMask.UI_2D; // 确保摄像机可以渲染UI层
            camera.priority = 0;
        }
        

        
    }

    private onMouseDown(event: EventMouse) {
        if (event.getButton() === 2) { // 右键
            this._isRotating = true;
            const { x, y } = event.getLocation();
            this._lastMousePos.set(x, y, 0);
        }
    }

    private onMouseUp(event: EventMouse) {
        if (event.getButton() === 2) {
            this._isRotating = false;
        }
    }

    private onMouseMove(event: EventMouse) {
        if (!this._isRotating) return;

        const { x, y } = event.getLocation();
        const deltaX = x - this._lastMousePos.x;
        const deltaY = y - this._lastMousePos.y;

        this._yaw -= deltaX * this._rotationSpeed;
        this._pitch -= deltaY * this._rotationSpeed;

        const limit = this.verticalAngleLimit;
        this._pitch = math.clamp(this._pitch, -limit, limit);

        this._lastMousePos.set(x, y, 0);
    }

    update(deltaTime: number) {

        if(this.target == null){
            this.target = find("Player")
        }
        
        if (!this.target || !this.cameraNode) return;
    
        // 让相机根节点跟随目标位置
        this.node.setWorldPosition(this.target.worldPosition);

            
        // // 2. 根据鼠标输入更新 this._yaw / this._pitch 后，设置旋转
        // this.node.setRotationFromEuler(this._pitch, this._yaw, 0);
    
        const radPitch = math.toRadian(this._pitch);
        const radYaw = math.toRadian(this._yaw);
    
        const offset = new Vec3();
        offset.x = this.distance * Math.cos(radPitch) * Math.sin(radYaw);
        offset.y = this.distance * Math.sin(radPitch);
        offset.z = this.distance * Math.cos(radPitch) * Math.cos(radYaw);
    
        const cameraPos = this.node.worldPosition.clone().add(offset);
        this.cameraNode.setWorldPosition(cameraPos);
        this.cameraNode.lookAt(this.node.worldPosition);
    }
    
}
