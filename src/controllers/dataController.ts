import { Request, Response } from "express";
import fetch = require("node-fetch");
import { getConfig } from "../config/config";
import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";
import TimeFragmenter from "../fragmenters/time";
import {convertResponseToEventstream, expandVocabulary, extractVocabulary, simplifyGraph} from "../utils/Util";

async function wrapPage(
    req: Request, // the original request
    data: object, // the converted data
    type: string, // the type of objects
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
    let vocabulary = extractVocabulary(data);
    vocabulary = await expandVocabulary(vocabulary);
    // simplifyGraph(expandedVocabulary, data);

    const config = getConfig();

    // add links to previous/next pages
    const children = [{
        "@type": "tree:LessThanRelation",
        "tree:node": geoFragmenter.getDataFragmentURI(config.targetURI, type, focus, precision, previousTime),
        "tree:path": "ngsi-ld:modifiedAt",
        "tree:value": {
            "schema:startDate": previousTime.toISOString(),
            "schema:endDate": fromTime.toISOString(),
        },
    }];

    if (new Date() > nextTime) {
        children.push({
            "@type": "tree:GreaterThanRelation",
            "tree:node": geoFragmenter.getDataFragmentURI(config.targetURI, type, focus, precision, nextTime),
            "tree:path": "ngsi-ld:modifiedAt",
            "tree:value": {
                "schema:startDate": nextTime.toISOString(),
                "schema:endDate": timeFragmenter.getNextTime(nextTime).toISOString(),
            },
        });
    } else {
        children.push({
            "@type": "tree:AlternateViewRelation",
            "tree:node": geoFragmenter.getLatestFragmentURI(config.targetURI, type, focus, precision),
            "tree:path": "ngsi-ld:modifiedAt",
            "tree:value": {
                "schema:startDate": undefined,
                "schema:endDate": new Date().toISOString(),
            },
        });
    }

    // build the fragment
    const result = {
        "@context": vocabulary,
        "@id": geoFragmenter.getDataFragmentURI(config.targetURI, type, focus, precision, fromTime),
        "@type": "tree:Node",
        ...geoFragmenter.getMetaData(focus, precision),
        "tree:relation": children,
        "tree:path": "ngsi-ld:modifiedAt",
        "tree:value": {
            "schema:startDate": fromTime.toISOString(),
            "schema:endDate": nextTime.toISOString(),
        },
        "dcterms:isPartOf": {
            "@id": config.targetURI,
            "@type": "tree:Collection",
            "hydra:search": geoFragmenter.getDataSearchTemplate(config.targetURI),
        },
        "@included": data,
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

    // type for NGSI-LD
    if (!req.query.type) {
        res.status(404).send("Provide \"type\" query parameter");
        return;
    }
    const type = decodeURIComponent(req.query.type.toString());

    const config = getConfig();

    const uri = `${config.sourceURI}/temporal/entities?type=${encodeURIComponent(type)}&georel=within&geometry=Polygon&`
        + `coordinates=${JSON.stringify(bbox)}&timerel=between`
        + `&time=${fromTime.toISOString()}&endTime=${toTime.toISOString()}`
        + `&timeproperty=modifiedAt&options=sysAttrs`;
    const response = await fetch(uri);

    // remember when the response arrived
    const dataTime = new Date();
    const responseJson = await response.json();

    const data = await convertResponseToEventstream(responseJson, type, fromTime, toTime, bbox);

    // add metadata to the resulting data
    const pagedData = await wrapPage(req, data, type, timeFragmenter, geoFragmenter);

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