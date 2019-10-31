import md5 = require("md5");
import fetch = require("node-fetch");

import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";
import TimeFragmenter from "../fragmenters/time";

const SOURCE_URI = "http://localhost:3001";
const TARGET_URI = "http://localhost:3002";

interface ISourceData {
    context: object;
    graph: IObservation[];
    resourcesUsed: string[];
}

interface IObservation {
    sensor: string;
    feature: string;
    observedProperty: string;
    value: number;
    unitCode: string;
    time: Date;
}

interface IAggregation {
    function: string;
    timeStart: Date;
    timeEnd: Date;
    sensor: string;
    observedProperty: string;
    value: number;
    unitCode: string;
}

interface IBucket {
    sensor?: string;
    feature: string;
    observedProperty: string;
    timeStart: Date;
    timeEnd: Date;
}

interface IAggregationFunction {
    function: (data: number[]) => number;
    name: string;
}

function extractVocubalary(data) {
    // fixme; simple placeholder
    return data["@context"][0];
}

async function getSourceData(fromTime: Date, toTime: Date, endpoint: string): Promise<ISourceData> {
    const graph: IObservation[] = [];
    let context = {};
    const resources = [];

    let currentTime = fromTime;
    while (currentTime < toTime) {
        const uri = `${endpoint}?page=${currentTime.toISOString()}`;
        const response = await fetch(uri);
        const data = await response.json();

        context = extractVocubalary(data);
        resources.push(uri);
        for (const element of data["@graph"]) {
            const sensor = element.id;
            const feature = element.featureOfInterest;

            for (const metric of ["NO2", "O3", "PM10", "PM1", "PM25"]) {
                if (!element[metric]) {
                    continue;
                }

                for (const observation of element[metric]) {
                    graph.push({
                        sensor,
                        feature,
                        observedProperty: metric,
                        value: observation.value,
                        unitCode: observation.unitCode,
                        time: new Date(observation.observedAt),
                    });
                }
            }
        }
        currentTime = new Date(data["tree:value"]["schema:endDate"]);
    }

    return {
        context,
        graph,
        resourcesUsed: resources,
    };
}

function average(data) {
    return sum(data) / count(data);
}

function count(data): number {
    return data.length;
}

function maximum(data): number {
    return Math.max(...data);
}

function minimum(data): number {
    return Math.min(...data);
}

function diffs(data): number[] {
    const a = average(data);
    return data.map((value) => {
        return value - a;
    });
}

function squareDiffs(data): number[] {
    return diffs(data).map((v) => v * v);
}

function avgSquareDiff(data): number {
    return average(squareDiffs(data));
}

function stddev(data) {
    return Math.sqrt(variance(data));
}

function variance(data) {
    return avgSquareDiff(data) / sum(data);
}

function sum(data): number {
    return data.reduce((a, b) => a + b, 0);
}

function selectBuckets(
    data: ISourceData,
    fromTime: Date,
    toTime: Date,
    aggregateTimeFragmenter: TimeFragmenter,
): IBucket[] {
    const buckets: IBucket[] = [];
    const sensors: Set<string> = new Set();
    sensors.add(null);

    const features: Set<string> = new Set();
    const properties: Set<string> = new Set();

    for (const element of data.graph) {
        sensors.add(element.sensor);
        features.add(element.feature);
        properties.add(element.observedProperty);
    }

    for (let currentTime = fromTime;
        currentTime < toTime;
        currentTime = aggregateTimeFragmenter.getNextTime(currentTime)
    ) {
        for (const sensor of sensors) {
            for (const feature of features) {
                for (const property of properties) {
                    buckets.push({
                        sensor,
                        feature,
                        observedProperty: property,
                        timeStart: currentTime,
                        timeEnd: aggregateTimeFragmenter.getNextTime(currentTime),
                    });
                }
            }
        }
    }

    return buckets;
}

function aggregate(data: ISourceData, buckets: IBucket[], functions: IAggregationFunction[]): IAggregation[] {
    const result: IAggregation[] = [];

    for (const bucket of buckets) {
        let unitCode: string;
        const bucketData: number[] = [];

        for (const observation of data.graph) {
            unitCode = observation.unitCode;

            if (observation.feature !== bucket.feature) {
                continue;
            }

            if (bucket.sensor && observation.sensor !== bucket.sensor) {
                continue;
            }

            if (observation.observedProperty !== bucket.observedProperty) {
                continue;
            }

            if (observation.time < bucket.timeStart) {
                continue;
            }

            if (observation.time >= bucket.timeEnd) {
                continue;
            }

            bucketData.push(observation.value);
        }

        for (const fn of functions) {
            const bucketValue = fn.function(bucketData);
            result.push({
                function: fn.name,
                value: bucketValue,
                unitCode,
                timeStart: bucket.timeStart,
                timeEnd: bucket.timeEnd,
                observedProperty: bucket.observedProperty,
                sensor: bucket.sensor,
            });
        }
    }

    return result;
}

