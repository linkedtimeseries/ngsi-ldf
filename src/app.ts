import compression = require("compression");
import cors = require("cors");
import debug = require("debug");
import express = require("express");

import routes from "./routes/all";

const app = express();

app.use(compression()); // enable gzip

app.options("*", cors()); // add cors to OPTIONS requests
app.use(cors()); // add cors to GET requests

app.use("/", routes);
app.set("port", process.env.PORT || 3001);

const server = app.listen(app.get("port"), () => {
    debug("Express server listening on port " + server.address().port);
});
