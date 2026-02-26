let viewModule = await import(`${base_url}/js/modules/view.js`);
let tfModule = await import(`${base_url}/js/modules/tf.js`);
let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let missionUtils = await import(`${base_url}/js/modules/mission_utils.js`);
let drawWaypointsModule = await import(`${base_url}/js/modules/draw_waypoints.js`);

let view = viewModule.view;
let tf = tfModule.tf;
let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let Status = StatusModule.Status;

let topic = getTopic("{uniqueID}");
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let typedict = {};
let fixed_frame = tf.fixed_frame;
let base_link_frame = find_base_frame();
let mode = "IDLE";
let points = [];
let shift_pressed = false;

let gpsExportServiceDict = {};
let gpsImportServiceDict = {};
let selectedGpsExportService = "";
let selectedGpsImportService = "";

const icon_bar = document.getElementById("icon_bar");
const icon = document.getElementById("{uniqueID}_icon");
const dropdown = document.getElementById("{uniqueID}_dropdown");

const buttontext = document.getElementById("{uniqueID}_buttontext");
const margin = document.getElementById("{uniqueID}_margin");
const startCheckbox = document.getElementById('{uniqueID}_startclosest');

const flipButton = document.getElementById("{uniqueID}_flip");
const zSetButton = document.getElementById("{uniqueID}_z_set");
const deleteButton = document.getElementById("{uniqueID}_delete");

const exportButton = document.getElementById("{uniqueID}_export");
const importButton = document.getElementById("{uniqueID}_import");
const importInput = document.getElementById("{uniqueID}_import_input");
const useGpsCoordinatesCheckbox = document.getElementById("{uniqueID}_use_gps_coordinates");
const gpsServiceContainer = document.getElementById("{uniqueID}_gps_service_container");
const gpsExportServiceBox = document.getElementById("{uniqueID}_gps_export_service");
const gpsImportServiceBox = document.getElementById("{uniqueID}_gps_import_service");

const missionSelect = document.getElementById("{uniqueID}_mission_select");
const missionNameInput = document.getElementById("{uniqueID}_mission_name");
const saveMissionButton = document.getElementById("{uniqueID}_save_mission");
const loadMissionButton = document.getElementById("{uniqueID}_load_mission");
const deleteMissionButton = document.getElementById("{uniqueID}_delete_mission");

const recordMaxThresholdInput = document.getElementById("{uniqueID}_record_position_max_threshold");
const recordMinThresholdInput = document.getElementById("{uniqueID}_record_position_min_threshold");
const recordAngleThresholdInput = document.getElementById("{uniqueID}_record_angle_threshold");

let isRecording = false;
let recordMaxThreshold = 5.0;
let recordMinThreshold = 0.5;
let recordAngleThreshold = 0.52; // ~30 degrees in radians
let recordingTimer = null;

flipButton.addEventListener('click', () => {
	points.reverse();
	drawWaypoints();
	saveSettings();
});

zSetButton.addEventListener('click', async () => {
	let zval = await prompt("Set the height of all points to this value:", "0");
	if (zval != null) {
		const newz = parseFloat(zval);
		for (let i = 0; i < points.length; i++) {
			points[i].z = newz;
		}
	}
});

deleteButton.addEventListener('click', async () => {
	if (await confirm("Are you sure you want to delete all waypoints?")) {
		points = [];
		drawWaypoints();
		saveSettings();
	}
});

startCheckbox.addEventListener('change', () => {
	drawWaypoints();
	saveSettings();
});

exportButton.addEventListener('click', () => {
	try {
		missionUtils.exportMissionsToFile(getSavedMissions(), useGpsCoordinatesCheckbox.checked, selectedGpsExportService);
		status.setOK("Missions exported successfully");
	} catch (error) {
		status.setError(`Failed to export missions: ${error.message}`);
	}
});

importButton.addEventListener('click', () => {
	importInput.click();
});

importInput.addEventListener('change', async (event) => {
	const file = event.target.files[0];
	if (file) {
		try {
			const convertedMissions = await missionUtils.importMissionsFromFile(file, getSavedMissions(), useGpsCoordinatesCheckbox.checked, selectedGpsImportService);

			const missionKey = getMissionKey();
			settings[missionKey] = convertedMissions;
			settings.save();

			updateMissionSelect();

			status.setOK("Missions imported successfully");
		} catch (error) {
			status.setError(`Failed to import missions: ${error.message}`);
			importInput.value = '';
		}
	}
});

