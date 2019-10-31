import debug = require("debug");
import express = require("express");

import routes from "./routes/all";

const app = express();

app.use("/", routes);
app.set("port", process.env.PORT || 3001);

const server = app.listen(app.get("port"), () => {
    debug("Express server listening on port " + server.address().port);
});
