let viewModule = await import(`${base_url}/js/modules/view.js`);
let tfModule = await import(`${base_url}/js/modules/tf.js`);
let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let drawWaypointsModule = await import(`${base_url}/js/modules/draw_waypoints.js`);
let missionRecorderModule = await import(`${base_url}/js/modules/mission_recorder.js`);

let view = viewModule.view;
let tf = tfModule.tf;
let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let imageToDataURL = utilModule.imageToDataURL;
let MissionRecorder = new missionRecorderModule.MissionRecorder(rosbridge.ros, "mission_recorder");
let MissionWindow = new missionRecorderModule.MissionWindow(
	document.getElementById("{uniqueID}_mission_window"),
	document.getElementById("{uniqueID}_mission_drag_handle"),
	saveSettings
);

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let mission_status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_mission_status")
);

let typedict = {};
let fixed_frame = tf.fixed_frame;
let mode = "IDLE";
let state = "IDLE";
let points = [];
let mission_window_active = false;

const icon = document.getElementById("{uniqueID}_icon");
const dropdown = document.getElementById("{uniqueID}_dropdown");

const icondiv = document.getElementById("{uniqueID}_icon");
const icontext = icondiv.getElementsByTagName('p')[0];

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const nodeNamebox = document.getElementById("{uniqueID}_node_name");
const fixedFrameBox = document.getElementById("{uniqueID}_fixed_frame");

const drop_start = document.getElementById("{uniqueID}_start");
const drop_continue = document.getElementById("{uniqueID}_continue");
const drop_stop = document.getElementById("{uniqueID}_stop");
const drop_follow_me = document.getElementById("{uniqueID}_follow_me");
const drop_mule = document.getElementById("{uniqueID}_mule");
const drop_exit = document.getElementById("{uniqueID}_exit");
const drop_mission_select = document.getElementById("{uniqueID}_mission_selection");
const drop_config = document.getElementById("{uniqueID}_config");

const missionNodeNamebox = document.getElementById("{uniqueID}_mission_node_name");
const missionSelect = document.getElementById("{uniqueID}_mission_select");
const clearPathButton = document.getElementById("{uniqueID}_clear_path");
const missionWindowCloseButton = document.getElementById("{uniqueID}_mission_window_close");

function setLabel(string) {
	icontext.textContent = string;
	icon.alt = string;
	icon.dataset.text = string;
}

setLabel("IDLE");

function drawWaypoints() {
	try {
		canvas.height = window.innerHeight;
		canvas.width = window.innerWidth;
		drawWaypointsModule.drawWaypoints(canvas, ctx, view, points, tf, fixed_frame, "IDLE", 0.8, 0, false);
		status.setOK();
	} catch (error) {
		console.error("Error drawing waypoints:", error);
		status.setError(`Failed to draw waypoints: ${error.message}`);
	}
}

function resizeScreen() {
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	if (state === "MULE") drawWaypoints();
}

function clearPath() {
	let points_tmp = points;
	points = [];
	drawWaypoints();
	points = points_tmp;
	saveSettings();
}

// Subscribe to current_state topic and update icon text

function subscribeCurrentState() {
	const stateTopic = new ROSLIB.Topic({
		ros: rosbridge.ros,
		name: nodeNamebox.value + "/current_state",
		messageType: "std_msgs/String",
		qos: {
			durability: "transient_local"
		}
	});

	stateTopic.subscribe((msg) => {
		if (msg && msg.data) {
			state = msg.data.trim().toUpperCase();
			drop_mission_select.style.display = "none";
			MissionWindow.hide();
			clearPath();

			// Change background color depending on state
			if (state === "ERROR") {
				icon.style.backgroundColor = "#e74c3c"; // red
			} else if (state === "READY") {
				icon.style.backgroundColor = "#27ae60"; // green
			} else if (state === "FOLLOW_ME") {
				icon.style.backgroundColor = "#3498db"; // blue
			} else if (state === "MULE") {
				icon.style.backgroundColor = "#3498db"; // blue
				drop_mission_select.style.display = "block";
				if (mission_window_active) {
					MissionWindow.show();
				}
				loadMission();
			} else {
				icon.style.backgroundColor = "#bdc3c7"; // gray default (IDLE, NOT READY)
			}

			state = state.replace(/_/g, " "); // Replace underscores with spaces for better readability
			setLabel(state);
		}
	});
}

// Mission management