useGpsCoordinatesCheckbox.addEventListener('change', () => {
	if (useGpsCoordinatesCheckbox.checked) {
		gpsServiceContainer.style.display = 'block';
		loadGpsServices();
	} else {
		gpsServiceContainer.style.display = 'none';
	}
	saveSettings();
});

gpsExportServiceBox.addEventListener("change", (event) => {
	selectedGpsExportService = gpsExportServiceBox.value;
	saveSettings();
});

gpsImportServiceBox.addEventListener("change", (event) => {
	selectedGpsImportService = gpsImportServiceBox.value;
	saveSettings();
});

saveMissionButton.addEventListener('click', saveMission);
loadMissionButton.addEventListener('click', loadMission);
deleteMissionButton.addEventListener('click', deleteMission);

missionSelect.addEventListener('change', () => {
	const selectedMission = missionSelect.value;
	missionNameInput.value = selectedMission;
});

recordMaxThresholdInput.addEventListener('change', () => {
	recordMaxThreshold = parseFloat(recordMaxThresholdInput.value);
	saveSettings();
});

recordMinThresholdInput.addEventListener('change', () => {
	recordMinThreshold = parseFloat(recordMinThresholdInput.value);
	saveSettings();
});

recordAngleThresholdInput.addEventListener('change', () => {
	recordAngleThreshold = parseFloat(recordAngleThresholdInput.value) * (Math.PI / 180);
	saveSettings();
});

function drawWaypoints() {
	try{
		drawWaypointsModule.drawWaypoints(canvas, ctx, view, points, tf, fixed_frame, mode, margin.value, getStartIndex());
		status.setOK();
	} catch (error) {
		console.error("Error drawing waypoints:", error);
		status.setError(`Failed to draw waypoints: ${error.message}`);
	}
}

function pointToScreen(point) {
	return drawWaypointsModule.pointToScreen(point, view, tf, fixed_frame);
}

function screenToPoint(click) {
	return drawWaypointsModule.screenToPoint(click, view, tf, fixed_frame);
}

async function loadGpsServices() {
	try {
		console.log("Loading GPS coordinate services...");
		const toLLServices = await rosbridge.get_services("robot_localization/srv/ToLL");
		const fromLLArrayServices = await rosbridge.get_services("robot_localization/srv/FromLLArray");

		let exportServiceList = "";
		let importServiceList = "";

		// Add ToLL services (fallback for export)
		toLLServices.forEach(service => {
			exportServiceList += `<option value='${service}'>${service} (ToLL)</option>`;
			gpsExportServiceDict[service] = "robot_localization/srv/ToLL";
		});

		// Add FromLLArray services (preferred for import)
		fromLLArrayServices.forEach(service => {
			importServiceList += `<option value='${service}'>${service} (FromLLArray)</option>`;
			gpsImportServiceDict[service] = "robot_localization/srv/FromLLArray";
		});

		gpsExportServiceBox.innerHTML = exportServiceList;
		gpsImportServiceBox.innerHTML = importServiceList;

		if (exportServiceList === "") {
			console.log(`No ToLL services found, defaulting to ${selectedGpsExportService}`);
			gpsExportServiceBox.innerHTML = `<option value='${selectedGpsExportService}'>${selectedGpsExportService} (default)</option>`;
		}
		if (importServiceList === "") {
			console.log(`No FromLLArray services found, defaulting to ${selectedGpsImportService}`);
			gpsImportServiceBox.innerHTML = `<option value='${selectedGpsImportService}'>${selectedGpsImportService} (default)</option>`;
		}

		if (toLLServices.includes(selectedGpsExportService)) {
			gpsExportServiceBox.value = selectedGpsExportService;
		} else {
			selectedGpsExportService = gpsExportServiceBox.value;
		}

		if (fromLLArrayServices.includes(selectedGpsImportService)) {
			gpsImportServiceBox.value = selectedGpsImportService;
		} else {
			selectedGpsImportService = gpsImportServiceBox.value;
		}

	} catch (error) {
		console.error("Error loading GPS services:", error);
		status.setWarn("Failed to load GPS coordinate services");
	}
}

// Mission management

function getMissionKey() {
	return "{uniqueID}_missions";
}

function getSavedMissions() {
	const missionKey = getMissionKey();
	return settings[missionKey] || {};
}

