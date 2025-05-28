const mongoose = require("mongoose");
const logger = require("./logger");

function connectToMongoDbCluster() {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      logger.info("Connect to MongoDb Successfully!");
    })
    .catch((e) => {
      console.log(e);
      logger.warn("Connection to MongoDb Failed!");
    });
}

module.exports = connectToMongoDbCluster;
