import fetch = require("node-fetch");
import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";
import TimeFragmenter from "../fragmenters/time";

// tslint:disable: no-string-literal
const BASE_URI = "http://localhost:3001";

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

    targetContext["schema"] = "http://schema.org/";
    targetContext["dcterms"] = "http://purl.org/dc/terms/";
    targetContext["tree"] = "https://w3id.org/tree/terms#";
    targetContext["tree:child"] = {
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
}

function simplifyGraph(vocabulary, graph) {
    // fixme; simple placeholder
    for (const entity of graph) {
        delete entity["@context"];
    }
}

function wrapPage(req, data, timeFragmenter: TimeFragmenter, geoFragmenter: GeoFragmenter) {
    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    const fromTime = timeFragmenter.getFromTime(req.query.page);
    const nextTime = timeFragmenter.getNextTime(fromTime);
    const previousTime = timeFragmenter.getPreviousTime(fromTime);

    const vocabulary = extractVocubalary(data);
    expandVocabulary(vocabulary);
    simplifyGraph(vocabulary, data);

    const children = [{
        "@type": "tree:LesserThanRelation",
        "tree:child": geoFragmenter.getDataFragmentURI(BASE_URI, focus, precision, previousTime),
    }];

    if (new Date() > nextTime) {
        children.push({
            "@type": "tree:GreaterThanRelation",
            "tree:child": geoFragmenter.getDataFragmentURI(BASE_URI, focus, precision, nextTime),
        });
    }

    const result = {
        "@context": vocabulary,
        "@id": geoFragmenter.getDataFragmentURI(BASE_URI, focus, precision, fromTime),
        "@type": "tree:Node",
        ...geoFragmenter.getMetaData(focus, precision),
        "tree:childRelation": children,
        "tree:value": {
            "schema:startDate": fromTime.toISOString(),
            "schema:endDate": nextTime.toISOString(),
        },
        "sh:path": "observedAt",
        "dcterms:isPartOf": {
            "@id": BASE_URI,
            "@type": "hydra:Collection",
            "hydra:search": geoFragmenter.getDataSearchTemplate(BASE_URI),
        },
        "@graph": data,
    };

    return result;
}

async function getPage(req, res, timeFragmenter: TimeFragmenter, geoFragmenter: GeoFragmenter) {
    const currentTime = new Date();
    const fromTime = timeFragmenter.getFromTime(req.query.page);
    const toTime = timeFragmenter.getNextTime(fromTime);

    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    const bbox = [geoFragmenter.getBBox(focus, precision).map((location) => [location.longitude, location.latitude])];

    const uri = "http://localhost:3000/temporal/entities?georel=within&geometry=Polygon&"
        + `coordinates=${JSON.stringify(bbox)}&timerel=between`
        + `&time=${fromTime.toISOString()}&endTime=${toTime.toISOString()}`;

    const response = await fetch(uri);
    const data = await response.json();

    const pagedData = wrapPage(req, data, timeFragmenter, geoFragmenter);
    addHeaders(res, toTime < currentTime);
    res.status(200).send(pagedData);
}

function addHeaders(res, done?: boolean) {
    res.type("application/ld+json; charset=utf-8");
    if (done) {
        res.set("Cache-Control", `public, max-age=${60 * 60 * 24}`);
    } else {
        res.set("Cache-Control", "public, max-age=5");
    }
}

export async function getSlippyPage(req, res) {
    const geoFragmenter = new SlippyFragmenter();
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
    } else {
        await getPage(req, res, new TimeFragmenter(TimeFragmenter.HOUR), geoFragmenter);
    }
}

export async function getGeohashPage(req, res) {
    const geoFragmenter = new GeohashFragmenter();
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
    } else {
        await getPage(req, res, new TimeFragmenter(TimeFragmenter.HOUR), geoFragmenter);
    }
}

export async function getH3Page(req, res) {
    const geoFragmenter = new H3Fragmenter();
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
    } else {
        await getPage(req, res, new TimeFragmenter(TimeFragmenter.HOUR), geoFragmenter);
    }
}