function saveMission() {
	const missionName = missionNameInput.value.trim();
	if (!missionName) {
		status.setWarn("Please enter a mission name");
		return;
	}

	if (points.length === 0) {
		status.setWarn("No waypoints to save");
		return;
	}

	const missions = getSavedMissions();

	// Check if mission already exists
	if (missions[missionName]) {
		const overwrite = confirm(`Mission "${missionName}" already exists. Do you want to overwrite it?`);
		if (!overwrite) {
			status.setWarn("Save cancelled by user");
			return;
		}
	}

	const missionData = {
		name: missionName,
		date: new Date().toISOString(),
		fixed_frame: fixed_frame,
		base_link_frame: base_link_frame,
		waypoints: points.map((point, index) => ({
			index: index,
			x: point.x,
			y: point.y,
			z: point.z
		})),
		settings: {
			margin: margin.value,
			start_closest: startCheckbox.checked
		}
	};

	missions[missionName] = missionData;

	const missionKey = getMissionKey();
	settings[missionKey] = missions;
	settings.save();

	updateMissionSelect();
	missionSelect.value = missionName;
	status.setOK(`Mission "${missionName}" saved successfully`);
}

async function loadMission() {
	const selectedMission = missionSelect.value;
	if (!selectedMission) {
		status.setWarn("Please select a mission to load");
		return;
	}

	const missions = getSavedMissions();
	const missionData = missions[selectedMission];

	if (!missionData) {
		status.setError("Mission not found");
		return;
	}

	// Ask user if they want to replace existing waypoints
	if (points.length > 0) {
		const replace = await confirm(`Replace current waypoints with mission "${selectedMission}"?`);
		if (!replace) {
			return;
		}
	}

	// Load waypoints
	points = missionData.waypoints.map(wp => ({
		x: wp.x || 0,
		y: wp.y || 0,
		z: wp.z || 0
	}));

	// Load settings if available
	if (missionData.settings) {
		if (missionData.settings.margin !== undefined) {
			margin.value = missionData.settings.margin;
		}
		if (missionData.settings.start_closest !== undefined) {
			startCheckbox.checked = missionData.settings.start_closest;
		}
	}

	// Update frames if they exist in the mission and are available
	if (missionData.fixed_frame && tf.frame_list.has(missionData.fixed_frame)) {
		fixed_frame = missionData.fixed_frame;
		fixedFrameBox.value = fixed_frame;
	}

	if (missionData.base_link_frame && tf.frame_list.has(missionData.base_link_frame)) {
		base_link_frame = missionData.base_link_frame;
		baseLinkFrameBox.value = base_link_frame;
	}

	drawWaypoints();
	saveSettings();
	status.setOK(`Mission "${selectedMission}" loaded successfully (${points.length} waypoints)`);
}

async function deleteMission() {
	const selectedMission = missionSelect.value;
	if (!selectedMission) {
		status.setWarn("Please select a mission to delete");
		return;
	}

	const confirmDelete = await confirm(`Are you sure you want to delete mission "${selectedMission}"?`);
	if (!confirmDelete) {
		return;
	}

	const missions = getSavedMissions();
	delete missions[selectedMission];

	const missionKey = getMissionKey();
	settings[missionKey] = missions;
	settings.save();

	updateMissionSelect();
	missionNameInput.value = "";
	status.setOK(`Mission "${selectedMission}" deleted successfully`);
}

function updateMissionSelect() {
	const missions = getSavedMissions();
	const missionNames = Object.keys(missions).sort();

	let optionsHtml = '<option value="">-- Select Mission --</option>';
	missionNames.forEach(name => {
		const mission = missions[name];
		const waypointCount = mission.waypoints ? mission.waypoints.length : 0;
		const date = new Date(mission.date).toLocaleDateString();
		optionsHtml += `<option value="${name}">${name} (${waypointCount} points, ${date})</option>`;
	});

	missionSelect.innerHTML = optionsHtml;
}

// Initialize mission select
updateMissionSelect();

// Position recording

function startPositionRecording() {
	if (!base_link_frame || base_link_frame === "") {
		status.setWarn("Please select a robot frame first");
		return;
	}

	recordMaxThreshold = parseFloat(recordMaxThresholdInput.value);
	recordMinThreshold = parseFloat(recordMinThresholdInput.value);
	recordAngleThreshold = parseFloat(recordAngleThresholdInput.value) * (Math.PI / 180);

	isRecording = true;

	// Start recording loop at 10Hz
	recordingTimer = setInterval(() => {
		recordCurrentPosition();
	}, 100);

	status.setOK(`Started recording waypoints from ${base_link_frame} frame`);
}

function stopPositionRecording() {
	if (!isRecording) return;

	if (recordingTimer) {
		clearInterval(recordingTimer);
		recordingTimer = null;
	}

	isRecording = false;

	status.setOK("Stopped recording waypoints");
	saveSettings();
}

