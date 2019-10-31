import { GeoFragmenter, ILocation, IPrecisionRange } from "./GeoFragmenter";

function tileToLon(tileX, zoom): number {
    return (tileX / Math.pow(2, zoom) * 360 - 180);
}

function tileToLat(tileY, zoom): number {
    const n = Math.PI - 2 * Math.PI * tileY / Math.pow(2, zoom);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

function lonToTile(lon, zoom): number {
    return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
}

function latToTile(lat, zoom): number {
    return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180)
        + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
}

export default class SlippyFragmenter extends GeoFragmenter {
    public getPrecision(req: any): number {
        return parseInt(req.params.zoom, 10);
    }

    public getFocusPoint(req): ILocation {
        const zoom = this.getPrecision(req);
        const tileX = parseInt(req.params.tile_x, 10);
        const tileY = parseInt(req.params.tile_y, 10);

        return this.getCenterOfTile(tileX, tileY, zoom);
    }

    public getFragmentPath(focus: ILocation, precision: number) {
        const tileX = lonToTile(focus.longitude, precision);
        const tileY = latToTile(focus.latitude, precision);
        return `/${precision}/${tileX}/${tileY}`;
    }

    public getFragmentURI(base: string, focus: ILocation, precision: number, time?: Date) {
        const path = this.getFragmentPath(focus, precision);
        const geospatial = `${base}${path}`;
        if (time) {
            return `${geospatial}?page=${time.toISOString()}`;
        } else {
            return `${geospatial}/latest`;
        }
    }

    public getBBox(focus: ILocation, precision: number): ILocation[] {
        const tileX = lonToTile(focus.longitude, precision);
        const tileY = latToTile(focus.latitude, precision);

        const lat1 = tileToLat(tileY, precision);
        const lat2 = tileToLat(tileY + 1, precision);
        const lon1 = tileToLon(tileX, precision);
        const lon2 = tileToLon(tileX + 1, precision);

        return [
            { longitude: lon1, latitude: lat1 },
            { longitude: lon1, latitude: lat2 },
            { longitude: lon2, latitude: lat2 },
            { longitude: lon2, latitude: lat2 },
        ];
    }

    public getPrecisionRange(): IPrecisionRange {
        return {
            minimum: 13, // 10.5 km2
            maximum: 14, // 3.2 km2
        };
    }

    public getMetaData(focus: ILocation, precision: number) {
        const tileX = lonToTile(focus.longitude, precision);
        const tileY = latToTile(focus.latitude, precision);

        return {
            "tiles:zoom": precision,
            "tiles:longitudeTile": tileX,
            "tiles:latitudeTile": tileY,
        };
    }

    public getDataSearchTemplate(baseUri: string) {
        return {
            "@type": "hydraIriTemplate",
            "hydra:template": `${baseUri}/{z}/{x}/{y}{?page}`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "z",
                    "hydra:property": "tiles:zoom",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "x",
                    "hydra:property": "tiles:longitudeTile",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "y",
                    "hydra:property": "tiles:latitudeTile",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "page",
                    "hydra:property": "dcterms:date",
                    "hydra:required": false,
                },
            ],
        };
    }

    public getSummarySearchTemplate(baseUri: string) {
        return {
            "@type": "hydraIriTemplate",
            "hydra:template": `${baseUri}/{z}/{x}/{y}/summary{?page,period}`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "z",
                    "hydra:property": "tiles:zoom",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "x",
                    "hydra:property": "tiles:longitudeTile",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "y",
                    "hydra:property": "tiles:latitudeTile",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "page",
                    "hydra:property": "dcterms:date",
                    "hydra:required": false,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "period",
                    "hydra:property": "cot:hasAggregationPeriod",
                    "hydra:required": false,
                },
            ],
        };
    }

    public getLatestearchTemplate(baseUri: string) {
        return {
            "@type": "hydraIriTemplate",
            "hydra:template": `${baseUri}/{z}/{x}/{y}/latest`,
            "hydra:variableRepresentation": "hydra:BasicRepresentation",
            "hydra:mapping": [
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "z",
                    "hydra:property": "tiles:zoom",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "x",
                    "hydra:property": "tiles:longitudeTile",
                    "hydra:required": true,
                },
                {
                    "@type": "hydra:IriTemplateMapping",
                    "hydra:variable": "y",
                    "hydra:property": "tiles:latitudeTile",
                    "hydra:required": true,
                },
            ],
        };
    }

    private getCenterOfTile(tileX, tileY, zoom): ILocation {
        const lat1 = tileToLat(tileY, zoom);
        const lat2 = tileToLat(tileY + 1, zoom);
        const lon1 = tileToLon(tileX, zoom);
        const lon2 = tileToLon(tileX + 1, zoom);

        return {
            latitude: (lat1 + lat2) / 2,
            longitude: (lon1 + lon2) / 2,
        };
    }
}
