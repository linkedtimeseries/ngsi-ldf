# NGSI-LDF

Suppose you want to know the median NOx value in your garden over the course of last week, would you find a service giving you the answer you're looking for? What if you're looking for the 33% quantile, or you want to know the moving median, what then? Chances are that if you do find a suitable service, it'll either be plagued by stability issues, rate limiting restrictions, unpleasant pricing schemes, or all of the above. 

Some queries simply require a lot of resources, and services have to spread these resources among all their users -- so something has to give. We propose to publish the data in the purest form possible, allowing data consumers to answer their own questions. The rationale being that slowly getting to an answer is better than not getting to an answer at all. Note that the two approaches aren't necessarily mutually exclusive; the ideal service combine both.

At the same time, we have noticed that many data owners aren't opposed to sharing their data as long as it doesn't interfere with their actual operations. It should not require a lot of resources - both in the computational and the development effort points of view. NGSI-LD APIs do not (currently) meet these requirements. 

This tool (conveniently named NGSI-LDF) tool republishes data from a given NGSI-LD API as Linked Data Fragments (LDF). Each individual fragment is a read-only and cacheable partial view of the data, alleviating a  the main concerns from data owners. Data consumers can find the data they're looking for by either filling in search templates (described using the hydra vocabulary) or by traversing other fragments (described using the tree ontology).

---

Note that the tool itself is still rough around the edges, and the NGSI-LD specification is still evolving. While we believe it already goes a long way towards efficiently disclosing NGSI-LD data, it may not work for all use cases (yet).

## Fragmentations

The fragmentation strategy ultimately determines the usability of the published Linked Data Fragments. Making them too granular eliminates the cacheability of the data, making them too course makes the data harder to ingest for consumers. Keeping this in mind, we currently support three common geospatial bucketing strategies and a flexible temporal fragmentation strategy.

All published data is fragmented geospatially, but not at all data is fragmented temporally. We call geospatial fragments _tiles_, and tiles that are also temporally fragmented _tile pages_ or simply _pages_.

### Geospatial Fragmentations

Each geospatial fragmentation has a predefined 'acceptable' range of coarseness. 

#### Slippy Tiles

Made popular by digital maps such as Google Maps and the OpenStreetMap project, this fragmentation is essentially a geospatial quadtree. Fragments that use this fragmentation adhere to the following path template: `/{z}/{x}/{y}` where:

* `z` is the zoom level. Zoom level 0 covers the entire world, zoom level 1 contains 4 tiles, ... We support values that lie in the interval [13, 14].
* `x` is the tile longitude. Possible values lie in the interval [0, 2^n], where 0 corresponds to the westernmost tile and 2^n corresponds to the easternmost tile.
* `y`is the tile longitude. Possible values lie in the interval [0, 2^n], where 0 corresponds to the *northernmost* (**not** the southernmost) tile and 2^n corresponds to the southernmost tile. 

Example functions to translate a WGS84 coordinate to a tile coordinate as well as functions to translate tiles coordinates to their *top left* corners can be found on the [OpenStreetMap wiki](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames).

#### Geohash

Geohashes are commonly used to compactly store coordinates, but theyhttps://mail.google.com/mail/u/0/#inbox can also be used as a bucketing strategy. Essentially they are also based on quadtrees; element `0` covers the entire world and contains elements (ordered from top to bottom, left to right )`01` `11` `00` `10`. The resulting bit sequence is then encoded in base32 to obtain the actual geohash.  Fragments that use this fragmentation adhere to the following path template: `/geohash/{hash}` where:

* `hash` is the geohash. The length of this hash is also called the geohash precision. We support precision values that lie in the interval [5, 6].

See the [Wikipedia page](https://en.wikipedia.org/wiki/Geohash) for more information.

#### H3

The other two fragmentation strategies yield (more or less) rectangles. Researchers have found that hexagonal grids can be a better fit than rectangular grids (for example, [this](https://www.sciencedirect.com/science/article/pii/S0304380007001949) paper). H3 is such a hexagonal grid system developed by Uber. Fragments that use this fragmentation adhere to the following path template: `/h3/{index}` where:

* `index` is the grid cell identifier. Libraries (such as [h3-js](https://github.com/uber/h3-js)) can be used to determine the precision. We support precision that lie in the interval [6, 7].

See the [Uber blog](https://eng.uber.com/h3/) for more information.

### Temporal Fragmentations

Observations that happen in the same time period can be placed in the same bucket. The default bucket size is 1 hour, which means that an observation that happened at `2019-11-05T15:36:00.000Z` can be found in the `2019-11-05T15:00:00.000Z` bucket.

Temporal fragmentation are also used to aggregate data, in which case we can between the aggregation fragmentation (that is, computing the aggregation) and the one for the pagination (for the data publishing).  

## Interfaces

### Raw Data

Looks like temporal NGSI-LD data

#### Example

### Latest

Also looks like temporal NGSI-LD data

#### Example

#### Aggregates

Not NGSI-LD anymore because it's too entity-centric

## Usage

The root directory contains a configuration file (`config.toml`) that contains the most important parameters. The default file contains comments detailing their purpose:

```toml
[ngsi]
  # Location of the NGSI-LD endpoint
  host = "http://localhost:3000"

[api]
  # Base URI of the generated fragments
  host = "http://localhost:3001"
  # number of observations to include in the /latest fragments
  lastN = 100

[data]
  # NGSI-LD exclusively uses relative property URIs
  # These are resolved using the active context
  # Relative URIs used as objects (in JSON-LD) are considered relative to the base URI instead
  # This is a list of such properties that need to be made absolute when needed
  metrics = ["NO2", "O3", "PM10", "PM1", "PM25"]
```



## Hypermedia controls

#### Search Template

hydra

#### Traversal

Raw -> Raw

Summary -> Summary

---

Summary -> Raw

---

Latest -> Raw

Raw -> Latest



## Request Translations

Equivalence of fragmentations and NGSI-LD parameters

## Headers

CORS - NGSI-LD context

Cache

Compression