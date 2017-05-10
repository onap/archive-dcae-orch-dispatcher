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

/*
 * Dispatcher configuration
 * Configuration may come from environment variables, configuration file, or defaults,
 * in that order of precedence.
 * The configuration file is optional.
 * If present, the configuration file is a UTF-8 serialization of a JSON object.
 * 
 * --------------------------------------------------------------------------------------
 * | JSON property         | Environment variable   | Required? | Default               |
 * --------------------------------------------------------------------------------------
 * | foreground            | FOREGROUND             | Yes       | false                  |
 * --------------------------------------------------------------------------------------
 * | logLevel              | LOG_LEVEL              | Yes       | "INFO"                |
 * --------------------------------------------------------------------------------------
 * | listenHost            | LISTEN_HOST            | Yes       | "0.0.0.0"             |
 * --------------------------------------------------------------------------------------
 * | listenPort            | LISTEN_PORT            | Yes       | 8443                  |
 * --------------------------------------------------------------------------------------
 * | ssl.pfxFile           | SSL_PFX_FILE           | No        | none                  |
 * --------------------------------------------------------------------------------------
 * | ssl.pfxPassFile       | SSL_PFX_PASSFILE       | No        | none                  |
 * --------------------------------------------------------------------------------------
 * | cloudify.url          | CLOUDIFY_URL           | Yes       | none                  |
 * --------------------------------------------------------------------------------------
 * | cloudify.user         | CLOUDIFY_USER          | No        | none                  |
 * --------------------------------------------------------------------------------------
 * | cloudify.password     | CLOUDIFY_PASSWORD      | No        | none                  |
 * --------------------------------------------------------------------------------------
 * | inventory.url         | INVENTORY_URL          | Yes       | http://inventory:8080 |
 * --------------------------------------------------------------------------------------
 * | inventory.user        | INVENTORY_USER         | No        | none                  |
 * --------------------------------------------------------------------------------------
 * | inventory.password    | INVENTORY_PASSWORD     | No        | none                  |
 * --------------------------------------------------------------------------------------
 * 
 * cloudify.cfyManagerAddress allowed as synonym for cloudify.url
 * cloudify.cfyUser allowed as synonym for cloudify.user
 * cloudify.cfyPassword allowed as synonym for cloudify.password
 * inventory.inventoryAddress allowed as synonym for inventory.url
 * ssl.pfx-file allowed as synonym for ssl.pfxFile
 * Note that we're using ssl.passphrase directly in the config file--i.e., we get the passphrase, not a file.
 */
"use strict";

const fs = require("fs");
const utils = require("./utils");

const DEFAULT_FOREGROUND = false;
const DEFAULT_LISTEN_PORT = 8443;
const DEFAULT_LISTEN_HOST = "0.0.0.0";
const DEFAULT_LOG_LEVEL = "INFO";
const DEFAULT_INVENTORY_URL = "http://inventory:8080";

/* Check configuration for completeness */
const findMissingConfig = function(cfg) {
	const requiredProps = ['logLevel', 'listenHost', 'listenPort', 'cloudify.url', 'inventory.url'];
	return requiredProps.filter(function(p){return !utils.hasProperty(cfg,p);});	
};

/** Reads configuration-related files and returns a configuration object
 *  Sets some defaults
 *  Throws I/O errors, JSON parsing errors, and an error if required config elements are missing
 */
exports.configure = function(configFile) {
	var cfg = {};
    
	/* If there's a config file, read it */
	if (configFile) {
		cfg = JSON.parse(fs.readFileSync(configFile, 'utf8').trim());
	}
	
	/* Set config values */
	cfg.foreground = process.env['FOREGROUND'] || cfg.foreground || DEFAULT_FOREGROUND;
	cfg.logLevel = process.env['LOG_LEVEL'] || cfg.logLevel || DEFAULT_LOG_LEVEL;
	cfg.listenHost = process.env['LISTEN_HOST'] || cfg.listenHost || DEFAULT_LISTEN_HOST;
	cfg.listenPort = (process.env['LISTEN_PORT'] && parseInt(process.env['LISTEN_PORT'])) || cfg.listenPort || DEFAULT_LISTEN_PORT;
	
	if (process.env['SSL_PFX_FILE']) {
		if (!cfg.ssl) {
			cfg.ssl = {};
		}
		cfg.ssl.pfxFile = process.env['SSL_PFX_FILE'];
		cfg.ssl.pfxPassFile = process.env['SSL_PFX_PASS_FILE'] || cfg.ssl.pfxPassFile;
	}
	
	if (!cfg.cloudify) {
		cfg.cloudify = {};
	}
	cfg.cloudify.url = process.env['CLOUDIFY_URL'] || cfg.cloudify.url || cfg.cloudify.cfyManagerAddress;
	cfg.cloudify.user = process.env['CLOUDIFY_USER'] || cfg.cloudify.user || cfg.cloudify.cfyUser;
	cfg.cloudify.password = process.env['CLOUDIFY_PASSWORD'] || cfg.cloudify.password || cfg.cloudify.cfyPassword;
	
	if (!cfg.inventory) {
		cfg.inventory = {};
	}
	cfg.inventory.url = process.env['INVENTORY_URL'] || cfg.inventory.url || cfg.inventory.inventoryAddress || DEFAULT_INVENTORY_URL;
	cfg.inventory.user = process.env['INVENTORY_USER'] || cfg.inventory.user;
	cfg.inventory.password = process.env['INVENTORY_PASSWORD'] || cfg.inventory.password;
	cfg.locations = {};

	/* If https params are present, read in the cert/passphrase */
	if (cfg.ssl) {
		cfg.ssl.pfxFile = cfg.ssl.pfxFile || cfg.ssl['pfx-file'];    // Allow synonym
	}
	if (cfg.ssl && cfg.ssl.pfxFile) {
		cfg.ssl.pfx = fs.readFileSync(cfg.ssl.pfxFile);
		if (cfg.ssl.pfxPassFile) {
			cfg.ssl.passphrase = fs.readFileSync(cfg.ssl.pfxPassFile,'utf8').trim();
		}
	}

	const missing = findMissingConfig(cfg);
	if (missing.length > 0) {
		throw new Error ("Required configuration elements missing: " + missing.join(','));
		cfg = null;
	}

	return cfg;   
};

/** Read locations file
*/
exports.getLocations = function(locationsFile) {
	var locations = {};

	try {
		locations = JSON.parse(fs.readFileSync(locationsFile));
	}
	catch (e) {
		locations = {};
	}
	return locations;
}