using System.Diagnostics;
using System.Reflection;
using System.Text;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Helpers;
using SPTarkov.Server.Core.Models.Common;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Enums;
using SPTarkov.Server.Core.Models.Logging;
using SPTarkov.Server.Core.Models.Spt.Config;
using SPTarkov.Server.Core.Models.Spt.Mod;
using SPTarkov.Server.Core.Models.Spt.Server;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Servers;
using SPTarkov.Server.Core.Services;
using static System.Net.Mime.MediaTypeNames;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace StartCollectorEarly;

public record ModMetadata : AbstractModMetadata {
    public override string ModGuid { get; init; } = "com.mattdokn.startcollectorearly";
    public override string Name { get; init; } = "StartCollectorEarly";
    public override string Author { get; init; } = "Mattdokn";
    public override List<string>? Contributors { get; init; }
    public override SemanticVersioning.Version Version { get; init; } = new("1.4.0");
    public override SemanticVersioning.Range SptVersion { get; init; } = new("~4.0.0");


    public override List<string>? Incompatibilities { get; init; }
    public override Dictionary<string, SemanticVersioning.Range>? ModDependencies { get; init; }
    public override string? Url { get; init; } = "https://github.com/m-barneto/StartCollectorEarly";
    public override bool? IsBundleMod { get; init; }
    public override string? License { get; init; } = "MIT";
}

[Injectable(TypePriority = OnLoadOrder.PostDBModLoader + 1)]
public class AfterDBLoadHook(
    DatabaseServer databaseServer,
    ISptLogger<AfterDBLoadHook> logger,
    ModHelper modHelper,
    LocaleService localeService
    ) : IOnLoad {
    private ModConfig config;
    private LocaleBase locales;
    private SeededRandom seededRandom = new SeededRandom(1);
    Dictionary<string, string> localesToAdd = new Dictionary<string, string>();

    public Task OnLoad() {
        Stopwatch sw = Stopwatch.StartNew();
        string pathToMod = modHelper.GetAbsolutePathToModFolder(Assembly.GetExecutingAssembly());

        config = modHelper.GetJsonDataFromFile<ModConfig>(pathToMod, "config.json");

        DatabaseTables tables = databaseServer.GetTables();
        locales = tables.Locales;
        Dictionary<string, string> localeDb = localeService.GetLocaleDb();

        Quest quest = tables.Templates.Quests[QuestTpl.COLLECTOR];

        // Require original quest start conditions to be completed before finishing the quest
        if (config.PrerequisiteQuestCompletionRequired) {
            List<QuestCondition> conditions = new();
            List<QuestCondition> originalStartConditions = quest.Conditions.AvailableForStart!;
            string previousConditionId = null;
            List<VisibilityCondition> visConditionsEmpty = new();

            // Loop through the start conditions
            foreach (var origCondition in originalStartConditions) {
                // Visibility condition to require previous condition to be completed
                List<VisibilityCondition> prevConditionVis = new List<VisibilityCondition> {
                    new VisibilityCondition {
                        Id = seededRandom.NextMongoId(),
                        Target = previousConditionId,
                        OneSessionOnly = false,
                        ConditionType = "CompleteCondition"
                    }
                };

                var visConditions = (previousConditionId == null || !config.PrerequisiteQuestCompletionVisibility)
                    ? visConditionsEmpty
                    : prevConditionVis;

                // Create quest completion requirement condition based on original quest requirement
                var newCondition = new QuestCondition {
                    Id = origCondition.Id,
                    DynamicLocale = false,
                    ConditionType = "Quest",
                    Status = new HashSet<QuestStatusEnum> { QuestStatusEnum.Success },
                    Target = origCondition.Target,
                    VisibilityConditions = visConditions
                };

                conditions.Add(newCondition);

                // Add localization entry
                // Target quest id
                string? targetQuestId = origCondition.Target!.IsItem ? origCondition.Target.Item : origCondition.Target.List!.FirstOrDefault();
                if (targetQuestId != null) {
                    localesToAdd[origCondition.Id] = "Complete quest " + localeDb[$"{origCondition.Target.Item} name"];
                }

                previousConditionId = origCondition.Id;
            }

            // Add the new quest completion requirements to AvailableForFinish
            foreach (var condition in conditions) {
                quest.Conditions.AvailableForFinish!.Add(condition);
            }
        }

        // Remove FindItem conditions from available for finish tasks
        if (config.HideFindItemTasks) {
            quest.Conditions.AvailableForFinish!.RemoveAll(c => c.ConditionType == "FindItem");
        }

        if (config.RemoveFoundInRaidRequirement) {
            foreach (var condition in quest.Conditions.AvailableForFinish!) {
                if (condition.ConditionType == "HandoverItem") {
                    condition.OnlyFoundInRaid = false;
                    localesToAdd.Add(condition.Id, localeDb[condition.Id].Replace("found in raid item: ", ""));
                }
            }
        }

        // Modify quest start condition to only need level 1
        QuestCondition startCondition = new QuestCondition {
            Id = "5d777f5d86f7742fa901bc77",
            DynamicLocale = false,
            ConditionType = "Level",
            CompareMethod = ">=",
            Value = config.StartingLevel
        }
        ;
        quest.Conditions.AvailableForStart = [startCondition];


        // Add localization entries
        foreach (var (localeKey, localeKvP) in locales.Global) {
            localeKvP.AddTransformer(lazyloadedLocaleData => {
                foreach (var kvp in localesToAdd) {
                    lazyloadedLocaleData[kvp.Key] = kvp.Value;
                }
                return lazyloadedLocaleData;
            });
        }

        logger.LogWithColor("[Start Collector Early] Loaded", LogTextColor.Cyan);

        return Task.CompletedTask;
    }
}

public class SeededRandom {
    private int seed;

    public SeededRandom(int seed) {
        this.seed = seed;
        if (this.seed <= 0) {
            this.seed += 2147483646;
        }
    }

    public int Next() {
        return seed = seed * 16807 % 2147483647;
    }

    public float NextFloat() {
        return (this.Next() - 1) / 2147483646;
    }

    public string NextMongoId() {
        int timestamp = (int)Math.Floor((decimal)Next());
        string timestampHex = timestamp.ToString("x8");

        var sb = new StringBuilder("xxxxxxxxxxxxxxxx");
        for (int i = 0; i < sb.Length; i++) {
            int value = (int)Math.Floor(NextFloat() * 16);
            sb[i] = value.ToString("x")[0];
        }

        string objectId = timestampHex + sb.ToString().ToLower();
        return objectId;
    }
}

public class ModConfig {
    public int StartingLevel { get; set; }
    public bool HideFindItemTasks { get; set; }
    public bool RemoveFoundInRaidRequirement { get; set; }
    public bool PrerequisiteQuestCompletionRequired { get; set; }
    public bool PrerequisiteQuestCompletionVisibility { get; set; }
}