function recordCurrentPosition() {
	if (!isRecording) return;

	try {
		const robotTransform = tf.transformPose(
			base_link_frame,
			fixed_frame,
			{ x: 0, y: 0, z: 0 },
			new Quaternion()
		);

		const currentPosition = robotTransform.translation;
		const currentYaw = robotTransform.rotation.toEuler().h;

		if (shouldRecordPoint(currentPosition, currentYaw)) {
			points.push({
				x: currentPosition.x,
				y: currentPosition.y,
				z: currentPosition.z
			});

			drawWaypoints();

			status.setOK(`Recording... ${points.length} waypoints`);
		}

	} catch (error) {
		console.warn("Failed to get robot position from TF:", error);
	}
}

function shouldRecordPoint(currentPosition, currentYaw) {
	if (points.length === 0) {
		return true;
	}

	const lastPoint = points[points.length - 1];

	const distance = Math.sqrt(
		Math.pow(currentPosition.x - lastPoint.x, 2) +
		Math.pow(currentPosition.y - lastPoint.y, 2) +
		Math.pow(currentPosition.z - lastPoint.z, 2)
	);

	let lastYaw = 0;
	if (points.length >= 2) {
		const secondToLastPoint = points[points.length - 2];
		lastYaw = Math.atan2(lastPoint.y - secondToLastPoint.y, lastPoint.x - secondToLastPoint.x);
	}

	// Check angle between current position and last point to determine direction of movement
	const positionYaw = Math.atan2(currentPosition.y - lastPoint.y, currentPosition.x - lastPoint.x);
	const reversing = Math.abs(wrapAngle(positionYaw - currentYaw)) > Math.PI / 2;
	if (reversing) {
		lastYaw = lastYaw < 0 ? lastYaw + Math.PI : lastYaw - Math.PI;
	}

	const yawDiff = Math.abs(wrapAngle(lastYaw - currentYaw));
	return distance >= recordMinThreshold && (distance >= recordMaxThreshold || yawDiff >= recordAngleThreshold);
}

function wrapAngle(angle) {
	while (angle > Math.PI) {
		angle -= 2 * Math.PI;
	}
	while (angle < -Math.PI) {
		angle += 2 * Math.PI;
	}
	return angle;
}

// Settings

if (settings.hasOwnProperty("{uniqueID}")) {
	const loaded_data = settings["{uniqueID}"];
	topic = loaded_data.topic;
	points = loaded_data.points;
	fixed_frame = loaded_data.fixed_frame ?? tf.fixed_frame;
	base_link_frame = loaded_data.base_link_frame ?? "base_link";

	margin.value = loaded_data.margin ?? 0.8;
	startCheckbox.checked = loaded_data.start_closest;

	recordMaxThreshold = loaded_data.record_position_max_threshold ?? 5.0;
	recordMaxThresholdInput.value = recordMaxThreshold;

	recordMinThreshold = loaded_data.record_position_min_threshold ?? 0.5;
	recordMinThresholdInput.value = recordMinThreshold;

	recordAngleThreshold = loaded_data.record_angle_threshold ?? 0.52;
	recordAngleThresholdInput.value = Math.round(recordAngleThreshold * (180 / Math.PI));

	useGpsCoordinatesCheckbox.checked = loaded_data.use_gps_coordinates;

	selectedGpsExportService = loaded_data.gps_export_service ?? "/toLL";
	selectedGpsImportService = loaded_data.gps_import_service ?? "/fromLLArray";

	// Show GPS service container if GPS coordinates are enabled
	if (loaded_data.use_gps_coordinates) {
		gpsServiceContainer.style.display = 'block';
		loadGpsServices();
	}

	if (loaded_data.topic_type != undefined)
		typedict[topic] = loaded_data.topic_type;

	for (let i = 0; i < points.length; i++) {
		if (points[i].z == null || points[i].z == undefined)
			points[i].z = 0;
	}

} else {
	saveSettings();
}

if (topic == "") {
	topic = "/waypoints";
	status.setWarn("No topic found, defaulting to /waypoints");
	saveSettings();
}

function saveSettings() {
	settings["{uniqueID}"] = {
		topic: topic,
		topic_type: typedict[topic],
		fixed_frame: fixed_frame,
		base_link_frame: base_link_frame,
		points: points,
		start_closest: startCheckbox.checked,
		margin: margin.value,
		record_position_max_threshold: recordMaxThreshold,
		record_position_min_threshold: recordMinThreshold,
		record_angle_threshold: recordAngleThreshold,
		use_gps_coordinates: useGpsCoordinatesCheckbox.checked,
		gps_export_service: selectedGpsExportService,
		gps_import_service: selectedGpsImportService
	}
	settings.save();
}

