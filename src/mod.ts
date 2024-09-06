import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { IQuestCondition, VisibilityCondition } from "@spt/models/eft/common/tables/IQuest";
import { VFS } from "@spt/utils/VFS";
import path from "path";

export class StartCollectorEarly implements IPostDBLoadMod {
    private locales: Record<string, Record<string, string>>;
    private logger: ILogger;

    public newObjectId(): string {
        const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
        const objectId = timestamp + "xxxxxxxxxxxxxxxx".replace(/[x]/g, () => {
            return Math.floor(Math.random() * 16).toString(16);
        }).toLowerCase();
    
        return objectId;
    }

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
        const modConfig = JSON.parse(vfs.readFile(path.resolve(__dirname, "../config/config.json")));

        if (modConfig.prerequisiteQuestCompletionRequired) {
            const conditions: IQuestCondition[] = [];
            const origAvailableForStartConditions = tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForStart;
            
            let prevConditionId = null;

            const visConditionsEmpty = [];

            for (const i in origAvailableForStartConditions) {
                const origCondition: IQuestCondition = origAvailableForStartConditions[i];

                const prevConditionVis: VisibilityCondition[] = [
                    {
                        id: this.newObjectId(),
                        target: prevConditionId,
                        oneSessionOnly: false,
                        conditionType: "CompleteCondition"
                    }
                ];

                const visConditions = prevConditionId === null ? visConditionsEmpty : prevConditionVis;

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
                this.addToLocales(origCondition.id + " name", origCondition.target as string + " name");

                prevConditionId = origCondition.id;
            }
    
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
            value: Number(modConfig.startingLevel)
        };
        tables.templates.quests["5c51aac186f77432ea65c552"].conditions.AvailableForStart = [startCondition];

        this.logger.logWithColor("[Start Collector Early] Modified Quest!", LogTextColor.CYAN);
    }
}

export const mod = new StartCollectorEarly();
