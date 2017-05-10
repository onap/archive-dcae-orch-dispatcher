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

/* Middleware modules  */

"use strict";

const ejs = require('ejs');
const utils = require('./utils');
const logging = require('./logging');
const logAccess = logging.logAccess;
const logError = logging.logError;
const logWarn = logging.logWarn;
const config = process.mainModule.exports.config;
const locations = config.locations;

/* Assign a request ID and start time to each incoming request */
exports.assignId = function(req, res, next) {
	/* Use request ID from header if available, otherwise generate one */
	req.dcaeReqId = req.get('X-ECOMP-RequestID') ||  utils.generateId();
	req.startTime = new Date();
	next();
};


/* Error handler -- send error with JSON body */
exports.handleErrors = function(err, req, res, next) {
	var status = err.status || 500;
	var msg = err.message || err.body || 'unknown error'
	res.status(status).type('application/json').send({status: status, message: msg });
	logAccess(req, status, msg);

	if (status >= 500) {
		logError(err, req);
	}
};

/* Make sure Content-Type is correct for POST and PUT */
exports.checkType = function(type){
	return function(req, res, next) {
		const ctype = req.header('content-type');
		const method = req.method.toLowerCase();
		/* Content-Type matters only for POST and PUT */
		if (ctype === type || ['post','put'].indexOf(method) < 0) {
			next();
		}
		else {
			var err = new Error ('Content-Type must be \'' + type +'\'');
			err.status = 415;
			next (err);
		}	
	};
};

/* Check that a JSON body has a set of properties */
exports.checkProps = function(props) {
	return function (req, res, next) {
		const missing = props.filter(function(p){return !utils.hasProperty(req.body,p);});
		if (missing.length > 0) {
			var err = new Error ('Request missing required properties: ' + missing.join(','));
			err.status = 400;
			next(err);
		}
		else {
			next();
		}	
	};
};

/* Check that there is location information for this event */
/* Appends locations to req.dcae_locations for later use */
exports.checkLocation = function(req, res, next) {
	if (req.body.dcae_service_location in locations) {
		req.dcae_locations = {central: locations.central, local: locations[req.body.dcae_service_location]};
		next();
	}
	else {
		var err = new Error ('"' + req.body.dcae_service_location + '" is not a supported location');
		err.status = 400;
		next(err);	
	}
	
};

/* Expand blueprint templates into full blueprints.
 * Expects req.dcae_templates to contain templates.
 * Puts expanded blueprints into req.dcae_blueprints 
 */
exports.expandTemplates = function(req, res, next) {
	
	/* Build the context for rendering the template */
	var context = req.body;					// start with the body of POST /events request
	context.locations = req.dcae_locations;	// location information from the location "map" in config file
	context.dcae_shareables = req.dcae_shareables;	// local shareable components
	
	/* Expand the templates */
	try {
		if (req.dcae_templates) {		// There won't be any templates for an undeploy
			var blueprints = req.dcae_templates.map(function (template) {
				//TODO possibly compute intensive- is there a better way?
				return {
					blueprint: ejs.render(template.template, context),
					type: template.type,
					deploymentId: utils.generateId()		// Assign ID now, so we can return it in response
				};
			});
			req.dcae_blueprints = blueprints;
			req.dcae_templates = null;		// Make they'll get garbage-collected
		}
		next();
	}
	catch (err) {
		err.status = 400;
		next(err);
	}
};