// Message sending

function getStamp() {
	const currentTime = new Date();
	const currentTimeSecs = Math.floor(currentTime.getTime() / 1000);
	const currentTimeNsecs = (currentTime.getTime() % 1000) * 1e6;

	return {
		sec: currentTimeSecs,
		nanosec: currentTimeNsecs
	}
}

function getPoseStamped(index, timeStamp, x, y, z, quat) {
	return new ROSLIB.Message({
		header: {
			stamp: timeStamp,
			frame_id: fixed_frame
		},
		pose: {
			position: {
				x: x,
				y: y,
				z: z
			},
			orientation: quat
		}
	});
}

function getPose(x, y, z, quat) {
	return new ROSLIB.Message({
		position: {
			x: x,
			y: y,
			z: z
		},
		orientation: quat
	});
}

function sendMessage(pointlist) {
	let timeStamp = getStamp();
	let poseList = [];
	let stamped = typedict[topic] == "nav_msgs/msg/Path";

	if (pointlist.length > 0) {
		if (pointlist.length == 1) {
			if (stamped) {
				poseList.push(getPoseStamped(0, timeStamp, pointlist[0].x, pointlist[0].y, pointlist[0].z, new Quaternion()));
			} else {
				poseList.push(getPose(pointlist[0].x, pointlist[0].y, pointlist[0].z, new Quaternion()));
			}
		} else {
			pointlist.forEach((point, index) => {
				let p0;
				let p1;

				if (index < pointlist.length - 1) {
					p0 = point;
					p1 = pointlist[index + 1];
				} else {
					p0 = pointlist[index - 1];
					p1 = point;
				}

				const rotation = Quaternion.fromEuler(Math.atan2(p1.y - p0.y, p1.x - p0.x), 0, 0, 'ZXY');

				if (stamped) {
					poseList.push(getPoseStamped(index, timeStamp, point.x, point.y, point.z, rotation));
				} else {
					poseList.push(getPose(point.x, point.y, point.z, rotation));
				}
			});
		}
	}

	const publisher = new ROSLIB.Topic({
		ros: rosbridge.ros,
		name: topic,
		messageType: stamped ? 'nav_msgs/msg/Path' : 'geometry_msgs/msg/PoseArray',
		latched: true
	});

	const pathMessage = new ROSLIB.Message({
		header: {
			stamp: timeStamp,
			frame_id: fixed_frame
		},
		poses: poseList
	});

	publisher.publish(pathMessage);
	status.setOK();

	setMode("IDLE");
	closeModal("{uniqueID}_modal");
}

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const view_container = document.getElementById("view_container");

function getStartIndex() {

	if (base_link_frame == "") {
		status.setError("Base link frame not selected or the TF data is missing.");
		return 0;
	}

	let link = tf.transformPose(
		base_link_frame,
		fixed_frame,
		{ x: 0, y: 0, z: 0 },
		new Quaternion()
	);

	let minDistance = Number.POSITIVE_INFINITY;
	let minIndex = 0;

	for (let i = 0; i < points.length; i++) {
		let distance = 0;

		distance += Math.pow((link.translation.x - points[i].x), 2);
		distance += Math.pow((link.translation.y - points[i].y), 2);
		distance += Math.pow((link.translation.z - points[i].z), 2);

		if (distance < minDistance) {
			minDistance = distance;
			minIndex = i;
		}
	}
	return minIndex;
}

const LIGHT_YELLOW = [255, 248, 199];
const PURE_YELLOW = [235, 206, 0];
const DARK_YELLOW = [54, 47, 0];

const LIGHT_BLUE = [181, 209, 255];
const PURE_BLUE = [105, 162, 255];
const DARK_BLUE = [0, 25, 69];

let start_stamp = undefined;
let start_point = undefined;
let delta = undefined;
let drag_point = -1;
let drag_point_z = 0;

function findPoint(newpoint) {
	let i = -1;
	points.forEach((point, index) => {
		const screenpoint = pointToScreen(point);
		const dist = Math.hypot(
			screenpoint.x - newpoint.x,
			screenpoint.y - newpoint.y,
		)
		if (mode == "XY" && dist < 15) {
			i = index;
		} else if (mode == "Z" && dist < 20) {
			i = index;
		}
	});
	return i;
}

