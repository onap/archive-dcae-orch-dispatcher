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

const
API_VERSION = "3.0.0";

const
fs = require('fs');
const
util = require('util');
const
http = require('http');
const
https = require('https');
const
express = require('express');
const
daemon = require('daemon');
const
conf = require('./lib/config');
const
req = require('./lib/promise_request');
const
createError = require('./lib/dispatcher-error').createDispatcherError;

/* Paths for API routes */
const
INFO_PATH = "/";
const
EVENTS_PATH = "/events";
const
DEPLOYMENTS_PATH = "/dcae-deployments";

/* Set up log and work directories */
try {
	fs.mkdirSync("./log");
} catch (e) {
}
try {
	fs.mkdirSync("./work");
} catch (e) {
}

/* Set up logging */
const
log4js = require('log4js');
log4js.configure('etc/log4js.json');
const
logger = log4js.getLogger('dispatcher');
exports.config = {
	logSource : log4js
};
const
logError = require('./lib/logging').logError;
logger.info("Starting dispatcher");

try {
	/* Set configuration and make available to other modules */
	var config = conf.configure(process.argv[2] || "./etc/config.json");

	config.locations = conf.getLocations(process.argv[3]
			|| "./etc/locations.json");
	if (Object.keys(config.locations).length < 1) {
		logger.warn('No locations specified')
	}

	/*
	 * Set log level--config will supply a default of "INFO" if not explicitly
	 * set in config.json
	 */
	log4js.setGlobalLogLevel(config.logLevel);

	config.logSource = log4js;
	config.version = require('./version').version;
	config.apiVersion = API_VERSION;
	config.apiLinks = {
		info : INFO_PATH,
		events : EVENTS_PATH
	};
	exports.config = config;
	req.setLogger(log4js);

	/* Set up the application */
	const
	app = express();
	app.set('x-powered-by', false);
	app.set('etag', false);

	/* Give each request a unique request ID */
	app.use(require('./lib/middleware').assignId);

	/* If authentication is set up, check it */
	app.use(require('./lib/auth').checkAuth);

	/* Set up API routes */
	app.use(EVENTS_PATH, require('./lib/events'));
	app.use(INFO_PATH, require('./lib/info'));
	app.use(DEPLOYMENTS_PATH, require('./lib/dcae-deployments'));

	/* Set up error handling */
	app.use(require('./lib/middleware').handleErrors);

	/* Start the server */
	var	server = null;
	var	usingTLS = false;
	try {
		if (config.ssl && config.ssl.pfx && config.ssl.passphrase
				&& config.ssl.pfx.length > 0) {
			/*
			 * Check for non-zero pfx length--DCAE config will deliver an empty
			 * pfx if no cert available for the host.
			 */
			server = https.createServer({
				pfx : config.ssl.pfx,
				passphrase : config.ssl.passphrase
			}, app);
			usingTLS = true;
		} else {
			server = http.createServer(app);
		}
	} catch (e) {
		throw (createError('Could not create http(s) server--exiting: '
				+ e.message, 500, 'system', 551));
	}

	server.setTimeout(0);

	server.listen(config.listenPort, config.listenHost, function() {
		var	addr = server.address();
		logger.info("Dispatcher version " + config.version + " listening on "
				+ addr.address + ":" + addr.port + " pid: " + process.pid
				+ (usingTLS ? " " : " not ") + "using TLS (HTTPS)");
	});

	/* Daemonize */
	if (!config.foreground) {
		daemon();
	}

	/* Set up handling for terminate signal */
	process.on('SIGTERM', function() {
		logger.info("Dispatcher API server shutting down.");
		server.close(function() {
			logger.info("Dispatcher API server shut down.");
		});
	});

	/* Log actual exit */
	/*
	 * logger.info() is asynchronous, so we will see another beforeExit event
	 * after it completes.
	 */
	var	loggedExit = false;
	process.on('beforeExit', function() {
		if (!loggedExit) {
			loggedExit = true;
			logger.info("Dispatcher process exiting.");
		}
	});
} catch (e) {
	/*
	 * If it's the error from HTTP server creation, log it as is, else create a
	 * new standard error to log
	 */
	logError(e.logCode ? e : createError(
			'Dispatcher exiting due to start-up problem: ' + e.message, 500,
			'system', 552));
	console.log("Dispatcher exiting due to startup problem: " + e.message);
}
