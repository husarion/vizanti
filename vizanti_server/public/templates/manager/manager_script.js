let viewModule = await import(`${base_url}/js/modules/view.js`);
let tfModule = await import(`${base_url}/js/modules/tf.js`);
let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let missionUtils = await import(`${base_url}/js/modules/mission_utils.js`);
let drawWaypointsModule = await import(`${base_url}/js/modules/draw_waypoints.js`);

let view = viewModule.view;
let tf = tfModule.tf;
let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let imageToDataURL = utilModule.imageToDataURL;

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

let gpsImportServiceDict = {};
let selectedGpsImportService = "";

const icon = document.getElementById("{uniqueID}_icon");
const dropdown = document.getElementById("{uniqueID}_dropdown");

const icondiv = document.getElementById("{uniqueID}_icon");
const icontext = icondiv.getElementsByTagName('p')[0];

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

const nodenamebox = document.getElementById("{uniqueID}_nodename");
const fixedFrameBox = document.getElementById("{uniqueID}_fixed_frame");

const drop_start = document.getElementById("{uniqueID}_start");
const drop_continue = document.getElementById("{uniqueID}_continue");
const drop_stop = document.getElementById("{uniqueID}_stop");
const drop_follow_me = document.getElementById("{uniqueID}_follow_me");
const drop_mule = document.getElementById("{uniqueID}_mule");
const drop_exit = document.getElementById("{uniqueID}_exit");
const drop_mission_select = document.getElementById("{uniqueID}_mission_selection");
const drop_config = document.getElementById("{uniqueID}_config");

const importButton = document.getElementById("{uniqueID}_import");
const importInput = document.getElementById("{uniqueID}_import_input");
const useGpsCoordinatesCheckbox = document.getElementById("{uniqueID}_use_gps_coordinates");
const gpsServiceContainer = document.getElementById("{uniqueID}_gps_service_container");
const gpsImportServiceBox = document.getElementById("{uniqueID}_gps_import_service");

const missionSelect = document.getElementById("{uniqueID}_mission_select");
const loadMissionButton = document.getElementById("{uniqueID}_load_mission");
const clearPathButton = document.getElementById("{uniqueID}_clear_path");

function setLabel(string) {
	icontext.textContent = string;
	icon.alt = string;
	icon.dataset.text = string;
}

setLabel("IDLE");

function drawWaypoints() {
	try {
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
		name: nodenamebox.value + "/current_state",
		messageType: "std_msgs/String",
		qos: {
			durability: "transient_local"
		}
	});

	stateTopic.subscribe((msg) => {
		if (msg && msg.data) {
			state = msg.data.trim().toUpperCase();
			drop_mission_select.style.display = "none";
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
				loadMission();
			} else {
				icon.style.backgroundColor = "#bdc3c7"; // gray default (IDLE, NOT READY)
			}

			state = state.replace(/_/g, " "); // Replace underscores with spaces for better readability
			setLabel(state);
		}
	});
}

