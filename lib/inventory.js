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
 const createError = require('./dispatcher-error').createDispatcherError;
 
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
			var newErr;
			var message;
			if (err.status) {
				/* Got a response from inventory indicating an error */
				message = "Error response " + err.status + " from DCAE inventory: " + err.body;
				newErr = createError(message, 502, "api", 501, "dcae-inventory");
			}
			else {
				/* Problem connecting to inventory */
				message = "Error communicating with inventory: " + err.message;
				newErr = createError(message, 504, "system", 201, "dcae-inventory");
			}		
			throw newErr;
		} 
 };
 
 /*
	 * Query the inventory for all of the blueprint templates that need to be
	 * deployed for a given target type. Returns a promise for an array of
	 * objects, each object having: - type: the service type name associated
	 * with the blueprint template - template: the blueprint template
	 */
 const findTemplates = function(targetType, location, serviceId, asdcServiceId, asdcResourceId) {
	 
	 /* Set up query string based on available parameters */
	 var qs = {serviceLocation: location, onlyActive: true, onlyLatest: true};
	 
	 if (serviceId) {
		 qs.serviceId = serviceId;
	 }
	 
	 if (asdcResourceId) {
		 qs.asdcResourceId = asdcResourceId;
	 }
	 
	 if (asdcServiceId){
		 qs.asdcServiceId = asdcServiceId;
	 }
	 
	 /* We'll set vnfType in the query except when both asdcServiceId and asdcResourceId are populated */
	 if (!(asdcResourceId && asdcServiceId)) {
		 qs.vnfType = targetType;	 
	 }
	
	 /* Make the request to inventory */
	 const reqOptions = {
			 method : "GET",
			 uri : config.inventory.url + INV_SERV_TYPES,
			 qs: qs
	 };
	 return req.doRequest(reqOptions)
	 .then(function(result) {
		 var templates = [];
		 var content = JSON.parse(result.body);
		 if (content.items) {
			 /* Pick out the fields we want */
			 templates = content.items.map(function(i) {return {type: i.typeId, template: i.blueprintTemplate};});
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
		var services = [];
		var content = JSON.parse(result.body);
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
		var shareables = {};
		var content = JSON.parse(result.body);
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
  * Middleware-style function to check inventory.
  *  
  * For 'deploy' operations:
  *   - finds blueprint templates and shareable components 
  *   - attaches list of templates to req.dcae_templates 
  *   - attaches object with shareable components to req.dcae_shareables
  *   
  * For 'undeploy' operations:
  *   - finds deployed services
  *   - attaches list of deployed services to req.dcae_services
  */
 exports.checkInventory = function(req, res, next) {
	 if (req.body.dcae_service_action.toLowerCase() === 'deploy') {
		 findTemplates(
				 req.body.dcae_target_type,
				 req.body.dcae_service_location,
				 req.body.dcae_service_type,
				 req.body['dcae_service-instance_persona-model-id'],
				 req.body['dcae_generic-vnf_persona-model-id']
		 )
		 .then(function (templates) {
			 if (templates.length > 0) {
				 req.dcae_templates = templates;
				 return templates;
			 }
			 else {
				 var paramList = [
				     req.body.dcae_target_type, 
				     req.body.dcae_service_location, 
				     req.body.dcae_service_type || "unspecified",
				     req.body['dcae_service-instance_persona-model-id'] || "unspecified",
					 req.body['dcae_generic-vnf_persona-model-id'] || "unspecified"
				  ].join('/');
				 var err0 = new Error(paramList + ' has no associated DCAE service types');
				 err0.status = 400;
				 next(err0);
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
				 var err1 = new Error('"' + req.body.dcae_target_name + '" has no deployed DCAE services');
				 err1.status = 400;
				 next(err1);
			 }
		 })
		 .catch(function(err) {
			 next(err);
		 });
	 }
	 else {
		 var err2 = new Error ('"' + req.body.dcae_service_action + '" is not a valid service action. Valid actions: "deploy", "undeploy"');
		 err2.status = 400;
		 next(err2);
	 }
 };
 
/*
 * Add a DCAE service to the inventory. Done after a deployment.
 */
 exports.addService = function(deploymentId, serviceType, vnfId, vnfType, vnfLocation, outputs) {
	 
	 /* Create the service description */
	 var serviceDescription =
		 {
			 "vnfId" : vnfId,
			 "vnfType" : vnfType,
			 "vnfLocation" : vnfLocation,
			 "typeId" : serviceType,
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
 
 /*
  * Find running/deploying instances of services (with a given type name, if specified)
  */
 
 exports.getServicesByType = function(query) {
	 var options = {
			 method: 'GET',
			 uri: config.inventory.url + INV_SERVICES,
			 qs: query || {}
	 };
	 
	 return req.doRequest(options)
	 .then (function (result) {
		 var services = [];
		 var content = JSON.parse(result.body);
		 if(content.items) {
			 /* Pick out the fields we want */
			 services = content.items.map(function(i) { return { deploymentId: i.deploymentRef, serviceTypeId: i.typeId};});					
		 }
			return services;
	 })
	 .catch(invError);	 
 };
 
 /*
  * Find a blueprint given the service type ID -- return blueprint and type ID
  */
 exports.getBlueprintByType = function(serviceTypeId) {
	 return req.doRequest({
		 method: "GET",
		 uri: config.inventory.url + INV_SERV_TYPES + '/' + serviceTypeId
     })
     .then (function(result) {
		 var blueprintInfo = {};
		 var content = JSON.parse(result.body);
		 blueprintInfo.blueprint = content.blueprintTemplate;
		 blueprintInfo.typeId = content.typeId;
		 
		 return blueprintInfo;	
     })
     .catch(invError);
 };
 
 /*
  * Verify that the specified deployment ID does not already have 
  * an entry in inventory.   This is needed to enforce the rule that
  * creating a second instance of a deployment under the
  * same ID as an existing deployment is not permitted.
  * The function checks for a service in inventory using the
  * deployment ID as service name.  If it doesn't exist, the function
  * resolves its promise.  If it *does* exist, then it throws an error.
  */
 exports.verifyUniqueDeploymentId = function(deploymentId) {	
	 
	 return req.doRequest({
		 method: "GET",
		 uri: config.inventory.url + INV_SERVICES + "/" + deploymentId
	 })
	 
	 /* Successful lookup -- the deployment exists, so throw an error */
	 .then(function(res) {
		 throw createError("Deployment " + deploymentId + " already exists", 409, "api", 501);	 
	 },
	 
	 /* Error from the lookup -- either deployment ID doesn't exist or some other problem */
	 function (err) {
		 
		 /* Inventory returns a 404 if it does not find the deployment ID */
		 if (err.status && err.status === 404) {
			 return true;		 
		 }
		 
		 /* Some other error -- it really is an error and we can't continue */
		 else {
			 return invError(err);
		 }	 
	 });
 }
