import { _decorator, Component, Node, Label, UITransform, Size, Color, instantiate, Prefab, find, Camera, ProgressBar, Layers, director, resources, Vec3, v3 } from 'cc';
import { g_CameraController } from './CameraController';
import { UIFollow } from './ui/UIFollow';
const { ccclass } = _decorator;

@ccclass('GameObject')
export class GameObject extends Component {

    private headInfoUI: Node | null = null;
    private nameLabel: Label | null = null;
    private hpBar: ProgressBar | null = null;

    public hp = 80;
    public hpMax = 100;
    public username = "Slime";
    public offset: Vec3 = v3(0, 4);

    protected onDestroy(): void {
        this.nameLabel = null;
        this.hpBar = null;
        if (this.headInfoUI) {
            this.headInfoUI.destroy();
            this.headInfoUI = null;
        }
    }

    create() {
        const canvas = find("Canvas");
        const uiCamera = find("Canvas/Camera")?.getComponent(Camera);
        const camera = g_CameraController.cameraNode.getComponent(Camera);
        if (!canvas || !camera) return;



        resources.load("prefab/ui/血条", Prefab, (err, prefab) => {
            if (err) {
                console.error("加载血条 prefab 失败:", err);
                return;
            }


            let headInfo = instantiate(prefab);
            this.headInfoUI = headInfo;
            this.headInfoUI.parent = canvas;
            this.headInfoUI.layer = Layers.Enum.UI_3D;


            const follow = this.headInfoUI.addComponent(UIFollow);
            follow.targetNode = this.node;
            follow.uiCamera = uiCamera;
            follow.mainCamera = camera;
            follow.uiNode = this.headInfoUI;
            follow.canvasNode = canvas;
            follow.offset = this.offset;

            this.nameLabel = this.headInfoUI.getChildByName("name")?.getComponent(Label);
            this.hpBar = this.headInfoUI.getChildByName("hp")?.getComponent(ProgressBar);


            this.nameLabel.string = this.username;
            this.hpBar.totalLength = this.hpMax
            this.hpBar.progress = this.hp / this.hpMax;

        });
    }

    // 示例：血量更新接口
    public setHP(current: number, max: number) {
        this.hp = current;
        this.hpMax = max;
        if (this.hpBar) {
            this.hpBar.progress = this.hp / this.hpMax;
        }
    }
}
