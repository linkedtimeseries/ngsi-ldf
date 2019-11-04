import geohash = require("ngeohash");
import { GeoFragmenter, ILocation, IPrecisionRange } from "./GeoFragmenter";

export default class GeohashFragmenter extends GeoFragmenter {
    public getPrecisionRange(): IPrecisionRange {
        // not a very granular fragmentation
        return {
            minimum: 5, // 20 km2
            maximum: 6, // 1 km2
        };
    }

    public getPrecision(req: any): number {
        return req.params.hash.length;
    }

    public getFocusPoint(req): ILocation {
        const hash = req.params.hash;
        const [lat1, lon1, lat2, lon2] = geohash.decode_bbox(hash);

        return {
            latitude: (lat1 + lat2) / 2,
            longitude: (lon1 + lon2) / 2,
        };
    }

    public getFragmentPath(focus: ILocation, precision: number) {
        const hash = geohash.encode(focus.latitude, focus.longitude, precision);
        return `/geohash/${hash}`;
    }

    public getBBox(focus: ILocation, precision: number): ILocation[] {
        const hash = geohash.encode(focus.latitude, focus.longitude, precision);
        const [lat1, lon1, lat2, lon2] = geohash.decode_bbox(hash);

        return [
            { longitude: lon1, latitude: lat1 },
            { longitude: lon1, latitude: lat2 },
            { longitude: lon2, latitude: lat2 },
            { longitude: lon2, latitude: lat2 },
        ];
    }

    public getMetaData(focus: ILocation, precision: number) {
        const hash = geohash.encode(focus.latitude, focus.longitude, precision);

        return {
            "tiles:geohash": hash,
        };
    }

    public getSummarySearchTemplate(baseUri: string) {
        return {
            "@type": "hydra:IriTemplate",
            "hydra:template": `${baseUri}/geohash/{hash}/summary{?page}`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "hash",
                    "hydra:property": "tiles:geohash",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "page",
                    "hydra:property": "schema:startDate",
                    "hydra:required": false,
                },
            ],
        };
    }

    public getDataSearchTemplate(baseUri: string) {
        return {
            "@type": "hydra:IriTemplate",
            "hydra:template": `${baseUri}/geohash/{hash}{?page}`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "hash",
                    "hydra:property": "tiles:geohash",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "page",
                    "hydra:property": "schema:startDate",
                    "hydra:required": false,
                },
            ],
        };
    }

    public getLatestearchTemplate(baseUri: string) {
        return {
            "@type": "hydra:IriTemplate",
            "hydra:template": `${baseUri}/geohash/{hash}/latest`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "hash",
                    "hydra:property": "tiles:geohash",
                    "hydra:required": true,
                },
            ],
        };
    }
}
