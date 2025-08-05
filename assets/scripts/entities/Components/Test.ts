//    Copyright (C) 2016-2018 __COMPANY_NAME
//    All rights reserved
//
//    created by zone at 2018-10-19 19:00

import KBELog from "../../kbe_typescript_plugins/KBELog";
import {RegisterScript} from "../../kbe_typescript_plugins/ExportEntity";
import { GateBase } from "../../kbe_typescript_plugins/GateBase";
import { TestBase } from "../../kbe_typescript_plugins/TestBase";

export class Test extends TestBase{
    public helloCB(arg1: number) {
    }

}

RegisterScript("Test",Test)