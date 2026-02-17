let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);

let rosbridge = rosbridgeModule.rosbridge;

export async function exportMissionsToFile(missions, exportAsGps = false, gpsExportService = "") {
	const missionNames = Object.keys(missions);

	if (missionNames.length === 0) {
		throw Error("No saved missions to export");
	}

	let exportData = {
		version: "1.0",
		export_type: "missions",
		coordinate_system: exportAsGps ? "gps" : "cartesian",
		date: new Date().toISOString(),
		missions: {},
		mission_count: missionNames.length
	};

	if (exportAsGps) {
		console.log("Converting coordinates to GPS...");

		const toLLService = new ROSLIB.Service({
			ros: rosbridge.ros,
			name: gpsExportService,
			serviceType: "robot_localization/srv/ToLL"
		});

		try {
			for (const missionName of missionNames) {
				const mission = missions[missionName];
				const convertedMission = { ...mission };

				convertedMission.waypoints = await convertWaypointsToGps(mission.waypoints, toLLService);
				exportData.missions[missionName] = convertedMission;
			}
		} catch (error) {
			console.error("Error converting to GPS coordinates:", error);
			throw Error(`Failed to convert coordinates: ${error.message}`);
		}
	} else {
		exportData.missions = missions;
	}

	const jsonString = JSON.stringify(exportData, null, 2);
	const blob = new Blob([jsonString], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const downloadLink = document.createElement('a');
	downloadLink.href = url;
	downloadLink.download = `waypoint_missions_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
	document.body.appendChild(downloadLink);
	downloadLink.click();
	document.body.removeChild(downloadLink);
	URL.revokeObjectURL(url);

	const coordTypeText = exportAsGps ? "GPS" : "cartesian";
	console.log(`Exported ${missionNames.length} missions successfully as ${coordTypeText} coordinates`);
}

export async function importMissionsFromFile(file, existingMissions = {}, importAsGps = false, gpsImportService = "") {
	const text = await file.text();
	const data = JSON.parse(text);

	// Check if this is a missions export file
	if (data.export_type !== "missions" || !data.missions) {
		throw new Error("Invalid file format: not a missions export file");
	}

	if (importAsGps && data.coordinate_system !== "gps") {
		throw Error("File contains non-GPS coordinates but 'importAsGps' is set to true.");
	}
	if (!importAsGps && data.coordinate_system === "gps") {
		throw Error("File contains GPS coordinates but 'importAsGps' is set to false.");
	}

	const importedMissions = data.missions;
	const importedNames = Object.keys(importedMissions);

	if (importedNames.length === 0) {
		throw Error("No missions found in the file");
	}

	const existingNames = Object.keys(existingMissions);

	// Check for name conflicts
	const conflicts = importedNames.filter(name => existingNames.includes(name));

	if (conflicts.length > 0) {
		const overwrite = await confirm(
			`The following missions already exist and will be overwritten:\n${conflicts.join(', ')}\n\nDo you want to continue?`
		);
		if (!overwrite) {
			throw Error("Import cancelled by user");
		}
	}

	let convertedMissions = { ...importedMissions };

	if (importAsGps) {
		console.log("Converting GPS coordinates to map coordinates...");

		const fromLLArrayService = new ROSLIB.Service({
			ros: rosbridge.ros,
			name: gpsImportService,
			serviceType: "robot_localization/srv/FromLLArray"
		});

		try {
			for (const missionName of importedNames) {
				const mission = importedMissions[missionName];
				const convertedMission = { ...mission };

				convertedMission.waypoints = await convertGpsToWaypoints(mission.waypoints, fromLLArrayService);
				convertedMissions[missionName] = convertedMission;
			}
		} catch (error) {
			throw Error(`Failed to convert GPS coordinates: ${error.message}`);
		}
	}

	// Merge missions
	const mergedMissions = { ...existingMissions, ...convertedMissions };
	console.log(`Imported ${importedNames.length} missions successfully with ${importAsGps ? "GPS" : "cartesian"} coordinates (${conflicts.length} overwritten)`);

	return mergedMissions;
}

async function convertWaypointsToGps(waypoints, toLLService) {
	const gpsWaypoints = [];

	for (const waypoint of waypoints) {
		const request = new ROSLIB.ServiceRequest({
			map_point: {
				x: waypoint.x,
				y: waypoint.y,
				z: waypoint.z
			}
		});

		const result = await new Promise((resolve, reject) => {
			toLLService.callService(request, resolve, reject);
		});

		gpsWaypoints.push({
			index: waypoint.index,
			latitude: result.ll_point.latitude,
			longitude: result.ll_point.longitude,
			altitude: result.ll_point.altitude
		});
	}

	return gpsWaypoints;
}

async function convertGpsToWaypoints(gpsWaypoints, fromLLArrayService) {
	const gpsPoints = gpsWaypoints.map(waypoint => ({
		latitude: waypoint.latitude,
		longitude: waypoint.longitude,
		altitude: waypoint.altitude
	}));

	const request = new ROSLIB.ServiceRequest({
		ll_points: gpsPoints
	});

	const result = await new Promise((resolve, reject) => {
		fromLLArrayService.callService(request, resolve, reject);
	});

	// Convert result back to waypoint format
	const mapWaypoints = result.map_points.map((mapPoint, index) => ({
		index: index,
		x: mapPoint.x,
		y: mapPoint.y,
		z: mapPoint.z
	}));

	return mapWaypoints;
}