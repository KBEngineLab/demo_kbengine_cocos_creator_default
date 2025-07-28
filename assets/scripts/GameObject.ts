import { _decorator, Component, Node, Label, UITransform, Size, Color, instantiate, Prefab, find, Camera, ProgressBar, Layers, director, resources, Vec3, v3, Animation, Quat, SkeletalAnimation } from 'cc';
import { g_CameraController } from './CameraController';
import { UIFollow } from './ui/UIFollow';
import { Entity } from './kbe_typescript_plugins/KBEngine';

const { ccclass } = _decorator;

enum AnimState {
    Idle = 'idle',
    Run = 'run',
    Attack = 'attack',
    Die = 'die',  // 新增死亡动画状态
}

@ccclass('GameObject')
export class GameObject extends Component {
    private headInfoUI: Node | null = null;
    private nameLabel: Label | null = null;
    private hpBar: ProgressBar | null = null;

    public hp = 100;
    public hpMax = 100;
    public username = "Slime";
    public offset: Vec3 = v3(0, 4);
    public entity: Entity;

    public showHPBar = true;

    public lastEntityPos: Vec3 = v3();


    private _anim: Animation | null = null;
    private _currentState: AnimState = AnimState.Idle;
    private _attackTimer: number = 0;

    private _hasDied: boolean = false;

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

        // 初始化动画组件
        this._anim = this.getComponent(SkeletalAnimation) ? this.getComponent(SkeletalAnimation) : this.getComponentInChildren(SkeletalAnimation);


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

            if (!this.showHPBar) {
                this.hpBar.node.active = false;
            }

            this.nameLabel.string = this.username;
            this.hpBar.totalLength = this.hpMax;
            this.hpBar.progress = this.hp / this.hpMax;

            if (this.entity) this.lastEntityPos = v3(this.entity.position.x, this.entity.position.y, this.entity.position.z);
        });
    }

    public setHP(current: number, max: number) {
        this.hp = current;
        this.hpMax = max;
        if (this.hpBar) {
            this.hpBar.progress = this.hp / this.hpMax;
        }
    }

    public playAttack() {
        if (this._currentState === AnimState.Attack) return;

        this._switchAnim(AnimState.Attack);
        this._attackTimer = 0.8; // 攻击动画时长（单位：秒，根据实际动画时长调整）
    }

    private _switchAnim(state: AnimState) {
        if (this._currentState === state || !this._anim) return;

        this._currentState = state;

        // if(state.)
        if (!this._anim.getState(state)?.isPlaying) {
            this._anim.play(state);
        }
    }

    protected update(dt: number): void {
        if (!this.entity || !this._anim) return;

        // 死亡判断（仅限 Avatar 和 Monster 类型）
        const entityType = this.entity.className;
        if ((entityType === 'Avatar' || entityType === 'Monster') && this.entity.state === 1 && !this._hasDied && !this.entity.IsPlayer()) {
            this._hasDied = true;
            this._switchAnim(AnimState.Die);
            return;
        }

        if(this.entity.state != 1){
            this._hasDied = false;
        }


    

        // 如果已死亡，不再处理其他动画
        if (this._hasDied) return;

        // 攻击动画优先级最高
        if (this._attackTimer > 0) {
            this._attackTimer -= dt;
            if (this._attackTimer <= 0) {
                this._attackTimer = 0;
                this._switchAnim(AnimState.Idle);
            }
            return;
        }

        const currentPos = v3(this.entity.position.x, 0.1, this.entity.position.z);
        const dist = Vec3.distance(currentPos, v3(this.node.position.x, 0.1, this.node.position.z));

        if (dist > 0.01) {
            this._switchAnim(AnimState.Run);
        } else {
            this._switchAnim(AnimState.Idle);
        }
    }

}