async function loadGpsServices() {
	try {
		console.log("Loading GPS coordinate services...");
		const toLLServices = await rosbridge.get_services("robot_localization/srv/ToLL");
		const fromLLArrayServices = await rosbridge.get_services("robot_localization/srv/FromLLArray");

		let importServiceList = "";

		// Add FromLLArray services (preferred for import)
		fromLLArrayServices.forEach(service => {
			importServiceList += `<option value='${service}'>${service} (FromLLArray)</option>`;
			gpsImportServiceDict[service] = "robot_localization/srv/FromLLArray";
		});

		gpsImportServiceBox.innerHTML = importServiceList;

		if (importServiceList === "") {
			console.log(`No FromLLArray services found, defaulting to ${selectedGpsImportService}`);
			gpsImportServiceBox.innerHTML = `<option value='${selectedGpsImportService}'>${selectedGpsImportService} (default)</option>`;
		}

		if (fromLLArrayServices.includes(selectedGpsImportService)) {
			gpsImportServiceBox.value = selectedGpsImportService;
		} else {
			selectedGpsImportService = gpsImportServiceBox.value;
		}

	} catch (error) {
		console.error("Error loading GPS services:", error);
		mission_status.setWarn("Failed to load GPS coordinate services");
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

async function loadMission() {
	const selectedMission = missionSelect.value;
	if (!selectedMission) {
		mission_status.setWarn("Please select a mission to load");
		return;
	}

	const missions = getSavedMissions();
	const missionData = missions[selectedMission];

	if (!missionData) {
		mission_status.setError("Mission not found");
		return;
	}

	console.log("Mission data:", missionData);

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

	publishPoseArray(points);

	drawWaypoints();

	saveSettings();
	mission_status.setOK(`Mission "${selectedMission}" loaded successfully (${points.length} waypoints)`);
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
		name: nodenamebox.value + "/current_state/update_poses",
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

// Initialize mission select
updateMissionSelect();

// Settings

if (settings.hasOwnProperty("{uniqueID}")) {
	const loaded_data = settings["{uniqueID}"];
	nodenamebox.value = loaded_data.nodename ?? "navigation_manager";
	points = loaded_data.points;
	typedict = loaded_data.typedict ?? {};
	fixed_frame = loaded_data.fixed_frame ?? tf.fixed_frame;
	missionSelect.value = loaded_data.mission ?? "";

	useGpsCoordinatesCheckbox.checked = loaded_data.use_gps_coordinates;

	selectedGpsImportService = loaded_data.gps_import_service ?? "/fromLLArray";

	// Show GPS service container if GPS coordinates are enabled
	if (loaded_data.use_gps_coordinates) {
		gpsServiceContainer.style.display = 'block';
		loadGpsServices();
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
		nodename: nodenamebox.value,
		typedict: typedict,
		fixed_frame: fixed_frame,
		points: points,
		use_gps_coordinates: useGpsCoordinatesCheckbox.checked,
		gps_import_service: selectedGpsImportService,
		mission: missionSelect.value
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
	console.log(triggerSrvs);

	let foundServices = {
		start: false,
		continue: false,
		stop: false,
		follow_me: false,
		mule: false,
		exit: false
	};

	triggerSrvs.forEach(element => {
		if (element.includes(nodenamebox.value)) {
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

drop_start.addEventListener("click", (event) => {
	let found = Object.keys(typedict).find(k => k.endsWith("/start"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_continue.addEventListener("click", (event) => {
	let found = Object.keys(typedict).find(k => k.endsWith("/continue"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_stop.addEventListener("click", (event) => {
	let found = Object.keys(typedict).find(k => k.endsWith("/stop"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_follow_me.addEventListener("click", (event) => {
	let found = Object.keys(typedict).find(k => k.endsWith("/init_follow_me"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_mule.addEventListener("click", (event) => {
	let found = Object.keys(typedict).find(k => k.endsWith("/init_mule"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_exit.addEventListener("click", (event) => {
	let found = Object.keys(typedict).find(k => k.endsWith("/exit"));
	if (found) callService(found);
	dropdown_visibility(false);
});

drop_mission_select.addEventListener("click", (event) => {
	openModal("{uniqueID}_mission_modal");
	dropdown_visibility(false);
});

drop_config.addEventListener("click", (event) => {
	loadServices();
	openModal("{uniqueID}_modal");
	dropdown_visibility(false);
});

fixedFrameBox.addEventListener("change", (event) => {
	fixed_frame = fixedFrameBox.value;
	saveSettings();
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

			mission_status.setOK("Missions imported successfully");
		} catch (error) {
			mission_status.setError(`Failed to import missions: ${error.message}`);
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

gpsImportServiceBox.addEventListener("change", (event) => {
	selectedGpsImportService = gpsImportServiceBox.value;
	saveSettings();
});

loadMissionButton.addEventListener('click', loadMission);

clearPathButton.addEventListener('click', async () => {
	if (await confirm("Are you sure you want to delete all waypoints?")) {
		clearPath();
	}
});

nodenamebox.addEventListener("change", (event) => {
	subscribeCurrentState();
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

console.log("Button Widget Loaded {uniqueID}")