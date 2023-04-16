"use strict";
const express = require("express");
const app = express();
const PORT = 8080;

app.use(express.static("public"));

app.get("/triangle", (req, res) => {
    res.sendFile(__dirname + "/public/triangle.html");
});

app.get("/compute", (req, res) => {
    res.sendFile(__dirname + "/public/compute.html");
});

app.listen(PORT);
