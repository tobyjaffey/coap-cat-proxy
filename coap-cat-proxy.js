/* A simple polled HTTP catalogue proxy for unicast CoAP devices */
/** Copyright (c) 2013 Toby Jaffey <toby@1248.io>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var http = require('http');
var coap = require('h5.coap');
var linkformat = require('h5.linkformat');
var express = require('express');

process.argv.shift();
process.argv.shift();

if (!process.argv.length) {
    console.log("Supply one or more space separated coap://XYZ URLs on command line");
    console.log("eg coap://127.0.0.1");
    process.exit(1);
}

var PORT = 8005;
var DEVICES = process.argv;

var app = express();
var client = new coap.Client();

app.configure(function () {
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
});

app.get('/cat', function(req, rsp) {
    var cat = {
        "item-metadata":[
            {
                "rel":"urn:X-tsbiot:rels:isContentType",
                "val":"application/vnd.tsbiot.catalogue+json"
            },
            {
                "rel":"urn:X-tsbiot:rels:hasDescription:en",
                "val":"List of CoAP devices"
            }
        ],
        "items":[]
    };
    for (var i=0;i<DEVICES.length;i++) {
        var item = {"i-object-metadata":[]};
        item.href = '/proxycat?url=' + encodeURIComponent(DEVICES[i]);
        item['i-object-metadata'].push({
            rel: "urn:X-tsbiot:rels:hasDescription:en",
            val: "Proxied version of "+DEVICES[i]
        });
        item['i-object-metadata'].push({
            rel:"urn:X-tsbiot:rels:isContentType",
            val:"application/vnd.tsbiot.catalogue+json"
        });
        cat.items.push(item);
    }
    rsp.send(200, JSON.stringify(cat));
});


app.get('/proxycat', function(req, rsp) {
    console.log("CoAP req for "+req.query.url+'/.well-known/core');
    try {
        var coapReq = client.get(req.query.url+'/.well-known/core', {
          accept: 'application/link-format'
        });

        coapReq.on('error', function(coapRes) {
            rsp.send(400);
        });

        coapReq.on('timeout', function(coapRes) {
            rsp.send(408);
        });

        coapReq.on('response', function(coapRes) {
            if (coapRes.isSuccess()) {
                var coapObj = linkformat.parse(coapRes.getPayload().toString());
                console.log(coapObj);
                var cat = {
                    "item-metadata":[
                        {
                            "rel":"urn:X-tsbiot:rels:isContentType",
                            "val":"application/vnd.tsbiot.catalogue+json"
                        },
                        {
                            "rel":"urn:X-tsbiot:rels:hasDescription:en",
                            "val":"Proxied version of "+req.query.url
                        }
                    ],
                    "items":[]
                };
                for (var i=0;i<coapObj.length;i++) {
                    var mdata = [], item = {};
                    item.href = '/proxyrsrc?url=' + encodeURIComponent(req.query.url+coapObj[i].href);
                    mdata.push({
                        rel: "urn:X-tsbiot:rels:hasDescription:en",
                        val: (coapObj[i].title === undefined) ? req.query.url+coapObj[i].href : coapObj[i].title
                    });
                    mdata.push({
                        rel: "urn:X-tsbiot:rels:isContentType",
                        val: "text/plain"
                    });
                    if (coapObj[i].if !== undefined) {
                        mdata.push({
                            rel: "urn:X-coap:if",
                            val: coapObj[i].if
                        });
                    }
                    if (coapObj[i].ct !== undefined) {
                        mdata.push({
                            rel: "urn:X-coap:ct",
                            val: ""+coapObj[i].ct
                        });
                    }
                    if (coapObj[i].rt !== undefined) {
                        mdata.push({
                            rel: "urn:X-coap:rt",
                            val: coapObj[i].rt
                        });
                    }
                    item['i-object-metadata'] = mdata;
                    cat.items.push(item);
                }
                rsp.send(200, JSON.stringify(cat));
            } else {
                rsp.send(400, coapRes.toPrettyString());
            }
        });
    } catch(e) {
        rsp.send(400, e.toString());
    }
});

app.get('/proxyrsrc', function(req, rsp) {
    try {
        var coapReq = client.get(req.query.url);

        coapReq.on('response', function(coapRes) {
            if (coapRes.isSuccess()) {
                rsp.send(200, coapRes.getPayload().toString());
            } else {
                rsp.send(400, coapRes.toPrettyString());
            }
        });
    } catch(e) {
        rsp.send(400, e.toString());
    }
});

http.createServer(app).listen(PORT, function () {
    console.log("Server listening on port " + PORT);
});



