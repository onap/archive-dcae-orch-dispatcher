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
const auditLogger = config.logSource.getLogger('audit');
const defaultLogger = config.logSource.getLogger();

/* Audit log fields */
const AUDIT_BEGIN  = 0;
const AUDIT_END = 1;
const AUDIT_REQID = 2;
const AUDIT_SVCINST = 3;
const AUDIT_THREAD = 4;
const AUDIT_SRVNAME = 5;
const AUDIT_SVCNAME = 6;
const AUDIT_PARTNER = 7;
const AUDIT_STATUSCODE = 8;
const AUDIT_RESPCODE = 9;
const AUDIT_RESPDESC = 10;
const AUDIT_INSTUUID = 11;
const AUDIT_CATLOGLEVEL = 12;
const AUDIT_SEVERITY = 13;
const AUDIT_SRVIP = 14;
const AUDIT_ELAPSED = 15;
const AUDIT_SERVER = 16;
const AUDIT_CLIENTIP = 17;
const AUDIT_CLASSNAME = 18;
const AUDIT_UNUSED = 19;
const AUDIT_PROCESSKEY = 20;
const AUDIT_CUSTOM1 = 21;
const AUDIT_CUSTOM2 = 22;
const AUDIT_CUSTOM3 = 23;
const AUDIT_CUSTOM4 = 24;
const AUDIT_DETAILMSG = 25;
const AUDIT_NFIELDS = 26;

/* Error log fields */
const ERROR_TIMESTAMP = 0;
const ERROR_REQID = 1;
const ERROR_THREAD = 2;
const ERROR_SVCNAME = 3;
const ERROR_PARTNER = 4;
const ERROR_TGTENTITY = 5;
const ERROR_TGTSVC = 6;
const ERROR_CATEGORY = 7;
const ERROR_CODE = 8;
const ERROR_DESCRIPTION = 9;
const ERROR_MESSAGE = 10;
const ERROR_NFIELDS = 11;

/* Error code -> description mapping */
const descriptions = {
		
		201: 'Inventory communication error',
		202: 'Cloudify Manager communication error',
		
		501: 'Inventory API error',
		502: 'Cloudify Manager API error',
		
		551: 'HTTP(S) Server initialization error',
		552: 'Dispatcher start-up error',
		
		999: 'Unknown error'
};

/*  Format audit record for an incoming API request */
const formatAuditRecord = function(req, status, extra) {
	var rec = new Array(AUDIT_NFIELDS);
	const end = new Date();
	rec[AUDIT_END] = end.toISOString();
	rec[AUDIT_BEGIN] = req.startTime.toISOString();
	rec[AUDIT_REQID] = req.dcaeReqId;
	rec[AUDIT_SRVNAME] = req.hostname; 			// Use the value from the Host header
	rec[AUDIT_SVCNAME] = req.method + ' ' + req.originalUrl;	// Method and URL identify the operation being performed
	rec[AUDIT_STATUSCODE] = (status < 300 ) ? "COMPLETE" : "ERROR";
	rec[AUDIT_RESPCODE] = status;   // Use the HTTP status code--does not match the table in the logging spec, but makes more sense
	rec[AUDIT_CATLOGLEVEL] = "INFO";   // The audit records are informational, regardless of the outcome of the operation
	rec[AUDIT_SRVIP] = req.socket.address().address;
	rec[AUDIT_ELAPSED] = end - req.startTime;
	rec[AUDIT_SERVER] = req.hostname  // From the Host header, again
	rec[AUDIT_CLIENTIP] = req.connection.remoteAddress;
	
	if (extra) {
		rec[AUDIT_DETAILMSG]= extra.replace(/\n/g, " ");		/* Collapse multi-line extra data to a single line */
	}
	return rec.join('|');
};

/* Format error log record */
const formatErrorRecord = function(category, code, detail, req, target) {
	var rec = new Array(ERROR_NFIELDS);
	
	/* Common fields */
	rec[ERROR_TIMESTAMP] = (new Date()).toISOString();
	rec[ERROR_CATEGORY] = category;
	rec[ERROR_CODE] = code;
	rec[ERROR_DESCRIPTION] = descriptions[code] || 'no description available';
	
	/* Log error detail in a single line if provided */
	if (detail) {
		rec[ERROR_MESSAGE] = detail.replace(/\n/g, " ");
	}
	
	/* Fields available if the error happened during processing of an incoming API request */
	if (req) {
		rec[ERROR_REQID] = req.dcaeReqId;
		rec[ERROR_SVCNAME] = req.method + ' ' + req.originalUrl;    // Method and URL identify the operation being performed
		rec[ERROR_PARTNER] = req.connection.remoteAddress;  	// We don't have the partner's name, but we know the remote IP address	
	}
	
	/* Include information about the target entity/service if available */
	if (target) {
		rec[ERROR_TGTENTITY] = target.entity || '';
		rec[ERROR_TGTSVC] = target.service || '';
	}
	return rec.join('|');
};

exports.logAccess = function(req, status, extra) {	
	auditLogger.info(formatAuditRecord(req, status, extra));
};

exports.logError = function(error, req) {
	defaultLogger.error(formatErrorRecord("ERROR", error.logCode, error.message, req, {entity: error.target}));
};

exports.logWarn = function(error, req) {
	defaultLogger.error(formatErrorRecord("WARN", error.logCode, error.message, req, {entity: error.target}));
};
