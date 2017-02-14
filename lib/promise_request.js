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
 
 /* Promise-based HTTP request client */
 
 "use strict";
 
/*
 * Make an HTTP request using a string or a readable stream for the body 
 * of the request.
 * Return a promise for result in the form 
 * {status: <http status code>, body: <response body>}
 */
 
const stream = require('stream');
const request = require('request');

let logger = null;

exports.doRequest = function(options, body) {
	return new Promise(function(resolve, reject) {
		
		logger.debug("doRequest: " + JSON.stringify(options));
		if (body && !(body instanceof stream.Readable)) {
			// Body is a string, just include it in the request
			options.body = body;
		}
		var req = request(options);

		// Reject promise if there's an error
		req.on('error',  function(error) { 
			logger.debug('Error in on error handler for request: ' + error);
			reject(error);	
		});

		// Capture the response
		req.on('response', function(resp) {

			// Collect the body of the response
			var rbody = '';
			resp.on('data', function(d) {
				rbody += d;
			});

			// resolve or reject when finished
			resp.on('end', function() {

				var result = {
					status : resp.statusCode,
					body : rbody
				};

				// Add a JSON version of the body if appropriate
				if (rbody.length > 0) {
					try {
						var jbody = JSON.parse(rbody);
						result.json = jbody;
					} 
					catch (pe) {
						// Do nothing, no json property added to the result object
					}
				}

				logger.debug(JSON.stringify(result));
						
				if (resp.statusCode > 199 && resp.statusCode < 300) {
					// HTTP status code indicates success - resolve the promise
					logger.debug("do request resolve: "	+ JSON.stringify(result));
					resolve(result);
				} 
				else {
					// Reject the promise
					logger.debug("do request reject: " + JSON.stringify(result));
					reject(result);
				}
			});
		});

		// If there's a readable stream for a body, pipe it to the request
		if (body && (body instanceof stream.Readable)) {
			// Pipe the body readable stream into the request
			body.pipe(req);
		}
	});
};

exports.setLogger = function(logsource) {
	logger = logsource.getLogger('httprequest');
};
