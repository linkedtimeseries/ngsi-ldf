import cacheControl = require("@tusbar/cache-control");
import fetch = require("node-fetch");

interface ICacheEntry {
    ts: Date;
    maxAge: number;
    data: object;
}

const CACHE: Map<string, ICacheEntry> = new Map();
export async function getCached(uri: string): Promise<object> {
    if (CACHE.has(uri)) {
        const { ts, maxAge, data } = CACHE.get(uri);
        if (ts.getTime() + maxAge * 1000 > new Date().getTime()) {
            return data;
        }
    }

    console.log("GET", uri);
    const response = await fetch(uri);
    const data = await response.json();
    const maxAge = cacheControl.parse(response.headers.get("cache-control")).maxAge || 1;

    CACHE.set(uri, {
        ts: new Date(),
        maxAge,
        data,
    });

    return data;
}