async function loadMission() {
	const selectedMission = missionSelect.value;
	if (!selectedMission) {
		mission_status.setWarn("Please select a mission to load");
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

	publishPoseArray(points);

	drawWaypoints();

	saveSettings();
	mission_status.setOK(`Mission "${missionData.name}" loaded successfully (${points.length} waypoints)`);
}

async function updateMissionSelect(defaultMissionID = null) {
	let response;
	let optionsHtml = '<option value="">-- Select Mission --</option>';

	try {
		response = await MissionRecorder.listMissions();
	} catch (error) {
		mission_status.setError(`Failed to list missions: ${error.message}`);
		missionSelect.innerHTML = optionsHtml;
		return;
	}

	if (!response.success) {
		mission_status.setError(`Failed to load missions: ${response.message}`);
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
	}

	mission_status.setOK();
}

function publishPoseArray(pointList) {
	let timeStamp = getStamp();
	let poseList = [];

	if (pointList.length > 0) {
		if (pointList.length == 1) {

			poseList.push(getPose(pointList[0].x, pointList[0].y, pointList[0].z, new Quaternion()));

		} else {
			pointList.forEach((point, index) => {
				let p0;
				let p1;

				if (index < pointList.length - 1) {
					p0 = point;
					p1 = pointList[index + 1];
				} else {
					p0 = pointList[index - 1];
					p1 = point;
				}

				const rotation = Quaternion.fromEuler(Math.atan2(p1.y - p0.y, p1.x - p0.x), 0, 0, 'ZXY');

				poseList.push(getPose(point.x, point.y, point.z, rotation));
			});
		}
	}

	const publisher = new ROSLIB.Topic({
		ros: rosbridge.ros,
		name: nodeNamebox.value + "/current_state/update_poses",
		messageType: "geometry_msgs/msg/PoseArray",
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
}

function getStamp() {
	const currentTime = new Date();
	const currentTimeSecs = Math.floor(currentTime.getTime() / 1000);
	const currentTimeNsecs = (currentTime.getTime() % 1000) * 1e6;

	return {
		sec: currentTimeSecs,
		nanosec: currentTimeNsecs
	}
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

// Settings

if (settings.hasOwnProperty("{uniqueID}")) {
	const loaded_data = settings["{uniqueID}"];
	nodeNamebox.value = loaded_data.node_name ?? "navigation_manager";
	points = loaded_data.points;
	typedict = loaded_data.typedict ?? {};
	fixed_frame = loaded_data.fixed_frame ?? tf.fixed_frame;
	mission_window_active = loaded_data.mission_window_active ?? false;
	missionNodeNamebox.value = loaded_data.mission_node_name ?? "mission_recorder";
	MissionRecorder.setNodeName(missionNodeNamebox.value);

	const mission_window_position = loaded_data.mission_window_position;
	if (mission_window_position) {
		MissionWindow.setPosition(mission_window_position);
	}

	if (loaded_data.mission) {
		const missionData = JSON.parse(loaded_data.mission);
		await updateMissionSelect(missionData.id);
	}

	for (let i = 0; i < points.length; i++) {
		if (points[i].z == null || points[i].z == undefined)
			points[i].z = 0;
	}

} else {
	saveSettings();
}

function saveSettings() {
	settings["{uniqueID}"] = {
		node_name: nodeNamebox.value,
		typedict: typedict,
		fixed_frame: fixed_frame,
		points: points,
		mission: missionSelect.value,
		mission_node_name: missionNodeNamebox.value,
		mission_window_active: mission_window_active,
		mission_window_position: MissionWindow.getPosition()
	}
	settings.save();
}

// Messaging

function callService(serviceName) {
	if (!serviceName || serviceName === "") {
		console.error("Service name is empty.");
		status.setError("Empty service.");
		return;
	}

	const service = new ROSLIB.Service({
		ros: rosbridge.ros,
		name: serviceName,
		serviceType: "std_srvs/srv/Trigger"
	});

	const request = new ROSLIB.ServiceRequest({});
	service.callService(request, (result) => {
		if (result.success) {
			status.setOK(result.message);
		} else {
			console.error("Service call failed:", result.message);
			status.setError(result.message);
			// Blink the icon to indicate error
			let background = icon.style.backgroundColor;
			icon.style.backgroundColor = "#e74c3c"; // red
			setTimeout(() => {
				icon.style.backgroundColor = background;
			}, 600);
		}
	});
}

async function loadServices() {
	let triggerSrvs = await rosbridge.get_services("std_srvs/srv/Trigger");

	let foundServices = {
		start: false,
		continue: false,
		stop: false,
		follow_me: false,
		mule: false,
		exit: false
	};

	triggerSrvs.forEach(element => {
		if (element.includes(nodeNamebox.value)) {
			typedict[element] = "std_srvs/srv/Trigger";

			if (element.endsWith("/start")) foundServices.start = true;
			if (element.endsWith("/continue")) foundServices.continue = true;
			if (element.endsWith("/stop")) foundServices.stop = true;
			if (element.endsWith("/init_follow_me")) foundServices.follow_me = true;
			if (element.endsWith("/init_mule")) foundServices.mule = true;
			if (element.endsWith("/exit")) foundServices.exit = true;
		}
	});

	// Show/hide dropdown elements based on found services
	if (typeof drop_start !== "undefined" && drop_start) drop_start.style.display = foundServices.start ? "block" : "none";
	if (typeof drop_continue !== "undefined" && drop_continue) drop_continue.style.display = foundServices.continue ? "block" : "none";
	if (typeof drop_stop !== "undefined" && drop_stop) drop_stop.style.display = foundServices.stop ? "block" : "none";
	if (typeof drop_follow_me !== "undefined" && drop_follow_me) drop_follow_me.style.display = foundServices.follow_me ? "block" : "none";
	if (typeof drop_mule !== "undefined" && drop_mule) drop_mule.style.display = foundServices.mule ? "block" : "none";
	if (typeof drop_exit !== "undefined" && drop_exit) drop_exit.style.display = foundServices.exit ? "block" : "none";

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

	saveSettings();
}

loadServices();
subscribeCurrentState();

//dropdown stuff

function dropdown_visibility(open) {
	if (open) {
		loadServices();
		setTimeout(() => {
			dropdown.style.display = "block";
		}, 50);
	} else {
		dropdown.style.display = "none";
	}
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
		dropdown.style.width = "120px";

		dropdown_visibility(dropdown.style.display == "none")
	}
});

// Close dropdown when clicking outside
document.addEventListener("click", (event) => {
	if (!dropdown.contains(event.target) && !icon.contains(event.target)) {
		dropdown_visibility(false);
	}
});

drop_start.addEventListener("click", () => {
	let found = Object.keys(typedict).find(k => k.endsWith("/start"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_continue.addEventListener("click", () => {
	let found = Object.keys(typedict).find(k => k.endsWith("/continue"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_stop.addEventListener("click", () => {
	let found = Object.keys(typedict).find(k => k.endsWith("/stop"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_follow_me.addEventListener("click", () => {
	let found = Object.keys(typedict).find(k => k.endsWith("/init_follow_me"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_mule.addEventListener("click", () => {
	let found = Object.keys(typedict).find(k => k.endsWith("/init_mule"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_exit.addEventListener("click", () => {
	let found = Object.keys(typedict).find(k => k.endsWith("/exit"));
	if (found) callService(found);
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

drop_config.addEventListener("click", () => {
	loadServices();
	openModal("{uniqueID}_modal");
	dropdown_visibility(false);
});

fixedFrameBox.addEventListener("change", () => {
	fixed_frame = fixedFrameBox.value;
	saveSettings();
});

missionSelect.addEventListener('mousedown', updateMissionSelect);
missionSelect.addEventListener('change', loadMission);

missionWindowCloseButton.addEventListener("click", () => {
	MissionWindow.hide();
	mission_window_active = false;
	saveSettings();
});

clearPathButton.addEventListener('click', async () => {
	if (await confirm("Are you sure you want to delete all waypoints?")) {
		clearPath();
	}
});

nodeNamebox.addEventListener("change", () => {
	subscribeCurrentState();
	saveSettings();
});

missionNodeNamebox.addEventListener("change", () => {
	MissionRecorder.setNodeName(missionNodeNamebox.value);
	updateMissionSelect();
	saveSettings();
});

window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);
window.addEventListener("view_changed", () => { if (state === "MULE") drawWaypoints() });

window.addEventListener("tf_fixed_frame_changed", () => { if (state === "MULE") drawWaypoints() });
window.addEventListener("tf_changed", () => {
	if (fixed_frame != tf.fixed_frame && state === "MULE") {
		drawWaypoints();
	}
});

console.log("Manager Widget Loaded {uniqueID}")