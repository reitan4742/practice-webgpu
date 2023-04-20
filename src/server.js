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

app.get("/inzkyk", (req, res) => {
    res.sendFile(__dirname + "/public/inzkyk.html");
});

app.get("/f1", (req, res) => {
    res.sendFile(__dirname + "/public/f1.html");
});

app.listen(PORT);
