/*
Copyright(c) 2017 AT&T Intellectual Property. All rights reserved. 

Licensed under the Apache License, Version 2.0 (the "License"); 
you may not use this file except in compliance with the License.

You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, 
software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. 
See the License for the specific language governing permissions and limitations under the License.
*/

/* Dispatcher main  */

"use strict";

const API_VERSION = "2.0.0";

const fs = require('fs');
const util = require('util');
const http = require('http');
const https = require('https');
const express = require('express');
const daemon = require('daemon');
const conf = require('./lib/config');
const req = require('./lib/promise_request');

/* Paths for API routes */
const INFO_PATH = "/";
const EVENTS_PATH = "/events";

/* Set up log and work directories */
try { fs.mkdirSync("./log"); } catch (e) { }
try { fs.mkdirSync("./work"); } catch(e) { }

/* Set up logging */
const log4js = require('log4js');
log4js.configure('etc/log4js.json');
const logger = log4js.getLogger('dispatcher');
logger.info("Starting dispatcher");

try {
	/* Set configuration and make available to other modules */
	let config = conf.configure(process.argv[2] || "./etc/config.json");

	config.locations = conf.getLocations(process.argv[3] || "./etc/locations.json");
	if (Object.keys(config.locations).length < 1) {
		logger.warn('No locations specified')
	}

	/* Set log level--config will supply a default of "INFO" if not explicitly set in config.json */
	log4js.setGlobalLogLevel(config.logLevel);

	config.logSource = log4js;
	config.version = require('./version').version;
	config.apiVersion = API_VERSION;
	config.apiLinks = {
			info: INFO_PATH,
			events: EVENTS_PATH
	};
	exports.config = config;
	req.setLogger(log4js);

	/* Set up the application */
	const app = express();
	app.set('x-powered-by', false);
	app.set('etag', false);

	/* Give each request a unique request ID */
	app.use(require('./lib/middleware').assignId);

	/* If authentication is set up, check it */
	app.use(require('./lib/auth').checkAuth);

	/* Set up API routes */
	app.use(EVENTS_PATH, require('./lib/events'));
	app.use(INFO_PATH, require('./lib/info'));

	/* Set up error handling */
	app.use(require('./lib/middleware').handleErrors);

	/* Start the server */
	let server = null;
	let usingTLS = false;
	try {
		if (config.ssl && config.ssl.pfx && config.ssl.passphrase && config.ssl.pfx.length > 0) {
			/* Check for non-zero pfx length--DCAE config will deliver an empty pfx if no cert
			 * available for the host. */
			server = https.createServer({pfx: config.ssl.pfx, passphrase: config.ssl.passphrase}, app);
			usingTLS = true;
		}
		else {
			server = http.createServer(app);	
		}
	}
	catch (e) {
		logger.fatal ('Could not create http(s) server--exiting: ' + e);
		console.log ('Could not create http(s) server--exiting: ' + e);
		process.exit(2);
	}

	server.setTimeout(0);

	server.listen(config.listenPort, config.listenHost, function() {
		let addr = server.address();
		logger.info("Dispatcher version " + config.version + 
				" listening on " + addr.address + ":" + addr.port +
				" pid: " + process.pid +
				(usingTLS ? " " : " not ") + "using TLS (HTTPS)");
	});

	/* Daemonize */
	if (!config.foreground) {
		daemon();
	}

	/* Set up handling for terminate signal */
	process.on('SIGTERM', function(){
		logger.info("Dispatcher API server shutting down.");
		server.close(function() {
			logger.info("Dispatcher API server shut down.");
		});	
	});

	/* Log actual exit */
	/* logger.info() is asynchronous, so we will see
	 * another beforeExit event after it completes.
	 */
	let loggedExit = false;
	process.on('beforeExit', function() {
		if (!loggedExit) {
			loggedExit = true;
			logger.info("Dispatcher process exiting.");
		}
	});
}
catch (e) {
	logger.fatal("Dispatcher exiting due to start-up problems: " + e);
}
