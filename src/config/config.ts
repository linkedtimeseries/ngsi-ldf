import fs = require("fs");
import toml = require("toml");

interface IConfig {
    sourceURI: string;
    targetURI: string;
    metrics: string[];
    lastNumberOfMinutes: number;
    keyValues: boolean;
}

let config: IConfig;
export function getConfig(): IConfig {
    if (!config) {
        const data = toml.parse(fs.readFileSync("./config.toml").toString());
        config = {
            sourceURI: data.ngsi.host,
            targetURI: data.api.host,
            metrics: data.data.metrics,
            lastNumberOfMinutes: data.api.lastNumberOfMinutes,
            keyValues: data.api.keyValues
        };
    }

    return config;
}
