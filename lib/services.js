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

/* Deploying and undeploying services based on incoming events */

"use strict";

const ejs = require('ejs');
const deploy = require('./deploy');
const inventory = require('./inventory');
const config = process.mainModule.exports.config;

/* Set up logging */
var logger = config.logSource.getLogger("services");

/* Create a deployer function that can deploy a service from a
 * blueprint template in the context of the event request 'req'.
 * 'template' is a template object (with 'type' and 'template') 
 * created by the checkInventory middleware
 */
exports.createDeployer = function(req) {
	
	return function(blueprint) {
		/* Generate a deploymentId */
		let deploymentId = blueprint.deploymentId;		

		/* Attempt the deployment */
		logger.info(req.dcaeReqId + " " + "Attempting to deploy deploymentId " + deploymentId);
		logger.debug(req.dcaeReqId + " deploymentId: " + deploymentId + " blueprint: " + blueprint.blueprint);
		
		deploy.deployBlueprint(deploymentId, blueprint.blueprint)
		.then(function(outputs) {
			logger.info(req.dcaeReqId + " Deployed deploymentId: " + deploymentId);
			logger.debug (req.dcaeReqId + " deploymentId: " + deploymentId + " outputs: " + JSON.stringify(outputs));
			return outputs;
		})
		.then(function(outputs) {
			/* Update the inventory */
			return inventory.addService(
					deploymentId, 
					blueprint.type, 
					req.body.dcae_target_name,
					req.body.dcae_target_type,
					req.body.dcae_service_location,
					outputs
			);		
		})
		.then(function(result) {
			logger.info(req.dcaeReqId + " Updated inventory for deploymentId: " + deploymentId);
		})
		.catch(function(err) {
			logger.error(req.dcaeReqId + " Failed to deploy deploymentId: " + deploymentId + " Error: " + JSON.stringify(err));
			//TODO try uninstall?
		});
	};	
};

/* Create an undeployer function that can undeploy 
 * a previously deployed service.
 */
exports.createUndeployer = function(req) {
	
	return function(deployment) {
		
		/* Undeploy */
		deploy.undeployDeployment(deployment.deploymentId)
		.then(function(result){
			logger.info(req.dcaeReqId + " Undeployed deploymentId: " + deployment.deploymentId);
			return result;
		})
		.then(function(result) {
			/* Delete the service from the inventory */
			/* When we create service we set service id = deployment id */
			return inventory.deleteService(deployment.deploymentId);
		})
		.then(function(result){
			logger.info(req.dcaeReqId + " Deleted service from inventory for deploymentId: " + deployment.deploymentId);
		})
		.catch(function(err){
			logger.error(req.dcaeReqId + " Error undeploying " + deployment.deploymentId + ": " + JSON.stringify(err));
		});
	};
	
};