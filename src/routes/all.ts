import express = require("express");
import { getGeohashPage, getH3Page, getSlippyPage } from "../controllers/dataController";
import { getGeohashLatest, getH3Latest, getSlippyLatest } from "../controllers/latestController";
import { getGeohashSummaryPage, getH3SummaryPage, getSlippySummaryPage } from "../controllers/summaryController";

const router = express.Router();

// router.get("/:zoom/:tile_x/:tile_y/summary", getSlippySummaryPage);
// router.get("/geohash/:hash/summary", getGeohashSummaryPage);
// router.get("/h3/:index/summary", getH3SummaryPage);
//
router.get("/:zoom/:tile_x/:tile_y/latest", getSlippyLatest);
router.get("/geohash/:hash/latest", getGeohashLatest);
router.get("/h3/:index/latest", getH3Latest);

router.get("/:zoom/:tile_x/:tile_y", getSlippyPage);
router.get("/geohash/:hash", getGeohashPage);
router.get("/h3/:index", getH3Page);

export default router;
