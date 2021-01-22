import fetch = require("node-fetch");
import { getConfig } from "../config/config";
const ContextParser = require('jsonld-context-parser').ContextParser;

function convertToKeyValues(entity: any) {
    // Retrieve entities with options=keyValues
    const converted = {};
    if (!(typeof entity === "object")) { return entity; } else {
        for (const k in Object.keys(entity)) {
            try {
                if (entity[Object.keys(entity)[k]].type) {
                    if (entity[Object.keys(entity)[k]].type === "Relationship") {
                        converted[Object.keys(entity)[k]] = convertToKeyValues(entity[Object.keys(entity)[k]].object);
                    } else if (entity[Object.keys(entity)[k]].type === "Property" || entity[Object.keys(entity)[k]].type === "GeoProperty") {
                        converted[Object.keys(entity)[k]] = convertToKeyValues(entity[Object.keys(entity)[k]].value);
                    } else {
                        converted[Object.keys(entity)[k]] = convertToKeyValues(entity[Object.keys(entity)[k]]);
                    }
                } else if (Array.isArray(entity[Object.keys(entity)[k]])) {
                    converted[Object.keys(entity)[k]] = [];
                    for (const a in entity[Object.keys(entity)[k]]) {
                        converted[Object.keys(entity)[k]].push(convertToKeyValues(entity[Object.keys(entity)[k]][a]));
                    }
                } else if (typeof entity[Object.keys(entity)[k]] === 'object') {
                    converted[Object.keys(entity)[k]] = convertToKeyValues(entity[Object.keys(entity)[k]]);
                } else {
                    converted[Object.keys(entity)[k]] = entity[Object.keys(entity)[k]];
                }
            } catch (e) {
                console.error("something went wrong with converting to keyValues. Continuing...");
            }
        }
    }
    return converted;
}

function getModifiedAtsFromEntity(modifiedAts: any[], object: any) {
    for (const k in Object.keys(object)) {
        // tslint:disable-next-line:max-line-length
        if (Object.keys(object)[k] === "modifiedAt" && modifiedAts.indexOf(object[Object.keys(object)[k]]) === -1) { modifiedAts.push(object[Object.keys(object)[k]]); }
        else if (Array.isArray(object[Object.keys(object)[k]])) {
            for (const o in object[Object.keys(object)[k]]) {
                getModifiedAtsFromEntity(modifiedAts, object[Object.keys(object)[k]][o]);
            }
        } else if (typeof object[Object.keys(object)[k]] === "object") {
            getModifiedAtsFromEntity(modifiedAts, object[Object.keys(object)[k]]);
        }
    }
}

function getModifiedAtsFromResponse(responseJson: any): any[] {
    const modifiedAts = [];
    if (Array.isArray(responseJson)) {
        for (let e in responseJson) {
            getModifiedAtsFromEntity(modifiedAts, responseJson[e]);
        }
    } else if (responseJson.id) {
        // single entity
        getModifiedAtsFromEntity(modifiedAts, responseJson);
    }
    return modifiedAts;
}

function convertToEventStream(data: any[], type: string) {
    const config = getConfig();

    for (const d in data) {
        data[d]["dcterms:isVersionOf"] = data[d].id;
        // create version URI
        data[d].id += "/" + new Date(data[d].modifiedAt).toISOString();
        data[d]["prov:generatedAtTime"] = new Date(data[d].modifiedAt).toISOString();
        data[d].memberOf = `${config.targetURI}/${encodeURIComponent(type)}`;
    }
    return data;
}

export async function convertResponseToEventstream(responseJson: object, type: string, fromTime: Date, toTime: Date, bbox: object) {
    const config = getConfig();

    const modifiedAts = getModifiedAtsFromResponse(responseJson);

    const data = [];

    for (const ma in modifiedAts) {
        const modifiedAt = new Date(modifiedAts[ma]);
        if (modifiedAt.getTime() >= fromTime.getTime() && modifiedAt.getTime() < toTime.getTime()) {
            const uriModifiedAt = `${config.sourceURI}/temporal/entities?type=${encodeURIComponent(type)}&georel=within&geometry=Polygon&`
                + `coordinates=${JSON.stringify(bbox)}&timerel=between`
                + `&time=${modifiedAt.toISOString()}&endTime=${modifiedAt.toISOString()}`
                + `&timeproperty=modifiedAt&options=sysAttrs`;
            const modifiedAtResponse = await fetch(uriModifiedAt);
            const entities = await modifiedAtResponse.json();
            if (entities.id) {
                if (Array.isArray(entities)) {
                    for (const e in entities) {
                        let entity = entities[e];
                        // remove NGSI metadata model when keyValues is enabled
                        if (config.keyValues) entity = convertToKeyValues(entity);
                        data.push(entity);
                    }
                } else {
                    let entity = entities;
                    if (config.keyValues) entity = convertToKeyValues(entities);
                    data.push(entity);
                }
            }
        }
    }
    return convertToEventStream(data, type);
}

export async function expandVocabulary(vocabulary) {
    const myParser = new ContextParser();

    let defaultContext = {};
    defaultContext["xsd"] = "http://www.w3.org/2001/XMLSchema#";
    defaultContext["schema"] = "http://schema.org/";
    defaultContext["schema:endDate"] = {
        "@type": "xsd:dateTime",
    };
    defaultContext["dcterms"] = "http://purl.org/dc/terms/"; // to describe the dataset
    defaultContext["tiles"] = "https://w3id.org/tree/terms#"; // for the fragmentations
    defaultContext["hydra"] = "http://www.w3.org/ns/hydra/core#"; // for the hypermedia controls
    defaultContext["hydra:variableRepresentation"] = {
        "@type": "@id",
    };
    defaultContext["hydra:property"] = {
        "@type": "@id",
    };
    defaultContext["tree"] = "https://w3id.org/tree/terms#";
    defaultContext["tree:node"] = {
        "@type": "@id",
    };
    defaultContext["sh"] = "https://www.w3.org/ns/shacl#";
    defaultContext["tree:path"] = {
        "@type": "@id",
    };
    defaultContext["ngsi-ld"] = "https://uri.etsi.org/ngsi-ld/";

    const myContext = await myParser.parse([defaultContext, vocabulary], {
        external: true,
        minimalProcessing: true // remote contexts are not ingested in our context
    });

    return myContext.getContextRaw();
}

/*
 * Placeholders
 * There are probably libraries that automate the mutating of contexts
 * Ideally these functions create and use a new vocabulary combining the original data and the derived view
 */

export function extractVocabulary(data) {
    // fixme; simple placeholder
    if (data && data.length) {
        return data[0]["@context"];
    } else {
        return {};
    }
}

export function simplifyGraph(vocabulary, graph) {
    // fixme; simple placeholder
    for (const entity of graph) {
        delete entity["@context"];
    }
}