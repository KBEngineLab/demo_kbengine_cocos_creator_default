import { _decorator, Component, instantiate, resources, Node, director, Prefab } from 'cc';
const { ccclass, property, disallowMultiple } = _decorator;

@ccclass('GlobalInitializer')
@disallowMultiple
export class GlobalInitializer extends Component {
    @property(Prefab)
    MessagePopup:Prefab=null

    start() {
        const popupNode = instantiate(this.MessagePopup as any);
        popupNode.name = 'MessagePopup';
        director.addPersistRootNode(popupNode);
    }
}
