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

/* Handle the /events API */

"use strict";

const router = require('express').Router();
const bodyParser = require('body-parser');
const deploy = require('./deploy');
const middleware = require('./middleware');
const inventory = require('./inventory');
const logAccess = require('./logging').logAccess;
const services = require('./services');

/* Required properties for event POST */
const requiredProps = ['dcae_target_name','dcae_target_type','dcae_service_action','dcae_service_location'];

/* Pick up config exported by main */
const config = process.mainModule.exports.config;
const logger = config.logSource.getLogger('events');

/* Set up middleware stack for initial processing of request */
router.use(middleware.checkType('application/json'));		// Validate type
router.use(bodyParser.json({strict: true}));				// Parse body as JSON
router.use(middleware.checkProps(requiredProps));			// Make sure we have required properties
router.use(inventory.checkInventory);						// Get template(s) (deploy) or services (undeploy)
router.use(middleware.checkLocation);						// Check location and get location information
router.use(middleware.expandTemplates);						// Expand any blueprint templates


/* Accept an incoming event */
router.post('/', function(req, res, next) {
	let response = {requestId: req.dcaeReqId, deploymentIds:[]};
	
	if (req.body.dcae_service_action === 'deploy') {
		
		/* Deploy services for the VNF */
		
		/* req.dcae_blueprints has been populated by the expandTemplates middleware */
		logger.info(req.dcaeReqId + " services to deploy: " + JSON.stringify(req.dcae_blueprints));
		logger.debug(JSON.stringify(req.dcae_shareables, null, '\t'));
		logger.debug(JSON.stringify(req.dcae_locations, null, '\t'));
		
		/* Create a deployer function and use it for each of the services */
		let deployer = services.createDeployer(req);
		let outputs = req.dcae_blueprints.map(deployer);
		response.deploymentIds = req.dcae_blueprints.map(function(s) {return s.deploymentId;});
	}
	else {
		
		/* Undeploy services for the VNF */
		
		/* req.dcae_services has been populated by the checkInventory middleware */	
		logger.info(req.dcaeReqId + " deployments to undeploy: " + JSON.stringify(req.dcae_services));
		
		/* Create an undeployer function and use it for each of the services */
		let undeployer = services.createUndeployer(req);
		req.dcae_services.forEach(undeployer);
		response.deploymentIds = req.dcae_services.map(function(s) {return s.deploymentId;});
	}
	res.status(202).json(response);
	logAccess(req, 202);
});

module.exports = router;