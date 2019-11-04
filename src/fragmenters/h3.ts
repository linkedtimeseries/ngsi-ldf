import h3 from "h3-js";
import { GeoFragmenter, ILocation, IPrecisionRange } from "./GeoFragmenter";

export default class H3Fragmenter extends GeoFragmenter {
    public getPrecision(req: any): number {
        return h3.h3GetResolution(req.params.index);
    }

    public getFocusPoint(req): ILocation {
        const index = req.params.index;
        const [lat, lon] = h3.h3ToGeo(index);

        return {
            latitude: lat as number,
            longitude: lon as number,
        };
    }

    public getFragmentPath(focus: ILocation, precision: number) {
        const index = h3.geoToH3(focus.latitude, focus.longitude, precision);
        return `/h3/${index}`;
    }

    public getBBox(focus: ILocation, precision: number): ILocation[] {
        // not a bounding box, but a hexagon
        const index = h3.geoToH3(focus.latitude, focus.longitude, precision);
        return h3.h3ToGeoBoundary(index, false).map((p) => {
            return {
                latitude: p[0] as number,
                longitude: p[1] as number,
            };
        });
    }

    public getMetaData(focus: ILocation, precision: number) {
        const index = h3.geoToH3(focus.latitude, focus.longitude, precision);

        return {
            "tiles:h3Index": index,
        };
    }

    public getPrecisionRange(): IPrecisionRange {
        // see https://uber.github.io/h3/#/documentation/core-library/resolution-table
        return {
            minimum: 6, // 36.1290521 km2
            maximum: 7, // 5.1612932 km2
        };
    }

    public getDataSearchTemplate(baseUri: string) {
        return {
            "@type": "hydra:IriTemplate",
            "hydra:template": `${baseUri}/h3/{index}{?page}`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "index",
                    "hydra:property": "tiles:h3Index",
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

    public getSummarySearchTemplate(baseUri: string) {
        return {
            "@type": "hydra:IriTemplate",
            "hydra:template": `${baseUri}/h3/{index}/summary{?page}`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "index",
                    "hydra:property": "tiles:h3Index",
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
            "hydra:template": `${baseUri}/h3/{index}/latest`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "index",
                    "hydra:property": "tiles:h3Index",
                    "hydra:required": true,
                },
            ],
        };
    }
}
