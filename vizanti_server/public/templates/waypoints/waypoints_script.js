let viewModule = await import(`${base_url}/js/modules/view.js`);
let tfModule = await import(`${base_url}/js/modules/tf.js`);
let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let drawWaypointsModule = await import(`${base_url}/js/modules/draw_waypoints.js`);

let missionRecorderModule = await import(`${base_url}/js/modules/mission_recorder.js`);

let view = viewModule.view;
let tf = tfModule.tf;
let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let MissionRecorder = new missionRecorderModule.MissionRecorder(rosbridge.ros, "mission_recorder");
let MissionWindow = new missionRecorderModule.MissionWindow(
	document.getElementById("{uniqueID}_mission_window"),
	document.getElementById("{uniqueID}_mission_drag_handle"),
	saveSettings
);

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
let mission_window_active = false;

const icon_bar = document.getElementById("icon_bar");
const icon = document.getElementById("{uniqueID}_icon");
const dropdown = document.getElementById("{uniqueID}_dropdown");

const buttontext = document.getElementById("{uniqueID}_buttontext");
const margin = document.getElementById("{uniqueID}_margin");
const startCheckbox = document.getElementById('{uniqueID}_startclosest');

const flipButton = document.getElementById("{uniqueID}_flip");
const zSetButton = document.getElementById("{uniqueID}_z_set");
const deleteButton = document.getElementById("{uniqueID}_delete");

const useGpsCoordinatesCheckbox = document.getElementById("{uniqueID}_use_gps_coordinates");

const missionNodeNamebox = document.getElementById("{uniqueID}_mission_node_name");
const missionSelect = document.getElementById("{uniqueID}_mission_select");
const missionNameInput = document.getElementById("{uniqueID}_mission_name");
const updateMissionButton = document.getElementById("{uniqueID}_update_mission");
const deleteMissionButton = document.getElementById("{uniqueID}_delete_mission");
const missionWindowCloseButton = document.getElementById("{uniqueID}_mission_window_close");

const recordMaxThresholdInput = document.getElementById("{uniqueID}_record_position_max_threshold");
const recordMinThresholdInput = document.getElementById("{uniqueID}_record_position_min_threshold");
const recordAngleThresholdInput = document.getElementById("{uniqueID}_record_angle_threshold");

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

useGpsCoordinatesCheckbox.addEventListener('change', saveSettings);

updateMissionButton.addEventListener('click', updateMission);
deleteMissionButton.addEventListener('click', deleteMission);

missionNodeNamebox.addEventListener("change", () => {
	MissionRecorder.setNodeName(missionNodeNamebox.value);
	updateMissionSelect();
	saveSettings();
});

missionSelect.addEventListener('mousedown', updateMissionSelect);
missionSelect.addEventListener('change', () => {
	const selectedMission = missionSelect.value;
	const missionData = JSON.parse(selectedMission);
	missionNameInput.value = missionData.name;
	loadMission();
});

missionWindowCloseButton.addEventListener("click", () => {
	MissionWindow.hide();
	mission_window_active = false;
	saveSettings();
});

recordMaxThresholdInput.addEventListener('change', saveSettings);
recordMinThresholdInput.addEventListener('change', saveSettings);
recordAngleThresholdInput.addEventListener('change', saveSettings);

