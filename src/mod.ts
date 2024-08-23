import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { IQuestCondition } from "@spt/models/eft/common/tables/IQuest";

export class StartCollectorEarly implements IPostDBLoadMod {
    public postDBLoad(container: DependencyContainer): void {
        const tables = container.resolve<DatabaseServer>("DatabaseServer").getTables();
        const logger = container.resolve<ILogger>("WinstonLogger");

        const startCondition: IQuestCondition = {
            compareMethod: ">=",
            conditionType: "Level",
            dynamicLocale: false,
            id: "5d777f5d86f7742fa901bc77",
            value: 1,
            target: ""
        };

        tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForStart = [startCondition];

        logger.logWithColor("[Start Collector Early] Modified Quest!", LogTextColor.CYAN);
    }
}

export const mod = new StartCollectorEarly();
