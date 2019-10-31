export interface ILocation {
    latitude: number;
    longitude: number;
}

export interface IPrecisionRange {
    minimum: number;
    maximum: number;
}

export abstract class GeoFragmenter {
    public abstract getPrecisionRange(): IPrecisionRange;
    public abstract getPrecision(req): number;
    public abstract getFocusPoint(req): ILocation;
    public abstract getFragmentPath(focus: ILocation, precision: number);
    public abstract getBBox(focus: ILocation, precision: number): ILocation[];

    public abstract getMetaData(focus: ILocation, precision: number);

    public abstract getDataSearchTemplate(baseUri: string);
    public abstract getSummarySearchTemplate(baseUri: string);
    public abstract getLatestearchTemplate(baseUri: string);

    public getDataFragmentURI(base: string, focus: ILocation, precision: number, time: Date) {
        const path = this.getFragmentPath(focus, precision);
        const geospatial = `${base}${path}`;
        return `${geospatial}?page=${time.toISOString()}`;
    }

    public getLatestFragmentURI(base: string, focus: ILocation, precision: number) {
        const path = this.getFragmentPath(focus, precision);
        const geospatial = `${base}${path}`;
        return `${geospatial}/latest`;
    }

    public getSummaryFragmentURI(base: string, focus: ILocation, precision: number, time: Date, period: string) {
        const path = this.getFragmentPath(focus, precision);
        const geospatial = `${base}${path}`;
        const encoded = encodeURIComponent(period);
        return `${geospatial}/summary?page=${time.toISOString()}&period=${encoded}`;
    }
}