function drawWaypoints() {
	try {
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

// Mission management

async function updateMission() {
	const selectedMission = missionSelect.value;
	if (!selectedMission) {
		status.setWarn("Please select a mission to update");
		return;
	}

	const missionName = missionNameInput.value;
	if (!missionName) {
		status.setWarn("Mission name cannot be empty");
		return;
	}

	if (points.length === 0) {
		status.setWarn("No waypoints to save");
		return;
	}

	const useGPS = useGpsCoordinatesCheckbox.checked;
	const missionData = JSON.parse(selectedMission);

	const info = {
		id: missionData.id,
		name: missionName,
		type: useGPS ? "gps" : "cartesian",
	};

	const poses = points.map(point => ({
		position: {
			x: point.x,
			y: point.y,
			z: point.z
		}
	}));

	const result = await MissionRecorder.overrideMission(info, poses);

	if (!result.success) {
		status.setError(`Failed to update mission: ${result.message}`);
		return;
	}

	updateMissionSelect(missionData.id);
	status.setOK(`Mission "${missionName}" updated successfully`);
}

async function loadMission() {
	const selectedMission = missionSelect.value;
	if (!selectedMission) {
		status.setWarn("Please select a mission to load");
		return;
	}

	const missionData = JSON.parse(selectedMission);
	const result = await MissionRecorder.getMission(missionData.id);

	if (!result.success) {
		status.setError(`Failed to load mission: ${result.message}`);
		return;
	}

	// Load waypoints
	const mission = result.mission;
	points = mission.poses.map(pose => ({
		x: pose.position.x || 0,
		y: pose.position.y || 0,
		z: pose.position.z || 0
	}));

	drawWaypoints();
	saveSettings();
	status.setOK(`Mission "${missionData.name}" loaded successfully (${points.length} waypoints)`);
}

async function deleteMission() {
	const selectedMission = missionSelect.value;
	if (!selectedMission) {
		status.setWarn("Please select a mission to delete");
		return;
	}

	const missionData = JSON.parse(selectedMission);
	const confirmDelete = await confirm(`Are you sure you want to delete mission "${missionData.name}"?`);
	if (!confirmDelete) {
		return;
	}

	const result = await MissionRecorder.deleteMission(missionData.id);

	if (!result.success) {
		status.setError(`Failed to delete mission: ${result.message}`);
		return;
	}

	updateMissionSelect();
	missionNameInput.value = "";
	status.setOK(`Mission "${missionData.name}" deleted successfully`);
}

async function updateMissionSelect(defaultMissionID = null) {
	let response;
	let optionsHtml = '<option value="">-- Select Mission --</option>';

	try {
		response = await MissionRecorder.listMissions();
	} catch (error) {
		status.setError(`Failed to list missions: ${error.message}`);
		missionSelect.innerHTML = optionsHtml;
		return;
	}

	if (!response.success) {
		status.setError(`Failed to load missions: ${response.message}`);
		missionSelect.innerHTML = optionsHtml;
		return;
	}

	const missions = response.missions;

	// Save the currently selected value
	let defaultMission = missionSelect.value;

	missions.forEach(mission => {
		// Store both id and name as a JSON string in the value attribute
		const optionValue = JSON.stringify({ id: mission.id, name: mission.name });
		optionsHtml += `<option value='${optionValue}'>${mission.name} (ID: ${mission.id})</option>`;
	});

	missionSelect.innerHTML = optionsHtml;

	if (defaultMissionID) {
		// Try to set the default mission based on the provided ID
		defaultMission = JSON.stringify({ id: defaultMissionID, name: missions.find(m => m.id === defaultMissionID)?.name || "" });
	}

	// Restore the default mission if it still exists
	if (defaultMission && Array.from(missionSelect.options).some(opt => opt.value === defaultMission)) {
		missionSelect.value = defaultMission;
		missionNameInput.value = JSON.parse(defaultMission).name;
	}

	status.setOK();
}

// Position recording

async function startPositionRecording() {
	await updateRecordingParameters();

	let posesCallback = (message) => {
		points = message.poses.map(pose => ({
			x: pose.position.x,
			y: pose.position.y,
			z: pose.position.z
		}));
		drawWaypoints();
	}

	const result = await MissionRecorder.startRecording(posesCallback);
	if (result.success) {
		console.log("Started recording waypoints");
	} else {
		console.warn("Failed to start recording waypoints:", result.message);
	}
}

async function stopPositionRecording() {
	const result = await MissionRecorder.stopRecording();
	if (!result.success) {
		console.warn("Failed to stop recording waypoints:", result.message);
		return;
	}

	console.log("Stopped recording waypoints");

	// list missions and find the one we just recorded to get the final list of waypoints
	const response = await MissionRecorder.listMissions();
	// get last mission as the end element of the list
	const latestMissionID = response.missions[response.missions.length - 1].id;

	const latestMission = await MissionRecorder.getMission(latestMissionID);
	points = latestMission.mission.poses.map(pose => ({
		x: pose.position.x,
		y: pose.position.y,
		z: pose.position.z
	}));

	// TODO: update mission select to include the new mission and select it
	updateMissionSelect(latestMissionID);

	drawWaypoints();
	saveSettings();
}

async function updateRecordingParameters() {
	let recordMaxThreshold = parseFloat(recordMaxThresholdInput.value);
	let recordMinThreshold = parseFloat(recordMinThresholdInput.value);
	let recordAngleThreshold = parseFloat(recordAngleThresholdInput.value) * (Math.PI / 180);

	const params = [
		{ name: "record_max_threshold", value: recordMaxThreshold },
		{ name: "record_min_threshold", value: recordMinThreshold },
		{ name: "record_angle_threshold", value: recordAngleThreshold }
	];
	const result = await MissionRecorder.setDoubleParameters(params);

	result.results.forEach((res, index) => {
		if (!res.successful) {
			console.warn(`Failed to set parameter ${params[index].name}: ${res.reason}`);
		}
	});

	saveSettings();
}

// Settings

if (settings.hasOwnProperty("{uniqueID}")) {
	const loaded_data = settings["{uniqueID}"];
	topic = loaded_data.topic;
	points = loaded_data.points;
	fixed_frame = loaded_data.fixed_frame ?? tf.fixed_frame;
	base_link_frame = loaded_data.base_link_frame ?? "base_link";

	mission_window_active = loaded_data.mission_window_active ?? false;
	if (mission_window_active) {
		MissionWindow.show();
	}

	const mission_window_position = loaded_data.mission_window_position;
	if (mission_window_position) {
		MissionWindow.setPosition(mission_window_position);
	}

	missionNodeNamebox.value = loaded_data.mission_node_name ?? "mission_recorder";
	// Ensure the MissionRecorder instance has the correct node name
	MissionRecorder.setNodeName(missionNodeNamebox.value);

	margin.value = loaded_data.margin ?? 0.8;
	startCheckbox.checked = loaded_data.start_closest;

	recordMaxThresholdInput.value = loaded_data.record_position_max_threshold ?? 5.0;
	recordMinThresholdInput.value = loaded_data.record_position_min_threshold ?? 0.5;
	recordAngleThresholdInput.value = Math.round((loaded_data.record_angle_threshold ?? 0.52) * (180 / Math.PI));

	useGpsCoordinatesCheckbox.checked = loaded_data.use_gps_coordinates;

	missionSelect.value = loaded_data.selected_mission;

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
		mission_node_name: missionNodeNamebox.value,
		points: points,
		start_closest: startCheckbox.checked,
		margin: margin.value,
		record_position_max_threshold: recordMaxThresholdInput.value,
		record_position_min_threshold: recordMinThresholdInput.value,
		record_angle_threshold: recordAngleThresholdInput.value * (Math.PI / 180),
		use_gps_coordinates: useGpsCoordinatesCheckbox.checked,
		selected_mission: missionSelect.value,
		mission_window_active: mission_window_active,
		mission_window_position: MissionWindow.getPosition()
	}
	settings.save();
}

// Initialize mission select
updateMissionSelect();

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

window.addEventListener('beforeunload', stopPositionRecording);

const drop_start = document.getElementById("{uniqueID}_sendAction");
const drop_stop = document.getElementById("{uniqueID}_stopAction");
const drop_record = document.getElementById("{uniqueID}_record");
const drop_xy = document.getElementById("{uniqueID}_editXY");
const drop_z = document.getElementById("{uniqueID}_editZ");
const drop_mission_select = document.getElementById("{uniqueID}_mission_selection");
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

drop_mission_select.addEventListener("click", () => {
	MissionRecorder.setNodeName(missionNodeNamebox.value);
	updateMissionSelect();

	if (mission_window_active) {
		MissionWindow.hide();
	} else {
		MissionWindow.show();
	}

	mission_window_active = !mission_window_active;
	dropdown_visibility(false);
	saveSettings();
});

drop_config.addEventListener("click", (event) => {
	loadTopics();
	MissionRecorder.setNodeName(missionNodeNamebox.value);
	updateMissionSelect();
	openModal("{uniqueID}_modal");
	dropdown_visibility(false);
});

resizeScreen();

console.log("Waypoints Widget Loaded {uniqueID}")