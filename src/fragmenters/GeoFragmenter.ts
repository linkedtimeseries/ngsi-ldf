/* Point on the planet in WGS84 coordinates */
export interface ILocation {
    latitude: number;
    longitude: number;
}

/* The supported level of granularity */
export interface IPrecisionRange {
    minimum: number;
    maximum: number;
}

export abstract class GeoFragmenter {
    /* Determines the hierarchical level, can be a zoom level, identifier length, ... */
    public abstract getPrecision(req): number;
    /* Determines the levels of granularity we support */
    public abstract getPrecisionRange(): IPrecisionRange;
    /* Returns the center of the fragment */
    public abstract getFocusPoint(req): ILocation;
    /* Returns the fragmentation-specific part of the resource path */
    public abstract getFragmentPath(focus: ILocation, precision: number);
    /* Returns the shape of the fragment as a polygon */
    public abstract getBBox(focus: ILocation, precision: number): ILocation[];
    /* Returns an object containing the metadata description of a fragment, e.g. the zoom level */
    public abstract getMetaData(focus: ILocation, precision: number);

    /* Returns the hydra search template for the raw data view */
    public abstract getDataSearchTemplate(baseUri: string);
    /* Returns the hydra search template for the summary data view */
    public abstract getSummarySearchTemplate(baseUri: string);
    /* Returns the hydra search template for the latest data view */
    public abstract getLatestearchTemplate(baseUri: string);

    /* Returns the paginated raw data URI */
    public getDataFragmentURI(base: string, focus: ILocation, precision: number, time: Date) {
        const path = this.getFragmentPath(focus, precision);
        const geospatial = `${base}${path}`;
        return `${geospatial}?page=${time.toISOString()}`;
    }
    /* Returns the latest data URI */
    public getLatestFragmentURI(base: string, focus: ILocation, precision: number) {
        const path = this.getFragmentPath(focus, precision);
        const geospatial = `${base}${path}`;
        return `${geospatial}/latest`;
    }
    /* Returns the paginated summary data URI */
    public getSummaryFragmentURI(base: string, focus: ILocation, precision: number, time: Date, period: string) {
        const path = this.getFragmentPath(focus, precision);
        const geospatial = `${base}${path}`;
        // periods are resources, and thus URIs, themselves
        const encoded = encodeURIComponent(period);
        return `${geospatial}/summary?page=${time.toISOString()}&period=${encoded}`;
    }
}
