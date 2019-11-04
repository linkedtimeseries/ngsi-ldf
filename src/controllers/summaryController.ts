import { Request, Response } from "express";
import md5 = require("md5");

import { getCached } from "../cache/cache";
import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";
import TimeFragmenter from "../fragmenters/time";

const HOURLY = "https://w3id.org/cot/Hourly";
const DAILY = "https://w3id.org/cot/Daily";

const SOURCE_URI = "http://localhost:3001";
const TARGET_URI = "http://localhost:3001";

/* Collection of all the fetched source data */
interface ISourceData {
    context: object; // json-ld context for all the data
    graph: IObservation[]; // knowledge graph of all the data
    resourcesUsed: string[]; // original resources of all the data
}

/* The essential data of a single observation */
interface IObservation {
    sensor: string; // who made the observation
    feature: string; // what's the sensor trying to measure
    observedProperty: string; // which property did it measure
    value: number; // what was the result
    unitCode: string; // what the result's unit, UN/CEFACT Common Code
    time: Date; // when was the observation done
}

/*
 * The essential data of a single aggregation
 * Excluding the region, because the data for this varies
 */
interface IAggregation {
    function: string; // which function was used
    timeStart: Date; // when the aggregation period starts
    timeEnd: Date; // when the aggregation period stops
    sensor?: string; // if aggregating over sensor ids
    observedProperty: string; // the measured property
    value: number; // the result
    unitCode: string; // the result's unit, UN/CEFACT Common Code
}

/*
 * Defines which observation values go into a single bucket
 * Excluding the region, because the data for this varies
 */
interface IBucket {
    sensor?: string; // aggregating over sensor ids, optionally
    feature: string; // the feature of interest
    observedProperty: string; // the measured property
    timeStart: Date; // when the aggregation period starts
    timeEnd: Date; // when the aggregation period stops
}

