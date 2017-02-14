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
 
 /* Routines related to accessing DCAE inventory */
 
 "use strict";
 
 const req = require('./promise_request');
 
 const INV_SERV_TYPES = '/dcae-service-types';
 const INV_SERVICES = '/dcae-services';
 
 const config = process.mainModule.exports.config;

 /*
  * Common error handling for inventory API calls
  */ 
 const invError = function(err) {
		if (err.status && err.status === 404) {
			/* Map 404 to an empty list */
			return [];
		}
		else {
			var newErr = new Error("Error response " + err.status + " from DCAE inventory: " + err.body);
			newErr.status = 502;
			newErr.code = 502;
			throw newErr;
		}
	 
 };
 
 /*
	 * Query the inventory for all of the blueprint templates that need to be
	 * deployed for a given target type. Returns a promise for an array of
	 * objects, each object having: - type: the service type name associated
	 * with the blueprint template - template: the blueprint template
	 */
 const findTemplates = function(targetType, location, serviceId) {
	 
	 /* Set up query string based on available parameters */
	 var qs = {vnfType: targetType, serviceLocation: location };
	 if (serviceId) {
		 qs.serviceId = serviceId;
	 }
	
	 const reqOptions = {
		method : "GET",
		uri : config.inventory.url + INV_SERV_TYPES,
		qs: qs
	};
	return req.doRequest(reqOptions)
	.then(function(result) {
		let templates = [];
		let content = JSON.parse(result.body);
		if (content.items) {
			/* Pick out the fields we want */
			templates = content.items.map(function(i) {return {type: i.typeName, template: i.blueprintTemplate};});
		}
		return templates;		
	})
	.catch (invError);	 
 };
 
 /*
	 * Query the inventory for all of the services running for a given target
	 * name. Returns a promise for an array of objects, each object having: -
	 * type: the service type name associated with the service - deploymentID:
	 * the deploymentID for the service
	 */
 const findServices = function(target_name) {
	 const reqOptions = {
		method : "GET",
		uri : config.inventory.url + INV_SERVICES,
		qs: {vnfId: target_name}
	};
	return req.doRequest(reqOptions)
	.then(function(result) {
		let services = [];
		let content = JSON.parse(result.body);
		if(content.items) {
			/* Pick out the fields we want */
			services = content.items.map(function(i) { return {type: i.typeLink.title, deploymentId: i.deploymentRef};});					
		}
		return services;
	})
	.catch(invError); 
 };
 
 /*
	 * Find shareable components at 'location'. Return an object whose keys are
	 * component type names and whose values are component identifiers for
	 * components of the type. NOTE: if there are multiple shareable components
	 * with the same component type, the last one wins.
	 */
 const findShareables = function(location) {
	 const reqOptions = {
		method : "GET",
		uri : config.inventory.url + INV_SERVICES,
		qs: {vnfLocation: location}
	};	
	return req.doRequest(reqOptions)
	.then(function(result) {
		let shareables = {};
		let content = JSON.parse(result.body);
		if (content.items) {
			content.items.forEach(function(s) {
				s.components.filter(function(c) {return c.shareable === 1;})
			    .forEach(function(c){
			    	shareables[c.componentType] = c.componentId;
			    });		          
			});	
		}	
		return shareables;
	})
	.catch(invError); 
 };
 
 
 /*
	 * Middleware-style function to check inventory. For 'deploy' operations,
	 * finds blueprint templates and shareable components Attaches list of
	 * templates to req.dcae_templates, object with shareable components to
	 * req.dcae_shareables. For 'undeploy' operations, finds deployed services.
	 * Attaches list of deployed services to req.dcae_services.
	 */
 exports.checkInventory = function(req, res, next) {
	 if (req.body.dcae_service_action.toLowerCase() === 'deploy'){
		 findTemplates(req.body.dcae_target_type, req.body.dcae_service_location, req.body.dcae_service_type)
		 .then(function (templates) {
			 if (templates.length > 0) {
				 req.dcae_templates = templates;
				 return templates;
			 }
			 else {
				 var paramList = [req.body.dcae_target_type, req.body.dcae_service_location, req.body.dcae_service_type ? req.body.dcae_service_type : "unspecified"].join('/');
				 let err = new Error(paramList + ' has no associated DCAE service types');
				 err.status = 400;
				 next(err);
			 }
		 })
		 .then(function(result) {
			 return findShareables(req.body.dcae_service_location);
		 })
		 .then(function(shareables) {
			 req.dcae_shareables = shareables;
			 next();
		 })
		 .catch(function(err) {
			 next(err);
		 });
	 }
	 else if (req.body.dcae_service_action.toLowerCase() === 'undeploy') {
		 findServices(req.body.dcae_target_name)
		 .then(function (services){
			 if (services.length > 0) {
				 req.dcae_services = services;
				 next();
			 }
			 else {
				 let err = new Error('"' + req.body.dcae_target_name + '" has no deployed DCAE services');
				 err.status = 400;
				 next(err);
			 }
		 })
		 .catch(function(err) {
			 next(err);
		 });
	 }
	 else {
		 let err = new Error ('"' + req.body.dcae_service_action + '" is not a valid service action. Valid actions: "deploy", "undeploy"');
		 err.status = 400;
		 next(err);
	 }
 };
 
/*
 * Add a DCAE service to the inventory. Done after a deployment.
 */
 exports.addService = function(deploymentId, serviceType, vnfId, vnfType, vnfLocation, outputs) {
	 
	 /* Create the service description */
	 let serviceDescription =
		 {
			 "typeName" : serviceType,
			 "vnfId" : vnfId,
			 "vnfType" : vnfType,
			 "vnfLocation" : vnfLocation,
			 "deploymentRef" : deploymentId
		 };
	 
	 // TODO create 'components' array using 'outputs'--for now, a dummy
	 serviceDescription.components = [
	     {
	    	 componentType: "dummy_component", 
	    	 componentId: "/components/dummy",
	    	 componentSource: "DCAEController",
	    	 shareable: 0   	 
	      }
	  ];

	 const reqOptions = {
		method : "PUT",
		uri : config.inventory.url + INV_SERVICES + "/" + deploymentId,
		json: serviceDescription	
	};
	 
	return req.doRequest(reqOptions);
 };
 
/*
 * Remove a DCAE service from the inventory. Done after an undeployment.
 */
 exports.deleteService = function(serviceId) {
	 return req.doRequest({method: "DELETE", uri: config.inventory.url + INV_SERVICES + "/" + serviceId});
 };
 