const Z_SCALE_MULT = 170;

function stepToLinearScale(x) {
	const absX = Math.abs(x);
	let result;
	if (absX <= 1) {
		result = absX;
	} else if (absX <= 10) {
		result = 1 + (absX - 1) / 9;
	} else if (absX <= 100) {
		result = 2 + (absX - 10) / 90;
	} else if (absX <= 1000) {
		result = 3 + (absX - 100) / 900;
	} else if (absX <= 10000) {
		result = 4 + (absX - 1000) / 9000;
	} else {
		result = 5;
	}
	return result * Math.sign(x) * Z_SCALE_MULT;
}

function linearToStepScale(y) {
	y /= Z_SCALE_MULT;
	const absY = Math.abs(y);
	let result;
	if (absY <= 1) {
		result = absY;
	} else if (absY <= 2) {
		result = 1 + (absY - 1) * 9;
	} else if (absY <= 3) {
		result = 10 + (absY - 2) * 90;
	} else if (absY <= 4) {
		result = 100 + (absY - 3) * 900;
	} else if (absY <= 5) {
		result = 1000 + (absY - 4) * 9000;
	} else {
		result = 10000;
	}
	return result * Math.sign(y);
}

function startDrag(event) {
	const { clientX, clientY } = event.touches ? event.touches[0] : event;
	start_point = {
		x: clientX,
		y: clientY
	};

	drag_point = findPoint(start_point);
	if (drag_point >= 0) {
		view.setInputMovementEnabled(false);
		drag_point_z = points[drag_point].z;
	}

	start_stamp = new Date();
}

function drag(event) {
	let { clientX, clientY } = event.touches ? event.touches[0] : event;

	if (shift_pressed) {
		clientX = Math.round(clientX / 20) * 20;
		clientY = Math.round(clientY / 20) * 20;
	}

	if (mode == "XY") {
		if (drag_point >= 0) {
			const newpos = screenToPoint({
				x: clientX,
				y: clientY
			})

			points[drag_point].x = newpos.x;
			points[drag_point].y = newpos.y;
			drawWaypoints();
		}
	}

	if (start_point === undefined)
		return;

	delta = {
		x: start_point.x - clientX,
		y: start_point.y - clientY,
	};

	if (mode == "Z" && drag_point >= 0) {
		points[drag_point].z = drag_point_z + linearToStepScale(delta.y * 1.25);

		if (points[drag_point].z > 9999.99)
			points[drag_point].z = 9999;
		else if (points[drag_point].z < -9999.99)
			points[drag_point].z = -9999;

		if (Math.abs(points[drag_point].z) >= 100)
			points[drag_point].z = parseInt(points[drag_point].z);
		else
			points[drag_point].z = parseInt(points[drag_point].z * 10) / 10;

		drawWaypoints();
	}
}

function distancePointToLineSegment(px, py, x1, y1, x2, y2) {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const lengthSquared = dx * dx + dy * dy;

	let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
	t = Math.max(0, Math.min(1, t));

	const closestX = x1 + t * dx;
	const closestY = y1 + t * dy;

	const distanceSquared = (px - closestX) * (px - closestX) + (py - closestY) * (py - closestY);

	return Math.sqrt(distanceSquared);
}

function endDrag(event) {

	if (drag_point >= 0) {
		view.setInputMovementEnabled(true);
		drag_point = -1;
	}

	let moveDist = 0;

	if (delta !== undefined) {
		moveDist = Math.hypot(delta.x, delta.y);
	}

	if (moveDist < 10 && new Date() - start_stamp < 300 && mode == "XY") {

		start_stamp = new Date("2010-3-2"); //debounce, and also when ROS box turtle was released

		let { clientX, clientY } = event.touches ? event.touches[0] : event;

		if (shift_pressed) {
			clientX = Math.round(clientX / 20) * 20;
			clientY = Math.round(clientY / 20) * 20;
		}

		const newpoint = {
			x: clientX,
			y: clientY
		};

		let index = findPoint(newpoint);

		if (index >= 0) { // remove point
			points.splice(index, 1);
		} else {
			let before = -1;
			for (let i = 0; i < points.length - 1; i++) {
				const p0 = pointToScreen(points[i]);
				const p1 = pointToScreen(points[i + 1]);

				const distance = distancePointToLineSegment(
					newpoint.x, newpoint.y,
					p0.x, p0.y,
					p1.x, p1.y
				);

				if (distance <= 10) {
					before = i + 1;
					break;
				}
			}

			if (before > 0) {
				// insert new point between two others
				const p = screenToPoint(newpoint);
				const p0 = points[before - 1];
				const p1 = points[before];

				// Calculate the weight as the ratio of distances
				const distP0P1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
				const distP0P = Math.hypot(p.x - p0.x, p.y - p0.y);
				p.z = p0.z + distP0P / distP0P1 * (p1.z - p0.z);
				points.splice(before, 0, p);
			} else {
				// add point to the end
				const p = screenToPoint(newpoint);

				if (points.length > 0)
					p.z = points[points.length - 1].z;

				points.push(p);
			}
		}
		saveSettings();
	}

	drawWaypoints();

	start_point = undefined;
	delta = undefined;
}

