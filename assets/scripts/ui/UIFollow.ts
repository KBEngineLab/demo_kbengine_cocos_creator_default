import { _decorator, Camera, Component, Node, renderer, UITransform, v3, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIFollow')
export class UIFollow extends Component {
    @property(Node)
    targetNode: Node = null;  // 3D 物体

    @property(Camera)
    mainCamera: Camera = null; // 3D 摄像机

    @property(Camera)
    uiCamera: Camera = null; // 2D 摄像机

    @property(Node)
    uiNode: Node = null; // 2D 跟随的 Sprite (UI)

    @property(Node)
    canvasNode: Node = null; // UI 的 Canvas 节点

    @property(Vec3)
    offset: Vec3 = v3(0, 4);

    private orgScale = new Vec3();

    protected onLoad(): void {
        this.orgScale = this.node.scale.clone()
        this.update()
    }

    protected start(): void {
        // this.offset = v3(0, this.targetNode.position., 0);
    }

    protected onEnable(): void {
        this.update()
    }

    /**
     * 
     * @param cam3D 3d相机
     * @param cam2D 2d相机
     * @param worldPos 跟随目标的世界坐标
     * @returns 
     */
    public persWorldtoUI(
        cam3D: renderer.scene.Camera,
        cam2D: renderer.scene.Camera,
        worldPos: Vec3
    ): Vec3 {
        // 1. 使用透视相机的 viewProj 矩阵转到标准化坐标系 [-1, 1]
        let out = v3(0, 0, 0)
        const matViewProj = cam3D.matViewProj;
        Vec3.transformMat4(out, worldPos, matViewProj);
        // 2. 同时转换 x 和 y，合并了中间的 0.5 和 2 的因子
        out.x = (out.x + 1) * cam3D.width / cam2D.width - 1;
        out.y = (out.y + 1) * cam3D.height / cam2D.height - 1;
        // 3. 使用正交相机的逆 viewProj 矩阵，回到正交相机的世界坐标
        const matViewProjInv = cam2D.matViewProjInv;
        Vec3.transformMat4(out, out, matViewProjInv);
        return out;
    }

    protected lateUpdate(): void {
        this.update()
    }

    update(): void {
        if (!this.targetNode) return
        let pos = this.targetNode.worldPosition.clone();
        pos.add(this.offset)
        let _temp_vec3_1 = this.persWorldtoUI(this.mainCamera.camera, this.uiCamera.camera, pos)
        this.node.setWorldPosition(_temp_vec3_1)
    }
}


