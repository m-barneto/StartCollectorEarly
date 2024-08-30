import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { IQuestCondition, IQuestConditionCounter, IQuestConditionCounterCondition } from "@spt/models/eft/common/tables/IQuest";
import { VFS } from "@spt/utils/VFS";
import path from "path";

export class StartCollectorEarly implements IPostDBLoadMod {
    public postDBLoad(container: DependencyContainer): void {
        const tables = container.resolve<DatabaseServer>("DatabaseServer").getTables();
        const logger = container.resolve<ILogger>("WinstonLogger");
        const vfs = container.resolve<VFS>("VFS");
        const modConfig = JSON.parse(vfs.readFile(path.resolve(__dirname, "../config/config.json")));
        const conditions: IQuestCondition[] = [];
        
        if (modConfig.prerequisiteQuestStartRequired){
            const origAvailableForStartConditions = tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForStart;

            for (const i in origAvailableForStartConditions) {
                const origCondition: IQuestCondition = origAvailableForStartConditions[i];
    
                // Create quest completion requirement condition based on original quest requirement that was in AvailableForStart
                conditions.push({
                    // How bad is this...
                    id: origCondition.target as string + " name",
                    dynamicLocale: false,
                    conditionType: "Quest",
                    status: [
                        4
                    ],
                    target: origCondition.target
                });
            }
        }

        if (modConfig.prerequisiteQuestCompletionRequired) {
            // Add the original quest completetion requirements to AvailableForFinish
            // (They will be removed from AvailableForStart and we want to keep things balanced)
            for (const i in conditions) {
                tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForFinish.push(conditions[i]);
            }
        }
        

        // Modify quest start condition to only need level 1
        const startCondition: IQuestCondition = {
            id: "5d777f5d86f7742fa901bc77",
            dynamicLocale: false,
            target: "",
            conditionType: "Level",
            compareMethod: ">=",
            value: 1
        };
        tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForStart = [startCondition];

        logger.logWithColor("[Start Collector Early] Modified Quest!", LogTextColor.CYAN);
    }
}

export const mod = new StartCollectorEarly();