function resizeScreen() {
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawWaypoints();
}

window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);
window.addEventListener("view_changed", drawWaypoints);

window.addEventListener("tf_fixed_frame_changed", drawWaypoints);
window.addEventListener("tf_changed", () => {
	if (fixed_frame != tf.fixed_frame) {
		drawWaypoints();
	}
});

view_container.addEventListener("mouseleave", (event) => {
	delta = undefined;
	endDrag(event);
});

function addListeners() {
	view_container.addEventListener('mousedown', startDrag);
	view_container.addEventListener('mousemove', drag);
	view_container.addEventListener('mouseup', endDrag);

	view_container.addEventListener('touchstart', startDrag);
	view_container.addEventListener('touchmove', drag);
	view_container.addEventListener('touchend', endDrag);
}

function removeListeners() {
	view_container.removeEventListener('mousedown', startDrag);
	view_container.removeEventListener('mousemove', drag);
	view_container.removeEventListener('mouseup', endDrag);

	view_container.removeEventListener('touchstart', startDrag);
	view_container.removeEventListener('touchmove', drag);
	view_container.removeEventListener('touchend', endDrag);
}

function setMode(newmode) {
	mode = newmode;

	switch (mode) {
		case "IDLE":
			stopPositionRecording();
			removeListeners()
			icon.style.backgroundColor = "rgba(124, 124, 124, 0.3)";
			view_container.style.cursor = "";
			buttontext.innerText = "";
			canvas.style.zIndex = "2";
			break;

		case "XY":
			addListeners();
			icon.style.backgroundColor = "rgba(255, 255, 255, 1.0)";
			view_container.style.cursor = "pointer";
			buttontext.innerText = "X,Y";
			canvas.style.zIndex = "999";
			break;

		case "Z":
			addListeners();
			icon.style.backgroundColor = "rgba(255, 255, 255, 1.0)";
			view_container.style.cursor = "pointer";
			buttontext.innerText = "Z";
			canvas.style.zIndex = "999";
			break;

		case "RECORD":
			startPositionRecording();
			removeListeners();
			icon.style.backgroundColor = "rgba(255, 75, 75, 1.0)";
			view_container.style.cursor = "";
			buttontext.innerText = "REC";
			canvas.style.zIndex = "2";
			break;
	}

	drawWaypoints();
}

// Shift clamp to axis
function handleKeyDown(event) {
	if (event.key === "Shift") {
		shift_pressed = true;
	}
}

