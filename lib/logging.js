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

"use strict";
const config = process.mainModule.exports.config;
const accessLogger = config.logSource.getLogger('access');


/* Logging */

exports.logAccess = function (req, status, extra) {
	let entry = req.dcaeReqId + " " + req.connection.remoteAddress + " " + req.method + " " + req.originalUrl + " " + status;
	if (extra) {
		extra = extra.replace(/\n/g, " ");		/* Collapse multi-line extra data to a single line */
		entry = entry + " <" + extra + ">";
	}
	accessLogger.info(entry);
};