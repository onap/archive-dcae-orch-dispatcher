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

// Utility functions

var fs = require('fs');
var rimraf = require('rimraf');
var uuid = require('node-uuid');

// Create a directory (named 'dirName') and write 'content' into a file (named 'fileName') in that directory.
exports.makeDirAndFile =  function(dirName, fileName, content){

	return new Promise(function(resolve, reject){
		fs.mkdir(dirName, function(err) {
			if (err) {
				reject(err);
			}
			else {
				fs.writeFile(dirName + "/" + fileName, content, function(err, fd) {
					if (err) {
						reject(err);
					}
					else {
						resolve();						
					}
					
				});
			}
		});
		
	});	
};

// Remove directory and its contents
exports.removeDir = function(dirName) {
	return new Promise(function(resolve, reject){
		rimraf(dirName, function(err) {
			if (err) {
				reject(err);
			}
			else {
				resolve();
			}
		});
	});
};

/* Does object 'o' have property 'key' */
exports.hasProperty = function(o, key) {
	return key.split('.').every(function(e){
		if (typeof(o) === 'object' && o !== null && (e in o) &&  (typeof o[e] !== 'undefined')) {
			o = o[e];
			return true;
		}	
		else {
			return false;
		} 
	});
};

/* Generate a random ID string */
exports.generateId = function() {
	return uuid.v4();	
};
