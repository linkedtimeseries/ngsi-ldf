﻿import { Request, Response } from "express";
import fetch = require("node-fetch");
import { getConfig } from "../config/config";
import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";
import TimeFragmenter from "../fragmenters/time";

// tslint:disable: no-string-literal

function wrapPage(
    req: Request, // the original request
    data: object, // the converted data
    timeFragmenter: TimeFragmenter, // temporal fragmentation strategy
    geoFragmenter: GeoFragmenter, // geospatial fragmentation strategy
) {
    // figure out which area this fragment covers
    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    // figure out which period this fragment covers
    const fromTime = timeFragmenter.getFromTime(req.query.page);
    const nextTime = timeFragmenter.getNextTime(fromTime);
    const previousTime = timeFragmenter.getPreviousTime(fromTime);

    // adapt/use a new json-ld context
    const vocabulary = extractVocubalary(data);
    expandVocabulary(vocabulary);
    simplifyGraph(vocabulary, data);

    const config = getConfig();

    // add links to previous/next pages
    const children = [{
        "@type": "tree:LesserThanRelation",
        "tree:node": geoFragmenter.getDataFragmentURI(config.targetURI, focus, precision, previousTime),
        "sh:path": "ngsi-ld:observedAt",
        "tree:value": {
            "schema:startDate": previousTime.toISOString(),
            "schema:endDate": fromTime.toISOString(),
        },
    }];

    if (new Date() > nextTime) {
        children.push({
            "@type": "tree:GreaterThanRelation",
            "tree:node": geoFragmenter.getDataFragmentURI(config.targetURI, focus, precision, nextTime),
            "sh:path": "ngsi-ld:observedAt",
            "tree:value": {
                "schema:startDate": nextTime.toISOString(),
                "schema:endDate": timeFragmenter.getNextTime(nextTime).toISOString(),
            },
        });
    } else {
        children.push({
            "@type": "tree:AlternateViewRelation",
            "tree:node": geoFragmenter.getLatestFragmentURI(config.targetURI, focus, precision),
            "sh:path": "ngsi-ld:observedAt",
            "tree:value": {
                "schema:startDate": undefined,
                "schema:endDate": new Date().toISOString(),
            },
        });
    }

    // build the fragment
    const result = {
        "@context": vocabulary,
        "@id": geoFragmenter.getDataFragmentURI(config.targetURI, focus, precision, fromTime),
        "@type": "tree:Node",
        ...geoFragmenter.getMetaData(focus, precision),
        "tree:relation": children,
        "sh:path": "ngsi-ld:observedAt",
        "tree:value": {
            "schema:startDate": fromTime.toISOString(),
            "schema:endDate": nextTime.toISOString(),
        },
        "dcterms:isPartOf": {
            "@id": config.targetURI,
            "@type": "hydra:Collection",
            "hydra:search": geoFragmenter.getDataSearchTemplate(config.targetURI),
        },
        "@graph": data,
    };

    return result;
}

async function getPage(
    req: Request, // the original request
    res: Response, // the response object
    timeFragmenter: TimeFragmenter, // temporal fragmentation strategy
    geoFragmenter: GeoFragmenter, // geospatial fragmentation strategy
) {
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

    // find the time period to fetch
    const fromTime = timeFragmenter.getFromTime(req.query.page);
    const toTime = timeFragmenter.getNextTime(fromTime);

    // figure out which area to fetch
    // Polygon in geojson format
    const focus = geoFragmenter.getFocusPoint(req);
    const bbox = [geoFragmenter.getBBox(focus, precision).map((location) => [location.longitude, location.latitude])];

    const config = getConfig();

    const uri = `${config.sourceURI}/temporal/entities?georel=within&geometry=Polygon&`
        + `coordinates=${JSON.stringify(bbox)}&timerel=between`
        + `&time=${fromTime.toISOString()}&endTime=${toTime.toISOString()}`;
    const response = await fetch(uri);

    // remember when the response arrived
    const dataTime = new Date();
    const data = await response.json();

    // add metadata to the resulting data
    const pagedData = wrapPage(req, data, timeFragmenter, geoFragmenter);

    // fragment is presumed stable if the 'toTime' lies in the past
    addHeaders(res, toTime < dataTime);
    res.status(200).send(pagedData);
}

function addHeaders(
    res: Response, // the response object
    stable?: boolean, // is the fragment considered to be stable?
) {
    res.type("application/ld+json; charset=utf-8");
    if (stable) {
        // stable fragments are cached for a day
        res.set("Cache-Control", `public, max-age=${60 * 60 * 24}`);
    } else {
        // unstable fragments are cached for 5 seconds
        res.set("Cache-Control", "public, max-age=5");
    }
}

export async function getSlippyPage(req, res) {
    const geoFragmenter = new SlippyFragmenter();
    await getPage(req, res, new TimeFragmenter(TimeFragmenter.HOUR), geoFragmenter);
}

export async function getGeohashPage(req, res) {
    const geoFragmenter = new GeohashFragmenter();
    await getPage(req, res, new TimeFragmenter(TimeFragmenter.HOUR), geoFragmenter);
}

export async function getH3Page(req, res) {
    const geoFragmenter = new H3Fragmenter();
    await getPage(req, res, new TimeFragmenter(TimeFragmenter.HOUR), geoFragmenter);
}

/*
 * Placeholders
 * There are probably libraries that automate the mutating of contexts
 * Ideally these functions create and use a new vocabulary combining the original data and the derived view
 */

function extractVocubalary(data) {
    // fixme; simple placeholder
    if (data && data.length) {
        return data[0]["@context"];
    } else {
        return {};
    }
}

function expandVocabulary(vocabulary) {
    let targetContext;
    if (vocabulary && vocabulary.length) {
        targetContext = vocabulary[0];
    } else {
        targetContext = vocabulary;
    }

    targetContext["xsd"] = "http://www.w3.org/2001/XMLSchema#";
    targetContext["schema"] = "http://schema.org/";
    targetContext["schema:startDate"] = {
        "@type": "xsd:dateTime",
    };
    targetContext["schema:endDate"] = {
        "@type": "xsd:dateTime",
    };
    targetContext["dcterms"] = "http://purl.org/dc/terms/";
    targetContext["tree"] = "https://w3id.org/tree/terms#";
    targetContext["tree:node"] = {
        "@type": "@id",
    };
    targetContext["tiles"] = "https://w3id.org/tree/terms#";
    targetContext["hydra"] = "http://www.w3.org/ns/hydra/core#";
    targetContext["hydra:variableRepresentation"] = {
        "@type": "@id",
    };
    targetContext["hydra:property"] = {
        "@type": "@id",
    };
    targetContext["sh"] = "https://www.w3.org/ns/shacl#";
    targetContext["sh:path"] = {
        "@type": "@id",
    };
    targetContext["ngsi-ld"] = "https://uri.etsi.org/ngsi-ld/";
}

function simplifyGraph(vocabulary, graph) {
    // fixme; simple placeholder
    for (const entity of graph) {
        delete entity["@context"];
    }
}
