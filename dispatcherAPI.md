# Dispatcher API


<a name="overview"></a>
## Overview
High-level API for deploying/deploying composed services using Cloudify Manager.


### Version information
*Version* : 2.0.0




<a name="paths"></a>
## Paths

<a name="get"></a>
### GET /

#### Description
Get API version information, links to API operations, and location data


#### Responses

|HTTP Code|Description|Schema|
|---|---|---|
|**200**|Success|[DispatcherInfo](#dispatcherinfo)|

<a name="dispatcherinfo"></a>
**DispatcherInfo**

|Name|Description|Schema|
|---|---|---|
|**apiVersion**  <br>*optional*|version of API supported by this server|string|
|**links**  <br>*optional*|Links to API resources|[links](#get-links)|
|**locations**  <br>*optional*|Information about DCAE locations known to this dispatcher|object|
|**serverVersion**  <br>*optional*|version of software running on this server|string|

<a name="get-links"></a>
**links**

|Name|Description|Schema|
|---|---|---|
|**dcaeServiceInstances**  <br>*optional*|root of DCAE service instance resource tree|string|
|**status**  <br>*optional*|link to server status information|string|


<a name="events-post"></a>
### POST /events

#### Description
Signal an event that triggers deployment or undeployment of a DCAE service


#### Parameters

|Type|Name|Description|Schema|Default|
|---|---|---|---|---|
|**Body**|**dcae_event**  <br>*required*||[DCAEEvent](#dcaeevent)||


#### Responses

|HTTP Code|Description|Schema|
|---|---|---|
|**202**|Success:  The content that was posted is valid, the dispatcher has<br>  found the needed blueprint (for a deploy operation) or the existing deployment<br>  (for an undeploy operation), and is initiating the necessary orchestration steps.|[DCAEEventResponse](#dcaeeventresponse)|
|**400**|Bad request: See the message in the response for details.|[DCAEErrorResponse](#dcaeerrorresponse)|
|**415**|Bad request: The Content-Type header does not indicate that the content is<br>'application/json'|[DCAEErrorResponse](#dcaeerrorresponse)|
|**500**|Problem on the server side, possible with downstream systems.  See the message<br>in the response for more details.|[DCAEErrorResponse](#dcaeerrorresponse)|


#### Consumes

* `application/json`


#### Produces

* `application/json`




<a name="definitions"></a>
## Definitions

<a name="dcaeerrorresponse"></a>
### DCAEErrorResponse
Object reporting an error.


|Name|Description|Schema|
|---|---|---|
|**message**  <br>*optional*|Human-readable description of the reason for the error|string|
|**status**  <br>*required*|HTTP status code for the response|integer|


<a name="dcaeevent"></a>
### DCAEEvent
Data describing an event that should trigger a deploy or undeploy operation for one 
or more DCAE services.


|Name|Description|Schema|
|---|---|---|
|**aai_additional_info**  <br>*optional*|Additional information, not carried in the event, obtained from an A&AI query or set of queries.  Data in this object is available for populating deployment-specific values in the blueprint.|object|
|**dcae_service_action**  <br>*required*|Indicates whether the event requires a  DCAE service to be deployed or undeployed.<br>Valid values are 'deploy' and 'undeploy'.|string|
|**dcae_service_location**  <br>*required*|The location at which the DCAE service is to be deployed or from which it is to be<br>undeployed.|string|
|**dcae_service_type**  <br>*optional*|Identifier for the service of which the target entity is a part.|string|
|**dcae_target_name**  <br>*required*|The name of the entity that's the target for monitoring by a DCAE service.  This uniquely identifies the monitoring target.   For 'undeploy' operations, this value will be used to select the specific DCAE service instance to be undeployed.|string|
|**dcae_target_type**  <br>*required*|The type of the entity that's the target for monitoring by a DCAE service.  In 1607, this field will have one of eight distinct values, based on which mobility VM is to<br>  be monitored.  For 'deploy' operations, this value will be used to select the<br>  service blueprint to deploy.|string|
|**event**  <br>*required*|The original A&AI event object.  <br>The data included here is available for populating deployment-specific values in the<br>service blueprint.|object|


<a name="dcaeeventresponse"></a>
### DCAEEventResponse
Response body for a POST to /events.


|Name|Description|Schema|
|---|---|---|
|**deploymentIds**  <br>*required*|An array of deploymentIds, one for each service being deployed in response to this<br>event.  A deploymentId uniquely identifies an attempt to deploy a service.|< string > array|
|**requestId**  <br>*required*|A unique identifier assigned to the request.  Useful for tracing a request through<br>logs.|string|