/* Fetches raw data */
async function getSourceData(
    fromTime: Date, // begin aggregation period
    toTime: Date, // end aggregation period
    endpoint: string, // API endpoint that contains the raw data; already geospatially fragmented
): Promise<ISourceData> {
    const graph: IObservation[] = [];
    let context = {};
    const resources = [];

    // keep following links until we have all the required data
    let currentTime = fromTime;
    while (currentTime < toTime) {
        const uri = `${endpoint}?page=${currentTime.toISOString()}`;
        const data = await getCached(uri);

        context = extractVocubalary(data);
        resources.push(uri);
        for (const element of data["@graph"]) {
            const sensor = element.id;
            const feature = element.featureOfInterest;

            // TODO; move to config
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

/*
 * Figure out which buckets we have to fill
 * Just the cartesian product of all source values
 */
function selectBuckets(
    data: ISourceData, // the raw data
    fromTime: Date, // start of earliest aggregation period
    toTime: Date, // end of latest aggregation period
    aggregateTimeFragmenter: TimeFragmenter, // how to fragment the time in between fromTime and toTime
): IBucket[] {
    const buckets: IBucket[] = [];
    const sensors: Set<string> = new Set();
    sensors.add(null); // aggregating by sensor is optional

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

/* Aggregate the source data using the given buckets/function */
function aggregate(data: ISourceData, buckets: IBucket[], functions: IAggregationFunction[]): IAggregation[] {
    const result: IAggregation[] = [];

    for (const bucket of buckets) {
        let unitCode: string;
        const bucketData: number[] = [];

        for (const observation of data.graph) {
            // this seems horribly inefficient, but it's good enough for now
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

/* Wraps a single aggregation value into a JSON-LD object */
function wrapAggregation(
    value: IAggregation, // the aggregation value
    period: string, // the aggregation period URI
    geoMetaData: object, // description of the geospatial region that's being aggregated
) {
    const result = {};
    const hash = md5(JSON.stringify([value, geoMetaData])); // generate a (probably) unique ID
    result["@id"] = `${TARGET_URI}/aggregation/${hash}`;
    result["@type"] = "cot:Aggregation";
    result["cot:hasAggregationPeriod"] = period;
    result["cot:usingFunction"] = value.function;
    result["cot:duringPeriod"] = {
        "schema:startDate": value.timeStart.toISOString(),
        "schema:endDate": value.timeEnd.toISOString(),
    };
    result["cot:inArea"] = {
        ...geoMetaData,
    };
    if (value.sensor) {
        result["sosa:madeBySensor"] = value.sensor;
    }
    result["sosa:observedProperty"] = `cot:${value.observedProperty}`; // can't use relative URIs as objects

    // TODO; would be cleaner with sosa:hasResult, qudt:hasNumericValue, and qudt:unit
    result["sosa:hasSimpleResult"] = value.value;
    result["schema:unitCode"] = value.unitCode;
    return result;
}

function wrapPage(
    req: Request, // the original request
    sourceData: ISourceData, // the source data
    aggregatedData: IAggregation[], // the aggregated data
    timeFragmenter: TimeFragmenter, // temporal fragmentation strategy
    geoFragmenter: GeoFragmenter, // geospatial fragmentation strategy
    period: string, // aggregation period URI
) {
    // figure out which area this fragment covers
    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    // figure out which period this fragment covers
    const fromTime = timeFragmenter.getFromTime(req.query.page);
    const nextTime = timeFragmenter.getNextTime(fromTime);
    const previousTime = timeFragmenter.getPreviousTime(fromTime);

    const geoMetaData = geoFragmenter.getMetaData(focus, precision);

    // add links to previous/next pages
    const children = [{
        "@type": "tree:LesserThanRelation",
        "tree:child": geoFragmenter.getSummaryFragmentURI(TARGET_URI, focus, precision, previousTime, period),
    }];

    if (new Date() > nextTime) {
        children.push({
            "@type": "tree:GreaterThanRelation",
            "tree:child": geoFragmenter.getSummaryFragmentURI(TARGET_URI, focus, precision, nextTime, period),
        });
    }

    for (const resource of sourceData.resourcesUsed) {
        children.push({
            "@type": "tree:DerivedFromRelation",
            "tree:child": resource,
        });
    }

    const context = sourceData.context;
    expandVocabulary(context);

    // build the fragment
    const result = {
        "@context": context,
        "@id": geoFragmenter.getSummaryFragmentURI(TARGET_URI, focus, precision, fromTime, period),
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
        "@graph": aggregatedData.map((element) => {
            return wrapAggregation(element, period, geoMetaData);
        }),
    };

    return result;
}

async function getPage(
    req: Request, // the original request
    res: Response, // the response object
    geoFragmenter: GeoFragmenter, // geospatial fragmentation strategy
) {
    let period: string; // aggregation period URI
    let aggregateTimeFragmenter: TimeFragmenter; // fragmentation strategy for individual aggregations
    let pageTimeFragmenter: TimeFragmenter; // fragmentation strategy to combine aggregations into pages

    if (req.query.period === DAILY) {
        // one aggregation per day
        // 7 aggregation periods per page
        period = DAILY;
        aggregateTimeFragmenter = new TimeFragmenter(TimeFragmenter.DAY);
        pageTimeFragmenter = new TimeFragmenter(TimeFragmenter.DAY * 7);
    } else {
        // one aggregation per hour
        // 6 aggregation periods per page
        period = HOURLY;
        aggregateTimeFragmenter = new TimeFragmenter(TimeFragmenter.HOUR);
        pageTimeFragmenter = new TimeFragmenter(TimeFragmenter.HOUR * 6);
    }

    // check if we want to support this level of granularity
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
        return;
    }

    // define the aggregation periods
    const currentTime = new Date();
    const fromTime = pageTimeFragmenter.getFromTime(req.query.page); // start of first aggregation period of this page
    const nextTime = pageTimeFragmenter.getNextTime(fromTime); // same for the next page
    const toTime = currentTime < nextTime ? currentTime : nextTime; // end of the last aggregation period of this page

    // fetch the source data
    const focus = geoFragmenter.getFocusPoint(req);
    const path = geoFragmenter.getFragmentPath(focus, precision);
    const sourceData = await getSourceData(fromTime, toTime, `${SOURCE_URI}${path}`);

    // aggregate the source data
    const buckets = selectBuckets(sourceData, fromTime, toTime, aggregateTimeFragmenter);
    const aggregations = aggregate(sourceData, buckets, getAggregationFunctions());

    // add metadata to the resulting data
    const pagedData = wrapPage(
        req,
        sourceData,
        aggregations,
        pageTimeFragmenter,
        geoFragmenter,
        period,
    );

    addHeaders(res, toTime < currentTime);
    res.status(200).send(pagedData);
}

function addHeaders(
    res: Response, // the response object
    stable?: boolean, // is the fragment considered to be stable?
) {
    res.type("application/ld+json; charset=utf-8");
    if (stable) {
        res.set("Cache-Control", `public, max-age=${60 * 60 * 24}`);
    } else {
        res.set("Cache-Control", "public, max-age=5");
    }
}

export async function getSlippySummaryPage(req, res) {
    const geoFragmenter = new SlippyFragmenter();
    await getPage(req, res, geoFragmenter);
}

export async function getGeohashSummaryPage(req, res) {
    const geoFragmenter = new GeohashFragmenter();
    await getPage(req, res, geoFragmenter);
}

export async function getH3SummaryPage(req, res) {
    const geoFragmenter = new H3Fragmenter();
    await getPage(req, res, geoFragmenter);
}

/* Aggregation functions */
interface IAggregationFunction {
    function: (data: number[]) => number;
    name: string;
}

function getAggregationFunctions(): IAggregationFunction[] {
    return [
        {
            function: sum,
            name: "cot:Sum",
        },
        {
            function: count,
            name: "cot:Count",
        },
        {
            function: average,
            name: "cot:Average",
        },
        {
            function: minimum,
            name: "cot:Minimum",
        },
        {
            function: maximum,
            name: "cot:Maximum",
        },
        {
            function: stddev,
            name: "cot:StdDev",
        },
    ];
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

/*
 * Placeholders
 * There are probably libraries that automate the mutating of contexts
 * Ideally these functions create and use a new vocabulary combining the original data and the derived view
 */

function extractVocubalary(data) {
    return data["@context"][0];
}

function expandVocabulary(vocabulary) {
    vocabulary["sosa:observedProperty"] = {
        "@type": "@id",
    };
    vocabulary["sosa:madeBySensor"] = {
        "@type": "@id",
    };
    vocabulary.cot = "https://w3id.org/cot/";
    vocabulary["cot:hasAggregationPeriod"] = {
        "@type": "@id",
    };
    vocabulary["cot:usingFunction"] = {
        "@type": "@id",
    };
}