function handleKeyUp(event) {
	if (event.key === "Shift") {
		shift_pressed = false;
	}
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// Topics
const selectionbox = document.getElementById("{uniqueID}_topic");
const fixedFrameBox = document.getElementById("{uniqueID}_fixed_frame");
const baseLinkFrameBox = document.getElementById("{uniqueID}_base_link_frame");

selectionbox.addEventListener("change", (event) => {
	topic = selectionbox.value;
	saveSettings();
	status.setOK();
});

fixedFrameBox.addEventListener("change", (event) => {
	fixed_frame = fixedFrameBox.value;
	saveSettings();
});

baseLinkFrameBox.addEventListener("change", (event) => {
	base_link_frame = baseLinkFrameBox.value;
	saveSettings();
});

margin.addEventListener("input", (event) => {
	drawWaypoints();
	saveSettings();
});

function find_base_frame() {
	//try base_link first
	for (const key of tf.frame_list.values()) {
		if (key.includes("base_link")) {
			return key
		}
	}

	//maybe footprint?
	for (const key of tf.frame_list.values()) {
		if (key.includes("base_footprint")) {
			return key
		}
	}

	//ok just base then...?
	for (const key of tf.frame_list.values()) {
		if (key.includes("base")) {
			return key
		}
	}

	//eh screw it
	return "base_link";
}

async function loadTopics() {
	const result_path = await rosbridge.get_topics("nav_msgs/msg/Path");
	const result_array = await rosbridge.get_topics("geometry_msgs/msg/PoseArray");

	let topiclist = "";
	result_path.forEach(element => {
		topiclist += "<option value='" + element + "'>" + element + " (Path)</option>";
		typedict[element] = "nav_msgs/msg/Path";
	});
	result_array.forEach(element => {
		topiclist += "<option value='" + element + "'>" + element + " (PoseArray)</option>";
		typedict[element] = "geometry_msgs/msg/PoseArray";
	});
	selectionbox.innerHTML = topiclist

	if (topic == "")
		topic = selectionbox.value;
	else {
		if (result_path.includes(topic) || result_array.includes(topic)) {
			selectionbox.value = topic;
		} else {
			topiclist += "<option value='" + topic + "'>" + topic + "</option>"
			selectionbox.innerHTML = topiclist
			selectionbox.value = topic;
		}
	}

	//find frames
	let framelist = "";
	for (const key of tf.frame_list.values()) {
		framelist += "<option value='" + key + "'>" + key + "</option>"
	}
	fixedFrameBox.innerHTML = framelist;

	if (tf.frame_list.has(fixed_frame)) {
		fixedFrameBox.value = fixed_frame;
	} else {
		framelist += "<option value='" + fixed_frame + "'>" + fixed_frame + "</option>"
		fixedFrameBox.innerHTML = framelist;
		fixedFrameBox.value = fixed_frame;
	}

	baseLinkFrameBox.innerHTML = framelist;

	if (tf.frame_list.has(base_link_frame)) {
		baseLinkFrameBox.value = base_link_frame;
	} else {
		framelist += "<option value='" + fixed_frame + "'>" + fixed_frame + "</option>"
		baseLinkFrameBox.innerHTML = framelist;
		baseLinkFrameBox.value = base_link_frame;
	}

	// Load GPS services if checkbox is checked
	if (useGpsCoordinatesCheckbox.checked) {
		await loadGpsServices();
	}
}

loadTopics();

//dropdown stuff

function dropdown_visibility(open) {
	if (open)
		dropdown.style.display = "block";
	else
		dropdown.style.display = "none";
}

// Toggle dropdown on click
icon.addEventListener("click", (event) => {
	event.stopPropagation();

	if (mode != "IDLE") {
		setMode("IDLE");
	} else {
		const rect = icon.getBoundingClientRect();
		const dropdownWidth = 90;
		let top = rect.bottom + 5; // Default: below the icon
		let left = rect.left;

		if (left + dropdownWidth > window.innerWidth) {
			left = window.innerWidth - dropdownWidth - 5;
		}

		if (left < 5) {
			left = 5;
		}

		dropdown.style.top = `${top}px`;
		dropdown.style.left = `${left}px`;

		dropdown_visibility(dropdown.style.display == "none")
	}
});

// Close dropdown when clicking outside
document.addEventListener("click", (event) => {
	if (!dropdown.contains(event.target) && !icon.contains(event.target)) {
		dropdown_visibility(false);
	}
});

window.addEventListener('beforeunload', () => {
	if (isRecording) {
		stopPositionRecording();
	}
});

const drop_start = document.getElementById("{uniqueID}_sendAction");
const drop_stop = document.getElementById("{uniqueID}_stopAction");
const drop_record = document.getElementById("{uniqueID}_record");
const drop_xy = document.getElementById("{uniqueID}_editXY");
const drop_z = document.getElementById("{uniqueID}_editZ");
const drop_config = document.getElementById("{uniqueID}_config");

const startButton = document.getElementById("{uniqueID}_start");
const stopButton = document.getElementById("{uniqueID}_stop");

drop_start.addEventListener("click", (event) => {
	if (startCheckbox.checked)
		sendMessage(points.slice(getStartIndex()))
	else
		sendMessage(points)
	dropdown_visibility(false);
});

drop_stop.addEventListener("click", (event) => {
	sendMessage([]);
	dropdown_visibility(false);
});

drop_record.addEventListener("click", (event) => {
	setMode("RECORD");
	dropdown_visibility(false);
});

drop_xy.addEventListener("click", (event) => {
	setMode("XY");
	dropdown_visibility(false);
});

drop_z.addEventListener("click", (event) => {
	setMode("Z");
	dropdown_visibility(false);
});

drop_config.addEventListener("click", (event) => {
	loadTopics();
	updateMissionSelect();
	openModal("{uniqueID}_modal");
	dropdown_visibility(false);
});

resizeScreen();

console.log("Waypoints Widget Loaded {uniqueID}")