import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { IQuest, IQuestCondition, VisibilityCondition } from "@spt/models/eft/common/tables/IQuest";
import { VFS } from "@spt/utils/VFS";
import path from "path";
import { SeededRandom } from "./SeededRandom";
import { jsonc } from "jsonc";
import { ModConfig } from "./ModConfig";

export class StartCollectorEarly implements IPostDBLoadMod {
    private locales: Record<string, Record<string, string>>;
    private logger: ILogger;
    private config: ModConfig;

    public addToLocales(id: string, textId: string): void {
        for (const locale in this.locales) {
            this.locales[locale][id] = this.locales[locale][textId];
        }
    }

    public postDBLoad(container: DependencyContainer): void {
        const tables = container.resolve<DatabaseServer>("DatabaseServer").getTables();
        this.locales = tables.locales.global;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        const vfs = container.resolve<VFS>("VFS");
        this.config = jsonc.parse(vfs.readFile(path.resolve(__dirname, "../config/config.jsonc")));

        const quest: IQuest = tables.templates.quests["5c51aac186f77432ea65c552"];
        const seededRandom: SeededRandom = new SeededRandom(1);

        // Add original quest start conditions to quest finish
        if (this.config.prerequisiteQuestCompletionRequired) {
            const conditions: IQuestCondition[] = [];
            const origAvailableForStartConditions = tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForStart;
            
            let prevConditionId = null;

            const visConditionsEmpty = [];

            for (const i in origAvailableForStartConditions) {
                const origCondition: IQuestCondition = origAvailableForStartConditions[i];

                const prevConditionVis: VisibilityCondition[] = [
                    {
                        id: seededRandom.nextMongoId(),
                        target: prevConditionId,
                        oneSessionOnly: false,
                        conditionType: "CompleteCondition"
                    }
                ];

                const visConditions = ((prevConditionId === null || !this.config.prerequisiteQuestCompletionVisibility) ? visConditionsEmpty : prevConditionVis);

                // Create quest completion requirement condition based on original quest requirement that was in AvailableForStart
                conditions.push({
                    id: origCondition.id,
                    dynamicLocale: false,
                    conditionType: "Quest",
                    status: [
                        4
                    ],
                    target: origCondition.target,
                    visibilityConditions: visConditions
                });
                // + " name"
                this.addToLocales(origCondition.id, origCondition.target as string + " name");

                prevConditionId = origCondition.id;
            }
    
            // Add the original quest completetion requirements to AvailableForFinish
            // (They will be removed from AvailableForStart and we want to keep things balanced)
            for (const i in conditions) {
                tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForFinish.push(conditions[i]);
            }
        }

        // Remove FindItem conditions from available for finish tasks
        for (let i = quest.conditions.AvailableForFinish.length - 1; i >= 0; i--) {
            const condition = quest.conditions.AvailableForFinish[i];
            if (condition.conditionType === "FindItem" && this.config.hideFindItemTasks) {
                quest.conditions.AvailableForFinish.splice(i, 1);
            } else if (condition.conditionType === "HandoverItem" && this.config.removeFoundInRaidRequirement) {
                condition.onlyFoundInRaid = false;
                this.locales["en"][condition.id] = this.locales["en"][condition.id].replace("found in raid item: ", "");
            }
        }
        
        // Modify quest start condition to only need level 1
        const startCondition: IQuestCondition = {
            id: "5d777f5d86f7742fa901bc77",
            dynamicLocale: false,
            target: "",
            conditionType: "Level",
            compareMethod: ">=",
            value: this.config.startingLevel
        };
        quest.conditions.AvailableForStart = [startCondition];

        this.logger.logWithColor("[Start Collector Early] Modified Quest!", LogTextColor.CYAN);
        //this.logger.logWithColor(JSON.stringify(quest, null, 4), LogTextColor.WHITE);
    }
}

export const mod = new StartCollectorEarly();
