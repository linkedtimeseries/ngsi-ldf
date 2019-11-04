export default class TimeFragmenter {
    /* Some preset time ranges */
    public static readonly HOUR = 1000 * 60 * 60;
    public static readonly DAY = TimeFragmenter.HOUR * 24;
    public static readonly WEEK = TimeFragmenter.DAY * 7;
    public static readonly YEAR = TimeFragmenter.DAY * 365; // kind of

    /* Time range of the fragments in milliseconds */
    private pageSize: number;
    public constructor(pageSize: number) {
        this.pageSize = pageSize;
    }

    /* Returns the start time of a fragment, given the time range the client requested */
    public getFromTime(requestedPage: string): Date {
        let date: Date;

        const requestedTime = Date.parse(decodeURIComponent(requestedPage));
        if (!isNaN(requestedTime)) {
            date = new Date(requestedTime);
        } else {
            // the requested start time wasn't a valid date
            // default to the most recent page
            date = new Date();
        }

        return new Date(date.getTime() - (date.getTime() % this.pageSize));
    }

    public getLastCompleteTime(): Date {
        const date = new Date();
        return new Date(date.getTime() - (date.getTime() % this.pageSize));
    }

    public getPreviousTime(time: Date): Date {
        return new Date(time.getTime() - this.pageSize);
    }

    public getNextTime(time: Date): Date {
        return new Date(time.getTime() + this.pageSize);
    }
}
