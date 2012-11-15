/*jslint maxerr: 50, indent: 4, nomen: true */
/*global print, _, moment, db, ObjectId */
/*!
 * mesh - the MongoDB Extended Shell
 * 
 *      Version: 1.3.0
 *         Date: November 13, 2012
 *      Project: http://skratchdot.com/projects/mesh/
 *  Source Code: https://github.com/skratchdot/mesh/
 *       Issues: https://github.com/skratchdot/mesh/issues/
 * Dependencies: MongoDB v1.8+
 * 
 * Copyright 2012 <skratchdot.com>
 *   Dual licensed under the MIT or GPL Version 2 licenses.
 *   https://raw.github.com/skratchdot/mesh/master/LICENSE-MIT.txt
 *   https://raw.github.com/skratchdot/mesh/master/LICENSE-GPL.txt
 * 
 * Includes:
 * 
 *   underscore.js - http://underscorejs.org
 *     Copyright (c) 2009-2012 Jeremy Ashkenas, DocumentCloud
 * 
 *   underscore.string.js - http://epeli.github.com/underscore.string/
 *     Copyright (c) 2011 Esa-Matti Suuronen esa-matti@suuronen.org
 * 
 *   moment.js - http://momentjs.com
 *     Copyright (c) 2011-2012 Tim Wood
 * 
 *   science.js - https://github.com/jasondavies/science.js
 *     Copyright (c) 2011, Jason Davies
 * 
 */
