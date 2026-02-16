let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);

let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let Status = StatusModule.Status;
let imageToDataURL = utilModule.imageToDataURL;

let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let typedict = {};
let mode = "IDLE";
let nodename = "navigation_manager";

const icon = document.getElementById("{uniqueID}_icon");
const dropdown = document.getElementById("{uniqueID}_dropdown");

const icondiv = document.getElementById("{uniqueID}_icon");
const icontext = icondiv.getElementsByTagName('p')[0];

const nodenamebox = document.getElementById("{uniqueID}_nodename");

function setLabel(string) {
	// Change background color depending on state
	let state = string.trim().toUpperCase();
	if (state === "ERROR") {
		icon.style.backgroundColor = "#e74c3c"; // red
	} else if (state === "READY") {
		icon.style.backgroundColor = "#27ae60"; // green
	} else if (state === "FOLLOW_ME" || state === "MULE") {
		icon.style.backgroundColor = "#3498db"; // blue
	} else {
		icon.style.backgroundColor = "#bdc3c7"; // gray default (IDLE, NOT READY)
	}

	state = state.replace(/_/g, " "); // Replace underscores with spaces for better readability
	icontext.textContent = state;
	icon.alt = state;
	icon.dataset.text = state;
}

setLabel("IDLE");

// Subscribe to current_state topic and update icon text

function subscribeCurrentState() {
	const stateTopic = new ROSLIB.Topic({
		ros: rosbridge.ros,
		name: nodename + "/current_state",
		messageType: "std_msgs/String",
		qos: {
			durability: "transient_local" // QoSDurabilityPolicy.TRANSIENT_LOCAL
		}
	});

	stateTopic.subscribe((msg) => {
		if (msg && msg.data) {
			setLabel(msg.data);
		}
	});
}

subscribeCurrentState();

// Settings

if (settings.hasOwnProperty("{uniqueID}")) {
	const loaded_data = settings["{uniqueID}"];
	nodename = loaded_data.nodename;
	typedict = loaded_data.typedict ?? {};
} else {
	saveSettings();
}

function saveSettings() {
	settings["{uniqueID}"] = {
		nodename: nodename,
		typedict: typedict
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
	let triggersrvs = await rosbridge.get_services("std_srvs/srv/Trigger");
	console.log(triggersrvs);

	let serviceList = "";
	let foundServices = {
		start: false,
		stop: false,
		follow_me: false,
		mule: false,
		exit: false
	};

	triggersrvs.forEach(element => {
		if (!element.includes("/vizanti/") && element.includes(nodenamebox.value)) {
			serviceList += "<option value='" + element + "'>" + element + " (srvs/Trigger)</option>";
			typedict[element] = "std_srvs/srv/Trigger";

			// Detect service types by name
			if (element.endsWith("/start")) foundServices.start = true;
			if (element.endsWith("/stop")) foundServices.stop = true;
			if (element.endsWith("/init_follow_me")) foundServices.follow_me = true;
			if (element.endsWith("/init_mule")) foundServices.mule = true;
			if (element.endsWith("/exit")) foundServices.exit = true;
		}
	});

	// Show/hide dropdown elements based on found services
	if (typeof drop_start !== "undefined" && drop_start) drop_start.style.display = foundServices.start ? "block" : "none";
	if (typeof drop_stop !== "undefined" && drop_stop) drop_stop.style.display = foundServices.stop ? "block" : "none";
	if (typeof drop_follow_me !== "undefined" && drop_follow_me) drop_follow_me.style.display = foundServices.follow_me ? "block" : "none";
	if (typeof drop_mule !== "undefined" && drop_mule) drop_mule.style.display = foundServices.mule ? "block" : "none";
	if (typeof drop_exit !== "undefined" && drop_exit) drop_exit.style.display = foundServices.exit ? "block" : "none";

	saveSettings();
}

loadServices();

//dropdown stuff

function dropdown_visibility(open) {
	if (open) {
		loadServices();
		dropdown.style.display = "block";
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

	saveSettings();
});

const drop_start = document.getElementById("{uniqueID}_start");
const drop_stop = document.getElementById("{uniqueID}_stop");
const drop_follow_me = document.getElementById("{uniqueID}_follow_me");
const drop_mule = document.getElementById("{uniqueID}_mule");
const drop_exit = document.getElementById("{uniqueID}_exit");
const drop_config = document.getElementById("{uniqueID}_config");


drop_start.addEventListener("click", (event) => {
	// Find the service ending with /start
	let found = Object.keys(typedict).find(k => k.endsWith("/start"));
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

drop_config.addEventListener("click", (event) => {
	loadServices();
	openModal("{uniqueID}_modal");
	dropdown_visibility(false);
});


console.log("Button Widget Loaded {uniqueID}")