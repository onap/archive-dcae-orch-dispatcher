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

/* Low-level routines for using the Cloudify Manager REST API */

"use strict";

const stream = require('stream');
const targz = require('node-tar.gz');

const utils = require('./utils');
const repeat = require('./repeat');
const req = require('./promise_request');
const doRequest = req.doRequest;

var cfyAPI = null;
var cfyAuth = null;
var logger = null;


// Delay function--returns a promise that's resolved after 'dtime'
// milliseconds.`
var delay = function(dtime) {
	return new Promise(function(resolve, reject) {
		setTimeout(resolve, dtime);
	});
};

// Poll for the result of a workflow execution
var getWorkflowResult = function(execution_id) {
	var finished = [ "terminated", "cancelled", "failed" ];
	var retryInterval = 15000;   // Every 15 seconds
	var maxTries = 240;           // Up to an hour

	logger.debug("Getting workflow status for execution id: " + execution_id);

	// Function for getting execution info
	var getExecutionStatus = function() {
		var reqOptions = {
			method : "GET",
			uri : cfyAPI + "/executions/" + execution_id
		};
        if (cfyAuth) {
            reqOptions.auth = cfyAuth;
        } 
		return doRequest(reqOptions);
	};

	// Function for testing if workflow is finished
	// Expects the result of getExecutionStatus
	var checkStatus = function(res) {
		logger.debug("Checking result: " + JSON.stringify(res) + " ==> " + (res.json && res.json.status && finished.indexOf(res.json.status) < 0));
		return res.json && res.json.status && finished.indexOf(res.json.status) < 0;
	};

	return repeat.repeatWhile(getExecutionStatus, checkStatus, maxTries,
			retryInterval).then(function(res) {
		if (res.json && res.json.status && res.json.status !== "terminated") {
			throw ("workflow failed!");
		} else {
			return res;
		}
	});
};

// Uploads a blueprint via the Cloudify API
exports.uploadBlueprint = function(bpid, blueprint) {
	// Cloudify API wants a gzipped tar of a directory, not the blueprint text
	// So we make a directory and feed a gzipped tar as the body of the PUT
	// request
	var workingDir = "./work/" + bpid;

	return utils.makeDirAndFile(workingDir, 'blueprint.yaml', blueprint)

	.then(function() {
		// Set up a read stream that presents tar'ed and gzipped data
		var src = targz().createReadStream(workingDir);

		// Set up the HTTP PUT request
		var reqOptions = {
			method : "PUT",
			uri : cfyAPI + "/blueprints/" + bpid,
			headers : {
				"Content-Type" : "application/octet-stream",
				"Accept" : "*/*"
			}
		};

        if (cfyAuth) {
            reqOptions.auth = cfyAuth;
        }
		// Initiate PUT request and return the promise for a result
		return doRequest(reqOptions, src).then(
		// Cleaning up the working directory without perturbing the result is
		// messy!
		function(result) {
			utils.removeDir(workingDir);
			return result;
		}, function(err) {
			logger.debug("Problem on upload: " + JSON.stringify(err));
			utils.removeDir(workingDir);
			throw err;
		});

	});
};

// Creates a deployment from a blueprint
exports.createDeployment = function(dpid, bpid, inputs) {

	// Set up the HTTP PUT request
	var reqOptions = {
		method : "PUT",
		uri : cfyAPI + "/deployments/" + dpid,
		headers : {
			"Content-Type" : "application/json",
			"Accept" : "*/*"
		}
	};

    if (cfyAuth) {
        reqOptions.auth = cfyAuth;
    }
	var body = {
		blueprint_id : bpid
	};
	if (inputs) {
		body.inputs = inputs;
	}

	// Make the PUT request to create the deployment
	return doRequest(reqOptions, JSON.stringify(body));
};

// Executes a workflow against a deployment (use for install and uninstall)
exports.executeWorkflow = function(dpid, workflow) {

	// Set up the HTTP POST request
	var reqOptions = {
		method : "POST",
		uri : cfyAPI + "/executions",
		headers : {
			"Content-Type" : "application/json",
			"Accept" : "*/*"
		}
	};
    if (cfyAuth) {
        reqOptions.auth = cfyAuth;
    }
	var body = {
		deployment_id : dpid,
		workflow_id : workflow
	};

	// Make the POST request
	return doRequest(reqOptions, JSON.stringify(body)).then(
			function(result) {
				logger.debug("Result from POSTing workflow start: "	+ JSON.stringify(result));
				if (result.json && result.json.id) {
					logger.debug("Waiting for workflow status: " + result.json.id);
					return getWorkflowResult(result.json.id);
				} 
				else {
					logger.warn("Did not get expected JSON body from POST to start workflow");
					// TODO throw? we got an OK for workflow but no JSON?
				}
			});
};

// Retrieves outputs for a deployment
exports.getOutputs = function(dpid) {
	var reqOptions = {
		method : "GET",
		uri : cfyAPI + "/deployments/" + dpid + "/outputs",
		headers : {
			"Accept" : "*/*"
		}
	};
    if (cfyAuth) {
        reqOptions.auth = cfyAuth;
    }

	return doRequest(reqOptions);
};

// Get the output descriptions for a deployment
exports.getOutputDescriptions = function(dpid) {
	var reqOptions = {
		method : "GET",
		uri : cfyAPI + "/deployments/" + dpid + "?include=outputs",
		headers : {
			"Accept" : "*/*"
		}
	};
    if (cfyAuth) {
        reqOptions.auth = cfyAuth;
    }

	return doRequest(reqOptions);
};

// Deletes a deployment
exports.deleteDeployment = function(dpid) {
	var reqOptions = {
		method : "DELETE",
		uri : cfyAPI + "/deployments/" + dpid
	};
    if (cfyAuth) {
        reqOptions.auth = cfyAuth;
    }

	return doRequest(reqOptions);
};

// Deletes a blueprint
exports.deleteBlueprint = function(bpid) {
	var reqOptions = {
		method : "DELETE",
		uri : cfyAPI + "/blueprints/" + bpid
	};
    if (cfyAuth) {
        reqOptions.auth = cfyAuth;
    }

	return doRequest(reqOptions);
};

// Allow client to set the Cloudify API root address
exports.setAPIAddress = function(addr) {
	cfyAPI = addr;
};

// Allow client to set Cloudify credentials 
exports.setCredentials = function(user, password) {
    cfyAuth = {
        user : user,
        password : password
    };
};

// Set a logger
exports.setLogger = function(logsource) {
	logger = logsource.getLogger('cfyinterface');
};