var mesh = mesh || (function (global) {
	'use strict';

	var api,
		lastTime = null,
		config = {
			defaultPrompt : 0,	// 0-4 or a string
			globalTid : null,	// null or any string. passing in 't' will make t() work
			globalOid : null	// null or any string. passing in 'o' will make o() work
		};

	/*
	 * This is the "mesh" function. If someone types: mesh(), then we will just
	 * print the current version info.
	 */
	api = function () {
		return api.version();
	};

	/*
	 * Override mesh.toString() so it calls mesh.help();
	 */
	api.toString = function () {
		api.help();
		return "";
	};

	/*
	 * We can override the default settings by calling this function.
	 * 
	 * The idea is to keep a "mesh.config.js" file that calls this function.
	 * 
	 * When updating mesh.js, we will never override mesh.config.js
	 */
	api.config = function (settings) {
		// Handle defaultPrompt
		if (settings.hasOwnProperty('defaultPrompt')) {
			config.defaultPrompt = settings.defaultPrompt;
			api.prompt(config.defaultPrompt);
		}
		// Handle globalTid override
		if (settings.hasOwnProperty('globalTid') && typeof settings.globalTid === 'string') {
			global[settings.globalTid] = api.tid;
		}
		// Handle globalOid override
		if (settings.hasOwnProperty('globalOid') && typeof settings.globalOid === 'string') {
			global[settings.globalOid] = api.oid;
		}
	};

	/*
	 * Print the current version
	 */
	api.version = function () {
		return print('mesh (the MongoDB Extended Shell) version: 1.3.0');
	};

	/*
	 * Print help information.
	 * 
	 * TODO: make sure that "help mesh" works as well by overriding default mongo help()
	 */
	api.help = function () {
		api.version();
		print('help coming soon!');
	};

	/*
	 * Sets the default prompt.
	 * 
	 * See: http://www.kchodorow.com/blog/2011/06/27/ps1/
	 * 
	 * newPrompt can be a function, or a number:
	 * 
	 *   0: '>' reset to default prompt
	 *   1: 'dbname>'
	 *   2: 'dbname>' for PRIMARY, '(dbname)>' for SECONDARY
	 *   3: 'host:dbname>'
	 *   4: '[YYYY-MM-DD hh:mm:ss] host:dbname>'
	 */
	api.prompt = function (newPrompt) {
		var base = '> ';
		if (typeof newPrompt === 'function') {
			global.prompt = newPrompt;
		} else if (newPrompt === 1) {
			global.prompt = function () {
				return db.getName() + base;
			};
		} else if (newPrompt === 2) {
			global.prompt = function () {
				var isMaster = db.isMaster().ismaster;
				return (isMaster ? '' : '(') +
					db.getName() +
					(isMaster ? '' : ')') +
					base;
			};
		} else if (newPrompt === 3) {
			global.prompt = function () {
				var isMaster = db.isMaster().ismaster;
				return (isMaster ? '' : '(') +
					hostname() + ":" +
					db.getName() +
					(isMaster ? '' : ')') +
					base;
			};
		} else if (newPrompt === 4) {
			global.prompt = function () {
				var isMaster = db.isMaster().ismaster;
				return '[' + moment().format('YYYY-MM-DD hh:mm:ss') + '] ' +
					(isMaster ? '' : '(') +
					db.serverStatus().host + ":" +
					db.getName() +
					(isMaster ? '' : ')') +
					base;
			};
		} else if (typeof newPrompt === 'string') {
			global.prompt = function () {
				return newPrompt;
			};
		} else {
			delete global.prompt;
		}
	};

	/*
	 * A simple wrapper for ObjectId();
	 */
	api.oid = function (oidString) {
		if (typeof oidString === 'string') {
			return new ObjectId(oidString);
		}
		return new ObjectId();
	};

	/*
	 * Generate an ObjectId() based on a time stamp.
	 *
	 * usage:
	 *
	 *		 // pass in nothing to get an ObjectId based on the current timestamp
	 *		 mesh.tid();
	 *		 // you can pass in any valid Date object
	 *		 mesh.tid(new Date());
	 *		 // you can pass in any valid moment object
	 *		 mesh.tid(moment());
	 *		 mesh.tid('2 minutes ago');
	 *
	 * see:
	 *
	 *		 http://www.kchodorow.com/blog/2011/12/20/querying-for-timestamps-using-objectids/
	 *		 http://www.mongodb.org/display/DOCS/Object+IDs
	 *
	 * ObjectIds are 12-byte BSON objects:
	 *
	 * TimeStamp [bytes 0-3]:
	 *		 This is a unix style timestamp. It is a signed int representing
	 *		 the number of seconds before or after January 1st 1970 (UTC).
	 *
	 * Machine [bytes 4-6]
	 *		 This is the first three bytes of the (md5) hash of the machine host
	 *		 name, or of the mac/network address, or the virtual machine id.
	 *
	 * Pid [bytes 7-8]
	 *		 This is 2 bytes of the process id (or thread id) of the process
	 *		 generating the ObjectId.
	 *
	 * Increment [bytes 9-11]
	 *		 This is an ever incrementing value starting with a random number.
	 */
	api.tid = function (newMoment) {
		var theDate, seconds, hexSecs;
		newMoment = moment(newMoment);
		if (newMoment && newMoment.hasOwnProperty('isValid') && newMoment.isValid()) {
			theDate = newMoment.toDate();
		} else {
			theDate = new Date();
		}
		seconds = parseInt(theDate.getTime() / 1000, 10);
		hexSecs = seconds.toString(16);
		return new ObjectId(hexSecs + '0000000000000000');
	};

	/*
	 * Returns a sorted array of all the keys in an object
	 */
	api.keys = function (obj) {
		return _.keys(obj || global).sort();
	};

	/*
	 * If passed a function, it will display the function execution time.
	 * 
	 * If passed anything else, it will just print the current time.
	 * 
	 * This function keeps track of the last time it was called, and will output
	 * how long it's been since the last time it was called.
	 */
	api.time = function (obj) {
		var start = moment(),
			formatString = 'YYYY-MM-DD hh:mm:ss a';

		// Current Time
		print('Current Time: ' + start.format(formatString));

		// Last time called
		if (lastTime !== null) {
			print('Last time called ' + lastTime.fromNow() + ' [' + start.format(formatString) + ']');
		}

		// Execute function if one is passed
		if (typeof obj === 'function') {
			print('Executing function...');
			obj.apply();
			print(' Started ' + start.fromNow());
			print('Finished: ' + moment().format(formatString));
		}

		// Save last time
		lastTime = start;
	};

	return api;
}(this));