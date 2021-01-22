import { Request, Response } from "express";
import fetch = require("node-fetch");
import { getConfig } from "../config/config";
import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";
import TimeFragmenter from "../fragmenters/time";
import {convertResponseToEventstream, expandVocabulary, extractVocabulary, simplifyGraph} from "../utils/Util";

async function wrapLatest(
    req: Request, // the original request
    data: object, // the converted data
    type: string,
    endDate: Date, // when was this known to be the latest data
    geoFragmenter: GeoFragmenter, // geospatial fragmentation strategy
) {
    // figure out which area this fragment covers
    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    // adapt/use a new json-ld context
    let vocabulary = extractVocabulary(data);
    vocabulary = await expandVocabulary(vocabulary);
    // simplifyGraph(vocabulary, data);

    const config = getConfig();

    // todo, size of fragment should be configurable and consistent
    const timeFragmenter = new TimeFragmenter(TimeFragmenter.HOUR);
    const [beginTime, endTime] = timeFragmenter.getFragmentValue(endDate);

    const children = [{
        "@type": "tree:AlternateViewRelation",
        "tree:node": geoFragmenter.getDataFragmentURI(config.targetURI, type, focus, precision, beginTime),
        "sh:path": "ngsi-ld:observedAt",
        "tree:value": {
            "schema:startDate": beginTime.toISOString(),
            "schema:endDate": endTime.toISOString(),
        },
    }];

    // build the fragment
    const result = {
        "@context": vocabulary,
        "@id": geoFragmenter.getLatestFragmentURI(config.targetURI, type, focus, precision),
        "@type": "tree:Node",
        ...geoFragmenter.getMetaData(focus, precision),
        "tree:relation": children,
        "tree:path": "ngsi-ld:observedAt",
        "tree:value": {
            "schema:endDate": endDate.toISOString(),
        },
        "dcterms:isPartOf": {
            "@id": config.targetURI,
            "@type": "tree:Collection",
            "hydra:search": geoFragmenter.getLatestearchTemplate(config.targetURI),
        },
        "@graph": data,
    };

    return result;
}

async function getLatest(
    req: Request, // the original request
    res: Response, // the response object
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

    // type for NGSI-LD
    if (!req.query.type) {
        res.status(404).send("Provide \"type\" query parameter");
        return;
    }
    const type = decodeURIComponent(req.query.type.toString());

    const config = getConfig();

    const fromTime = new Date(new Date().getTime() - config.lastNumberOfMinutes * 60 * 1000);
    // going to fetch the most recent observations up until NOW
    const toTime = new Date();

    // figure out which area to request data for
    // Polygon in geojson format
    const focus = geoFragmenter.getFocusPoint(req);
    const bbox = [geoFragmenter.getBBox(focus, precision).map((location) => [location.longitude, location.latitude])];

    const uri = `${config.sourceURI}/temporal/entities?type=${encodeURIComponent(type)}&georel=within&geometry=Polygon&`
        + `coordinates=${JSON.stringify(bbox)}&timerel=between`
        + `&time=${fromTime.toISOString()}&endTime=${toTime.toISOString()}`
        + `&timeproperty=modifiedAt&options=sysAttrs`;
    const response = await fetch(uri);
    const responseJson = await response.json();

    const data = await convertResponseToEventstream(responseJson, type, fromTime, toTime, bbox);
    // add metadata to the resulting data
    const wrappedData = await wrapLatest(req, data, type, toTime, geoFragmenter);

    addHeaders(res);
    res.status(200).send(wrappedData);
}

function addHeaders(
    res: Response, // response object to write the headers to
) {
    res.type("application/ld+json; charset=utf-8");
    res.set("Cache-Control", "public, max-age=5"); // cache for 5s
}

export async function getSlippyLatest(req, res) {
    const geoFragmenter = new SlippyFragmenter();
    await getLatest(req, res, geoFragmenter);
}

export async function getGeohashLatest(req, res) {
    const geoFragmenter = new GeohashFragmenter();
    await getLatest(req, res, geoFragmenter);
}

export async function getH3Latest(req, res) {
    const geoFragmenter = new H3Fragmenter();
    await getLatest(req, res, geoFragmenter);
}

