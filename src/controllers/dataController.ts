import fetch = require("node-fetch");
import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";
import TimeFragmenter from "../fragmenters/time";

const BASE_URI = "http://localhost:3001";
const N = 100;

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

function wrapLatest(req, data, toTime: Date, geoFragmenter: GeoFragmenter) {
    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    const vocabulary = extractVocubalary(data);
    expandVocabulary(vocabulary);
    simplifyGraph(vocabulary, data);

    const result = {
        "@context": vocabulary,
        "@id": geoFragmenter.getLatestFragmentURI(BASE_URI, focus, precision),
        "endDate": toTime.toISOString(),
        ...geoFragmenter.getMetaData(focus, precision),
        "dcterms:isPartOf": {
            "@id": BASE_URI,
            "@type": "hydra:Collection",
            "hydra:search": geoFragmenter.getLatestearchTemplate(BASE_URI),
        },
        "@graph": data,
    };

    return result;
}

function extractVocubalary(data) {
    // fixme; simple placeholder
    if (data && data.length) {
        return data[0]["@context"];
    } else {
        return {};
    }
}

function expandVocabulary(vocabulary) {
    vocabulary[0]["tree"] = "https://w3id.org/tree/terms#";
    vocabulary[0]["tree:child"] = {
        "@type": "@id",
    };
    vocabulary[0]["tiles"] = "https://w3id.org/tree/terms#";
    vocabulary[0]["hydra"] = "http://www.w3.org/ns/hydra/core#";
    vocabulary[0]["hydra:variableRepresentation"] = {
        "@type": "@id",
    };
    vocabulary[0]["hydra:property"] = {
        "@type": "@id",
    };
    vocabulary[0]["sh"] = "https://www.w3.org/ns/shacl#";
    vocabulary[0]["sh:path"] = {
        "@type": "@id",
    };
}

function simplifyGraph(vocabulary, graph) {
    // fixme; simple placeholder
    for (const entity of graph) {
        delete entity["@context"];
    }
}

async function getPage(req, res, timeFragmenter: TimeFragmenter, geoFragmenter: GeoFragmenter) {
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
    res.status(200).send(pagedData);
}

async function getLatest(req, res, geoFragmenter: GeoFragmenter) {
    const toTime = new Date();

    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    const bbox = [geoFragmenter.getBBox(focus, precision).map((location) => [location.longitude, location.latitude])];

    const uri = "http://localhost:3000/temporal/entities?georel=within&geometry=Polygon&"
        + `coordinates=${JSON.stringify(bbox)}&timerel=before`
        + `&time=${toTime.toISOString()}&lastN=${N}`;

    const response = await fetch(uri);
    const data = await response.json();

    const pagedData = wrapLatest(req, data, toTime, geoFragmenter);
    res.status(200).send(pagedData);
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

export async function getSlippyLatest(req, res) {
    const geoFragmenter = new SlippyFragmenter();
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
    } else {
        await getLatest(req, res, geoFragmenter);
    }
}

export async function getGeohashLatest(req, res) {
    const geoFragmenter = new GeohashFragmenter();
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
    } else {
        await getLatest(req, res, geoFragmenter);
    }
}

export async function getH3Latest(req, res) {
    const geoFragmenter = new H3Fragmenter();
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
    } else {
        await getLatest(req, res, geoFragmenter);
    }
}
