import { _decorator, Component, Label, tween, UIOpacity, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('MessagePopup')
export class MessagePopup extends Component {
    private static _instance: MessagePopup;

    @property(Label)
    messageLabel: Label = null!;

    @property(UIOpacity)
    opacityComp: UIOpacity = null!;

    private _hideTimer: number | null = null;
    private _isShowing: boolean = false;

    onLoad() {
        MessagePopup._instance = this;
        this.node.active = false;
        this.opacityComp.opacity = 0;
    }

    public static showMessage(message: string, duration: number = 2.0, autoHide: boolean = true) {
        if (!MessagePopup._instance) {
            console.warn('MessagePopup 尚未初始化');
            return;
        }
        MessagePopup._instance._show(message, duration, autoHide);
    }

    private _show(message: string, duration: number, autoHide: boolean) {
        if (this._isShowing) {
            // 取消上一个隐藏定时器
            if (this._hideTimer !== null) {
                clearTimeout(this._hideTimer);
                this._hideTimer = null;
            }
        }

        this.messageLabel.string = message;
        this.node.active = true;
        this._isShowing = true;

        // 淡入动画
        this.opacityComp.opacity = 0;
        tween(this.opacityComp)
            .to(0.3, { opacity: 255 })
            .start();

        if (autoHide) {
            this._hideTimer = setTimeout(() => {
                this.hide();
            }, duration * 1000) as any;
        }
    }

    public hide() {
        if (!this._isShowing) return;

        // 淡出动画 + 结束时隐藏
        tween(this.opacityComp)
            .to(0.3, { opacity: 0 })
            .call(() => {
                this.node.active = false;
                this._isShowing = false;
            })
            .start();
    }

    public static hide() {
        if (MessagePopup._instance) {
            MessagePopup._instance.hide();
        }
    }
}