function wrapAggregation(value: IAggregation, period, geoMetaData) {
    const hash = md5(JSON.stringify([value, geoMetaData]));

    const result = {};
    result["@id"] = `${TARGET_URI}/aggregation/${hash}`;
    result["@type"] = "ex:Aggregation";
    result["ex:hasAggregationPeriod"] = period;
    result["ex:usingFunction"] = value.function;
    result["ex:duringPeriod"] = {
        "schema:startDate": value.timeStart.toISOString(),
        "schema:endDate": value.timeEnd.toISOString(),
    };
    result["ex:inArea"] = {
        ...geoMetaData,
    };
    if (value.sensor) {
        result["sosa:madeBySensor"] = value.sensor;
    }
    result["sosa:observedProperty"] = value.observedProperty;
    result["sosa:hasSimpleResult"] = value.value;
    result["schema:unitCode"] = value.unitCode;
    return result;
}

async function getPage(
    req,
    res,
    aggregateTimeFragmenter: TimeFragmenter,
    pageTimeFragmenter: TimeFragmenter,
    geoFragmenter: GeoFragmenter,
) {
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
        return;
    }

    const fromTime = pageTimeFragmenter.getFromTime(req.query.page);
    const lastPossibleTime = aggregateTimeFragmenter.getLastCompleteTime();
    const previousTime = pageTimeFragmenter.getPreviousTime(fromTime);
    const nextTime = pageTimeFragmenter.getNextTime(fromTime);
    const toTime = lastPossibleTime < nextTime ? lastPossibleTime : nextTime;

    const focus = geoFragmenter.getFocusPoint(req);
    const path = geoFragmenter.getFragmentPath(focus, precision);
    const sourceData = await getSourceData(fromTime, toTime, `${SOURCE_URI}${path}`);
    const buckets = selectBuckets(sourceData, fromTime, toTime, aggregateTimeFragmenter);
    const aggregations = aggregate(sourceData, buckets, [
        {
            function: sum,
            name: "ex:Sum",
        },
        {
            function: count,
            name: "ex:Count",
        },
        {
            function: average,
            name: "ex:Average",
        },
        {
            function: minimum,
            name: "ex:Minimum",
        },
        {
            function: maximum,
            name: "ex:Maximum",
        },
        {
            function: stddev,
            name: "ex:StdDev",
        },
    ]);

    const geoMetaData = geoFragmenter.getMetaData(focus, precision);

    const children = [{
        "@type": "tree:LesserThanRelation",
        "tree:child": geoFragmenter.getSummaryFragmentURI(TARGET_URI, focus, precision, previousTime),
    }];

    if (new Date() > nextTime) {
        children.push({
            "@type": "tree:GreaterThanRelation",
            "tree:child": geoFragmenter.getSummaryFragmentURI(TARGET_URI, focus, precision, nextTime),
        });
    }

    const period = "https://example.org/ns/cot/hourly";

    const result = {
        "@context": sourceData.context,
        "@id": geoFragmenter.getSummaryFragmentURI(TARGET_URI, focus, precision, fromTime),
        "@type": "tree:Node",
        ...geoMetaData,
        "tree:childRelation": children,
        "tree:value": {
            "schema:startDate": fromTime.toISOString(),
            "schema:endDate": nextTime.toISOString(),
        },
        "sh:path": "schema:startDate",
        "dcterms:isPartOf": {
            "@id": TARGET_URI,
            "@type": "hydra:Collection",
            "hydra:search": geoFragmenter.getSummarySearchTemplate(TARGET_URI),
        },
        "@graph": aggregations.map((element) => {
            return wrapAggregation(element, period, geoMetaData);
        }),
    };

    res.status(200).send(result);
}

export async function getSlippySummaryPage(req, res) {
    const geoFragmenter = new SlippyFragmenter();
    await getPage(
        req,
        res,
        new TimeFragmenter(TimeFragmenter.HOUR),
        new TimeFragmenter(TimeFragmenter.HOUR * 6),
        geoFragmenter,
    );
}

export async function getGeohashSummaryPage(req, res) {
    const geoFragmenter = new GeohashFragmenter();
    await getPage(
        req,
        res,
        new TimeFragmenter(TimeFragmenter.HOUR),
        new TimeFragmenter(TimeFragmenter.HOUR * 6),
        geoFragmenter,
    );

}

export async function getH3SummaryPage(req, res) {
    const geoFragmenter = new H3Fragmenter();
    await getPage(
        req,
        res,
        new TimeFragmenter(TimeFragmenter.HOUR),
        new TimeFragmenter(TimeFragmenter.HOUR * 6),
        geoFragmenter,
    );
}
